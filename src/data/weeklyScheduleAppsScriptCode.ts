export const WEEKLY_SCHEDULE_APPS_SCRIPT_CODE = String.raw`/**
 * Weekly Schedule Stabilizer for Khoa Tim Mach.
 *
 * How to adopt:
 * 1. Paste this file into the Apps Script project that contains the existing weekly scheduler.
 * 2. Rename the old function taoLichTuanMoi() to taoLichTuanMoiCore(context).
 * 3. Keep onOpen(), triggerSendWeeklyEmail(), runSyncCalendar(), and calendar helpers below if they already exist.
 * 4. Run setupScheduleConfigSheets() once, review the Config_* sheets, then run setupWeeklyScheduleTrigger().
 */

var SCHEDULER_VERSION = "weekly-scheduler-stabilized-v1";

var SCHEDULER_SHEETS = {
  runLog: "RunLog",
  staff: "Config_NhanSu",
  tasks: "Config_CaViec",
  priorities: "Config_UuTien",
  blockers: "Config_Blocker",
  holidays: "Config_NgayLe",
  links: "Config_Links"
};

var DEFAULT_WEEKLY_TRIGGER = {
  day: ScriptApp.WeekDay.SUNDAY,
  hour: 20
};

function onOpen() {
  try {
    SpreadsheetApp.getUi()
      .createMenu("Quan ly Lich")
      .addItem("Tao lich tuan moi", "taoLichTuanMoiManual")
      .addItem("Chay tao lich tu dong ngay", "taoLichTuanMoiAuto")
      .addSeparator()
      .addItem("Tao/Cap nhat sheet cau hinh", "setupScheduleConfigSheets")
      .addItem("Cai trigger tao lich hang tuan", "setupWeeklyScheduleTrigger")
      .addItem("Xoa trigger tao lich hang tuan", "removeWeeklyScheduleTriggers")
      .addSeparator()
      .addItem("Dong bo Lich hoc & Lich ca nhan", "runSyncCalendar")
      .addItem("Dong bo Lich tuan BS An", "runSyncWeeklyAnManual")
      .addItem("Gui Lich Tuan qua Email", "triggerSendWeeklyEmail")
      .addToUi();
  } catch (e) {
    Logger.log("onOpen skipped in background: " + e.message);
  }
}

/**
 * Backward-compatible menu entry. Existing buttons can keep calling taoLichTuanMoi().
 */
function taoLichTuanMoi() {
  return taoLichTuanMoiManual();
}

function taoLichTuanMoiManual() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sourceSheet = ss.getActiveSheet();
  return runWeeklyScheduleWithLock_(sourceSheet, { mode: "manual" });
}

function taoLichTuanMoiAuto() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sourceSheet = findLatestWeeklyScheduleSheet(ss);
  if (!sourceSheet) {
    throw new Error("Khong tim thay sheet lich tuan nguon. Hay kiem tra ten sheet co chua 'Lich tuan'.");
  }
  return runWeeklyScheduleWithLock_(sourceSheet, { mode: "auto" });
}

function taoLichTuanMoiFromSheet(sourceSheet, options) {
  return runWeeklyScheduleWithLock_(sourceSheet, options || { mode: "manual" });
}

function runWeeklyScheduleWithLock_(sourceSheet, options) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30 * 1000)) {
    throw new Error("Dang co tien trinh tao lich khac dang chay. Vui long thu lai sau.");
  }

  var startedAt = new Date();
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var run = {
    id: Utilities.getUuid(),
    version: SCHEDULER_VERSION,
    mode: (options && options.mode) || "manual",
    startedAt: startedAt,
    sourceSheet: sourceSheet,
    sourceSheetName: sourceSheet ? sourceSheet.getName() : "",
    outputSheetName: "",
    warnings: createWarningCollector_(),
    config: null,
    eventsCreated: 0
  };

  try {
    if (!sourceSheet) throw new Error("sourceSheet is required.");
    setupRunLogSheet_();
    run.config = loadConfig();
    run.configHelpers = createScheduleConfigHelpers_(run.config, sourceSheet);

    ss.setActiveSheet(sourceSheet);
    var beforeSheetIds = getSheetIdSet_(ss);

    runLegacyScheduleCore_(run);

    var outputSheet = detectNewOrActiveSheet_(ss, beforeSheetIds);
    run.outputSheetName = outputSheet ? outputSheet.getName() : ss.getActiveSheet().getName();

    writeWarningsToSchedule_(outputSheet, run.warnings.list());
    appendRunLog_(run, "success", "");
    notifyScheduleRun_(run, "Hoan tat tao lich tuan: " + run.outputSheetName);
    return run;
  } catch (e) {
    appendRunLog_(run, "error", e && e.stack ? e.stack : String(e));
    notifyScheduleRun_(run, "Loi tao lich tuan: " + (e && e.message ? e.message : e));
    throw e;
  } finally {
    lock.releaseLock();
  }
}

function runLegacyScheduleCore_(context) {
  if (typeof taoLichTuanMoiCore === "function") {
    return taoLichTuanMoiCore(context);
  }

  throw new Error(
    "Chua tim thay taoLichTuanMoiCore(context). Hay doi ten ham taoLichTuanMoi() cu thanh taoLichTuanMoiCore(context) de runner moi goi duoc logic xep lich hien tai."
  );
}

function findLatestWeeklyScheduleSheet(ss) {
  var sheets = ss.getSheets();
  var candidates = [];

  for (var i = 0; i < sheets.length; i++) {
    var sheet = sheets[i];
    var name = sheet.getName();
    if (name.toLowerCase().indexOf("lich tuan") === -1 && name.toLowerCase().indexOf("lịch tuần") === -1) continue;

    var startDate = getStartDateFromSheetSafe_(sheet);
    var weekNumber = parseWeekNumber_(name);
    candidates.push({
      sheet: sheet,
      startTime: startDate ? startDate.getTime() : 0,
      weekNumber: weekNumber || 0,
      index: i
    });
  }

  candidates.sort(function(a, b) {
    if (a.startTime !== b.startTime) return b.startTime - a.startTime;
    if (a.weekNumber !== b.weekNumber) return b.weekNumber - a.weekNumber;
    return b.index - a.index;
  });

  return candidates.length ? candidates[0].sheet : null;
}

function parseWeekNumber_(name) {
  var match = String(name || "").match(/(?:tuan|tuần|thu|thứ)\s*(?:so|số|thu|thứ)?\s*(\d{1,2})/i);
  return match ? parseInt(match[1], 10) : 0;
}

function getStartDateFromSheetSafe_(sheet) {
  try {
    var text = sheet.getRange("A2:Z2").getDisplayValues()[0].join(" ");
    var match = text.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (!match) return null;
    return new Date(parseInt(match[3], 10), parseInt(match[2], 10) - 1, parseInt(match[1], 10));
  } catch (e) {
    return null;
  }
}

function getSheetIdSet_(ss) {
  var ids = {};
  ss.getSheets().forEach(function(sheet) {
    ids[sheet.getSheetId()] = true;
  });
  return ids;
}

function detectNewOrActiveSheet_(ss, beforeSheetIds) {
  var sheets = ss.getSheets();
  for (var i = 0; i < sheets.length; i++) {
    if (!beforeSheetIds[sheets[i].getSheetId()]) return sheets[i];
  }
  return ss.getActiveSheet();
}

function setupScheduleConfigSheets() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  ensureSheetWithHeaders_(ss, SCHEDULER_SHEETS.staff, [
    "Name", "NormalizedName", "StaffType", "Group", "Room", "Email", "CalendarId", "CanNightDuty", "CanWeekend", "Active", "Notes"
  ]);
  ensureSheetWithHeaders_(ss, SCHEDULER_SHEETS.tasks, [
    "TaskCode", "DisplayName", "Session", "StartTime", "EndTime", "SyncToCalendar", "CountsAsLeave", "Notes"
  ]);
  ensureSheetWithHeaders_(ss, SCHEDULER_SHEETS.priorities, [
    "RuleName", "PriorityOrder", "Notes"
  ]);
  ensureSheetWithHeaders_(ss, SCHEDULER_SHEETS.blockers, [
    "RuleName", "BlockedByCodes", "Notes"
  ]);
  ensureSheetWithHeaders_(ss, SCHEDULER_SHEETS.holidays, [
    "DateKey", "Name", "YearSpecific", "CountsCompDay", "Notes"
  ]);
  ensureSheetWithHeaders_(ss, SCHEDULER_SHEETS.links, [
    "Key", "Value", "Notes"
  ]);
  setupRunLogSheet_();
  seedDefaultConfigRows_();
  notifyScheduleRun_({ mode: "manual" }, "Da tao/cap nhat cac sheet cau hinh xep lich.");
}

function ensureSheetWithHeaders_(ss, sheetName, headers) {
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) sheet = ss.insertSheet(sheetName);

  var current = sheet.getLastColumn() > 0
    ? sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), headers.length)).getValues()[0]
    : [];

  var changed = false;
  for (var i = 0; i < headers.length; i++) {
    if (current[i] !== headers[i]) {
      current[i] = headers[i];
      changed = true;
    }
  }

  if (changed || sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  }

  sheet.getRange(1, 1, 1, headers.length).setFontWeight("bold").setBackground("#e8f5e9");
  sheet.setFrozenRows(1);
  return sheet;
}

function seedDefaultConfigRows_() {
  seedKeyValueRows_(SCHEDULER_SHEETS.links, [
    ["weeklyTriggerDay", "SUNDAY", "Ngay trigger: SUNDAY/MONDAY/..."],
    ["weeklyTriggerHour", "20", "Gio trigger 0-23"],
    ["notifyEmail", "", "Email nhan bao cao loi/canh bao khi chay nen"],
    ["monthlyScheduleUrlCell", "W4", "O tren sheet lich tuan chua link lich thang"],
    ["leaveScheduleUrlCell", "W5", "O tren sheet lich tuan chua link nghi phep"],
    ["teachingScheduleUrlCell", "W6", "O tren sheet lich tuan chua link lich day"]
  ]);

  seedKeyValueRows_(SCHEDULER_SHEETS.holidays, [
    ["1/1", "Tet Duong lich", "FALSE", "FALSE", ""],
    ["27/2", "Ngay Thay thuoc VN", "FALSE", "FALSE", ""],
    ["30/4", "Giai phong mien Nam", "FALSE", "FALSE", ""],
    ["1/5", "Quoc te Lao dong", "FALSE", "FALSE", ""],
    ["2/9", "Quoc khanh", "FALSE", "FALSE", ""]
  ]);

  seedKeyValueRows_(SCHEDULER_SHEETS.blockers, [
    ["default", "TT,SN,RO,SAPK,PKTC,HSSS,VG,HV,BU,P,CT,H,DAY", "Blocker chung cho isBlocked"],
    ["staff", "BU,P,SN,RO,PKTC,SAPK,HV,RT,MRI,CT,H", "Blocker cho staff"],
    ["round", "BU,SN,HV,TN,P,CT,H", "Blocker cho round"]
  ]);
}

function seedKeyValueRows_(sheetName, rows) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) return;

  var existing = {};
  if (sheet.getLastRow() > 1) {
    sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getValues().forEach(function(row) {
      existing[String(row[0] || "").trim()] = true;
    });
  }

  var toAppend = rows.filter(function(row) {
    return !existing[String(row[0] || "").trim()];
  });
  if (toAppend.length) {
    sheet.getRange(sheet.getLastRow() + 1, 1, toAppend.length, toAppend[0].length).setValues(toAppend);
  }
}

function loadConfig() {
  setupScheduleConfigSheetsIfMissing_();
  return {
    staff: readTable_(SCHEDULER_SHEETS.staff),
    tasks: readTable_(SCHEDULER_SHEETS.tasks),
    priorities: readConfigMap_(SCHEDULER_SHEETS.priorities, "RuleName", "PriorityOrder"),
    blockers: readConfigMap_(SCHEDULER_SHEETS.blockers, "RuleName", "BlockedByCodes"),
    holidays: readHolidayMap_(),
    links: readConfigMap_(SCHEDULER_SHEETS.links, "Key", "Value")
  };
}

function createScheduleConfigHelpers_(config, sourceSheet) {
  return {
    getLinkValue: function(key, fallback) {
      var value = config.links && config.links[key];
      return value !== undefined && value !== "" ? value : fallback;
    },
    getLinkFromCellSetting: function(settingKey, fallbackCellA1) {
      var cellA1 = this.getLinkValue(settingKey, fallbackCellA1);
      if (!sourceSheet || !cellA1) return "";
      return String(sourceSheet.getRange(cellA1).getValue() || "").trim();
    },
    getPriorityList: function(ruleName, fallbackList) {
      var raw = config.priorities && config.priorities[ruleName];
      return splitConfigList_(raw, fallbackList || []);
    },
    getBlockerList: function(ruleName, fallbackList) {
      var raw = config.blockers && config.blockers[ruleName];
      return splitConfigList_(raw, fallbackList || []);
    },
    getHolidayName: function(date) {
      if (!date) return "";
      var day = date.getDate();
      var month = date.getMonth() + 1;
      var year = date.getFullYear();
      var yearly = config.holidays[day + "/" + month + "/" + year];
      var annual = config.holidays[day + "/" + month];
      return yearly && yearly.name ? yearly.name : (annual && annual.name ? annual.name : "");
    },
    getActiveStaff: function() {
      return (config.staff || []).filter(function(row) {
        return String(row.Active || "TRUE").toUpperCase() !== "FALSE";
      });
    }
  };
}

function splitConfigList_(value, fallbackList) {
  if (Array.isArray(value)) return value;
  var text = String(value || "").trim();
  if (!text) return fallbackList.slice();
  return text.split(/[,;\n]+/).map(function(item) {
    return item.trim();
  }).filter(function(item) {
    return item !== "";
  });
}

function setupScheduleConfigSheetsIfMissing_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var required = [SCHEDULER_SHEETS.links, SCHEDULER_SHEETS.holidays, SCHEDULER_SHEETS.blockers];
  var missing = required.some(function(name) { return !ss.getSheetByName(name); });
  if (missing) setupScheduleConfigSheets();
}

function readTable_(sheetName) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
  if (!sheet || sheet.getLastRow() < 2) return [];

  var values = sheet.getDataRange().getValues();
  var headers = values.shift().map(function(h) { return String(h || "").trim(); });
  return values
    .filter(function(row) { return row.some(function(cell) { return String(cell || "").trim() !== ""; }); })
    .map(function(row) {
      var item = {};
      headers.forEach(function(header, index) {
        if (header) item[header] = row[index];
      });
      return item;
    });
}

function readConfigMap_(sheetName, keyField, valueField) {
  var map = {};
  readTable_(sheetName).forEach(function(row) {
    var key = String(row[keyField] || "").trim();
    if (!key) return;
    map[key] = row[valueField];
  });
  return map;
}

function readHolidayMap_() {
  var map = {};
  readTable_(SCHEDULER_SHEETS.holidays).forEach(function(row) {
    var key = String(row.DateKey || "").trim();
    if (!key) return;
    map[key] = {
      name: String(row.Name || "").trim(),
      yearSpecific: normalizeBoolean_(row.YearSpecific),
      countsCompDay: normalizeBoolean_(row.CountsCompDay)
    };
  });
  return map;
}

function normalizeBoolean_(value) {
  return String(value).toLowerCase().trim() === "true" || value === true || value === 1;
}

function setupRunLogSheet_() {
  ensureSheetWithHeaders_(SpreadsheetApp.getActiveSpreadsheet(), SCHEDULER_SHEETS.runLog, [
    "RunId", "StartedAt", "FinishedAt", "Mode", "Status", "SourceSheet", "OutputSheet", "WarningCount", "Warnings", "EventsCreated", "Error"
  ]);
}

function appendRunLog_(run, status, errorText) {
  try {
    setupRunLogSheet_();
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SCHEDULER_SHEETS.runLog);
    var warnings = run.warnings && run.warnings.list ? run.warnings.list() : [];
    sheet.appendRow([
      run.id || Utilities.getUuid(),
      run.startedAt || new Date(),
      new Date(),
      run.mode || "",
      status,
      run.sourceSheetName || "",
      run.outputSheetName || "",
      warnings.length,
      warnings.join(" | "),
      run.eventsCreated || 0,
      errorText || ""
    ]);
  } catch (e) {
    Logger.log("appendRunLog failed: " + e.message);
  }
}

function createWarningCollector_() {
  var warnings = [];
  return {
    add: function(message) {
      var text = String(message || "").trim();
      if (text && warnings.indexOf(text) === -1) warnings.push(text);
    },
    addMany: function(messages) {
      (messages || []).forEach(this.add);
    },
    list: function() {
      return warnings.slice();
    }
  };
}

function writeWarningsToSchedule_(sheet, warnings) {
  if (!sheet || !warnings || warnings.length === 0) return;
  try {
    sheet.getRange("E30").setValue("Can bo sung:").setFontColor("#ff0000").setFontWeight("bold");
    var current = String(sheet.getRange("F30").getDisplayValue() || "").trim();
    var merged = current ? current + ", " + warnings.join(", ") : warnings.join(", ");
    sheet.getRange("F30").setValue(merged);
  } catch (e) {
    Logger.log("writeWarningsToSchedule failed: " + e.message);
  }
}

function notifyScheduleRun_(run, message) {
  var isManual = run && run.mode === "manual";
  if (isManual) {
    try {
      SpreadsheetApp.getActiveSpreadsheet().toast(message, "Lich tuan", 8);
      return;
    } catch (e) {
      Logger.log(message);
    }
  }

  Logger.log(message);
  try {
    var config = loadConfig();
    var notifyEmail = String(config.links.notifyEmail || "").trim();
    if (notifyEmail && Utilities.isValidEmail(notifyEmail)) {
      MailApp.sendEmail(notifyEmail, "[Lich tuan] Bao cao chay tu dong", message);
    }
  } catch (e) {
    Logger.log("notify email skipped: " + e.message);
  }
}

function safeAlert(message) {
  try {
    SpreadsheetApp.getUi().alert(message);
  } catch (e) {
    Logger.log("Thong bao chay nen: " + message);
  }
}

function setupWeeklyScheduleTrigger() {
  removeWeeklyScheduleTriggers();

  var config = loadConfig();
  var dayName = String(config.links.weeklyTriggerDay || "SUNDAY").toUpperCase().trim();
  var hour = parseInt(config.links.weeklyTriggerHour || DEFAULT_WEEKLY_TRIGGER.hour, 10);
  if (isNaN(hour) || hour < 0 || hour > 23) hour = DEFAULT_WEEKLY_TRIGGER.hour;

  ScriptApp.newTrigger("taoLichTuanMoiAuto")
    .timeBased()
    .onWeekDay(resolveWeekDay_(dayName))
    .atHour(hour)
    .create();

  notifyScheduleRun_({ mode: "manual" }, "Da cai trigger tao lich hang tuan: " + dayName + " luc " + hour + "h.");
}

function removeWeeklyScheduleTriggers() {
  ScriptApp.getProjectTriggers().forEach(function(trigger) {
    if (trigger.getHandlerFunction() === "taoLichTuanMoiAuto") {
      ScriptApp.deleteTrigger(trigger);
    }
  });
}

function resolveWeekDay_(dayName) {
  var days = {
    SUNDAY: ScriptApp.WeekDay.SUNDAY,
    MONDAY: ScriptApp.WeekDay.MONDAY,
    TUESDAY: ScriptApp.WeekDay.TUESDAY,
    WEDNESDAY: ScriptApp.WeekDay.WEDNESDAY,
    THURSDAY: ScriptApp.WeekDay.THURSDAY,
    FRIDAY: ScriptApp.WeekDay.FRIDAY,
    SATURDAY: ScriptApp.WeekDay.SATURDAY
  };
  return days[dayName] || DEFAULT_WEEKLY_TRIGGER.day;
}
`;
