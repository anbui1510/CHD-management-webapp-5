/**
 * Refactored legacy weekly scheduler entrypoint.
 *
 * This file is the repository home for the weekly Google Apps Script scheduler.
 * It is designed to be pasted into the same Apps Script project as the
 * stabilized runner from weeklyScheduleAppsScriptCode.ts.
 *
 * Migration contract:
 * - The runner calls taoLichTuanMoiCore(context).
 * - context.sourceSheet is the source weekly sheet selected by manual or auto run.
 * - context.config contains Config_* sheet data loaded by loadConfig().
 * - context.configHelpers exposes helpers for links, holidays, priorities, and blockers.
 * - context.warnings is the single warning collector written to RunLog and the schedule.
 *
 * To finish migrating the current live script, move the body of the old
 * taoLichTuanMoi() into taoLichTuanMoiLegacyBody_(context, runtime).
 */

function taoLichTuanMoiCore(context) {
  context = context || {};

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sourceSheet = context.sourceSheet || ss.getActiveSheet();
  if (!sourceSheet) throw new Error("Missing source sheet for weekly schedule generation.");

  var runtime = createWeeklySchedulerRuntime_(context, sourceSheet);
  var outputSheet = taoLichTuanMoiLegacyBody_(context, runtime);

  if (context.warnings && runtime.extraWarnings.length > 0) {
    context.warnings.addMany(runtime.extraWarnings.map(function(warning) {
      return String(warning || "").replace(/^"|"$/g, "");
    }));
  }

  return outputSheet || ss.getActiveSheet();
}

function createWeeklySchedulerRuntime_(context, sourceSheet) {
  var config = context.config || {};
  var helpers = context.configHelpers || {};

  return {
    config: config,
    helpers: helpers,
    sourceSheet: sourceSheet,
    extraWarnings: [],
    getMonthlyScheduleUrl: function() {
      return getConfiguredLinkFromSheet_(helpers, sourceSheet, "monthlyScheduleUrlCell", "W4", "X4");
    },
    getLeaveScheduleUrl: function() {
      return getConfiguredLinkFromSheet_(helpers, sourceSheet, "leaveScheduleUrlCell", "W5", "X5");
    },
    getTeachingScheduleUrl: function() {
      return getConfiguredLinkFromSheet_(helpers, sourceSheet, "teachingScheduleUrlCell", "W6", "X6");
    },
    getCmrAppsheetUrl: function() {
      if (helpers.getLinkValue) {
        return helpers.getLinkValue(
          "cmrAppsheetUrl",
          "https://docs.google.com/spreadsheets/d/1h0gMUUKs5TskzM-6eWkJ_S2bkNkLnAkFgmrwDd0y6wo/edit"
        );
      }
      return "https://docs.google.com/spreadsheets/d/1h0gMUUKs5TskzM-6eWkJ_S2bkNkLnAkFgmrwDd0y6wo/edit";
    },
    getHolidayDictionary: function() {
      return buildLegacyHolidayDictionary_(config);
    },
    getPriorityList: function(ruleName, fallback) {
      if (helpers.getPriorityList) return helpers.getPriorityList(ruleName, fallback);
      return fallback.slice();
    },
    getBlockerList: function(ruleName, fallback) {
      if (helpers.getBlockerList) return helpers.getBlockerList(ruleName, fallback);
      return fallback.slice();
    },
    addWarning: function(message) {
      var text = String(message || "").trim();
      if (text && this.extraWarnings.indexOf(text) === -1) this.extraWarnings.push(text);
    }
  };
}

function taoLichTuanMoiLegacyBody_(context, runtime) {
  /**
   * Paste the body of the old taoLichTuanMoi() here, with these replacements:
   *
   * 1. Replace:
   *      var ss = SpreadsheetApp.getActiveSpreadsheet();
   *      var sheetHienTai = ss.getActiveSheet();
   *    with:
   *      var ss = SpreadsheetApp.getActiveSpreadsheet();
   *      var sheetHienTai = runtime.sourceSheet;
   *
   * 2. Replace the hard-coded holiday dictionary:
   *      var tuDienNgayLe = {...};
   *    with:
   *      var tuDienNgayLe = runtime.getHolidayDictionary();
   *
   * 3. Replace source links:
   *      var linkThang = sheetHienTai.getRange("W4")... || sheetHienTai.getRange("X4")...
   *      var linkPhep = sheetHienTai.getRange("W5")... || sheetHienTai.getRange("X5")...
   *      var linkTMCB = sheetHienTai.getRange("W6")... || sheetHienTai.getRange("X6")...
   *    with:
   *      var linkThang = runtime.getMonthlyScheduleUrl();
   *      var linkPhep = runtime.getLeaveScheduleUrl();
   *      var linkTMCB = runtime.getTeachingScheduleUrl();
   *
   * 4. Replace:
   *      var linkCMRAppsheet = "...";
   *    with:
   *      var linkCMRAppsheet = runtime.getCmrAppsheetUrl();
   *
   * 5. Replace the second declaration of extraWarnings:
   *      var extraWarnings = [];
   *    with reuse of the first array. At the end, call:
   *      runtime.extraWarnings = extraWarnings;
   *
   * 6. Replace priority arrays gradually:
   *      var prioT1Star_GroupA = runtime.getPriorityList("t1StarGroupA", ["THỊNH", "ÂN", "NGHI", "HIẾU", "TÀI"]);
   *      var prioT1Star_GroupB = runtime.getPriorityList("t1StarGroupB", ["LỢI"]);
   *      var prioT1_S = runtime.getPriorityList("t1Morning", ["ÂN", "NGHI", "TÀI", "HIẾU", "TRANG"]);
   *      var prioT1_C = runtime.getPriorityList("t1Afternoon", ["NGHI", "TRANG", "ÂN", "HIẾU", "TÀI"]);
   *
   * 7. Replace blocker arrays gradually:
   *      var blockers = runtime.getBlockerList("default", ["TT", "SN", "RO", "SAPK", "PKTC", "HSSS", "VG", "HV", "BÙ", "P", "CT", "H", "DẠY"]);
   *
   * 8. After syncing calendar, surface count to RunLog:
   *      context.eventsCreated = eventsCreated;
   *
   * 9. Return the newly created sheet:
   *      return sheetMoi;
   */

  throw new Error(
    "weeklySchedulerLegacy.gs is ready for the legacy body, but taoLichTuanMoiLegacyBody_ has not been filled yet."
  );
}

function getConfiguredLinkFromSheet_(helpers, sheet, settingKey, primaryFallbackCell, secondaryFallbackCell) {
  if (helpers && helpers.getLinkFromCellSetting) {
    var configured = helpers.getLinkFromCellSetting(settingKey, primaryFallbackCell);
    if (configured) return configured;
  }

  var primary = sheet.getRange(primaryFallbackCell).getValue().toString().trim();
  if (primary) return primary;

  return sheet.getRange(secondaryFallbackCell).getValue().toString().trim();
}

function buildLegacyHolidayDictionary_(config) {
  var fallback = {
    "1/1": "Tết Dương lịch",
    "14/2": "Valentine",
    "27/2": "Ngày Thầy thuốc VN",
    "8/3": "Quốc tế Phụ nữ",
    "30/4": "Giải phóng miền Nam",
    "1/5": "Quốc tế Lao động",
    "2/9": "Quốc khánh",
    "20/10": "Phụ nữ Việt Nam",
    "20/11": "Nhà giáo Việt Nam",
    "22/12": "Thành lập QĐNDVN",
    "26/4/2026": "Giỗ tổ Hùng Vương",
    "16/2/2026": "Nghỉ Giao thừa",
    "17/2/2026": "Mùng 1 Tết",
    "18/2/2026": "Mùng 2 Tết",
    "19/2/2026": "Mùng 3 Tết"
  };

  if (!config || !config.holidays) return fallback;

  var merged = {};
  Object.keys(fallback).forEach(function(key) {
    merged[key] = fallback[key];
  });
  Object.keys(config.holidays).forEach(function(key) {
    if (config.holidays[key] && config.holidays[key].name) {
      merged[key] = config.holidays[key].name;
    }
  });
  return merged;
}
