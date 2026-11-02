export const GOOGLE_APPS_SCRIPT_CODE = `/**
 * SCRIPT_VERSION: 2026-10-09-security
 * Google Apps Script for Pediatric Cardiac (CHD) Patient Management System
 * Hook this script into your Google Sheets to sync with Cloud Run in real-time.
 * 
 * Instructions:
 * 1. Open your Google Sheet (https://docs.google.com/spreadsheets/d/your-sheet-id)
 * 2. In the top menu, go to "Extensions" (Tiện ích mở rộng) -> "Apps Script"
 * 3. Copy code tu docs/Code.gs (hoac nut Copy trong app Virtual Google Sheets). KHONG copy truc tiep file appsScriptCode.ts (co dong export/semicolon dong template gay loi cu phap).
 * 4. Click the Save icon (orange folder/save icon).
 * 5. Click "Deploy" (Triển khai) -> "New deployment" (Triển khai mới).
 * 6. Select "Web app" (Ứng dụng web) as deployment type (click gear icon next to "Select type").
 * 7. Configure:
 *    - Description: CHD Direct Web Sync
 *    - Execute as: "Me" (Tôi - your own email)
 *    - Who has access: "Anyone" (Bất kỳ ai) -> This is required so the webapp can talk to it.
 * 8. Click "Deploy" (Triển khai).
 * 9. Authorize Permissions (click Advanced -> Go to Untitled project / Allow).
 * 10. Copy the "Web app URL" (starts with https://script.google.com/macros/s/...)
 * 11. Paste this URL into the Connect Settings in your Web app!
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
    "StaffKey", "StaffName", "Name", "StaffSex", "Avatar", "StaffDOB", "Department", "Career", "StaffPhone", "Password", "Role", "Permissions", "StaffRolePreset", "Email", "FireDate"
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
    } else if (action === "upload_staff_slide") {
      result = uploadStaffSlideToDrive(payload);
    } else if (action === "update" || action === "insert") {
      result = writeRecordToSheet(type, action, key, record);
    } else if (action === "delete") {
      result = deleteRecordFromSheet(type, key);
    }
  } catch (err) {
    result = { status: "error", message: err.toString() };
  }

  return ContentService.createTextOutput(JSON.stringify(result))
                       .setMimeType(ContentService.MimeType.JSON);
}

/**
 * Upload PPTX slide staff to Drive.
 * payload: {
 *   fileName, base64, rootFolderId, yearFolderName, monthFolderName
 * }
 */
function findOrCreateSubfolder(parentFolder, folderName) {
  var name = String(folderName || "").trim();
  if (!name) throw new Error("Thiếu tên thư mục Drive");
  var folders = parentFolder.getFoldersByName(name);
  if (folders.hasNext()) return folders.next();
  return parentFolder.createFolder(name);
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

function buildConsultSlidePrompt(patient, consult) {
  patient = patient || {};
  consult = consult || {};
  return "Bạn là trợ lý lâm sàng tim mạch nhi. Đọc các ảnh/PDF đính kèm (phiếu hành chính, kết quả siêu âm TTE, ECG, CXR nếu có) và trích xuất thông tin cho slide hội chẩn.\n\nDữ liệu đã có trên hệ thống (ưu tiên giữ nếu ảnh không rõ):\n" + JSON.stringify({ patient: patient, consult: consult }, null, 2) + "\n\nYêu cầu:\n- Đọc cả chữ in và chữ viết tay (cân nặng, chiều cao, SĐT).\n- KHÔNG đưa tài khoản/mật khẩu RIS, URL đăng nhập, mã QR credentials, hay thông tin đăng nhập vào JSON.\n- Ngày tháng dùng dd/mm/yyyy khi có thể.\n- tteFindings: danh sách bullet ngắn gọn từng ý siêu âm.\n- tteConclusion: kết luận siêu âm.\n- historySummary: tóm tắt bệnh sử ngắn hoặc rỗng.\n- surgNote / cathNote: có thể rỗng.\n\nTrả về JSON thuần với các trường PatientName, OtherPatientName, PatientID1, PatientID2, PatientSex, PatientDOB, PatientAddress, PatientPhone, PatientWeight, PatientHeight, ageLabel, clinicalSummary, DetailDiagnosis, historySummary, tteDate, tteFindings (mảng), tteConclusion, ecgNote, cxrNote, surgNote, cathNote.";
}

function consultSlideResolveModels(preferred) {
  var models = [];
  var p = String(preferred || "").trim();
  if (p) models.push(p);
  if (models.indexOf("gemini-2.5-flash") === -1) models.push("gemini-2.5-flash");
  if (models.indexOf("gemini-2.5-flash-lite") === -1) models.push("gemini-2.5-flash-lite");
  return models;
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
  if (attachments.length > 6) attachments = attachments.slice(0, 6);

  var preferredModel = String(payload.model || props.getProperty("GEMINI_MODEL") || "gemini-2.5-flash").trim();
  var models = consultSlideResolveModels(preferredModel);
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
  for (var m = 0; m < models.length; m++) {
    var model = models[m];
    var url = "https://generativelanguage.googleapis.com/v1beta/models/" + encodeURIComponent(model) + ":generateContent?key=" + encodeURIComponent(apiKey);
    var body = {
      contents: [{ role: "user", parts: parts }],
      generationConfig: { responseMimeType: "application/json" }
    };
    var response = UrlFetchApp.fetch(url, {
      method: "post",
      contentType: "application/json",
      payload: JSON.stringify(body),
      muteHttpExceptions: true
    });
    var code = response.getResponseCode();
    var responseText = response.getContentText();
    if (code >= 200 && code < 300) {
      var parsed = JSON.parse(responseText);
      var cand = parsed.candidates && parsed.candidates[0];
      var partText = cand && cand.content && cand.content.parts && cand.content.parts[0] && cand.content.parts[0].text;
      if (!partText) throw new Error("Gemini không trả nội dung (model: " + model + ")");
      var extract = consultSlideExtractJsonFromText(partText);
      return { status: "success", action: "consult_slide_extract", extract: extract, model: model };
    }
    var shortErr = responseText.length > 400 ? responseText.substring(0, 400) + "…" : responseText;
    errors.push(model + ": " + shortErr);
  }
  throw new Error("Gemini lỗi: " + (errors[errors.length - 1] || "unknown"));
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
    "StaffKey", "StaffName", "Name", "StaffSex", "Avatar", "StaffDOB", "Department", "Career", "StaffPhone", "Password", "Role", "Permissions", "StaffRolePreset", "Email", "FireDate",
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
