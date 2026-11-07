export const LICH_KHOA_APPS_SCRIPT_CODE = String.raw`/**
 * F-304 — Lịch khoa Sheet bridge (CHD StaffKey + API Key)
 * Deploy: Execute as Me | Who has access: Anyone
 * Script property: LICHKHOA_API_KEY (or API_KEY)
 */
var REQUIRED_TABS = ['_meta', 'NhanSu', 'Task', 'LichTuan', 'LichThang'];

var TAB_ACCESS = {
  NhanSu: 'staff',
  Task: 'tasks',
  LichTuan: 'week',
  LichThang: 'month',
  LichNghi: 'leave',
  LichHoc: 'study',
  Dashboard: 'dashboard'
};

function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents || '{}');
    var action = body.action;
    var spreadsheetId = body.spreadsheetId;
    var apiKey = body.apiKey || body.scriptSecret || '';
    var staffKey = String(body.staffKey || '').trim();
    var chdRole = String(body.chdRole || body.role || '').trim();
    if (!spreadsheetId) {
      return jsonOut({ error: 'Thiếu spreadsheetId.' }, 400);
    }
    if (!verifyApiKey_(apiKey)) {
      return jsonOut({ error: 'API Key không hợp lệ.' }, 401);
    }

    if (action === 'verifySpreadsheet') {
      var ssVerify = openSpreadsheetById_(spreadsheetId);
      return jsonOut({ status: 'success', title: ssVerify.getName(), spreadsheetId: spreadsheetId });
    }

    if (!staffKey) {
      return jsonOut({ error: 'Thiếu staffKey.' }, 400);
    }

    var ss = openSpreadsheetById_(spreadsheetId);
    ensureTabs_(ss);

    var staffRows = sheetValues_(ss, 'NhanSu');
    var staff = rowsToStaff_(staffRows);
    var nhanSuEmpty = isNhanSuEmpty_(staff);

    if (action === 'getProfile') {
      if (nhanSuEmpty) {
        return jsonOut({
          staffKey: staffKey,
          bootstrapEligible: true,
          updatedAt: metaUpdatedAt_(ss)
        });
      }
      var actorProfile = resolveActorByKey_(staffKey, staff, chdRole);
      if (!actorProfile.allowed) {
        return jsonOut({
          error: 'StaffKey chưa có trong NhanSu. Admin CHD: redeploy Code.gs lịch khoa bản mới, hoặc Đồng bộ để ghi NhanSu từ CHD. User: nhờ Admin bật ShowInLichKhoa và đẩy NhanSu.'
        }, 403);
      }
      return jsonOut({
        staffKey: staffKey,
        actor: actorProfile,
        updatedAt: metaUpdatedAt_(ss)
      });
    }

    if (action === 'bootstrap') {
      if (!nhanSuEmpty) {
        return jsonOut({ error: 'Khoa đã có nhân sự trên Sheet. Không thể bootstrap lại.' }, 409);
      }
      var incomingBootstrap = body.tabs || {};
      writeBootstrapTabs_(ss, incomingBootstrap);
      touchMetaUpdatedAt_(ss);
      staffRows = sheetValues_(ss, 'NhanSu');
      staff = rowsToStaff_(staffRows);
      var actorBoot = resolveActorByKey_(staffKey, staff, chdRole);
      if (!actorBoot.allowed) {
        return jsonOut({ error: 'Bootstrap xong nhưng StaffKey chưa có trong NhanSu. Kiểm tra tab NhanSu (cột id = StaffKey).' }, 500);
      }
      return jsonOut({ updatedAt: metaUpdatedAt_(ss), actor: actorBoot, staffKey: staffKey });
    }

    var actor = resolveActorByKey_(staffKey, staff, chdRole);
    if (!actor.allowed) {
      return jsonOut({
        error: 'StaffKey chưa có trong NhanSu. Admin CHD: redeploy Code.gs lịch khoa bản mới, hoặc Đồng bộ để ghi NhanSu từ CHD. User: nhờ Admin bật ShowInLichKhoa và đẩy NhanSu.'
      }, 403);
    }

    if (action === 'pull') {
      var tabs = {};
      Object.keys(TAB_ACCESS).forEach(function (tabName) {
        var accessId = TAB_ACCESS[tabName];
        if (canSee_(actor, accessId)) tabs[tabName] = sheetValues_(ss, tabName);
      });
      tabs._meta = sheetValues_(ss, '_meta');
      return jsonOut({ tabs: tabs, updatedAt: metaUpdatedAt_(ss), actor: actor });
    }

    if (action === 'push') {
      var incoming = body.tabs || {};
      var writtenCount = 0;
      Object.keys(incoming).forEach(function (tabName) {
        if (tabName === '_meta') return;
        var accessId = TAB_ACCESS[tabName];
        if (!accessId) return;
        if (!canEdit_(actor, accessId)) {
          // Bỏ qua tab này nếu actor không có quyền sửa (tránh quăng lỗi làm hỏng toàn bộ các tab khác)
          return;
        }
        writeSheet_(ss, tabName, incoming[tabName]);
        writtenCount++;
      });
      if (writtenCount > 0) {
        touchMetaUpdatedAt_(ss);
      }
      return jsonOut({ updatedAt: metaUpdatedAt_(ss), writtenCount: writtenCount });
    }

    return jsonOut({ error: 'action không hợp lệ.' }, 400);
  } catch (err) {
    return jsonOut({ error: String(err.message || err) }, 500);
  }
}

function doGet(e) {
  var p = (e && e.parameter) || {};
  if (p.action === 'test') {
    return jsonOut({ status: 'success', service: 'lichkhoa-sheet-bridge' });
  }
  if (p.action === 'setup') {
    var key = String(p.apiKey || '').trim();
    if (key) {
      PropertiesService.getScriptProperties().setProperty('LICHKHOA_API_KEY', key);
    }
    return jsonOut({ status: 'success', message: 'API Key đã lưu (nếu gửi kèm).' });
  }
  if (p.action === 'verifySpreadsheet') {
    var sid = String(p.spreadsheetId || '').trim();
    var vKey = String(p.apiKey || '').trim();
    if (!sid) {
      return jsonOut({ error: 'Thiếu spreadsheetId.' }, 400);
    }
    if (!verifyApiKey_(vKey)) {
      return jsonOut({ error: 'API Key không hợp lệ.' }, 401);
    }
    var ssGet = openSpreadsheetById_(sid);
    return jsonOut({ status: 'success', title: ssGet.getName(), spreadsheetId: sid });
  }
  return ContentService.createTextOutput(JSON.stringify({ ok: true, service: 'lichkhoa-sheet-bridge' }))
    .setMimeType(ContentService.MimeType.JSON);
}

function jsonOut(obj, status) {
  var out = ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
  return out;
}

function verifyApiKey_(apiKey) {
  var expected = PropertiesService.getScriptProperties().getProperty('LICHKHOA_API_KEY')
    || PropertiesService.getScriptProperties().getProperty('API_KEY')
    || '';
  if (!expected) return true; // first deploy before setup
  return String(apiKey || '') === String(expected);
}

function openSpreadsheetById_(spreadsheetId) {
  try {
    return SpreadsheetApp.openById(spreadsheetId);
  } catch (e) {
    var msg = String(e && e.message ? e.message : e);
    if (msg.indexOf('missing') !== -1) {
      throw new Error(
        'Không mở được Google Sheet (ID: ' + spreadsheetId + '). '
        + 'Kiểm tra: (1) ID đúng 44 ký tự từ URL docs.google.com/spreadsheets/d/…/edit, '
        + '(2) file chưa bị xóa, (3) tài khoản Google deploy Apps Script (Execute as Me) có quyền Editor trên file đó.'
      );
    }
    throw e;
  }
}

function ensureTabs_(ss) {
  REQUIRED_TABS.forEach(function (name) {
    if (!ss.getSheetByName(name)) ss.insertSheet(name);
  });
  ['LichNghi', 'LichHoc', 'Dashboard'].forEach(function (name) {
    if (!ss.getSheetByName(name)) ss.insertSheet(name);
  });
}

function isNhanSuEmpty_(staff) {
  return !staff || staff.length === 0;
}

function writeBootstrapTabs_(ss, incoming) {
  Object.keys(incoming).forEach(function (tabName) {
    var rows = incoming[tabName];
    if (!rows || !rows.length) return;
    writeSheet_(ss, tabName, rows);
  });
}

function sheetValues_(ss, name) {
  var sh = ss.getSheetByName(name);
  if (!sh) return [];
  var range = sh.getDataRange();
  if (!range) return [];
  var values = range.getValues();
  // Chuẩn hóa Date object thành chuỗi yyyy-MM-dd để tránh bị lệch múi giờ UTC khi JSON.stringify
  for (var r = 0; r < values.length; r++) {
    for (var c = 0; c < values[r].length; c++) {
      var cell = values[r][c];
      if (Object.prototype.toString.call(cell) === '[object Date]' || cell instanceof Date) {
        values[r][c] = Utilities.formatDate(cell, "GMT+7", "yyyy-MM-dd");
      }
    }
  }
  return values;
}

function writeSheet_(ss, name, rows) {
  var sh = ss.getSheetByName(name) || ss.insertSheet(name);
  sh.clearContents();
  if (!rows || !rows.length || !rows[0].length) return;
  var maxRows = sh.getMaxRows();
  var maxCols = sh.getMaxColumns();
  var reqRows = rows.length;
  var reqCols = rows[0].length;
  if (reqRows > maxRows) {
    sh.insertRowsAfter(maxRows, reqRows - maxRows);
  }
  if (reqCols > maxCols) {
    sh.insertColumnsAfter(maxCols, reqCols - maxCols);
  }
  sh.getRange(1, 1, reqRows, reqCols).setValues(rows);
}

function rowsToStaff_(rows) {
  if (!rows || rows.length < 2) return [];
  var headers = rows[0].map(function (h) { return String(h || '').trim(); });
  var list = [];
  for (var i = 1; i < rows.length; i++) {
    var row = rows[i];
    var obj = {};
    headers.forEach(function (h, idx) { if (h) obj[h] = row[idx]; });
    if (obj.id) list.push(obj);
  }
  return list;
}

function findStaffByKey_(staffKey, staff) {
  var key = String(staffKey || '').trim();
  for (var i = 0; i < staff.length; i++) {
    if (String(staff[i].id || '').trim() === key) return staff[i];
  }
  return null;
}

function resolveActorByKey_(staffKey, staff, chdRole) {
  // CHD Admin luôn full quyền (kể cả khi dòng NhanSu đang gán access_tasks=none).
  // Tránh push Task/NhanSu thất bại → mất dữ liệu sau mỗi lần deploy/xóa localStorage.
  if (String(chdRole || '').trim().toLowerCase() === 'admin') {
    var sAdmin = findStaffByKey_(staffKey, staff);
    return {
      allowed: true,
      kind: 'admin',
      staffId: (sAdmin && sAdmin.id) || String(staffKey || '').trim(),
      access: fullAccess_(),
      fromChdAdmin: true
    };
  }
  var s = findStaffByKey_(staffKey, staff);
  if (s) {
    var role = String(s.accessRole || '').trim().toLowerCase();
    if (role && role !== 'member') {
      return { allowed: true, kind: 'admin', staffId: s.id, access: fullAccess_() };
    }
    return {
      allowed: true,
      kind: 'member',
      staffId: s.id,
      access: {
        week: s.access_week || 'edit',
        month: s.access_month || 'view',
        leave: s.access_leave || 'edit',
        study: s.access_study || 'view',
        calendar: s.access_calendar || 'view',
        dashboard: s.access_dashboard || 'none',
        staff: s.access_staff || 'none',
        tasks: s.access_tasks || 'none'
      }
    };
  }
  return { allowed: false, kind: 'guest' };
}

function fullAccess_() {
  return {
    week: 'edit', month: 'edit', leave: 'edit', study: 'edit',
    calendar: 'edit', dashboard: 'edit', staff: 'edit', tasks: 'edit'
  };
}

function canSee_(actor, tab) {
  if (actor.kind === 'admin') return true;
  var level = actor.access[tab];
  return level === 'view' || level === 'edit';
}

function canEdit_(actor, tab) {
  if (actor.kind === 'admin') return true;
  return actor.access[tab] === 'edit';
}

function metaUpdatedAt_(ss) {
  var sh = ss.getSheetByName('_meta');
  if (!sh) return '';
  var data = sh.getDataRange().getValues();
  for (var i = 0; i < data.length; i++) {
    if (String(data[i][0]) === 'updatedAt') return String(data[i][1] || '');
  }
  return '';
}

function touchMetaUpdatedAt_(ss) {
  var sh = ss.getSheetByName('_meta') || ss.insertSheet('_meta');
  var data = sh.getDataRange().getValues();
  var now = new Date().toISOString();
  var found = false;
  for (var i = 0; i < data.length; i++) {
    if (String(data[i][0]) === 'updatedAt') {
      sh.getRange(i + 1, 2).setValue(now);
      found = true;
      break;
    }
  }
  if (!found) sh.appendRow(['updatedAt', now]);
}
`;
