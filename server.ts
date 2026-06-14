/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import express from 'express';
import path from 'path';
import fs from 'fs';
import { createServer as createViteServer } from 'vite';
import { Patient, Consult, Staff, CathLab, CMR, Source, RolePreset } from './src/types';
import { normalizeDiagnosisID } from './src/data/source';
import { DEFAULT_ROLE_PRESET_RECORDS } from './src/auth/rolePresetDefaults';
import { isSystemRolePresetId, resolveRolePresetRecords, slugifyRolePresetId } from './src/auth/permissions';

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
const OPERATIONS_FILE = path.join(DB_DIR, 'operations.json');
const CMRS_FILE = path.join(DB_DIR, 'cmrs.json');
const SOURCES_FILE = path.join(DB_DIR, 'sources.json');
const ROLE_PRESETS_FILE = path.join(DB_DIR, 'role-presets.json');
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

const recentLocalEdits = new Map<string, { timestamp: number; data: any }>();

function preserveRecentLocalRecords(map: Map<string, any>, prefix: string, getKey: (record: any) => string): void {
  const now = Date.now();
  for (const [editKey, recent] of recentLocalEdits.entries()) {
    if (!editKey.startsWith(`${prefix}_`)) continue;
    if (now - recent.timestamp >= 300000) continue;

    const recordKey = getKey(recent.data);
    if (recordKey && !map.has(recordKey)) {
      map.set(recordKey, recent.data);
    }
  }
}

function preserveLocalOnlyRecords(map: Map<string, any>, records: any[], getKey: (record: any) => string): void {
  records.forEach(record => {
    const key = getKey(record);
    if (key && !map.has(key)) {
      map.set(key, record);
    }
  });
}

function markLocalMutation(): void {
  lastSyncTime = Date.now();
}

function createUniqueKey(prefix: string, existingKeys: Iterable<any>): string {
  const existing = new Set(Array.from(existingKeys).map(key => String(key || '').trim()).filter(Boolean));
  let key = `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  while (existing.has(key)) {
    key = `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }
  return key;
}

// Periodically clean up stale recentLocalEdits (older than 5 minutes)
setInterval(() => {
  const now = Date.now();
  for (const [key, val] of recentLocalEdits.entries()) {
    if (now - val.timestamp > 300000) {
      recentLocalEdits.delete(key);
    }
  }
}, 60000);

function cleanSheetText(val: any): string {
  if (val === undefined || val === null) return '';
  let str = String(val).trim();
  if (str.startsWith("'")) {
    str = str.substring(1);
  }
  return str;
}

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

    if (data && (Array.isArray(data.patients) || Array.isArray(data.consults) || Array.isArray(data.staff) || Array.isArray(data.cathlabs) || Array.isArray(data.operations) || Array.isArray(data.cmrs) || Array.isArray(data.sources) || Array.isArray(data.rolePresets))) {
      if (Array.isArray(data.patients)) {
        const currentPatients = readDB<Patient>(PATIENTS_FILE, defaultPatients);
        const pMap = new Map();
        data.patients.forEach((p: any, i: number) => {
          const k = p.PatientKey || `pat_no_key_${i}`;
          p.PatientKey = k;
          
          if (p.PatientID1 !== undefined && p.PatientID1 !== null) {
            p.PatientID1 = cleanSheetText(p.PatientID1);
          }
          if (p.PatientID2 !== undefined && p.PatientID2 !== null) {
            p.PatientID2 = cleanSheetText(p.PatientID2);
          }
          if (p.PatientPhone1 !== undefined && p.PatientPhone1 !== null) {
            p.PatientPhone1 = cleanSheetText(p.PatientPhone1);
          }
          if (p.PatientPhone2 !== undefined && p.PatientPhone2 !== null) {
            p.PatientPhone2 = cleanSheetText(p.PatientPhone2);
          }
          
          // Overlay recent local edit if < 45s old to avoid overwriting with stale Sheets data
          const recent = recentLocalEdits.get(`Patient_${k}`);
          if (recent && (Date.now() - recent.timestamp < 45000)) {
            p = { ...p, ...recent.data };
          }
          
          pMap.set(k, p);
        });
        preserveLocalOnlyRecords(pMap, currentPatients, record => record.PatientKey);
        preserveRecentLocalRecords(pMap, 'Patient', record => record.PatientKey);
        writeDB(PATIENTS_FILE, Array.from(pMap.values()));
      }
      if (Array.isArray(data.consults)) {
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

        const cMap = new Map();
        data.consults.forEach((c: any, i: number) => {
          const k = c.ConsultKey || `con_no_key_${i}`;
          c.ConsultKey = k;
          
          // Overlay recent local edit if < 45s old to avoid overwriting with stale Sheets data
          const recent = recentLocalEdits.get(`Consult_${k}`);
          if (recent && (Date.now() - recent.timestamp < 45000)) {
            c = { ...c, ...recent.data };
          }
          
          cMap.set(k, c);
        });
        preserveLocalOnlyRecords(cMap, currentConsults, record => record.ConsultKey);
        preserveRecentLocalRecords(cMap, 'Consult', record => record.ConsultKey);
        writeDB(CONSULTS_FILE, Array.from(cMap.values()));
      }
      if (Array.isArray(data.cathlabs) && data.cathlabs.length > 0) {
        const currentCathlabs = readDB<CathLab>(CATHLABS_FILE, defaultCathlabs);
        const clMap = new Map();
        data.cathlabs.forEach((c: any, i: number) => {
          const k = c.CathKey || `cl_no_key_${i}`;
          c.CathKey = k;
          
          // Overlay recent local edit if < 45s old to avoid overwriting with stale Sheets data
          const recent = recentLocalEdits.get(`CathLab_${k}`);
          if (recent && (Date.now() - recent.timestamp < 45000)) {
            c = { ...c, ...recent.data };
          }
          
          clMap.set(k, c);
        });
        preserveLocalOnlyRecords(clMap, currentCathlabs, record => record.CathKey);
        preserveRecentLocalRecords(clMap, 'CathLab', record => record.CathKey);
        writeDB(CATHLABS_FILE, Array.from(clMap.values()));
      }
      if (Array.isArray(data.operations) && data.operations.length > 0) {
        const opMap = new Map();
        data.operations.forEach((o: any, i: number) => {
          const k = o.OpKey || o.SurgKey || `op_no_key_${i}`;
          if (o.SurgKey) o.SurgKey = k;
          if (o.OpKey) o.OpKey = k;
          opMap.set(k, o);
        });
        writeDB(OPERATIONS_FILE, Array.from(opMap.values()));
      }
      if (Array.isArray(data.cmrs) && data.cmrs.length > 0) {
        const currentCmrs = readDB<CMR>(CMRS_FILE, defaultCmrs);
        const cmrmap = new Map();
        data.cmrs.forEach((m: any, i: number) => {
          const k = m.CMRKey || m.CMRkey || `cmr_no_key_${i}`;
          m.CMRKey = k;

          const recent = recentLocalEdits.get(`CMR_${k}`);
          if (recent && (Date.now() - recent.timestamp < 45000)) {
            m = { ...m, ...recent.data };
          }

          cmrmap.set(k, m);
        });
        preserveLocalOnlyRecords(cmrmap, currentCmrs, record => record.CMRKey || record.CMRkey);
        preserveRecentLocalRecords(cmrmap, 'CMR', record => record.CMRKey || record.CMRkey);
        writeDB(CMRS_FILE, Array.from(cmrmap.values()));
      }
      if (Array.isArray(data.staff) && data.staff.length > 0) {
        const stMap = new Map();
        data.staff.forEach((s: any, i: number) => {
          const k = s.StaffKey || `st_no_key_${i}`;
          s.StaffKey = k;
          if (s.StaffPhone !== undefined && s.StaffPhone !== null) {
            s.StaffPhone = cleanSheetText(s.StaffPhone);
          }
          stMap.set(k, s);
        });
        writeDB(STAFF_FILE, Array.from(stMap.values()));
      }
      if (Array.isArray(data.sources) && data.sources.length > 0) {
        writeDB(SOURCES_FILE, data.sources);
      }
      if (Array.isArray(data.rolePresets)) {
        writeDB(ROLE_PRESETS_FILE, resolveRolePresetRecords(data.rolePresets));
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

async function syncToGoogleSheets(type: 'Patient' | 'Consult' | 'Staff' | 'CathLab' | 'CMR' | 'Source' | 'RolePreset', action: 'insert' | 'update', key: string, record: any): Promise<boolean> {
  const config = getSyncConfig();
  if (!config.scriptUrl) return false;

  // Clone record to format fields safely without polluting the database cache
  const dataToPush = { ...record };
  const numericTextCols = ['PatientID1', 'PatientID2', 'PatientPhone1', 'PatientPhone2', 'StaffPhone'];
  
  numericTextCols.forEach(col => {
    if (dataToPush[col] !== undefined && dataToPush[col] !== null) {
      let val = String(dataToPush[col]).trim();
      if (val !== "") {
        if (!val.startsWith("'")) {
          val = "'" + val;
        }
        dataToPush[col] = val;
      }
    }
  });

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
        data: dataToPush
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
const defaultCmrs: CMR[] = [];

// Helper functions for reading/writing Database
function readDB<T>(filePath: string, defaultData: T[]): T[] {
  try {
    if (!fs.existsSync(filePath)) {
      fs.writeFileSync(filePath, JSON.stringify(defaultData, null, 2), 'utf-8');
      return defaultData;
    }
    const data = fs.readFileSync(filePath, 'utf-8');
    let parsed = JSON.parse(data);
    
    // Deduplicate read data just in case.
    // IMPORTANT: check each table's OWN primary key first. Consult/CathLab/CMR/Operation
    // records also contain PatientKey, so deduping by PatientKey would wrongly collapse
    // multiple records of the same patient into one. PatientKey is only the primary key
    // for the Patient table, so it must be checked last (as a fallback).
    if (Array.isArray(parsed) && parsed.length > 0) {
      if ('ConsultKey' in parsed[0]) {
        const cMap = new Map();
        parsed.forEach((c: any, i: number) => {
          const k = c.ConsultKey || `con_no_key_${i}`;
          c.ConsultKey = k;
          cMap.set(k, c);
        });
        parsed = Array.from(cMap.values());
      } else if ('CathKey' in parsed[0]) {
        const clMap = new Map();
        parsed.forEach((c: any, i: number) => {
          const k = c.CathKey || `cl_no_key_${i}`;
          c.CathKey = k;
          clMap.set(k, c);
        });
        parsed = Array.from(clMap.values());
      } else if ('CMRKey' in parsed[0] || 'CMRkey' in parsed[0]) {
        const cmrMap = new Map();
        parsed.forEach((m: any, i: number) => {
          const k = m.CMRKey || m.CMRkey || `cmr_no_key_${i}`;
          m.CMRKey = k;
          cmrMap.set(k, m);
        });
        parsed = Array.from(cmrMap.values());
      } else if ('SurgKey' in parsed[0] || 'OpKey' in parsed[0]) {
        const opMap = new Map();
        parsed.forEach((o: any, i: number) => {
          const k = o.SurgKey || o.OpKey || `op_no_key_${i}`;
          if (o.SurgKey !== undefined) o.SurgKey = k;
          if (o.OpKey !== undefined) o.OpKey = k;
          opMap.set(k, o);
        });
        parsed = Array.from(opMap.values());
      } else if ('StaffKey' in parsed[0]) {
        const stMap = new Map();
        parsed.forEach((s: any, i: number) => {
          const k = s.StaffKey || `st_no_key_${i}`;
          s.StaffKey = k;
          stMap.set(k, s);
        });
        parsed = Array.from(stMap.values());
      } else if ('PatientKey' in parsed[0]) {
        const pMap = new Map();
        parsed.forEach((p: any, i: number) => {
          const k = p.PatientKey || `pat_no_key_${i}`;
          p.PatientKey = k;
          pMap.set(k, p);
        });
        parsed = Array.from(pMap.values());
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

function ensureRolePresetsDB(): RolePreset[] {
  const existing = readDB<RolePreset>(ROLE_PRESETS_FILE, []);
  if (existing.length === 0) {
    const seeded = resolveRolePresetRecords(DEFAULT_ROLE_PRESET_RECORDS);
    writeDB(ROLE_PRESETS_FILE, seeded);
    return seeded;
  }
  const resolved = resolveRolePresetRecords(existing);
  if (JSON.stringify(resolved) !== JSON.stringify(existing)) {
    writeDB(ROLE_PRESETS_FILE, resolved);
  }
  return resolved;
}

// Routes
app.get('/api/staff', async (req, res) => {
  await syncFromGoogleSheets();
  const staff = readDB<Staff>(STAFF_FILE, defaultStaff);
  res.json(staff);
});

app.put('/api/staff/:key', async (req, res) => {
  try {
    const staff = readDB<Staff>(STAFF_FILE, defaultStaff);
    const key = req.params.key;
    const index = staff.findIndex(member => String(member.StaffKey || '') === String(key));

    if (index === -1) {
      res.status(404).json({ error: 'Staff not found' });
      return;
    }

    const updateData = req.body || {};
    if (updateData.StaffPhone !== undefined && updateData.StaffPhone !== null) {
      updateData.StaffPhone = cleanSheetText(updateData.StaffPhone);
    }

    staff[index] = { ...staff[index], ...updateData, StaffKey: staff[index].StaffKey };
    writeDB<Staff>(STAFF_FILE, staff);
    markLocalMutation();

    recentLocalEdits.set(`Staff_${staff[index].StaffKey}`, { timestamp: Date.now(), data: staff[index] });

    syncToGoogleSheets('Staff', 'update', staff[index].StaffKey, staff[index]).catch(err => {
      console.error('Error syncing staff update to google sheets background:', err);
    });

    res.json(staff[index]);
  } catch (err) {
    console.error('Error in PUT /api/staff/:key:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/role-presets', async (req, res) => {
  await syncFromGoogleSheets();
  res.json(ensureRolePresetsDB());
});

app.post('/api/role-presets', async (req, res) => {
  try {
    const presets = ensureRolePresetsDB();
    const body = req.body || {};
    const label = String(body.RolePresetLabel || '').trim();
    let presetId = String(body.RolePresetID || '').trim();

    if (!label) {
      res.status(400).json({ error: 'RolePresetLabel is required' });
      return;
    }

    if (!presetId) {
      presetId = slugifyRolePresetId(label);
      let suffix = 1;
      while (presets.some(item => item.RolePresetID === presetId)) {
        presetId = `${slugifyRolePresetId(label)}-${suffix++}`;
      }
    }

    if (presets.some(item => item.RolePresetID === presetId)) {
      res.status(409).json({ error: 'RolePresetID already exists' });
      return;
    }

    const record: RolePreset = {
      RolePresetID: presetId,
      RolePresetLabel: label,
      RolePresetDescription: String(body.RolePresetDescription || '').trim(),
      Permissions: String(body.Permissions || 'home,workspace').trim(),
      SortOrder: body.SortOrder ?? presets.length + 1,
      IsSystem: false,
    };

    presets.push(record);
    writeDB(ROLE_PRESETS_FILE, presets);
    markLocalMutation();

    syncToGoogleSheets('RolePreset', 'insert', record.RolePresetID, record).catch(err => {
      console.error('Error syncing role preset insert:', err);
    });

    res.status(201).json(record);
  } catch (err) {
    console.error('Error in POST /api/role-presets:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.put('/api/role-presets/:key', async (req, res) => {
  try {
    const presets = ensureRolePresetsDB();
    const key = req.params.key;
    const index = presets.findIndex(item => item.RolePresetID === key);

    if (index === -1) {
      res.status(404).json({ error: 'Role preset not found' });
      return;
    }

    const body = req.body || {};
    const updated: RolePreset = {
      ...presets[index],
      ...body,
      RolePresetID: presets[index].RolePresetID,
      IsSystem: presets[index].IsSystem,
    };

    if (body.RolePresetLabel !== undefined) {
      updated.RolePresetLabel = String(body.RolePresetLabel).trim();
    }
    if (body.RolePresetDescription !== undefined) {
      updated.RolePresetDescription = String(body.RolePresetDescription).trim();
    }
    if (body.Permissions !== undefined) {
      updated.Permissions = String(body.Permissions).trim();
    }

    presets[index] = updated;
    writeDB(ROLE_PRESETS_FILE, presets);
    markLocalMutation();

    syncToGoogleSheets('RolePreset', 'update', updated.RolePresetID, updated).catch(err => {
      console.error('Error syncing role preset update:', err);
    });

    res.json(updated);
  } catch (err) {
    console.error('Error in PUT /api/role-presets/:key:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.delete('/api/role-presets/:key', async (req, res) => {
  try {
    const presets = ensureRolePresetsDB();
    const key = req.params.key;

    if (isSystemRolePresetId(key)) {
      res.status(403).json({ error: 'Cannot delete system role preset' });
      return;
    }

    const index = presets.findIndex(item => item.RolePresetID === key);
    if (index === -1) {
      res.status(404).json({ error: 'Role preset not found' });
      return;
    }

    presets.splice(index, 1);
    writeDB(ROLE_PRESETS_FILE, presets);
    markLocalMutation();

    res.json({ success: true, RolePresetID: key });
  } catch (err) {
    console.error('Error in DELETE /api/role-presets/:key:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/patients', async (req, res) => {
  await syncFromGoogleSheets();
  const patients = readDB<Patient>(PATIENTS_FILE, defaultPatients);
  res.json(patients);
});

app.post('/api/patients', async (req, res) => {
  const patients = readDB<Patient>(PATIENTS_FILE, defaultPatients);
  const newPatient: Patient = req.body;
  
  if (newPatient.PatientID1 !== undefined && newPatient.PatientID1 !== null) {
    newPatient.PatientID1 = cleanSheetText(newPatient.PatientID1);
  }
  if (newPatient.PatientID2 !== undefined && newPatient.PatientID2 !== null) {
    newPatient.PatientID2 = cleanSheetText(newPatient.PatientID2);
  }
  if (newPatient.PatientPhone1 !== undefined && newPatient.PatientPhone1 !== null) {
    newPatient.PatientPhone1 = cleanSheetText(newPatient.PatientPhone1);
  }
  if (newPatient.PatientPhone2 !== undefined && newPatient.PatientPhone2 !== null) {
    newPatient.PatientPhone2 = cleanSheetText(newPatient.PatientPhone2);
  }
  
  // Back-end validation / augmentation
  newPatient.PatientKey = newPatient.PatientKey || `pat_${Date.now()}`;
  newPatient.PatientCreateTime = newPatient.PatientCreateTime || newTimestamp();
  
  patients.push(newPatient);
  writeDB<Patient>(PATIENTS_FILE, patients);
  markLocalMutation();
  
  // Track this locally so we don't overwrite with stale Google Sheets data
  recentLocalEdits.set(`Patient_${newPatient.PatientKey}`, { timestamp: Date.now(), data: newPatient });
  
  // Sync to Google Sheet asynchronously in the background so API stays fast
  syncToGoogleSheets('Patient', 'insert', newPatient.PatientKey, newPatient).catch(err => {
    console.error('Error syncing patient to google sheets background:', err);
  });
  
  res.status(201).json(newPatient);
});

app.put('/api/patients/:key', async (req, res) => {
  const patients = readDB<Patient>(PATIENTS_FILE, defaultPatients);
  const key = req.params.key;
  const updateData: Partial<Patient> = req.body;
  
  if (updateData.PatientID1 !== undefined && updateData.PatientID1 !== null) {
    updateData.PatientID1 = cleanSheetText(updateData.PatientID1);
  }
  if (updateData.PatientID2 !== undefined && updateData.PatientID2 !== null) {
    updateData.PatientID2 = cleanSheetText(updateData.PatientID2);
  }
  if (updateData.PatientPhone1 !== undefined && updateData.PatientPhone1 !== null) {
    updateData.PatientPhone1 = cleanSheetText(updateData.PatientPhone1);
  }
  if (updateData.PatientPhone2 !== undefined && updateData.PatientPhone2 !== null) {
    updateData.PatientPhone2 = cleanSheetText(updateData.PatientPhone2);
  }
  
  const index = patients.findIndex(p => 
    String(p.PatientKey || '').trim().toLowerCase() === String(key || '').trim().toLowerCase() || 
    String(p.PatientID1 || '').trim().toLowerCase() === String(key || '').trim().toLowerCase()
  );
  if (index !== -1) {
    patients[index] = { ...patients[index], ...updateData };
    writeDB<Patient>(PATIENTS_FILE, patients);
    markLocalMutation();
    
    // Track this locally so we don't overwrite with stale Google Sheets data
    recentLocalEdits.set(`Patient_${patients[index].PatientKey}`, { timestamp: Date.now(), data: patients[index] });
    
    // Sync to Google Sheet asynchronously in the background so API stays fast
    syncToGoogleSheets('Patient', 'update', patients[index].PatientKey, patients[index]).catch(err => {
      console.error('Error syncing patient update to google sheets background:', err);
    });
    
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

app.get('/api/operations', async (req, res) => {
  await syncFromGoogleSheets();
  const operations = readDB<any>(OPERATIONS_FILE, []);
  res.json(operations);
});

app.get('/api/cmrs', async (req, res) => {
  await syncFromGoogleSheets();
  const cmrs = readDB<CMR>(CMRS_FILE, defaultCmrs);
  res.json(cmrs);
});

app.post('/api/cmrs', async (req, res) => {
  const cmrs = readDB<CMR>(CMRS_FILE, defaultCmrs);
  const newCmr: CMR = applyDiagnosisNormalization(req.body, ['CMRDiagnosisID']);

  const requestedCmrKey = newCmr.CMRKey || newCmr.CMRkey;
  const cmrKeyExists = requestedCmrKey && cmrs.some(cmr => String(cmr.CMRKey || cmr.CMRkey || '') === String(requestedCmrKey));
  newCmr.CMRKey = requestedCmrKey && !cmrKeyExists ? requestedCmrKey : createUniqueKey('cmr', cmrs.map(cmr => cmr.CMRKey || cmr.CMRkey));
  newCmr.UpdateTime = newCmr.UpdateTime || newTimestamp();
  cmrs.push(newCmr);
  writeDB<CMR>(CMRS_FILE, cmrs);
  markLocalMutation();

  recentLocalEdits.set(`CMR_${newCmr.CMRKey}`, { timestamp: Date.now(), data: newCmr });

  syncToGoogleSheets('CMR', 'insert', newCmr.CMRKey, newCmr).catch(err => {
    console.error('Error syncing CMR to google sheets background:', err);
  });

  res.status(201).json(newCmr);
});

app.put('/api/cmrs/:key', async (req, res) => {
  try {
    const cmrs = readDB<CMR>(CMRS_FILE, defaultCmrs);
    const key = req.params.key;
    const index = cmrs.findIndex(m =>
      String(m.CMRKey || '').trim().toLowerCase() === String(key || '').trim().toLowerCase() ||
      String(m.CMRkey || '').trim().toLowerCase() === String(key || '').trim().toLowerCase()
    );

    if (index !== -1) {
      cmrs[index] = applyDiagnosisNormalization(
        { ...cmrs[index], ...req.body, UpdateTime: newTimestamp() },
        ['CMRDiagnosisID']
      );
      cmrs[index].CMRKey = cmrs[index].CMRKey || cmrs[index].CMRkey || key;
      writeDB<CMR>(CMRS_FILE, cmrs);
      markLocalMutation();

      recentLocalEdits.set(`CMR_${cmrs[index].CMRKey}`, { timestamp: Date.now(), data: cmrs[index] });

      syncToGoogleSheets('CMR', 'update', cmrs[index].CMRKey, cmrs[index]).catch(err => {
        console.error('Error syncing CMR update to google sheets background:', err);
      });

      res.json(cmrs[index]);
    } else {
      res.status(404).json({ error: 'CMR record not found' });
    }
  } catch (err) {
    console.error('Error in PUT /api/cmrs/:key:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/sources', async (req, res) => {
  await syncFromGoogleSheets();
  const sources = readDB<Source>(SOURCES_FILE, []);
  res.json(sources);
});

app.post('/api/sources', async (req, res) => {
  const sources = readDB<Source>(SOURCES_FILE, []);
  const diagnosisID = normalizeDiagnosisID(req.body?.DiagnosisID);

  if (!diagnosisID) {
    res.status(400).json({ error: 'DiagnosisID is required' });
    return;
  }

  const existingIndex = sources.findIndex(source =>
    String(source.DiagnosisID || '').trim().toLowerCase() === diagnosisID.toLowerCase()
  );

  const sourceRecord: Source = existingIndex >= 0
    ? { ...sources[existingIndex], ...req.body, DiagnosisID: diagnosisID }
    : { ...req.body, DiagnosisID: diagnosisID };

  if (existingIndex >= 0) {
    sources[existingIndex] = sourceRecord;
  } else {
    sources.push(sourceRecord);
  }

  writeDB<Source>(SOURCES_FILE, sources);
  markLocalMutation();

  syncToGoogleSheets('Source', existingIndex >= 0 ? 'update' : 'insert', diagnosisID, sourceRecord).catch(err => {
    console.error('Error syncing source to google sheets background:', err);
  });

  res.status(existingIndex >= 0 ? 200 : 201).json(sourceRecord);
});

app.post('/api/consults', async (req, res) => {
  const consults = readDB<Consult>(CONSULTS_FILE, defaultConsults);
  const newConsult: Consult = applyDiagnosisNormalization(req.body, ['DiagnosisID']);
  
  // Set Key dynamically and guard against client-side duplicate keys.
  const requestedConsultKey = newConsult.ConsultKey;
  const consultKeyExists = requestedConsultKey && consults.some(c => String(c.ConsultKey || '') === String(requestedConsultKey));
  newConsult.ConsultKey = requestedConsultKey && !consultKeyExists ? requestedConsultKey : createUniqueKey('con', consults.map(c => c.ConsultKey));
  newConsult.ConsultCreateTime = newConsult.ConsultCreateTime || newTimestamp();
  
  consults.push(newConsult);
  writeDB<Consult>(CONSULTS_FILE, consults);
  markLocalMutation();
  
  // Track this locally so we don't overwrite with stale Google Sheets data
  recentLocalEdits.set(`Consult_${newConsult.ConsultKey}`, { timestamp: Date.now(), data: newConsult });
  
  // Sync to Google Sheet asynchronously in the background so API stays fast
  syncToGoogleSheets('Consult', 'insert', newConsult.ConsultKey, newConsult).catch(err => {
    console.error('Error syncing consult to google sheets background:', err);
  });
  
  res.status(201).json(newConsult);
});

// Update an existing consult result (or details)
app.put('/api/consults/:key', async (req, res) => {
  const consults = readDB<Consult>(CONSULTS_FILE, defaultConsults);
  const key = req.params.key;
  const updateData: Partial<Consult> = req.body;
  
  const index = consults.findIndex(c => c.ConsultKey === key);
  if (index !== -1) {
    consults[index] = applyDiagnosisNormalization(
      { ...consults[index], ...updateData },
      ['DiagnosisID']
    );
    writeDB<Consult>(CONSULTS_FILE, consults);
    markLocalMutation();
    
    // Track this locally so we don't overwrite with stale Google Sheets data
    recentLocalEdits.set(`Consult_${consults[index].ConsultKey}`, { timestamp: Date.now(), data: consults[index] });
    
    // Sync to Google Sheet asynchronously in the background so API stays fast
    syncToGoogleSheets('Consult', 'update', consults[index].ConsultKey, consults[index]).catch(err => {
      console.error('Error syncing consult update to google sheets background:', err);
    });
    
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
  const newCathLab: CathLab = applyDiagnosisNormalization(req.body, ['PostDiagnosisID']);
  
  const requestedCathKey = newCathLab.CathKey;
  const cathKeyExists = requestedCathKey && cathlabs.some(cath => String(cath.CathKey || '') === String(requestedCathKey));
  newCathLab.CathKey = requestedCathKey && !cathKeyExists ? requestedCathKey : createUniqueKey('cath', cathlabs.map(cath => cath.CathKey));
  cathlabs.push(newCathLab);
  writeDB<CathLab>(CATHLABS_FILE, cathlabs);
  markLocalMutation();
  
  // Track this locally so we don't overwrite with stale Google Sheets data
  recentLocalEdits.set(`CathLab_${newCathLab.CathKey}`, { timestamp: Date.now(), data: newCathLab });
  
  // Sync to Google Sheet asynchronously in the background so API stays fast
  syncToGoogleSheets('CathLab', 'insert', newCathLab.CathKey, newCathLab).catch(err => {
    console.error('Error syncing cathlab to google sheets background:', err);
  });
  
  res.status(201).json(newCathLab);
});

app.put('/api/cathlabs/:key', async (req, res) => {
  const cathlabs = readDB<CathLab>(CATHLABS_FILE, defaultCathlabs);
  const key = req.params.key;
  const index = cathlabs.findIndex(c => c.CathKey === key);
  if (index !== -1) {
    cathlabs[index] = applyDiagnosisNormalization(
      { ...cathlabs[index], ...req.body },
      ['PostDiagnosisID']
    );
    writeDB<CathLab>(CATHLABS_FILE, cathlabs);
    markLocalMutation();
    
    // Track this locally so we don't overwrite with stale Google Sheets data
    recentLocalEdits.set(`CathLab_${cathlabs[index].CathKey}`, { timestamp: Date.now(), data: cathlabs[index] });
    
    // Sync to Google Sheet asynchronously in the background so API stays fast
    syncToGoogleSheets('CathLab', 'update', cathlabs[index].CathKey, cathlabs[index]).catch(err => {
      console.error('Error syncing cathlab update to google sheets background:', err);
    });
    
    res.json(cathlabs[index]);
  } else {
    res.status(404).json({ error: 'CathLab not found' });
  }
});

function newTimestamp() {
  return new Date().toISOString();
}

function applyDiagnosisNormalization<T extends Record<string, unknown>>(
  record: T,
  fields: string[]
): T {
  const normalized: Record<string, unknown> = { ...record };
  for (const field of fields) {
    if (field in normalized && normalized[field]) {
      normalized[field] = normalizeDiagnosisID(normalized[field]);
    }
  }
  return normalized as T;
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
      server: {
        middlewareMode: true,
        // The JSON "database" lives in data/ and is rewritten on every save.
        // Without this, those writes make Vite trigger a full page reload,
        // which remounts the app and resets the view back to Home.
        watch: { ignored: ['**/data/**'] },
      },
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
