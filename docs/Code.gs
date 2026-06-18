/**
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
  
  // Set number format of string columns to Plain Text to preserve leading zeros
  for (var col = 0; col < headers.length; col++) {
    var header = headers[col];
    if (header === "PatientID1" || header === "PatientID2" || header === "PatientPhone1" || header === "PatientPhone2" || header === "StaffPhone") {
      var numRows = sheet.getMaxRows() - 1;
      if (numRows > 0) {
        sheet.getRange(2, col + 1, numRows, 1).setNumberFormat("@");
      }
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
    "Removed"
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
  initializeDatabase();
  
  // Protect against manual clicks on the "Run / Chạy" button inside Apps Script Editor where e is undefined
  var action = (e && e.parameter) ? e.parameter.action : "test";
  
  if (action === "test") {
    return ContentService.createTextOutput(JSON.stringify({ status: "success", message: "Connected successfully to Google Sheet!" }))
                         .setMimeType(ContentService.MimeType.JSON);
  }

  // Fetch all sheets
  var patients = readSheetAsJson("Patient");
  var consults = readSheetAsJson("Consult");
  var staff = readSheetAsJson("Staff");
  var cathlabs = readSheetAsJson("CathLab");
  var operations = readSheetAsJson("Operation");
  var cmrs = readSheetAsJson("CMR");
  var sources = readSheetAsJson("Source");
  var deviceTemplates = readSheetAsJson("DeviceTemplate");
  var rolePresets = readSheetAsJson("RolePreset");
  var notifications = readSheetAsJson("Notification");
  var doctorPerformanceMarks = readSheetAsJson("DoctorPerformanceMark");

  // If Staff is completely empty, populate with some default users so admin can login
  if (staff.length === 0) {
    var staffSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Staff");
    if (staffSheet) {
      staffSheet.appendRow(["01378", "BS Minh Tuấn (Admin)", "BS Minh Tuấn", "Nam", "", "", "", "", "", "admin", "Admin", "", "admin-khoa", "tuan.nguyen@company.com", ""]);
      staffSheet.appendRow(["11111", "BS Thu Hà (User)", "BS Thu Hà", "Nữ", "", "", "", "", "", "user", "User", "", "tuy-chinh", "ha.thu@company.com", ""]);
      staff = readSheetAsJson("Staff");
    }
  }

  var responseData = {
    patients: patients,
    consults: consults,
    staff: staff,
    cathlabs: cathlabs,
    operations: operations,
    cmrs: cmrs,
    sources: sources,
    deviceTemplates: deviceTemplates,
    rolePresets: rolePresets,
    notifications: notifications,
    doctorPerformanceMarks: doctorPerformanceMarks
  };

  return ContentService.createTextOutput(JSON.stringify(responseData))
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
  }
  return keyColumnName;
}

function writeRecordToSheet(type, action, key, record) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(type);
  if (!sheet) {
    throw new Error("Sheet not found: " + type);
  }

  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var keyColumnName = getKeyColumnNameForType(type);
  var keyColIndex = headers.indexOf(keyColumnName) + 1;

  if (keyColIndex === 0) {
    keyColIndex = 1;
  }

  var lastRow = sheet.getLastRow();
  var foundRowIndex = -1;
  
  if (lastRow > 1) {
    var keyValues = sheet.getRange(2, keyColIndex, lastRow - 1, 1).getValues();
    for (var i = 0; i < keyValues.length; i++) {
      if (keyValues[i][0] == key) {
        foundRowIndex = i + 2;
        break;
      }
    }
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
        header === "StaffPhone"
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

// POST Requests - Inserts or Updates records
function doPost(e) {
  initializeDatabase();
  var result = { status: "error", message: "Unknown action" };
  
  try {
    var rawData = e.postData.contents;
    var payload = JSON.parse(rawData);
    var action = payload.action;
    var type = payload.type; // "Patient" | "Consult" | "Staff"
    var key = payload.key; // Unique key to find
    var record = payload.data; // JSON Object

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

    if (action === "update" || action === "insert") {
      result = writeRecordToSheet(type, action, key, record);
    }
  } catch (err) {
    result = { status: "error", message: err.toString() };
  }

  return ContentService.createTextOutput(JSON.stringify(result))
                       .setMimeType(ContentService.MimeType.JSON);
}

// Convert Sheet into Array of JSON Objects
function readSheetAsJson(sheetName) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) return [];

  var lastRow = sheet.getLastRow();
  var lastCol = sheet.getLastColumn();
  if (lastRow <= 1) return []; // Only headers

  var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  var dataRange = sheet.getRange(2, 1, lastRow - 1, lastCol);
  var values = dataRange.getValues();
  
  var jsonArray = [];
  for (var r = 0; r < values.length; r++) {
    var row = values[r];
    var obj = {};
    var emptyRow = true;
    for (var c = 0; c < headers.length; c++) {
      var cellVal = row[c];
      
      // Convert Date objects to ISO string
      if (cellVal instanceof Date) {
        // Skip invalid dates (empty/broken cells) - toISOString() throws RangeError otherwise
        if (isNaN(cellVal.getTime())) {
          obj[headers[c]] = "";
        } else if (cellVal.getHours() === 0 && cellVal.getMinutes() === 0 && cellVal.getSeconds() === 0) {
          // Format as YYYY-MM-DD
          var year = cellVal.getFullYear();
          var month = ("0" + (cellVal.getMonth() + 1)).slice(-2);
          var day = ("0" + cellVal.getDate()).slice(-2);
          obj[headers[c]] = year + "-" + month + "-" + day;
        } else {
          obj[headers[c]] = cellVal.toISOString();
        }
      } else {
        var headerName = headers[c];
        if (cellVal !== undefined && cellVal !== null) {
          if (headerName === "PatientID1" || headerName === "PatientID2" || headerName === "PatientPhone1" || headerName === "PatientPhone2" || headerName === "StaffPhone") {
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
