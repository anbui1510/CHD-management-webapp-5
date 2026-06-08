export const GOOGLE_APPS_SCRIPT_CODE = `/**
 * Google Apps Script for Pediatric Cardiac (CHD) Patient Management System
 * Hook this script into your Google Sheets to sync with Cloud Run in real-time.
 * 
 * Instructions:
 * 1. Open your Google Sheet (https://docs.google.com/spreadsheets/d/your-sheet-id)
 * 2. In the top menu, go to "Extensions" (Tiện ích mở rộng) -> "Apps Script"
 * 3. Delete any default code in Code.gs and paste this entire script.
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
  }
  return sheet;
}

// Ensure sheets exist on load or action
function initializeDatabase() {
  var patientHeaders = [
    "PatientKey", "PatientID1", "PatientID2", "PatientName", "OtherPatientName",
    "PatientDOB", "PatientSex", "PatientAdress", "PatientPhone1", "PatientPhone2",
    "PatientCreateBy", "PatientCreateTime", "Outcome"
  ];
  
  var consultHeaders = [
    "ConsultKey", "PatientKey", "ConsultType", "PatientWeight", "PatientHeight", "ConsultDate",
    "RequestBy", "DiagnosisID", "DetailDiagnosis", "Department", "ConsultCreateBy",
    "ConsultCreateTime", "ConsultMember", "ConsultResultID", "DetailConsultResult", "ConsultNote",
    "PlannedDevice", "PlannedPrice", "PriorityOrder", "RiskFactor", "ConsultResultCreateBy",
    "ConsultResultCreateTime", "CheckDevice", "OperationFeedback", "SupplyDepFeedback",
    "CallStatus", "CallNote", "PlannedCathLabDate", "FundingRequest", "CheckDeviceDate",
    "CheckDeviceBy", "CathMethod", "PostCathDepart", "Scheduled1stInterventionist",
    "Scheduled2ndInterventionist", "Scheduled3rdInterventionist"
  ];
  
  var staffHeaders = [
    "StaffKey", "StaffName", "Name", "StaffSex", "Avatar", "StaffDOB", "Department", "Career", "StaffPhone", "Password", "Role", "Email", "FireDate"
  ];
  
  var cathLabHeaders = [
    "CathKey", "PatientKey", "ConsultKey", "CathDate", "PostDiagnosisID", "PostDiagnosis",
    "CathResultID", "CathMethod", "CathPlan", "CathNote", "_1stInterventionist",
    "_2ndInterventionist", "_3rdInterventionist", "_4thInterventionist", "PlannedFollowUpDate",
    "CathUpdatedBy", "CathUpdatedTime"
  ];

  var operationHeaders = [
    "SurgKey", "PatientKey", "ConsultKey", "SurgDate", "DetailDiagnosisManual", "PostDiagnosis",
    "SurgResultID", "SurgNote", "SurgMethod", "PlannedFollowUpDate", "1stSurgeon", "2ndSurgeon", "3rdSurgeon", "4thSurgeon", "SurgCreateTime", "SurgUpdatedBy"
  ];
  
  var cmrHeaders = [
    "CMRKey", "ConsultKey", "PatientKey", "CMRDate", "CMRMethod", "CMRResult", "CMRNote"
  ];

  var sourseHeaders = [];

  getOrCreateSheet("Patient", patientHeaders);
  getOrCreateSheet("Consult", consultHeaders);
  getOrCreateSheet("Staff", staffHeaders);
  getOrCreateSheet("CathLab", cathLabHeaders);
  getOrCreateSheet("Operation", operationHeaders);
  getOrCreateSheet("CMR", cmrHeaders);
  
  if (sourseHeaders.length > 0) {
    getOrCreateSheet("Sourse", sourseHeaders);
  } else {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    if (!ss.getSheetByName("Sourse")) {
      ss.insertSheet("Sourse");
    }
  }
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
  var sourses = readSheetAsJson("Sourse");

  // If Staff is completely empty, populate with some default users so admin can login
  if (staff.length === 0) {
    var staffSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Staff");
    if (staffSheet) {
      staffSheet.appendRow(["01378", "BS Minh Tuấn (Admin)", "admin", "Admin", "tuan.nguyen@company.com", ""]);
      staffSheet.appendRow(["11111", "BS Thu Hà (User)", "user", "User", "ha.thu@company.com", ""]);
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
    sourses: sourses
  };

  return ContentService.createTextOutput(JSON.stringify(responseData))
                       .setMimeType(ContentService.MimeType.JSON);
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

    if (action === "update" || action === "insert") {
      var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(type);
      if (!sheet) {
        return ContentService.createTextOutput(JSON.stringify({ status: "error", message: "Sheet not found: " + type }))
                             .setMimeType(ContentService.MimeType.JSON);
      }

      var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
      var keyColumnName = type + "Key";
      var keyColIndex = headers.indexOf(keyColumnName) + 1;

      if (keyColIndex === 0) {
        // Fallback if Column name differs
        keyColIndex = 1;
      }

      // Search for existing row by key
      var lastRow = sheet.getLastRow();
      var foundRowIndex = -1;
      
      if (lastRow > 1) {
        var keyValues = sheet.getRange(2, keyColIndex, lastRow - 1, 1).getValues();
        for (var i = 0; i < keyValues.length; i++) {
          if (keyValues[i][0] == key) {
            foundRowIndex = i + 2; // Offset for headers + index
            break;
          }
        }
      }

      // Format record object into row values matches headers exactly
      var rowValues = [];
      for (var col = 0; col < headers.length; col++) {
        var header = headers[col];
        var val = record[header];
        rowValues.push(val !== undefined ? val : "");
      }

      if (foundRowIndex !== -1) {
        // Update existing row
        var rowRange = sheet.getRange(foundRowIndex, 1, 1, headers.length);
        rowRange.setValues([rowValues]);
        result = { status: "success", action: "updated", key: key, rowIndex: foundRowIndex };
      } else {
        // Insert new row
        sheet.appendRow(rowValues);
        result = { status: "success", action: "inserted", key: key, rowIndex: sheet.getLastRow() };
      }
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
        // Check if date represents calendar date only (no time)
        if (cellVal.getHours() === 0 && cellVal.getMinutes() === 0 && cellVal.getSeconds() === 0) {
          // Format as YYYY-MM-DD
          var year = cellVal.getFullYear();
          var month = ("0" + (cellVal.getMonth() + 1)).slice(-2);
          var day = ("0" + cellVal.getDate()).slice(-2);
          obj[headers[c]] = year + "-" + month + "-" + day;
        } else {
          obj[headers[c]] = cellVal.toISOString();
        }
      } else {
        obj[headers[c]] = cellVal;
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
`;
