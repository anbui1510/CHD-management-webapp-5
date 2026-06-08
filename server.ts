/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import express from 'express';
import path from 'path';
import fs from 'fs';
import { createServer as createViteServer } from 'vite';
import { Patient, Consult, Staff, CathLab } from './src/types';

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

app.use(express.json());

// Proxy endpoint to bypass CORS for Google Drive Export
app.get('/api/proxy/drive-export', async (req, res) => {
  const { url } = req.query;
  if (!url || typeof url !== 'string' || !url.startsWith('https://docs.google.com/')) {
    return res.status(400).json({ error: 'Invalid Google Drive URL' });
  }
  try {
    const fetchRes = await fetch(url);
    if (!fetchRes.ok) {
      return res.status(fetchRes.status).send('Fetch from Google Drive failed');
    }
    const buffer = await fetchRes.arrayBuffer();
    res.set('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(Buffer.from(buffer));
  } catch (error) {
    console.error('Drive proxy error:', error);
    res.status(500).json({ error: 'Internal Server Error fetching file' });
  }
});

// Path to persist JSON database
const DB_DIR = path.join(process.cwd(), 'data');
const STAFF_FILE = path.join(DB_DIR, 'staff.json');
const PATIENTS_FILE = path.join(DB_DIR, 'patients.json');
const CONSULTS_FILE = path.join(DB_DIR, 'consults.json');
const CATHLABS_FILE = path.join(DB_DIR, 'cathlabs.json');
const SYNC_CONFIG_FILE = path.join(DB_DIR, 'sync_config.json');

// Ensure DB directory exists
if (!fs.existsSync(DB_DIR)) {
  fs.mkdirSync(DB_DIR);
}

// Google Sheets Sync Config Interface & Helpers
interface SyncConfig {
  scriptUrl: string;
}

function getSyncConfig(): SyncConfig {
  if (process.env.GOOGLE_SCRIPT_URL) {
    return { scriptUrl: process.env.GOOGLE_SCRIPT_URL };
  }
  try {
    if (fs.existsSync(SYNC_CONFIG_FILE)) {
      const content = fs.readFileSync(SYNC_CONFIG_FILE, 'utf-8');
      return JSON.parse(content);
    }
  } catch (err) {
    console.error('Error reading sync config:', err);
  }
  return { scriptUrl: '' };
}

function saveSyncConfig(config: SyncConfig): void {
  try {
    fs.writeFileSync(SYNC_CONFIG_FILE, JSON.stringify(config, null, 2), 'utf-8');
  } catch (err) {
    console.error('Error writing sync config:', err);
  }
}

// Helper to fetch with timeout to prevent server hanging if Apps Script is slow
async function fetchWithTimeout(url: string, options: any = {}, timeout = 15000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal
    });
    clearTimeout(id);
    return response;
  } catch (error) {
    clearTimeout(id);
    throw error;
  }
}

// Throttle sync pulls so we don't spam Google Sheets on concurrent requests
let lastSyncTime = 0;
const SYNC_COOLDOWN_MS = 6000; // 6 seconds minimum between background pulls

async function syncFromGoogleSheets(force = false): Promise<boolean> {
  const config = getSyncConfig();
  if (!config.scriptUrl) return false;

  const now = Date.now();
  if (!force && now - lastSyncTime < SYNC_COOLDOWN_MS) {
    // Skip pulling if synced recently (use local cache instead for extreme speed)
    return true;
  }

  try {
    console.log(`Pulling data from Google Sheets: ${config.scriptUrl}`);
    const response = await fetchWithTimeout(`${config.scriptUrl}?action=getAll`, {
      method: 'GET',
      headers: { 'Accept': 'application/json' }
    }, 15000);

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json() as any;

    if (data && (Array.isArray(data.patients) || Array.isArray(data.consults) || Array.isArray(data.staff) || Array.isArray(data.cathlabs))) {
      if (Array.isArray(data.patients)) {
        const uniquePatients = Array.from(new Map(data.patients.map((p: any) => [p.PatientKey, p])).values());
        writeDB(PATIENTS_FILE, uniquePatients);
      }
      if (Array.isArray(data.consults)) {
        // preserve local fields like TransferredToCathLab
        const currentConsults = readDB(CONSULTS_FILE, []);
        const currentMap = new Map();
        currentConsults.forEach(c => currentMap.set((c as any).ConsultKey, c));

        data.consults = data.consults.map((c: any) => {
          const localRecord = currentMap.get(c.ConsultKey);
          if (localRecord && localRecord.TransferredToCathLab !== undefined) {
             c.TransferredToCathLab = localRecord.TransferredToCathLab;
          }
          return c;
        });

        const uniqueConsults = Array.from(new Map(data.consults.map((c: any) => [c.ConsultKey, c])).values());
        writeDB(CONSULTS_FILE, uniqueConsults);
      }
      if (Array.isArray(data.cathlabs) && data.cathlabs.length > 0) {
        const uniqueCathlabs = Array.from(new Map(data.cathlabs.map((c: any) => [c.CathKey, c])).values());
        writeDB(CATHLABS_FILE, uniqueCathlabs);
      }
      if (Array.isArray(data.staff) && data.staff.length > 0) {
        const uniqueStaff = Array.from(new Map(data.staff.map((s: any) => [s.StaffKey, s])).values());
        writeDB(STAFF_FILE, uniqueStaff);
      }
      lastSyncTime = Date.now();
      console.log('Successfully pulling synced and updated local database cache!');
      return true;
    }
  } catch (err) {
    console.error('Failed to pull from Google Sheets (will use caching instead):', err);
  }
  return false;
}

async function syncToGoogleSheets(type: 'Patient' | 'Consult' | 'Staff' | 'CathLab', action: 'insert' | 'update', key: string, record: any): Promise<boolean> {
  const config = getSyncConfig();
  if (!config.scriptUrl) return false;

  try {
    console.log(`Pushing mutation to Google Sheets: type=${type}, action=${action}, key=${key}`);
    const response = await fetchWithTimeout(config.scriptUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        action,
        type,
        key,
        data: record
      })
    }, 15000);

    if (response.ok) {
      const resData = await response.json() as any;
      if (resData && resData.status === 'success') {
        console.log(`Successfully updated Google Sheet for key ${key}!`);
        return true;
      } else {
        console.warn('Google Sheet responded with error:', resData);
      }
    }
  } catch (err) {
    console.error(`Failed to push update to Google Sheet for key ${key}:`, err);
  }
  return false;
}

// Initial Staff Data
const defaultStaff: Staff[] = [
  {
    StaffKey: "11111",
    StaffName: "Admin",
    Name: "Admin",
    Password: "1111",
    Role: "Admin",
    Email: "admin@hospital.vn",
    FireDate: ""
  },
  {
    StaffKey: "01378",
    StaffName: "Bùi Tuấn Ân",
    Name: "BS. Ân",
    Password: "1111",
    Role: "User",
    StaffSex: "Nam",
    Email: "anbui150@gmail.com",
    StaffPhone: "0348940432",
    FireDate: ""
  },
  {
    StaffKey: "01651",
    StaffName: "Lê Trần Bảo Nghi",
    Name: "BS. Nghi",
    Password: "1111",
    Role: "User",
    StaffSex: "Nữ",
    StaffDOB: "13/05/1995",
    Department: "Nội Tim Mạch",
    Career: "Bác sĩ",
    Email: "baonghile.95@gmail.com",
    StaffPhone: "0932051995",
    FireDate: ""
  },
  {
    StaffKey: "02000",
    StaffName: "Nguyễn Thu Trang",
    Name: "BS. Trang",
    Password: "1111",
    Role: "User",
    StaffSex: "Nữ",
    Department: "Nội Tim Mạch",
    Career: "Bác sĩ",
    Email: "",
    FireDate: ""
  },
  {
    StaffKey: "33333",
    StaffName: "BS. Lợi",
    Password: "user",
    Role: "User",
    Email: "loi@company.com",
    FireDate: ""
  },
  {
    StaffKey: "44444",
    StaffName: "BS. Phụng",
    Password: "user",
    Role: "User",
    Email: "phung@company.com",
    FireDate: ""
  },
  {
    StaffKey: "55555",
    StaffName: "BS. Thịnh",
    Password: "user",
    Role: "User",
    Email: "thinh@company.com",
    FireDate: ""
  },
  {
    StaffKey: "77777",
    StaffName: "BS. Hiếu",
    Password: "user",
    Role: "User",
    Email: "hieu@company.com",
    FireDate: ""
  },
  {
    StaffKey: "88888",
    StaffName: "BS. Tài",
    Password: "user",
    Role: "User",
    Email: "tai@company.com",
    FireDate: ""
  },
  {
    StaffKey: "99999",
    StaffName: "BS. Hùng",
    Password: "user",
    Role: "User",
    Email: "hung@company.com",
    FireDate: ""
  },
  {
    StaffKey: "10000",
    StaffName: "BS Tĩnh",
    Password: "user",
    Role: "User",
    Email: "tinh@company.com",
    FireDate: ""
  }
];

// Initial Patient Data
const defaultPatients: Patient[] = [
  {
    PatientKey: "pat_001",
    PatientID1: "BN001",
    PatientID2: "NB-2024-05",
    PatientName: "Nguyễn Hoàng Nam",
    OtherPatientName: "Nguyễn Hoàng Nam",
    PatientDOB: "2018-04-12",
    PatientSex: "Nam",
    PatientAddress: "Hà Nội",
    PatientPhone1: "0912345678",
    PatientPhone2: "0987654321",
    PatientCreateBy: "01378",
    PatientCreateTime: "2026-01-10T08:30:00Z",
    Outcome: "Đã mổ"
  },
  {
    PatientKey: "pat_002",
    PatientID1: "BN002",
    PatientID2: "NB-2024-11",
    PatientName: "Trần Mai Phương",
    OtherPatientName: "Trần Mai Phương",
    PatientDOB: "2020-08-25",
    PatientSex: "Nữ",
    PatientAddress: "Hải Phòng",
    PatientPhone1: "0923456789",
    PatientPhone2: "",
    PatientCreateBy: "11111",
    PatientCreateTime: "2026-02-15T14:15:00Z",
    Outcome: ""
  },
  {
    PatientKey: "pat_003",
    PatientID1: "BN003",
    PatientID2: "NB-2025-01",
    PatientName: "Lê Minh Khôi",
    OtherPatientName: "Lê Minh Khôi",
    PatientDOB: "2022-11-02",
    PatientSex: "Nam",
    PatientAddress: "Nghệ An",
    PatientPhone1: "0934567890",
    PatientPhone2: "0911223344",
    PatientCreateBy: "11111",
    PatientCreateTime: "2026-03-01T09:00:00Z",
    Outcome: "Đã thông"
  }
];

// Initial Consult Data
const defaultConsults: Consult[] = [
  {
    ConsultKey: "con_001",
    PatientKey: "pat_002",
    ConsultType: "Staff mổ",
    PatientWeight: "12kg",
    ConsultDate: "2026-06-01",
    RequestBy: "Admin",
    DiagnosisID: "VSD",
    DetailDiagnosis: "Thông liên thất phần màng d = 6mm, tăng áp động mạch phổi vừa",
    Department: "Tim Mạch",
    ConsultCreateBy: "11111",
    ConsultCreateTime: "2026-05-30T10:00:00Z",
    ConsultResultID: "", // Pending Consult! Contains no result
    DetailConsultResult: "",
    ConsultNote: "Theo dõi sát nồng độ oxy huyết",
    PlannedDevice: "Vá thông liên thất bằng miếng vá dacron",
    PlannedPrice: "35,000,000 VND",
    PriorityOrder: "Chương trình",
    RiskFactor: "3 - Không HF, HF độ I-II / có chỉ định mổ",
    CheckDevice: "Đủ"
  },
  {
    ConsultKey: "con_002",
    PatientKey: "pat_001",
    ConsultType: "Staff thông",
    PatientWeight: "18kg",
    ConsultDate: "2026-05-15",
    RequestBy: "Bùi Tuấn Ân",
    DiagnosisID: "PDA",
    DetailDiagnosis: "Còn ống động mạch d = 4mm, luồng thông Trái - Phải",
    Department: "Ngoại LN-TM",
    ConsultCreateBy: "01378",
    ConsultCreateTime: "2026-05-10T11:00:00Z",
    ConsultResultID: "Can thiệp thông tim",
    DetailConsultResult: "Bít ống động mạch bằng dù chuyên dụng thành công",
    ConsultNote: "Tái khám sau 1 tháng",
    PlannedDevice: "Dù bít PDA Amplatzer",
    PlannedPrice: "45,000,000 VND",
    PriorityOrder: "Chương trình",
    RiskFactor: "3 -SpO2 > 75% ổn định",
    CheckDevice: "Đủ"
  }
];

// Initial CathLab Data
const defaultCathlabs: CathLab[] = [];

// Helper functions for reading/writing Database
function readDB<T>(filePath: string, defaultData: T[]): T[] {
  try {
    if (!fs.existsSync(filePath)) {
      fs.writeFileSync(filePath, JSON.stringify(defaultData, null, 2), 'utf-8');
      return defaultData;
    }
    const data = fs.readFileSync(filePath, 'utf-8');
    let parsed = JSON.parse(data);
    
    // Deduplicate read data just in case
    if (Array.isArray(parsed) && parsed.length > 0) {
      if ('PatientKey' in parsed[0]) {
        parsed = Array.from(new Map(parsed.map((p: any) => [p.PatientKey, p])).values());
      } else if ('ConsultKey' in parsed[0]) {
        parsed = Array.from(new Map(parsed.map((c: any) => [c.ConsultKey, c])).values());
      } else if ('CathKey' in parsed[0]) {
        parsed = Array.from(new Map(parsed.map((c: any) => [c.CathKey, c])).values());
      } else if ('StaffKey' in parsed[0]) {
        parsed = Array.from(new Map(parsed.map((s: any) => [s.StaffKey, s])).values());
      }
    }
    
    return parsed;
  } catch (err) {
    console.error(`Error reading ${filePath}:`, err);
    return defaultData;
  }
}

function writeDB<T>(filePath: string, data: T[]): void {
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
  } catch (err) {
    console.error(`Error writing to ${filePath}:`, err);
  }
}

// API Sync Config Router Endpoints
app.get('/api/sync-config', (req, res) => {
  const config = getSyncConfig();
  res.json({
    scriptUrl: config.scriptUrl,
    isSynced: !!config.scriptUrl
  });
});

app.post('/api/sync-config', async (req, res) => {
  const { scriptUrl } = req.body;
  
  if (!scriptUrl) {
    // Disconnect sync
    saveSyncConfig({ scriptUrl: '' });
    return res.json({ success: true, message: "Disconnected visual sheet integration. Switched back to local database." });
  }

  // Pin check of URL format
  if (!scriptUrl.startsWith('https://script.google.com/')) {
    return res.status(400).json({ error: "Địa chỉ Apps Script không hợp lệ! URL phải bắt đầu bằng https://script.google.com/" });
  }

  try {
    // Verify scriptUrl responds properly
    console.log(`Testing connection & initializing database worksheets on URL: ${scriptUrl}`);
    const testRes = await fetchWithTimeout(`${scriptUrl}?action=test`, { method: 'GET' }, 10000);
    
    if (!testRes.ok) {
      throw new Error(`Google Apps Script trả về lỗi HTTP ${testRes.status}`);
    }

    const testText = await testRes.text();
    const cleanText = testText.trim();

    // Check if the script returned an HTML page (Google login or error document) instead of JSON
    if (cleanText.startsWith('<!DOCTYPE') || cleanText.startsWith('<html') || cleanText.startsWith('<!doctype')) {
      throw new Error(
        "Apps Script của bạn đang trả về một trang Web HTML thay vì dữ liệu JSON. Điều này thường do 2 nguyên nhân sau:\n\n" +
        "1. Bạn chưa cấp quyền 'Anyone' (Bất kỳ ai) khi deploy: Trong Google Apps Script, hãy nhấn 'Triển khai mới' (New deployment) -> phần 'Who has access' (Ai có quyền truy cập) bắt buộc phải chọn 'Anyone' (Bất kỳ ai) sau đó nhấn Deploy rồi lấy link mới.\n\n" +
        "2. Bạn dán nhầm link chỉnh sửa thiết kế hoặc link của nhà phát triển (kết thúc bằng /dev) thay vì URL của Web App chính thức được cấp sau khi nhấn Deploy."
      );
    }

    let testData;
    try {
      testData = JSON.parse(cleanText);
    } catch (parseErr) {
      throw new Error(`Đầu ra nhận được từ Apps Script không phải là JSON hợp lệ. Vui lòng kiểm tra lại nội dung dán vào Code.gs. Phản hồi thô: ${cleanText.substring(0, 150)}...`);
    }

    if (testData.status !== 'success') {
      throw new Error(testData.message || "Không thể khởi động kết nối dữ liệu! Hãy đảm bảo Apps Script được triển khai đúng quyền truy cập ('Anyone').");
    }

    // Save and immediately trigger full initial pull sync
    saveSyncConfig({ scriptUrl });
    const pullSuccess = await syncFromGoogleSheets(true);

    res.json({
      success: true,
      message: pullSuccess 
        ? "Kết nối thành công! Toàn bộ dữ liệu Bệnh nhi & Nhân viên đã được đồng bộ hóa trực tiếp từ Google Sheet của bạn."
        : "Kết nối Google Sheet thành công, nhưng không thể tải dữ liệu ban đầu. Đang sử dụng bản lưu trữ cục bộ."
    });
  } catch (err: any) {
    console.error('Failed to configure Google Sheet synchronization URL:', err);
    res.status(500).json({ error: err.message || "Không thể kết nối tới Google Apps Script URL. Vui lòng kiểm tra lại cấu hình." });
  }
});

// Manual force sync endpoint
app.post('/api/sync-config/sync', async (req, res) => {
  const pullSuccess = await syncFromGoogleSheets(true);
  if (pullSuccess) {
    res.json({ success: true, message: "Đồng bộ thành công dữ liệu mới nhất từ Google Sheets!" });
  } else {
    res.status(500).json({ error: "Không thể kết nối tới Google Sheet. Đang hiển thị dữ liệu lưu tạm ngoại tuyến." });
  }
});

// Routes
app.get('/api/staff', async (req, res) => {
  await syncFromGoogleSheets();
  const staff = readDB<Staff>(STAFF_FILE, defaultStaff);
  res.json(staff);
});

app.get('/api/patients', async (req, res) => {
  await syncFromGoogleSheets();
  const patients = readDB<Patient>(PATIENTS_FILE, defaultPatients);
  res.json(patients);
});

app.post('/api/patients', async (req, res) => {
  const patients = readDB<Patient>(PATIENTS_FILE, defaultPatients);
  const newPatient: Patient = req.body;
  
  // Back-end validation / augmentation
  newPatient.PatientKey = newPatient.PatientKey || `pat_${Date.now()}`;
  newPatient.PatientCreateTime = newPatient.PatientCreateTime || newTimestamp();
  
  patients.push(newPatient);
  writeDB<Patient>(PATIENTS_FILE, patients);
  
  // Update Google Sheet asynchronously if configured
  syncToGoogleSheets('Patient', 'insert', newPatient.PatientKey, newPatient);
  
  res.status(201).json(newPatient);
});

app.put('/api/patients/:key', async (req, res) => {
  const patients = readDB<Patient>(PATIENTS_FILE, defaultPatients);
  const key = req.params.key;
  const updateData: Partial<Patient> = req.body;
  
  const index = patients.findIndex(p => p.PatientKey === key || p.PatientID1 === key);
  if (index !== -1) {
    patients[index] = { ...patients[index], ...updateData };
    writeDB<Patient>(PATIENTS_FILE, patients);
    
    // Update Google Sheet asynchronously if configured
    syncToGoogleSheets('Patient', 'update', patients[index].PatientKey, patients[index]);
    
    res.json(patients[index]);
  } else {
    res.status(404).json({ error: 'Patient not found' });
  }
});

app.get('/api/consults', async (req, res) => {
  await syncFromGoogleSheets();
  const consults = readDB<Consult>(CONSULTS_FILE, defaultConsults);
  res.json(consults);
});

app.post('/api/consults', async (req, res) => {
  const consults = readDB<Consult>(CONSULTS_FILE, defaultConsults);
  const newConsult: Consult = req.body;
  
  // Set Key dynamically
  newConsult.ConsultKey = newConsult.ConsultKey || `con_${Date.now()}`;
  newConsult.ConsultCreateTime = newConsult.ConsultCreateTime || newTimestamp();
  
  consults.push(newConsult);
  writeDB<Consult>(CONSULTS_FILE, consults);
  
  // Update Google Sheet asynchronously
  syncToGoogleSheets('Consult', 'insert', newConsult.ConsultKey, newConsult);
  
  res.status(201).json(newConsult);
});

// Update an existing consult result (or details)
app.put('/api/consults/:key', async (req, res) => {
  const consults = readDB<Consult>(CONSULTS_FILE, defaultConsults);
  const key = req.params.key;
  const updateData: Partial<Consult> = req.body;
  
  const index = consults.findIndex(c => c.ConsultKey === key);
  if (index !== -1) {
    consults[index] = { ...consults[index], ...updateData };
    writeDB<Consult>(CONSULTS_FILE, consults);
    
    // Update Google Sheet asynchronously
    syncToGoogleSheets('Consult', 'update', consults[index].ConsultKey, consults[index]);
    
    res.json(consults[index]);
  } else {
    res.status(404).json({ error: 'Consult not found' });
  }
});

app.get('/api/cathlabs', async (req, res) => {
  await syncFromGoogleSheets();
  const cathlabs = readDB<CathLab>(CATHLABS_FILE, defaultCathlabs);
  res.json(cathlabs);
});

app.post('/api/cathlabs', async (req, res) => {
  const cathlabs = readDB<CathLab>(CATHLABS_FILE, defaultCathlabs);
  const newCathLab: CathLab = req.body;
  
  newCathLab.CathKey = newCathLab.CathKey || `cath_${Date.now()}`;
  cathlabs.push(newCathLab);
  writeDB<CathLab>(CATHLABS_FILE, cathlabs);
  
  syncToGoogleSheets('CathLab', 'insert', newCathLab.CathKey, newCathLab);
  res.status(201).json(newCathLab);
});

app.put('/api/cathlabs/:key', async (req, res) => {
  const cathlabs = readDB<CathLab>(CATHLABS_FILE, defaultCathlabs);
  const key = req.params.key;
  const index = cathlabs.findIndex(c => c.CathKey === key);
  if (index !== -1) {
    cathlabs[index] = { ...cathlabs[index], ...req.body };
    writeDB<CathLab>(CATHLABS_FILE, cathlabs);
    
    syncToGoogleSheets('CathLab', 'update', cathlabs[index].CathKey, cathlabs[index]);
    res.json(cathlabs[index]);
  } else {
    res.status(404).json({ error: 'CathLab not found' });
  }
});

function newTimestamp() {
  return new Date().toISOString();
}

// Reset Database API (Useful for testing)
app.post('/api/reset', (req, res) => {
  writeDB<Patient>(PATIENTS_FILE, defaultPatients);
  writeDB<Consult>(CONSULTS_FILE, defaultConsults);
  writeDB<Staff>(STAFF_FILE, defaultStaff);
  res.json({ message: "Database reset to defaults successfully" });
});

// Vite Development or Production Mode Static Setup
async function launch() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    // Serve HTML
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

launch();
