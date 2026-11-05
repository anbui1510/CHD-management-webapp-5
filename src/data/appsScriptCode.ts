/** Manifest appsscript.json — bật "Show appsscript.json manifest in editor", dán đè, Lưu, rồi chạy authorizeStaffSlideDrive. */
export const GOOGLE_APPS_SCRIPT_MANIFEST = `{
  "timeZone": "Asia/Ho_Chi_Minh",
  "dependencies": {},
  "exceptionLogging": "STACKDRIVER",
  "runtimeVersion": "V8",
  "webapp": {
    "executeAs": "USER_DEPLOYING",
    "access": "ANYONE_ANONYMOUS"
  },
  "oauthScopes": [
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/script.scriptapp",
    "https://www.googleapis.com/auth/script.external_request",
    "https://www.googleapis.com/auth/drive",
    "https://www.googleapis.com/auth/script.container.ui"
  ]
}`;

export const GOOGLE_APPS_SCRIPT_CODE = `/**
 * SCRIPT_VERSION: 2026-11-03-drive-scope
 * Google Apps Script for Pediatric Cardiac (CHD) Patient Management System
 * Hook this script into your Google Sheets to sync with Cloud Run in real-time.
 * 
 * Instructions:
 * 1. Open your Google Sheet (https://docs.google.com/spreadsheets/d/your-sheet-id)
 * 2. In the top menu, go to "Extensions" (Tiện ích mở rộng) -> "Apps Script"
 * 3. Sao chep TOAN BO Code.gs (nut Copy trong Virtual Google Sheets). KHONG paste tung doan thu cong — editor Apps Script tu xuong dong lam vo chuoi dai. KHONG copy file appsScriptCode.ts.
 * 4. Click the Save icon (orange folder/save icon).
 * 5. (Bat buoc cho slide PPTX) Project Settings -> hien appsscript.json -> dan GOOGLE_APPS_SCRIPT_MANIFEST (co scope auth/drive) -> Save.
 * 6. Chay ham authorizeStaffSlideDrive trong editor, bam Review permissions / Allow (quyen Google Drive).
 * 7. Click "Deploy" (Triển khai) -> "New deployment" (hoac Manage deployments -> Edit -> New version).
 * 8. Select "Web app" (Ứng dụng web) as deployment type (click gear icon next to "Select type").
 * 9. Configure:
 *    - Description: CHD Direct Web Sync
 *    - Execute as: "Me" (Tôi - your own email)
 *    - Who has access: "Anyone" (Bất kỳ ai) -> This is required so the webapp can talk to it.
 * 10. Click "Deploy" (Triển khai).
 * 11. Authorize Permissions (click Advanced -> Go to Untitled project / Allow).
 * 12. Copy the "Web app URL" (starts with https://script.google.com/macros/s/...)
 * 13. Paste this URL into the Connect Settings in your Web app!
 */

// Helper to get or create a Sheet with headers
function getOrCreateSheet(sheetName, headers) {
  if (!sheetName || !headers || headers.length === 0) {
    console.warn("getOrCreateSheet: skipped because sheetName or headers was not provided (commonly happens when manually run from the script toolbar).");
    return null;
  }
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
    sheet.appendRow(headers);
    // Format headers (apply bold background)
    var headerRange = sheet.getRange(1, 1, 1, headers.length);
    headerRange.setFontWeight("bold");
    headerRange.setBackground("#E8F5E9"); // light green for Patients, or customize
    sheet.setFrozenRows(1);
    
    // Set number format of string columns to Plain Text to preserve leading zeros (only on creation)
    for (var col = 0; col < headers.length; col++) {
      var header = headers[col];
      if (header === "PatientID1" || header === "PatientID2" || header === "PatientPhone1" || header === "PatientPhone2" || header === "StaffPhone" || header === "PatientCreateBy" || header === "ConsultCreateBy" || header === "ConsultResultCreateBy" || header === "ConsultResultUpdatedBy" || header === "CheckDeviceBy" || header === "CheckDeviceUpdatedBy" || header === "CathUpdatedBy" || header === "SurgUpdatedBy" || header === "StaffKey" || header === "CreatedBy") {
        var numRows = sheet.getMaxRows() - 1;
        if (numRows > 0) {
          sheet.getRange(2, col + 1, numRows, 1).setNumberFormat("@");
        }
      }
    }
  } else {
    var existingLastCol = Math.max(sheet.getLastColumn(), 1);
    var existingHeaders = sheet.getRange(1, 1, 1, existingLastCol).getValues()[0];
    var changed = false;
    for (var h = 0; h < headers.length; h++) {
      if (existingHeaders.indexOf(headers[h]) === -1) {
        existingHeaders.push(headers[h]);
        changed = true;
      }
    }
    if (changed) {
      sheet.getRange(1, 1, 1, existingHeaders.length).setValues([existingHeaders]);
      var updatedHeaderRange = sheet.getRange(1, 1, 1, existingHeaders.length);
      updatedHeaderRange.setFontWeight("bold");
      updatedHeaderRange.setBackground("#E8F5E9");
      sheet.setFrozenRows(1);
    }
  }
  return sheet;
}

// Ensure sheets exist on load or action
function initializeDatabase() {
  var patientHeaders = [
    "PatientKey", "PatientID1", "PatientID2", "PatientName", "OtherPatientName",
    "PatientDOB", "PatientSex", "PatientAddress", "PatientPhone1", "PatientPhone2",
    "PatientCreateBy", "PatientCreateTime", "Outcome", "PatientAddressDefaultWarning"
  ];
  
  var consultHeaders = [
    "ConsultKey", "PatientKey", "ConsultType", "PatientWeight", "PatientHeight", "ConsultDate",
    "RequestBy", "DiagnosisID", "DetailDiagnosis", "Department", "ConsultCreateBy",
    "ConsultCreateTime", "ConsultMember", "ConsultResultID", "DetailConsultResult", "ConsultNote",
    "PlannedDevice", "PlannedPrice", "PriorityOrder", "RiskFactor", "ConsultResultCreateBy",
    "ConsultResultCreateTime", "ConsultResultUpdatedBy", "ConsultResultUpdatedTime",
    "CheckDevice", "OperationFeedback", "SupplyDepFeedback",
    "CallStatus", "CallNote", "PlannedCathLabDate", "FundingRequest", "CheckDeviceDate",
    "CheckDeviceBy", "CheckDeviceUpdatedTime", "CheckDeviceUpdatedBy", "CathMethod",
    "PostCathDepart", "Scheduled1stInterventionist",
    "Scheduled2ndInterventionist", "Scheduled3rdInterventionist", "TransferredToCathLab",
    "FilePPTX", "Removed"
  ];
  
  var staffHeaders = [
    "StaffKey", "StaffName", "Name", "StaffSex", "Avatar", "StaffDOB", "Department", "Career", "StaffPhone", "Password", "Role", "Permissions", "StaffRolePreset", "Email", "FireDate", "ShowInLichKhoa"
  ];
  
  var cathLabHeaders = [
    "CathKey", "PatientKey", "ConsultKey", "CathDate", "DiagnosisID", "PostDiagnosisID", "PostDiagnosis",
    "CathResultID", "CathMethod", "CathPlan", "CathNote", "_1stInterventionist",
    "_2ndInterventionist", "_3rdInterventionist", "_4thInterventionist", "PlannedFollowUpDate",
    "CathUpdatedBy", "CathUpdatedTime"
  ];

  var operationHeaders = [
    "SurgKey", "PatientKey", "ConsultKey", "SurgDate", "DetailDiagnosisManual", "PostDiagnosis",
    "SurgResultID", "SurgNote", "SurgMethod", "PlannedFollowUpDate", "1stSurgeon", "2ndSurgeon", "3rdSurgeon", "4thSurgeon", "SurgCreateTime", "SurgUpdatedBy"
  ];
  
  var cmrHeaders = [
    "CMRKey", "CMRkey", "ConsultKey", "PatientKey", "MBN", "Họ và tên", "Tình trạng",
    "PatientWeight", "CMRDiagnosisID", "CMRDiagnosis", "CMRRequest", "RequestBy", "DepartRequest",
    "CMRMethod", "CMRDevice", "PostDepart", "Anesthesia", "CMRScheduledDate", "DayOfWeek",
    "CMRCallStatus", "CMRCallStatusNote", "CMRDate", "CMRResult", "CMRNote",
    "ConcludedResult", "PDFResult", "NextPlan", "UpdateTime"
  ];

  var transplantHeaders = [
    "TransKey", "PatientKey", "TransWeight", "TransHeight", "BloodType", "Gens", "GensFile",
    "MRI", "MRIFile", "TTE", "TTEFile", "Holter", "HolterFile", "TransDiagID",
    "DetailTransDiag", "Treatment", "TransNote", "TransStatus", "TransDate",
    "TransCreatedTime", "TransUpdateBy", "TransUpdateTime"
  ];

  var sourceHeaders = ["DiagnosisID"];

  var deviceTemplateHeaders = [
    "DiagnosisID", "PHƯƠNG PHÁP PHẪU THUẬT", "DeviceName", "FullDeviceName", "Size", "Price", "bhyt"
  ];

  var rolePresetHeaders = [
    "RolePresetID", "RolePresetLabel", "RolePresetDescription", "Permissions", "SortOrder", "IsSystem"
  ];

  var notificationHeaders = [
    "NotificationKey", "StaffKey", "StaffName", "Title", "Message", "Severity",
    "RelatedEntityType", "RelatedEntityKey", "PatientKey", "PatientID", "PatientName",
    "DedupKey", "IsRead", "CreatedTime", "ReadTime"
  ];

  var doctorPerformanceMarkHeaders = [
    "MarkKey", "StaffKey", "StaffName", "MarkType", "Score", "Label", "Reason",
    "RelatedEntityType", "RelatedEntityKey", "PatientKey", "PatientID", "PatientName",
    "DedupKey", "CreatedBy", "CreatedTime"
  ];

  getOrCreateSheet("Patient", patientHeaders);
  getOrCreateSheet("Consult", consultHeaders);
  getOrCreateSheet("Staff", staffHeaders);
  getOrCreateSheet("CathLab", cathLabHeaders);
  getOrCreateSheet("Operation", operationHeaders);
  getOrCreateSheet("CMR", cmrHeaders);
  getOrCreateSheet("Transplant", transplantHeaders);
  
  if (sourceHeaders.length > 0) {
    getOrCreateSheet("Source", sourceHeaders);
  } else {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    if (!ss.getSheetByName("Source")) {
      ss.insertSheet("Source");
    }
  }

  getOrCreateSheet("DeviceTemplate", deviceTemplateHeaders);

  getOrCreateSheet("RolePreset", rolePresetHeaders);
  getOrCreateSheet("Notification", notificationHeaders);
  getOrCreateSheet("DoctorPerformanceMark", doctorPerformanceMarkHeaders);
}

// GET Requests - Returns JSON of all data
function doGet(e) {
  var action = (e && e.parameter) ? e.parameter.action : "test";
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  
  // Fast path: Only initialize database if "Patient" sheet is missing or we are testing connection
  if (action === "test" || !ss.getSheetByName("Patient")) {
    initializeDatabase();
    ss = SpreadsheetApp.getActiveSpreadsheet(); // Refresh spreadsheet reference after creation
  }
  
  // 1. Handle API Key setup if requested
  if (action === "setup") {
    var existingKey = PropertiesService.getScriptProperties().getProperty("API_KEY");
    var keyToSet = (e && e.parameter) ? e.parameter.apiKey : "";
    if (!keyToSet) {
      return ContentService.createTextOutput(JSON.stringify({ status: "error", message: "Missing apiKey parameter for setup" }))
                           .setMimeType(ContentService.MimeType.JSON);
    }
    if (existingKey && existingKey !== keyToSet) {
      return ContentService.createTextOutput(JSON.stringify({ status: "error", message: "Unauthorized: API Key is already set." }))
                           .setMimeType(ContentService.MimeType.JSON);
    }
    PropertiesService.getScriptProperties().setProperty("API_KEY", keyToSet);
    return ContentService.createTextOutput(JSON.stringify({ status: "success", message: "API Key configured successfully!" }))
                         .setMimeType(ContentService.MimeType.JSON);
  }

  // 2. API key is required for every action except the first setup.
  var apiKey = PropertiesService.getScriptProperties().getProperty("API_KEY");
  if (!apiKey) {
    return ContentService.createTextOutput(JSON.stringify({ status: "error", message: "API Key chưa được cấu hình. Hãy gọi action=setup." }))
                         .setMimeType(ContentService.MimeType.JSON);
  }
  var reqKey = (e && e.parameter) ? e.parameter.apiKey : "";
  if (reqKey !== apiKey) {
    return ContentService.createTextOutput(JSON.stringify({ status: "error", message: "Unauthorized: Invalid or missing API Key" }))
                         .setMimeType(ContentService.MimeType.JSON);
  }

  if (action === "test") {
    return ContentService.createTextOutput(JSON.stringify({ status: "success", message: "Connected successfully to Google Sheet!" }))
                         .setMimeType(ContentService.MimeType.JSON);
  }

  if (action === "getStaffPublic") {
    var staff = readSheetAsJson(ss, "Staff");
    var publicStaff = [];
    for (var i = 0; i < staff.length; i++) {
      publicStaff.push({
        StaffKey: staff[i].StaffKey || "",
        StaffName: staff[i].StaffName || "",
        Name: staff[i].Name || "",
        Role: staff[i].Role || "",
        Avatar: staff[i].Avatar || "",
        FireDate: staff[i].FireDate || ""
      });
    }
    return ContentService.createTextOutput(JSON.stringify({ staff: publicStaff }))
                         .setMimeType(ContentService.MimeType.JSON);
  }

  if (action === "getStaff") {
    var staff = readSheetAsJson(ss, "Staff");
    if (staff.length === 0) {
      var staffSheet = ss.getSheetByName("Staff");
      if (staffSheet) {
        staffSheet.appendRow(["01378", "BS Minh Tuấn (Admin)", "BS Minh Tuấn", "Nam", "", "", "", "", "", "admin", "Admin", "", "admin-khoa", "tuan.nguyen@company.com", ""]);
        staffSheet.appendRow(["11111", "BS Thu Hà (User)", "BS Thu Hà", "Nữ", "", "", "", "", "", "user", "User", "", "tuy-chinh", "ha.thu@company.com", ""]);
        staff = readSheetAsJson(ss, "Staff");
      }
    }
    return ContentService.createTextOutput(JSON.stringify({ staff: stripStaffPasswords(staff) }))
                         .setMimeType(ContentService.MimeType.JSON);
  }

  // Fetch all sheets using the cached Spreadsheet object
  var patients = safeReadSheetAsJson(ss, "Patient");
  var consults = safeReadSheetAsJson(ss, "Consult");
  var staff = safeReadSheetAsJson(ss, "Staff");
  var cathlabs = safeReadSheetAsJson(ss, "CathLab");
  var operations = safeReadSheetAsJson(ss, "Operation");
  var cmrs = safeReadSheetAsJson(ss, "CMR");
  var transplants = safeReadSheetAsJson(ss, "Transplant");
  var sources = safeReadSheetAsJson(ss, "Source");
  var deviceTemplates = safeReadSheetAsJson(ss, "DeviceTemplate");
  var rolePresets = safeReadSheetAsJson(ss, "RolePreset");
  var notifications = safeReadSheetAsJson(ss, "Notification");
  var doctorPerformanceMarks = safeReadSheetAsJson(ss, "DoctorPerformanceMark");

  // If Staff is completely empty, populate with some default users so admin can login
  if (staff.length === 0) {
    var staffSheet = ss.getSheetByName("Staff");
    if (staffSheet) {
      staffSheet.appendRow(["01378", "BS Minh Tuấn (Admin)", "BS Minh Tuấn", "Nam", "", "", "", "", "", "admin", "Admin", "", "admin-khoa", "tuan.nguyen@company.com", ""]);
      staffSheet.appendRow(["11111", "BS Thu Hà (User)", "BS Thu Hà", "Nữ", "", "", "", "", "", "user", "User", "", "tuy-chinh", "ha.thu@company.com", ""]);
      staff = readSheetAsJson(ss, "Staff");
      for (var i = 0; i < staff.length; i++) {
        delete staff[i].Password;
      }
    }
  }

  var responseData = {
    patients: patients,
    consults: consults,
    staff: stripStaffPasswords(staff),
    cathlabs: cathlabs,
    operations: operations,
    cmrs: cmrs,
    transplants: transplants,
    sources: sources,
    deviceTemplates: deviceTemplates,
    rolePresets: rolePresets,
    notifications: notifications,
    doctorPerformanceMarks: doctorPerformanceMarks
  };

  return ContentService.createTextOutput(safeStringify(responseData))
                       .setMimeType(ContentService.MimeType.JSON);
}

function getKeyColumnNameForType(type) {
  var keyColumnName = type + "Key";
  if (type === "RolePreset") {
    keyColumnName = "RolePresetID";
  } else if (type === "Source") {
    keyColumnName = "DiagnosisID";
  } else if (type === "DeviceTemplate") {
    keyColumnName = "DeviceName";
  } else if (type === "Notification") {
    keyColumnName = "NotificationKey";
  } else if (type === "DoctorPerformanceMark") {
    keyColumnName = "MarkKey";
  } else if (type === "Transplant") {
    keyColumnName = "TransKey";
  }
  return keyColumnName;
}

function normalizeSheetKey(val) {
  if (val === null || val === undefined) return "";
  var s = String(val).trim();
  if (s.charAt(0) === "'") {
    s = s.substring(1).trim();
  }
  return s;
}

function sheetKeysMatch(cellValue, targetKey) {
  var left = normalizeSheetKey(cellValue).toLowerCase();
  var right = normalizeSheetKey(targetKey).toLowerCase();
  return left !== "" && right !== "" && left === right;
}

function resolveKeyColumnIndex(headers, type) {
  var keyColumnName = getKeyColumnNameForType(type);
  var idx = headers.indexOf(keyColumnName);
  if (idx >= 0) return idx + 1;
  var target = String(keyColumnName).trim().toLowerCase();
  for (var i = 0; i < headers.length; i++) {
    if (String(headers[i]).trim().toLowerCase() === target) {
      return i + 1;
    }
  }
  return 1;
}

function findRowIndexByKeyScanAllColumns(sheet, key) {
  var lastRow = sheet.getLastRow();
  var lastCol = sheet.getLastColumn();
  if (lastRow < 2 || lastCol < 1) return -1;
  var numDataRows = lastRow - 1;
  var rows = sheet.getRange(2, 1, numDataRows, lastCol).getValues();
  for (var r = 0; r < rows.length; r++) {
    for (var c = 0; c < rows[r].length; c++) {
      if (sheetKeysMatch(rows[r][c], key)) {
        return r + 2;
      }
    }
  }
  return -1;
}

function findRowIndexBySheetKey(sheet, keyColIndex, key) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return -1;
  var numRows = lastRow - 1;
  var keyValues = sheet.getRange(2, keyColIndex, numRows, 1).getValues();
  for (var i = 0; i < keyValues.length; i++) {
    if (sheetKeysMatch(keyValues[i][0], key)) {
      return i + 2;
    }
  }
  return -1;
}

function ensureSheetHeaders(sheet, requiredHeaders) {
  var lastCol = Math.max(sheet.getLastColumn(), 1);
  var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(function(h) {
    return String(h || "").trim();
  });
  var changed = false;
  for (var i = 0; i < requiredHeaders.length; i++) {
    var need = String(requiredHeaders[i] || "").trim();
    if (!need) continue;
    if (headers.indexOf(need) === -1) {
      headers.push(need);
      changed = true;
    }
  }
  if (changed) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  }
  return headers;
}

function writeRecordToSheet(type, action, key, record) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(type);
  if (!sheet) {
    throw new Error("Sheet not found: " + type);
  }

  if (type === "Consult") {
    ensureSheetHeaders(sheet, ["FilePPTX"]);
  }

  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var keyColIndex = resolveKeyColumnIndex(headers, type);

  var foundRowIndex = findRowIndexBySheetKey(sheet, keyColIndex, key);
  if (foundRowIndex === -1) {
    foundRowIndex = findRowIndexByKeyScanAllColumns(sheet, key);
  }

  var rowValues = [];
  for (var col = 0; col < headers.length; col++) {
    var header = headers[col];
    var val = record[header];
    if (val !== undefined && val !== null) {
      var strVal = String(val).trim();
      var isNumericTextCol = (
        header === "PatientID1" || 
        header === "PatientID2" || 
        header === "PatientPhone1" || 
        header === "PatientPhone2" || 
        header === "StaffPhone" ||
        header === "PatientWeight" ||
        header === "PatientHeight" ||
        header === "TransWeight" ||
        header === "TransHeight" ||
        header === "StaffKey"
      );
      if (isNumericTextCol && strVal !== "") {
        if (!strVal.startsWith("'")) {
          val = "'" + strVal;
        }
      }
    }
    rowValues.push(val !== undefined ? val : "");
  }

  if (foundRowIndex !== -1) {
    var rowRange = sheet.getRange(foundRowIndex, 1, 1, headers.length);
    rowRange.setValues([rowValues]);
    return { status: "success", action: "updated", key: key, rowIndex: foundRowIndex };
  }

  sheet.appendRow(rowValues);
  return { status: "success", action: "inserted", key: key, rowIndex: sheet.getLastRow() };
}

function deleteRecordFromSheet(type, key) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(type);
  if (!sheet) {
    throw new Error("Sheet not found: " + type);
  }

  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var keyColIndex = resolveKeyColumnIndex(headers, type);

  var foundRowIndex = findRowIndexBySheetKey(sheet, keyColIndex, key);
  if (foundRowIndex === -1) {
    foundRowIndex = findRowIndexByKeyScanAllColumns(sheet, key);
  }

  if (foundRowIndex !== -1) {
    sheet.deleteRow(foundRowIndex);
    return { status: "success", action: "deleted", key: key, rowIndex: foundRowIndex };
  }
  return { status: "error", message: "Record not found to delete: " + type + " key=" + key };
}

// POST Requests - Inserts or Updates records
function doPost(e) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss.getSheetByName("Patient") || !ss.getSheetByName("Staff")) {
    initializeDatabase();
  }
  
  // Validate API Key for POST requests
  var apiKey = PropertiesService.getScriptProperties().getProperty("API_KEY");
  if (!apiKey) {
    return ContentService.createTextOutput(JSON.stringify({ status: "error", message: "API Key chưa được cấu hình." }))
                         .setMimeType(ContentService.MimeType.JSON);
  }
  var reqKey = "";
  try {
    if (e && e.postData && e.postData.contents) {
      var payloadCheck = JSON.parse(e.postData.contents);
      reqKey = payloadCheck.apiKey || "";
    }
  } catch (err) {}
  if (!reqKey && e && e.parameter) {
    reqKey = e.parameter.apiKey || "";
  }
  if (reqKey !== apiKey) {
    return ContentService.createTextOutput(JSON.stringify({ status: "error", message: "Unauthorized: Invalid or missing API Key" }))
                         .setMimeType(ContentService.MimeType.JSON);
  }

  var result = { status: "error", message: "Unknown action" };
  
  try {
    var rawData = e.postData.contents;
    var payload = JSON.parse(rawData);
    var action = payload.action;
    var type = payload.type; // "Patient" | "Consult" | "Staff"
    var key = payload.key; // Unique key to find
    var record = payload.data; // JSON Object

    if (action === "login") {
      var ss = SpreadsheetApp.getActiveSpreadsheet();
      var staffList = readSheetAsJson(ss, "Staff");
      var inputStaffKey = String(payload.staffKey || "").trim();
      var inputPassword = String(payload.password || "").trim();
      
      var matchedStaff = null;
      for (var i = 0; i < staffList.length; i++) {
        if (String(staffList[i].StaffKey || "").trim() === inputStaffKey) {
          matchedStaff = staffList[i];
          break;
        }
      }
      
      if (!matchedStaff) {
        return ContentService.createTextOutput(JSON.stringify({ status: "error", message: "Mã nhân viên hoặc mật khẩu không đúng." }))
                             .setMimeType(ContentService.MimeType.JSON);
      }
      
      var verdict = verifyStoredPassword(inputPassword, String(matchedStaff.Password || ""), inputStaffKey);
      if (!verdict.ok) {
        return ContentService.createTextOutput(JSON.stringify({ status: "error", message: "Mã nhân viên hoặc mật khẩu không đúng." }))
                             .setMimeType(ContentService.MimeType.JSON);
      }
      if (verdict.upgraded) {
        matchedStaff.Password = verdict.upgraded;
        writeRecordToSheet("Staff", "update", matchedStaff.StaffKey, matchedStaff);
      }
      
      if (matchedStaff.FireDate && String(matchedStaff.FireDate).trim() !== "") {
        return ContentService.createTextOutput(JSON.stringify({ status: "error", message: "Tài khoản đã bị vô hiệu hóa (nghỉ việc)." }))
                             .setMimeType(ContentService.MimeType.JSON);
      }
      
      delete matchedStaff.Password;
      
      return ContentService.createTextOutput(JSON.stringify({ status: "success", staff: matchedStaff }))
                           .setMimeType(ContentService.MimeType.JSON);
    }

    if (action === "batch") {
      var operations = Array.isArray(payload.operations) ? payload.operations : [];
      var results = [];
      for (var opIndex = 0; opIndex < operations.length; opIndex++) {
        var operation = operations[opIndex];
        results.push(writeRecordToSheet(operation.type, operation.action, operation.key, operation.data || {}));
      }
      result = { status: "success", action: "batch", count: results.length, results: results };
      return ContentService.createTextOutput(JSON.stringify(result))
                           .setMimeType(ContentService.MimeType.JSON);
    }

    if (action === "sync_sources") {
      var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Source");
      if (!sheet) {
        throw new Error("Sheet not found: Source");
      }
      var lastRow = sheet.getLastRow();
      if (lastRow > 1) {
        sheet.deleteRows(2, lastRow - 1);
      }
      var records = Array.isArray(payload.data) ? payload.data : [];
      var headers = ["DiagnosisID", "PatientAddress", "ResultConsultID", "CathMethod"];
      var existingLastCol = Math.max(sheet.getLastColumn(), 1);
      var existingHeaders = sheet.getRange(1, 1, 1, existingLastCol).getValues()[0];
      var changed = false;
      for (var h = 0; h < headers.length; h++) {
        if (existingHeaders.indexOf(headers[h]) === -1) {
          existingHeaders.push(headers[h]);
          changed = true;
        }
      }
      if (changed) {
        sheet.getRange(1, 1, 1, existingHeaders.length).setValues([existingHeaders]);
      }
      var actualHeaders = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
      var rowsToAppend = [];
      for (var rIndex = 0; rIndex < records.length; rIndex++) {
        var rec = records[rIndex];
        var rowVal = [];
        for (var col = 0; col < actualHeaders.length; col++) {
          var head = actualHeaders[col];
          rowVal.push(rec[head] !== undefined ? rec[head] : "");
        }
        rowsToAppend.push(rowVal);
      }
      if (rowsToAppend.length > 0) {
        sheet.getRange(2, 1, rowsToAppend.length, actualHeaders.length).setValues(rowsToAppend);
      }
      result = { status: "success", action: "sync_sources", count: rowsToAppend.length };
      return ContentService.createTextOutput(JSON.stringify(result))
                           .setMimeType(ContentService.MimeType.JSON);
    }

    if (action === "consult_slide_extract") {
      result = consultSlideExtractGemini(payload);
      return ContentService.createTextOutput(JSON.stringify(result))
        .setMimeType(ContentService.MimeType.JSON);
    }
    if (action === "consult_slide_extract_enqueue") {
      result = consultSlideEnqueueExtract(payload);
      return ContentService.createTextOutput(JSON.stringify(result))
        .setMimeType(ContentService.MimeType.JSON);
    }
    if (action === "consult_slide_extract_process") {
      result = consultSlideProcessExtractJob(payload);
      return ContentService.createTextOutput(JSON.stringify(result))
        .setMimeType(ContentService.MimeType.JSON);
    }
    if (action === "consult_slide_extract_status") {
      result = consultSlideExtractJobStatus(payload);
      return ContentService.createTextOutput(JSON.stringify(result))
        .setMimeType(ContentService.MimeType.JSON);
    }
    if (action === "upload_staff_slide") {
      result = uploadStaffSlideToDrive(payload);
      return ContentService.createTextOutput(JSON.stringify(result))
        .setMimeType(ContentService.MimeType.JSON);
    }
    if (action === "update" || action === "insert") {
      result = writeRecordToSheet(type, action, key, record);
    } else if (action === "delete") {
      result = deleteRecordFromSheet(type, key);
    }
  } catch (err) {
    var errMsg = err && err.message ? String(err.message) : String(err);
    result = { status: "error", message: errMsg };
  }

  return ContentService.createTextOutput(JSON.stringify(result))
                       .setMimeType(ContentService.MimeType.JSON);
}

/**
 * Upload PPTX slide staff to Drive.
 * payload: {
 *   fileName, base64, rootFolderId, yearFolderName, monthFolderName
 * }
 *
 * Canh bao: can oauthScopes https://www.googleapis.com/auth/drive
 * (xem GOOGLE_APPS_SCRIPT_MANIFEST / ham authorizeStaffSlideDrive).
 */
function isDriveAuthError(err) {
  var msg = err && err.message ? String(err.message) : String(err || "");
  return /auth\/drive/i.test(msg) ||
    /DriveApp\.Folder\.createFolder/i.test(msg) ||
    /DriveApp\.createFolder/i.test(msg) ||
    /DriveApp\.File\.setSharing/i.test(msg) ||
    /DriveApp\.Folder\.createFile/i.test(msg) ||
    /不具有呼叫.*DriveApp/i.test(msg) ||
    /無權呼叫.*DriveApp/i.test(msg) ||
    /do not have permission to call.*DriveApp/i.test(msg);
}

function driveAuthHelpMessage(originalMsg) {
  return "Apps Script chưa có quyền Google Drive (oauth scope auth/drive). " +
    "Cách sửa: mở Apps Script → Project Settings → bật appsscript.json → dán manifest có " +
    "https://www.googleapis.com/auth/drive → Lưu → chạy hàm authorizeStaffSlideDrive → Allow → " +
    "Deploy → Manage deployments → Edit → New version. Chi tiết gốc: " +
    String(originalMsg || "");
}

/**
 * Chạy thủ công trong Apps Script editor (dropdown hàm → Run) để Google hiện lại màn hình cấp quyền Drive.
 * Sau khi Allow, Deploy lại Web app (New version).
 */
function authorizeStaffSlideDrive() {
  // Touch DriveApp so the project requests the full Drive scope.
  var root = DriveApp.getRootFolder();
  var name = root.getName();
  return "OK: đã có quyền Drive (" + name + "). Hãy Deploy → Manage deployments → New version.";
}

function findOrCreateSubfolder(parentFolder, folderName) {
  var name = String(folderName || "").trim();
  if (!name) throw new Error("Thiếu tên thư mục Drive");
  var folders = parentFolder.getFoldersByName(name);
  if (folders.hasNext()) return folders.next();
  try {
    return parentFolder.createFolder(name);
  } catch (err) {
    if (isDriveAuthError(err)) {
      throw new Error(driveAuthHelpMessage(err && err.message ? err.message : err));
    }
    throw err;
  }
}

function uploadStaffSlideToDrive(payload) {
  var fileName = String(payload.fileName || "").trim();
  if (!fileName) fileName = "staff-slide.pptx";
  if (!/\.pptx$/i.test(fileName)) fileName = fileName + ".pptx";

  var base64 = String(payload.base64 || "").replace(/^data:[^;]+;base64,/, "");
  if (!base64) throw new Error("Thiếu nội dung file PPTX (base64)");

  var rootFolderId = String(payload.rootFolderId || "").trim();
  var yearFolderName = String(payload.yearFolderName || "").trim();
  var monthFolderName = String(payload.monthFolderName || "").trim();
  if (!rootFolderId || !yearFolderName || !monthFolderName) {
    throw new Error("Thiếu cấu hình thư mục Drive (root/year/month)");
  }

  try {
    var root = DriveApp.getFolderById(rootFolderId);
    var yearFolder = findOrCreateSubfolder(root, yearFolderName);
    var monthFolder = findOrCreateSubfolder(yearFolder, monthFolderName);

    var blob = Utilities.newBlob(Utilities.base64Decode(base64), "application/vnd.openxmlformats-officedocument.presentationml.presentation", fileName);
    var file = monthFolder.createFile(blob);
    try {
      file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    } catch (shareErr) {
      // Ignore share errors; owner can still open the file.
    }

    return {
      status: "success",
      action: "upload_staff_slide",
      fileId: file.getId(),
      url: file.getUrl(),
      name: file.getName(),
      yearFolderName: yearFolderName,
      monthFolderName: monthFolderName
    };
  } catch (err) {
    if (isDriveAuthError(err)) {
      throw new Error(driveAuthHelpMessage(err && err.message ? err.message : err));
    }
    throw err;
  }
}

function consultSlideExtractJsonFromText(text) {
  var trimmed = String(text || "").trim();
  var tick3 = String.fromCharCode(96, 96, 96);
  var fenceStart = trimmed.indexOf(tick3);
  if (fenceStart >= 0) {
    var fenceEnd = trimmed.indexOf(tick3, fenceStart + 3);
    if (fenceEnd > fenceStart) {
      trimmed = trimmed.substring(fenceStart + 3, fenceEnd).trim();
      if (trimmed.toLowerCase().indexOf("json") === 0) {
        trimmed = trimmed.replace(/^json\s*/i, "").trim();
      }
    }
  }
  var start = trimmed.indexOf("{");
  var end = trimmed.lastIndexOf("}");
  if (start >= 0 && end > start) trimmed = trimmed.substring(start, end + 1);
  return JSON.parse(trimmed);
}

/** @consult-slide-prompt:start */
/** Generated from src/consultSlide/appsScriptPromptLines.ts — do not edit by hand. */
function buildConsultSlidePrompt(patient, consult) {
  patient = patient || {};
  consult = consult || {};
  var ctx = JSON.stringify({ patient: patient, consult: consult }, null, 2);
  var lines = [
    "Ban la tro ly OCR phieu hanh chinh + TTE nhi khoa VN.",
    "Trich xuat DUNG chu tren anh; khong doan bua.",
    "",
    "Du lieu he thong (chi dung khi anh mo):",
    "__CTX__",
    "",
    "Quy tac bat buoc:",
    "- PatientName = ten BE/BENH NHI (dong Ho va ten).",
    "- KHONG lay ten Me/Bo/Nguoi nha/BS chi dinh.",
    "- PatientID1 = Ma NB hoac Ma BN (chu so, thuong 8-12 so).",
    "- PatientID2 = Ma HS neu co; khong thi \"\".",
    "- CAM: ma TE..., barcode, QR, RIS, PID ky tu la.",
    "- PatientDOB bat buoc neu co tren phieu (dd/mm/yyyy).",
    "- PatientPhone = SDT tren phieu (thuong 10 so).",
    "- PatientWeight/Height uu tien phieu hanh chinh/viet tay.",
    "- PatientAddress = dia chi NHA BN (xa/huyen/tinh).",
    "- KHONG lay dia chi benh vien / \"TP\" tren tieu de BV.",
    "- PatientAddress: neu duoc, ghi ten TINH/TP cuoi dia chi.",
    "- KHONG dua RIS login, URL, QR credentials vao JSON.",
    "- tteFindings: bullet tung y; tteConclusion tach rieng.",
    "- DetailDiagnosis uu tien ket luan TTE.",
    "",
    "Tra ve JSON thuan (khong markdown) dung schema:",
    "{",
    "  \"PatientName\": \"\",",
    "  \"OtherPatientName\": \"\",",
    "  \"PatientID1\": \"\",",
    "  \"PatientID2\": \"\",",
    "  \"PatientSex\": \"\",",
    "  \"PatientDOB\": \"\",",
    "  \"PatientAddress\": \"\",",
    "  \"PatientPhone\": \"\",",
    "  \"PatientWeight\": \"\",",
    "  \"PatientHeight\": \"\",",
    "  \"ageLabel\": \"\",",
    "  \"clinicalSummary\": \"\",",
    "  \"DetailDiagnosis\": \"\",",
    "  \"historySummary\": \"\",",
    "  \"tteDate\": \"\",",
    "  \"tteFindings\": [\"\"],",
    "  \"tteConclusion\": \"\",",
    "  \"ecgNote\": \"\",",
    "  \"cxrNote\": \"\",",
    "  \"surgNote\": \"\",",
    "  \"cathNote\": \"\"",
    "}",
  ];
  var out = [];
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i];
    if (line === "__CTX__") {
      out.push(ctx);
    } else {
      out.push(line);
    }
  }
  return out.join("\n");
}

/** @consult-slide-prompt:end */

function consultSlideResolveModels(preferred) {
  var models = [];
  var p = String(preferred || "").trim();
  var candidates = [];
  if (p) candidates.push(p);
  candidates.push("gemini-3.8-flash");
  candidates.push("gemini-2.5-flash-lite");
  for (var c = 0; c < candidates.length; c++) {
    var name = String(candidates[c] || "").trim();
    if (!name) continue;
    if (models.indexOf(name) === -1) models.push(name);
  }
  return models;
}

function consultSlideFormatGeminiHttpError(httpCode, responseText) {
  var body = String(responseText || "");
  var message = "";
  try {
    var parsed = JSON.parse(body);
    if (parsed.error && parsed.error.message) {
      message = String(parsed.error.message);
    }
  } catch (ignore) {}
  if (!message) {
    message = body.length > 320 ? body.substring(0, 320) + "..." : body;
  }
  if (httpCode === 503 || httpCode === 429) {
    message =
      message +
      " (Google tam qua tai — thu lai sau 2-5 phut; hoac dat GEMINI_MODEL=gemini-3.8-flash va paste Code.gs moi co retry/fallback.)";
  }
  return "HTTP " + httpCode + ": " + message;
}

function consultSlideGeminiGenerationConfig(jsonMode) {
  var config = {
    temperature: 0,
    thinkingConfig: { thinkingLevel: "LOW" },
  };
  if (jsonMode) {
    config.responseMimeType = "application/json";
  }
  return config;
}

function consultSlideIsRetryableGeminiCode(code) {
  return code === 429 || code === 503 || code === 500;
}

function consultSlideFetchGeminiGenerate(apiKey, model, body, maxAttempts, maxSleepMs) {
  var attempts = maxAttempts || 3;
  var capSleep = maxSleepMs || 4000;
  var url =
    "https://generativelanguage.googleapis.com/v1beta/models/" +
    encodeURIComponent(model) +
    ":generateContent";
  var lastCode = 0;
  var lastText = "";
  for (var attempt = 0; attempt < attempts; attempt++) {
    if (attempt > 0) {
      var waitMs = Math.min(800 * attempt, capSleep);
      Utilities.sleep(waitMs);
    }
    var response = UrlFetchApp.fetch(url, {
      method: "post",
      contentType: "application/json",
      headers: { "x-goog-api-key": apiKey },
      payload: JSON.stringify(body),
      muteHttpExceptions: true,
    });
    lastCode = response.getResponseCode();
    lastText = response.getContentText();
    if (lastCode >= 200 && lastCode < 300) {
      return { ok: true, code: lastCode, text: lastText };
    }
    if (!consultSlideIsRetryableGeminiCode(lastCode) || attempt === attempts - 1) {
      return { ok: false, code: lastCode, text: lastText };
    }
  }
  return { ok: false, code: lastCode, text: lastText };
}

/** Test nhanh (~10s): 1 model, 1 lan goi — chon ham nay neu UI cu quay hoai. */
function runConsultSlideGeminiSmokeTestQuick() {
  var props = PropertiesService.getScriptProperties();
  var apiKey = String(props.getProperty("GEMINI_API_KEY") || "").trim();
  if (!apiKey) {
    throw new Error("Thiếu GEMINI_API_KEY trong Script properties.");
  }
  var model = String(props.getProperty("GEMINI_MODEL") || "gemini-3.8-flash").trim();
  var body = {
    contents: [{ role: "user", parts: [{ text: "Tra loi bang mot tu: OK" }] }],
    generationConfig: consultSlideGeminiGenerationConfig(false),
  };
  var result = consultSlideFetchGeminiGenerate(apiKey, model, body, 1, 0);
  Logger.log(model + " HTTP " + result.code);
  Logger.log(result.text);
  if (result.ok) {
    return;
  }
  throw new Error(consultSlideFormatGeminiHttpError(result.code, result.text));
}

/** Chay thu day du: retry + fallback model (co the ~30-60s). */
function runConsultSlideGeminiSmokeTest() {
  var props = PropertiesService.getScriptProperties();
  var apiKey = String(props.getProperty("GEMINI_API_KEY") || "").trim();
  if (!apiKey) {
    throw new Error("Thiếu GEMINI_API_KEY trong Script properties.");
  }
  var models = consultSlideResolveModels(
    String(props.getProperty("GEMINI_MODEL") || "gemini-3.8-flash").trim()
  ).slice(0, 2);
  var body = {
    contents: [{ role: "user", parts: [{ text: "Tra loi bang mot tu: OK" }] }],
    generationConfig: consultSlideGeminiGenerationConfig(false),
  };
  var errors = [];
  for (var i = 0; i < models.length; i++) {
    var model = models[i];
    var result = consultSlideFetchGeminiGenerate(apiKey, model, body, 2, 2500);
    Logger.log(model + " HTTP " + result.code);
    Logger.log(result.text);
    if (result.ok) {
      return;
    }
    errors.push(model + ": " + consultSlideFormatGeminiHttpError(result.code, result.text));
  }
  throw new Error(
    (errors[errors.length - 1] || "Gemini smoke test failed") +
      " Da thu: " +
      models.join(", ")
  );
}

function consultSlideGetOcrJobsRoot() {
  var rootName = "CHD_OCR_Jobs";
  var folders = DriveApp.getFoldersByName(rootName);
  if (folders.hasNext()) return folders.next();
  return DriveApp.createFolder(rootName);
}

function consultSlideWriteJobMeta(jobFolder, meta) {
  var files = jobFolder.getFilesByName("job.json");
  while (files.hasNext()) {
    files.next().setTrashed(true);
  }
  jobFolder.createFile(
    Utilities.newBlob(JSON.stringify(meta), "application/json", "job.json")
  );
}

function consultSlideReadJobMeta(jobFolder) {
  var files = jobFolder.getFilesByName("job.json");
  if (!files.hasNext()) throw new Error("Khong tim thay job.json");
  return JSON.parse(files.next().getBlob().getDataAsString());
}

function consultSlideFindJobFolder(jobId) {
  var id = String(jobId || "").trim();
  if (!id) throw new Error("Thieu jobId");
  var root = consultSlideGetOcrJobsRoot();
  var folders = root.getFoldersByName(id);
  if (!folders.hasNext()) throw new Error("Khong tim thay job: " + id);
  return folders.next();
}

function consultSlideScheduleOcrProcess(jobId) {
  var props = PropertiesService.getScriptProperties();
  var queueRaw = String(props.getProperty("OCR_JOB_QUEUE") || "").trim();
  var queue = [];
  if (queueRaw) {
    try {
      queue = JSON.parse(queueRaw);
    } catch (ignore) {
      queue = [];
    }
  }
  if (!Array.isArray(queue)) queue = [];
  if (queue.indexOf(jobId) === -1) queue.push(jobId);
  props.setProperty("OCR_JOB_QUEUE", JSON.stringify(queue.slice(-20)));
  try {
    ScriptApp.newTrigger("consultSlideDrainOcrQueue")
      .timeBased()
      .after(1000)
      .create();
  } catch (triggerErr) {
    console.warn("Khong tao duoc OCR trigger: " + triggerErr);
  }
}

/** Trigger handler — process queued OCR jobs after enqueue. */
function consultSlideDrainOcrQueue() {
  var props = PropertiesService.getScriptProperties();
  var queueRaw = String(props.getProperty("OCR_JOB_QUEUE") || "").trim();
  var queue = [];
  if (queueRaw) {
    try {
      queue = JSON.parse(queueRaw);
    } catch (ignore) {
      queue = [];
    }
  }
  if (!Array.isArray(queue) || !queue.length) return;
  var jobId = String(queue.shift() || "").trim();
  props.setProperty("OCR_JOB_QUEUE", JSON.stringify(queue));
  if (!jobId) return;
  try {
    consultSlideProcessExtractJob({ jobId: jobId });
  } catch (err) {
    console.error("OCR job failed " + jobId + ": " + err);
  }
  try {
    var triggers = ScriptApp.getProjectTriggers();
    for (var t = 0; t < triggers.length; t++) {
      if (triggers[t].getHandlerFunction() === "consultSlideDrainOcrQueue") {
        ScriptApp.deleteTrigger(triggers[t]);
      }
    }
  } catch (delErr) {}
  if (queue.length) {
    consultSlideScheduleOcrProcess(queue[0]);
  }
}

function consultSlideEnqueueExtract(payload) {
  var attachments = Array.isArray(payload.attachments) ? payload.attachments : [];
  if (!attachments.length) throw new Error("Can it nhat mot anh hoac PDF");
  if (attachments.length > 3) attachments = attachments.slice(0, 3);

  var jobId = Utilities.getUuid().replace(/-/g, "").substring(0, 20);
  var root = consultSlideGetOcrJobsRoot();
  var jobFolder = root.createFolder(jobId);
  var fileIds = [];

  for (var i = 0; i < attachments.length; i++) {
    var att = attachments[i] || {};
    var b64 = String(att.base64 || "").replace(/^data:[^;]+;base64,/, "");
    if (!b64) continue;
    var mime = String(att.mimeType || "image/jpeg");
    var kind = String(att.kind || "file");
    var name = String(att.fileName || (kind + "_" + i + ".jpg")).replace(/[^\w.\-]+/g, "_");
    var blob = Utilities.newBlob(Utilities.base64Decode(b64), mime, name);
    var file = jobFolder.createFile(blob);
    fileIds.push({
      fileId: file.getId(),
      kind: kind,
      mimeType: mime,
      fileName: name
    });
  }
  if (!fileIds.length) throw new Error("Khong luu duoc anh OCR");

  var meta = {
    jobId: jobId,
    status: "queued",
    patient: payload.patient || {},
    consult: payload.consult || {},
    fileIds: fileIds,
    createdAt: new Date().toISOString(),
    message: ""
  };
  consultSlideWriteJobMeta(jobFolder, meta);
  consultSlideScheduleOcrProcess(jobId);
  return {
    status: "success",
    action: "consult_slide_extract_enqueue",
    jobId: jobId,
    jobStatus: "queued"
  };
}

function consultSlideLoadAttachmentsFromJob(meta) {
  var out = [];
  var files = Array.isArray(meta.fileIds) ? meta.fileIds : [];
  for (var i = 0; i < files.length; i++) {
    var item = files[i] || {};
    var file = DriveApp.getFileById(String(item.fileId || ""));
    var blob = file.getBlob();
    out.push({
      kind: String(item.kind || ""),
      mimeType: String(item.mimeType || blob.getContentType() || "image/jpeg"),
      fileName: String(item.fileName || file.getName() || ""),
      base64: Utilities.base64Encode(blob.getBytes())
    });
  }
  return out;
}

function consultSlideProcessExtractJob(payload) {
  var jobId = String(payload.jobId || "").trim();
  var jobFolder = consultSlideFindJobFolder(jobId);
  var meta = consultSlideReadJobMeta(jobFolder);
  if (meta.status === "done" && meta.extract) {
    return {
      status: "success",
      action: "consult_slide_extract_process",
      jobId: jobId,
      jobStatus: "done",
      extract: meta.extract,
      model: meta.model || ""
    };
  }
  if (meta.status === "running") {
    return {
      status: "success",
      action: "consult_slide_extract_process",
      jobId: jobId,
      jobStatus: "running"
    };
  }

  meta.status = "running";
  meta.message = "";
  consultSlideWriteJobMeta(jobFolder, meta);

  try {
    var attachments = consultSlideLoadAttachmentsFromJob(meta);
    var geminiResult = consultSlideExtractGemini({
      patient: meta.patient || {},
      consult: meta.consult || {},
      attachments: attachments
    });
    meta.status = "done";
    meta.extract = geminiResult.extract;
    meta.model = geminiResult.model || "";
    meta.finishedAt = new Date().toISOString();
    consultSlideWriteJobMeta(jobFolder, meta);
    return {
      status: "success",
      action: "consult_slide_extract_process",
      jobId: jobId,
      jobStatus: "done",
      extract: meta.extract,
      model: meta.model
    };
  } catch (err) {
    meta.status = "error";
    meta.message = err && err.message ? String(err.message) : String(err);
    meta.finishedAt = new Date().toISOString();
    consultSlideWriteJobMeta(jobFolder, meta);
    return {
      status: "error",
      action: "consult_slide_extract_process",
      jobId: jobId,
      jobStatus: "error",
      message: meta.message
    };
  }
}

function consultSlideExtractJobStatus(payload) {
  var jobId = String(payload.jobId || "").trim();
  var jobFolder = consultSlideFindJobFolder(jobId);
  var meta = consultSlideReadJobMeta(jobFolder);
  var out = {
    status: "success",
    action: "consult_slide_extract_status",
    jobId: jobId,
    jobStatus: String(meta.status || "unknown")
  };
  if (meta.extract) out.extract = meta.extract;
  if (meta.model) out.model = meta.model;
  if (meta.message) out.message = meta.message;
  return out;
}

function consultSlideExtractGemini(payload) {
  var props = PropertiesService.getScriptProperties();
  var apiKey = String(props.getProperty("GEMINI_API_KEY") || "").trim();
  if (!apiKey) {
    throw new Error("Thiếu GEMINI_API_KEY trong Apps Script (Project Settings → Script properties). Dán cùng API key Gemini như Cloudflare.");
  }
  var patient = payload.patient || {};
  var consult = payload.consult || {};
  var attachments = Array.isArray(payload.attachments) ? payload.attachments : [];
  if (!attachments.length) throw new Error("Cần ít nhất một ảnh hoặc PDF");
  if (attachments.length > 3) attachments = attachments.slice(0, 3);

  // Web OCR path: one preferred model, one attempt (avoid CF/Worker timeouts).
  var preferredModel = String(payload.model || props.getProperty("GEMINI_MODEL") || "gemini-3.8-flash").trim();
  var models = [preferredModel];
  var prompt = buildConsultSlidePrompt(patient, consult);
  var parts = [{ text: prompt }];
  for (var i = 0; i < attachments.length; i++) {
    var att = attachments[i] || {};
    var b64 = String(att.base64 || "").replace(/^data:[^;]+;base64,/, "");
    if (!b64) continue;
    parts.push({
      inlineData: {
        mimeType: String(att.mimeType || "image/jpeg"),
        data: b64
      }
    });
    parts.push({ text: "[File loại: " + String(att.kind || "") + "]" });
  }

  var errors = [];
  var requestBody = {
    contents: [{ role: "user", parts: parts }],
    generationConfig: consultSlideGeminiGenerationConfig(true),
  };
  for (var m = 0; m < models.length; m++) {
    var model = models[m];
    var result = consultSlideFetchGeminiGenerate(apiKey, model, requestBody, 1, 0);
    var code = result.code;
    var responseText = result.text;
    if (result.ok) {
      var parsed = JSON.parse(responseText);
      var cand = parsed.candidates && parsed.candidates[0];
      var partText = cand && cand.content && cand.content.parts && cand.content.parts[0] && cand.content.parts[0].text;
      if (!partText) throw new Error("Gemini không trả nội dung (model: " + model + ")");
      var extract = consultSlideExtractJsonFromText(partText);
      return { status: "success", action: "consult_slide_extract", extract: extract, model: model };
    }
    var shortErr = consultSlideFormatGeminiHttpError(code, responseText);
    errors.push(model + ": " + shortErr);
  }
  throw new Error("Gemini lỗi — " + (errors[errors.length - 1] || "unknown"));
}

// Convert Sheet into Array of JSON Objects
function safeReadSheetAsJson(ss, sheetName) {
  try {
    return readSheetAsJson(ss, sheetName);
  } catch (err) {
    console.error("Failed to read sheet " + sheetName + ": " + err);
    return [];
  }
}

function safeStringify(value) {
  return JSON.stringify(value, function(key, val) {
    if (val instanceof Date) {
      if (isNaN(val.getTime())) return "";
      try {
        return val.toISOString();
      } catch (dateErr) {
        return "";
      }
    }
    return val;
  });
}

function formatCellDateValue(cellVal) {
  if (!(cellVal instanceof Date)) return null;
  if (isNaN(cellVal.getTime())) return "";
  try {
    if (cellVal.getHours() === 0 && cellVal.getMinutes() === 0 && cellVal.getSeconds() === 0) {
      var year = cellVal.getFullYear();
      var month = ("0" + (cellVal.getMonth() + 1)).slice(-2);
      var day = ("0" + cellVal.getDate()).slice(-2);
      return year + "-" + month + "-" + day;
    }
    return cellVal.toISOString();
  } catch (dateErr) {
    return "";
  }
}

function readSheetAsJson(ss, sheetName) {
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) return [];

  var lastRow = sheet.getLastRow();
  var lastCol = sheet.getLastColumn();
  if (lastRow <= 1) return []; // Only headers

  var schemaKeys = [
    // Staff
    "StaffKey", "StaffName", "Name", "StaffSex", "Avatar", "StaffDOB", "Department", "Career", "StaffPhone", "Password", "Role", "Permissions", "StaffRolePreset", "Email", "FireDate", "ShowInLichKhoa",
    // Patient
    "PatientKey", "PatientID1", "PatientID2", "PatientName", "OtherPatientName", "PatientDOB", "PatientSex", "PatientAddress", "PatientPhone1", "PatientPhone2", "PatientCreateBy", "PatientCreateTime", "Outcome", "PatientAddressDefaultWarning",
    // Consult
    "ConsultKey", "ConsultType", "PatientWeight", "PatientHeight", "ConsultDate", "RequestBy", "DiagnosisID", "DetailDiagnosis", "ConsultCreateBy", "ConsultCreateTime", "ConsultMember", "ConsultResultID", "DetailConsultResult", "ConsultNote", "PlannedDevice", "PlannedPrice", "PriorityOrder", "RiskFactor", "ConsultResultCreateBy", "ConsultResultCreateTime", "CheckDevice", "OperationFeedback", "SupplyDepFeedback", "CallStatus", "CallNote", "PlannedCathLabDate", "FundingRequest", "CheckDeviceDate", "CheckDeviceBy", "CathMethod", "PostCathDepart", "Scheduled1stInterventionist", "Scheduled2ndInterventionist", "Scheduled3rdInterventionist", "FilePPTX",
    // CathLab
    "CathKey", "CathDate", "PostDiagnosisID", "PostDiagnosis", "CathResultID", "CathMethod", "CathPlan", "CathNote", "_1stInterventionist", "_2ndInterventionist", "_3rdInterventionist", "_4thInterventionist", "PlannedFollowUpDate", "CathUpdatedBy", "CathUpdatedTime",
    // Operation
    "SurgKey", "SurgDate", "DetailDiagnosisManual", "SurgResultID", "SurgNote", "SurgMethod", "1stSurgeon", "2ndSurgeon", "3rdSurgeon", "4thSurgeon", "SurgCreateTime", "SurgUpdatedBy",
    // CMR
    "CMRKey", "CMRkey", "MBN", "Họ và tên", "Tình trạng", "CMRDiagnosisID", "CMRDiagnosis", "CMRRequest", "DepartRequest", "CMRMethod", "CMRDevice", "PostDepart", "Anesthesia", "CMRScheduledDate", "DayOfWeek", "CMRCallStatus", "CMRCallStatusNote", "CMRDate", "CMRResult", "CMRNote", "ConcludedResult", "PDFResult", "NextPlan", "UpdateTime",
    // Transplant
    "TransKey", "TransWeight", "TransHeight", "BloodType", "Gens", "GensFile", "MRI", "MRIFile", "TTE", "TTEFile", "Holter", "HolterFile", "TransDiagID", "DetailTransDiag", "Treatment", "TransNote", "TransStatus", "TransDate", "TransCreatedTime", "TransUpdateBy", "TransUpdateTime",
    // DeviceTemplate
    "PHƯƠNG PHÁP PHẪU THUẬT", "DeviceName", "FullDeviceName", "Size", "Price", "bhyt",
    // RolePreset
    "RolePresetID", "RolePresetLabel", "RolePresetDescription", "SortOrder", "IsSystem"
  ];

  var normalizationMap = {};
  for (var k = 0; k < schemaKeys.length; k++) {
    normalizationMap[schemaKeys[k].toLowerCase()] = schemaKeys[k];
  }

  var rawHeaders = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  var headers = [];
  for (var h = 0; h < rawHeaders.length; h++) {
    var rawH = String(rawHeaders[h] || "").trim();
    var lowerH = rawH.toLowerCase();
    if (normalizationMap[lowerH]) {
      headers.push(normalizationMap[lowerH]);
    } else {
      headers.push(rawH);
    }
  }

  var dataRange = sheet.getRange(2, 1, lastRow - 1, lastCol);
  var values = dataRange.getValues();
  
  var jsonArray = [];
  for (var r = 0; r < values.length; r++) {
    var row = values[r];
    var obj = {};
    var emptyRow = true;
    for (var c = 0; c < headers.length; c++) {
      var cellVal = row[c];
      var headerName = headers[c];
      
      // Convert Date objects to ISO string
      if (cellVal instanceof Date) {
        obj[headerName] = formatCellDateValue(cellVal);
      } else {
        if (cellVal !== undefined && cellVal !== null) {
          if (headerName === "PatientID1" || headerName === "PatientID2" || headerName === "PatientPhone1" || headerName === "PatientPhone2" || headerName === "StaffPhone" || headerName === "PatientWeight" || headerName === "PatientHeight") {
            var strVal = String(cellVal).trim();
            if (strVal.startsWith("'")) {
              strVal = strVal.substring(1);
            }
            obj[headerName] = strVal;
          } else {
            obj[headerName] = cellVal;
          }
        } else {
          obj[headerName] = "";
        }
      }
      
      if (cellVal !== "") {
        emptyRow = false;
      }
    }
    if (!emptyRow) {
      jsonArray.push(obj);
    }
  }
  return jsonArray;
}

function stripStaffPasswords(staff) {
  var safe = [];
  for (var i = 0; i < staff.length; i++) {
    var copy = {};
    for (var key in staff[i]) {
      if (staff[i].hasOwnProperty(key) && key !== "Password") copy[key] = staff[i][key];
    }
    safe.push(copy);
  }
  return safe;
}

function sha256Hex(input) {
  var rawHash = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, input, Utilities.Charset.UTF_8);
  var output = "";
  for (var i = 0; i < rawHash.length; i++) {
    var val = rawHash[i];
    if (val < 0) val += 256;
    var byteString = val.toString(16);
    if (byteString.length == 1) byteString = "0" + byteString;
    output += byteString;
  }
  return output;
}

function hashPassword(password, salt) {
  var useSalt = salt ? String(salt) : Utilities.getUuid().replace(/-/g, "");
  return "sha256$" + useSalt + "$" + sha256Hex(password + ":" + useSalt);
}

function verifyStoredPassword(password, stored, staffKey) {
  var saved = String(stored || "").trim();
  if (!saved || !password) return { ok: false, upgraded: "" };
  if (saved.indexOf("sha256$") === 0) {
    var parts = saved.split("$");
    if (parts.length !== 3) return { ok: false, upgraded: "" };
    return { ok: hashPassword(password, parts[1]) === saved, upgraded: "" };
  }
  if (/^[0-9a-f]{64}$/i.test(saved)) {
    var legacy = sha256Hex(password + ":" + staffKey);
    if (legacy.toLowerCase() === saved.toLowerCase()) {
      return { ok: true, upgraded: hashPassword(password, "") };
    }
    return { ok: false, upgraded: "" };
  }
  if (saved === String(password)) {
    return { ok: true, upgraded: hashPassword(password, "") };
  }
  return { ok: false, upgraded: "" };
}

// Check if a string is a 64-character SHA-256 hash (hexadecimal)
function isSHA256(str) {
  return /^[0-9a-f]{64}$/i.test(str);
}
`;
