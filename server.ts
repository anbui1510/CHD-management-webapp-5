/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import express from 'express';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import 'dotenv/config';
import { createServer as createViteServer } from 'vite';
import { Patient, Consult, Staff, CathLab, CMR, Source, DeviceTemplate, RolePreset, Operation, Notification, DoctorPerformanceMark } from './src/types';
import { normalizeDiagnosisID } from './src/data/source';
import { DEFAULT_ROLE_PRESET_RECORDS } from './src/auth/rolePresetDefaults';
import { isSystemRolePresetId, resolveRolePresetRecords, slugifyRolePresetId } from './src/auth/permissions';
import { resolveStaffByNameOrKey } from './src/utils/staffNameMatch';
import { getTopicForDate, formatDateISO, formatDateVN } from './src/chdDailyBrief/topics';
import {
  runPipeline,
  getPipelineStatus,
  loadBriefContent,
  getBriefHistory,
} from './src/chdDailyBrief/runPipeline';
import { docxPath } from './src/chdDailyBrief/paths';
import { formatAnnouncementVN } from './src/chdDailyBrief/formatAnnouncement';
import { startChdBriefScheduler } from './src/chdDailyBrief/scheduler';

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 5173;

app.use(express.json({ limit: '5mb' }));

// ─────────────────────────────────────────────────────────────────
// AUTH TOKEN SYSTEM
// ─────────────────────────────────────────────────────────────────

const SESSION_TTL_MS = 8 * 60 * 60 * 1000; // 8 hours
const tokenStore = new Map<string, { staffKey: string; expiresAt: number }>();

// Periodically clean up expired tokens
setInterval(() => {
  const now = Date.now();
  for (const [token, session] of tokenStore.entries()) {
    if (now >= session.expiresAt) tokenStore.delete(token);
  }
}, 30 * 60 * 1000);

function generateToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

function createSession(staffKey: string): string {
  const token = generateToken();
  tokenStore.set(token, { staffKey, expiresAt: Date.now() + SESSION_TTL_MS });
  return token;
}

function resolveSession(token: string): string | null {
  const session = tokenStore.get(token);
  if (!session) return null;
  if (Date.now() >= session.expiresAt) {
    tokenStore.delete(token);
    return null;
  }
  // Slide expiry on activity
  session.expiresAt = Date.now() + SESSION_TTL_MS;
  return session.staffKey;
}

function revokeToken(token: string): void {
  tokenStore.delete(token);
}

/** Strip the Password field from a Staff record before sending to client */
function stripPassword<T extends Record<string, any>>(staff: T): Omit<T, 'Password'> {
  const { Password, ...safe } = staff as any;
  return safe;
}

/** Hash password with per-user salt (StaffKey) using SHA-256 */
function hashPassword(password: string, salt: string): string {
  return crypto.createHash('sha256').update(password + ':' + salt, 'utf8').digest('hex');
}

/** Check if a string is a 64-character SHA-255 hash (hexadecimal) */
function isSHA256(str: string): boolean {
  return /^[0-9a-f]{64}$/i.test(str);
}

/** Extract Bearer token from Authorization header or cookie */
function extractBearerToken(req: express.Request): string | null {
  // 1. Try to extract from HttpOnly cookie first
  const cookieHeader = req.headers['cookie'] || '';
  const match = cookieHeader.match(/(?:^|;)\s*CHD_AUTH_TOKEN\s*=\s*([^;]+)/);
  if (match) {
    return match[1].trim();
  }

  // 2. Fall back to Authorization header
  const auth = req.headers['authorization'] || '';
  if (auth.startsWith('Bearer ')) return auth.slice(7).trim();
  // Also accept token from x-auth-token header for legacy support
  const xToken = req.headers['x-auth-token'];
  if (typeof xToken === 'string' && xToken.trim()) return xToken.trim();
  return null;
}

/** Middleware: require valid session token */
function requireAuth(req: express.Request, res: express.Response, next: express.NextFunction): void {
  const token = extractBearerToken(req);
  if (!token) {
    res.status(401).json({ error: 'Yêu cầu đăng nhập để truy cập tài nguyên này.' });
    return;
  }
  const staffKey = resolveSession(token);
  if (!staffKey) {
    res.status(401).json({ error: 'Phiên đăng nhập đã hết hạn hoặc không hợp lệ. Vui lòng đăng nhập lại.' });
    return;
  }
  (req as any).staffKey = staffKey;
  (req as any).authToken = token;
  next();
}

/** Middleware: require Admin role */
function requireAdmin(req: express.Request, res: express.Response, next: express.NextFunction): void {
  requireAuth(req, res, () => {
    const staffKey = (req as any).staffKey as string;
    const staffList = readDB<Staff>(STAFF_FILE, defaultStaff);
    const staff = staffList.find(s => String(s.StaffKey) === staffKey);
    if (!staff || staff.Role !== 'Admin') {
      res.status(403).json({ error: 'Chỉ Admin mới có quyền thực hiện hành động này.' });
      return;
    }
    next();
  });
}

// ─── Auth Endpoints ───────────────────────────────────────────────

app.post('/api/auth/login', async (req, res) => {
  try {
    const { StaffKey, Password } = req.body || {};
    if (!StaffKey || !Password) {
      res.status(400).json({ error: 'Vui lòng nhập mã nhân viên và mật khẩu.' });
      return;
    }

    const config = getSyncConfig();
    let staffMember: Staff | undefined;

    // 1. Try local verification first for instant login
    const staffList = readDB<Staff>(STAFF_FILE, defaultStaff);
    const localStaff = staffList.find(s => String(s.StaffKey || '').trim() === String(StaffKey).trim());
    if (localStaff) {
      const hashedInput = hashPassword(Password, String(StaffKey));
      const isPlaintextMatch = (String(localStaff.Password || '').trim() === String(Password).trim());
      const isHashedMatch = (String(localStaff.Password || '').trim() === String(hashedInput).trim());
      if (isPlaintextMatch || isHashedMatch) {
        staffMember = localStaff;
        if (isPlaintextMatch && !isHashedMatch) {
          localStaff.Password = hashedInput;
          writeDB(STAFF_FILE, staffList);
          if (config.scriptUrl) {
            syncToGoogleSheets('Staff', 'update', localStaff.StaffKey, localStaff).catch(() => {});
          }
        }
      }
    }

    // 2. Fallback to Google Sheets (Apps Script) delegation if local match didn't succeed
    if (!staffMember && config.scriptUrl) {
      try {
        console.log(`Verifying credentials with Google Sheets for StaffKey: ${StaffKey}`);
        const response = await fetchWithTimeout(config.scriptUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'login',
            staffKey: StaffKey,
            password: Password,
            apiKey: config.scriptSecret || ''
          })
        }, 10000);

        if (response.ok) {
          const resData = await response.json() as any;
          if (resData && resData.status === 'success') {
            staffMember = resData.staff as Staff;
          } else {
            if (resData && resData.message === 'Unknown action') {
              throw new Error('Unknown action');
            }
            res.status(401).json({ error: resData.message || 'Mật khẩu hoặc mã nhân viên không đúng.' });
            return;
          }
        } else {
          throw new Error(`Google Sheets responded with HTTP status ${response.status}`);
        }
      } catch (err) {
        console.error('Apps Script login check failed, falling back to local verification:', err);
        // Already tried local verification, so if it failed there too, we fail
        res.status(401).json({ error: 'Mã nhân viên hoặc mật khẩu không đúng.' });
        return;
      }
    }

    if (!staffMember) {
      res.status(401).json({ error: 'Xác thực thất bại.' });
      return;
    }

    if (staffMember.FireDate && String(staffMember.FireDate).trim()) {
      res.status(403).json({ error: `Tài khoản đã bị vô hiệu hóa (nghỉ việc ngày: ${staffMember.FireDate}).` });
      return;
    }

    const token = createSession(String(staffMember.StaffKey));
    res.cookie('CHD_AUTH_TOKEN', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: SESSION_TTL_MS
    });
    res.json({ token: 'cookie-session', staff: stripPassword(staffMember) });
  } catch (err) {
    console.error('Error in POST /api/auth/login:', err);
    res.status(500).json({ error: 'Lỗi máy chủ nội bộ.' });
  }
});

app.post('/api/auth/logout', (req, res) => {
  const token = extractBearerToken(req);
  if (token) revokeToken(token);
  res.clearCookie('CHD_AUTH_TOKEN', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/'
  });
  res.json({ success: true });
});

app.get('/api/auth/me', requireAuth, (req, res) => {
  const staffKey = (req as any).staffKey as string;
  const staffList = readDB<Staff>(STAFF_FILE, defaultStaff);
  const staff = staffList.find(s => String(s.StaffKey) === staffKey);
  if (!staff) {
    res.status(401).json({ error: 'Tài khoản không còn tồn tại.' });
    return;
  }
  res.json(stripPassword(staff));
});

// Public staff list — only StaffKey + StaffName + Name + Role + Avatar for login dropdown
// No auth required, no sensitive fields exposed
app.get('/api/staff/public', async (_req, res) => {
  await syncFromGoogleSheets();
  const staffList = readDB<Staff>(STAFF_FILE, defaultStaff);
  const publicList = staffList
    .filter(s => !s.FireDate || !String(s.FireDate).trim())
    .map(s => ({
      StaffKey: s.StaffKey,
      StaffName: s.StaffName,
      Name: s.Name || '',
      Role: s.Role || '',
      Avatar: (s as any).Avatar || ''
    }));
  res.json(publicList);
});

const BUILD_TIMESTAMP = String(Date.now());

// Version endpoint — public, does not require authentication
app.get('/api/version', (_req, res) => {
  res.json({ version: '5.0.0', buildTime: BUILD_TIMESTAMP });
});

// ─────────────────────────────────────────────────────────────────
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
const DEVICE_TEMPLATES_FILE = path.join(DB_DIR, 'device-templates.json');
const ROLE_PRESETS_FILE = path.join(DB_DIR, 'role-presets.json');
const NOTIFICATIONS_FILE = path.join(DB_DIR, 'notifications.json');
const DOCTOR_MARKS_FILE = path.join(DB_DIR, 'doctor-performance-marks.json');
const SYNC_CONFIG_FILE = path.join(DB_DIR, 'sync_config.json');

// Ensure DB directory exists
if (!fs.existsSync(DB_DIR)) {
  fs.mkdirSync(DB_DIR);
}

// Google Sheets Sync Config Interface & Helpers
interface SyncConfig {
  scriptUrl: string;
  scriptSecret?: string;
}

function getSyncConfig(): SyncConfig {
  if (process.env.GOOGLE_SCRIPT_URL) {
    return { 
      scriptUrl: process.env.GOOGLE_SCRIPT_URL,
      scriptSecret: process.env.GOOGLE_SCRIPT_SECRET || process.env.GOOGLE_SCRIPT_API_KEY || ''
    };
  }
  try {
    if (fs.existsSync(SYNC_CONFIG_FILE)) {
      const content = fs.readFileSync(SYNC_CONFIG_FILE, 'utf-8');
      const parsed = JSON.parse(content);
      return {
        scriptUrl: parsed.scriptUrl || '',
        scriptSecret: parsed.scriptSecret || ''
      };
    }
  } catch (err) {
    console.error('Error reading sync config:', err);
  }
  return { scriptUrl: '', scriptSecret: '' };
}

function saveSyncConfig(config: SyncConfig): void {
  try {
    fs.writeFileSync(SYNC_CONFIG_FILE, JSON.stringify(config, null, 2), 'utf-8');
  } catch (err) {
    console.error('Error writing sync config:', err);
  }
}

// Helper to fetch with timeout to prevent server hanging if Apps Script is slow
async function fetchWithTimeout(url: string, options: any = {}, timeout = 60000) {
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

function restoreWeightFromDate(val: any): string {
  if (val === undefined || val === null) return '';
  const str = String(val).trim();
  const datePart = str.split('T')[0].split(' ')[0];
  const match = datePart.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (match) {
    const month = parseInt(match[2], 10);
    const day = parseInt(match[3], 10);
    return `${day}.${month}`;
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
    let fetchUrl = `${config.scriptUrl}?action=getAll`;
    if (config.scriptSecret) {
      fetchUrl += `&apiKey=${encodeURIComponent(config.scriptSecret)}`;
    }
    console.log(`Pulling data from Google Sheets: ${config.scriptUrl}`);
    const response = await fetchWithTimeout(fetchUrl, {
      method: 'GET',
      headers: { 'Accept': 'application/json' }
    }, 60000);

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json() as any;

    if (data && (Array.isArray(data.patients) || Array.isArray(data.consults) || Array.isArray(data.staff) || Array.isArray(data.cathlabs) || Array.isArray(data.operations) || Array.isArray(data.cmrs) || Array.isArray(data.sources) || Array.isArray(data.deviceTemplates) || Array.isArray(data.rolePresets) || Array.isArray(data.notifications) || Array.isArray(data.doctorPerformanceMarks))) {
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
          
          if (c.PatientWeight !== undefined && c.PatientWeight !== null) {
            c.PatientWeight = restoreWeightFromDate(cleanSheetText(c.PatientWeight));
          }
          if (c.PatientHeight !== undefined && c.PatientHeight !== null) {
            c.PatientHeight = restoreWeightFromDate(cleanSheetText(c.PatientHeight));
          }

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

          if (m.PatientWeight !== undefined && m.PatientWeight !== null) {
            m.PatientWeight = restoreWeightFromDate(cleanSheetText(m.PatientWeight));
          }

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
      if (Array.isArray(data.deviceTemplates)) {
        writeDB(DEVICE_TEMPLATES_FILE, data.deviceTemplates);
      }
      if (Array.isArray(data.rolePresets)) {
        writeDB(ROLE_PRESETS_FILE, resolveRolePresetRecords(data.rolePresets));
      }
      if (Array.isArray(data.notifications)) {
        const currentNotifications = readDB<Notification>(NOTIFICATIONS_FILE, []);
        const nMap = new Map();
        data.notifications.forEach((n: any, i: number) => {
          const k = n.NotificationKey || `notif_no_key_${i}`;
          n.NotificationKey = k;
          n.IsRead = n.IsRead === true || String(n.IsRead || '').trim().toLowerCase() === 'true';
          const recent = recentLocalEdits.get(`Notification_${k}`);
          if (recent && (Date.now() - recent.timestamp < 45000)) {
            n = { ...n, ...recent.data };
          }
          nMap.set(k, n);
        });
        preserveLocalOnlyRecords(nMap, currentNotifications, record => record.NotificationKey);
        preserveRecentLocalRecords(nMap, 'Notification', record => record.NotificationKey);
        writeDB(NOTIFICATIONS_FILE, Array.from(nMap.values()));
      }
      if (Array.isArray(data.doctorPerformanceMarks)) {
        const currentMarks = readDB<DoctorPerformanceMark>(DOCTOR_MARKS_FILE, []);
        const mMap = new Map();
        data.doctorPerformanceMarks.forEach((m: any, i: number) => {
          const k = m.MarkKey || `mark_no_key_${i}`;
          m.MarkKey = k;
          m.Score = Number(m.Score || 1);
          const recent = recentLocalEdits.get(`DoctorPerformanceMark_${k}`);
          if (recent && (Date.now() - recent.timestamp < 45000)) {
            m = { ...m, ...recent.data };
          }
          mMap.set(k, m);
        });
        preserveLocalOnlyRecords(mMap, currentMarks, record => record.MarkKey);
        preserveRecentLocalRecords(mMap, 'DoctorPerformanceMark', record => record.MarkKey);
        writeDB(DOCTOR_MARKS_FILE, Array.from(mMap.values()));
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

async function syncToGoogleSheets(type: 'Patient' | 'Consult' | 'Staff' | 'CathLab' | 'CMR' | 'Source' | 'DeviceTemplate' | 'RolePreset' | 'Notification' | 'DoctorPerformanceMark', action: 'insert' | 'update', key: string, record: any): Promise<boolean> {
  const config = getSyncConfig();
  if (!config.scriptUrl) return false;

  // Clone record to format fields safely without polluting the database cache
  const dataToPush = { ...record };
  const numericTextCols = [
    'PatientID1', 'PatientID2', 'PatientPhone1', 'PatientPhone2', 'StaffPhone', 'PatientWeight', 'PatientHeight',
    'PatientCreateBy', 'ConsultCreateBy', 'ConsultResultCreateBy', 'ConsultResultUpdatedBy', 'CheckDeviceBy', 'CheckDeviceUpdatedBy', 'CathUpdatedBy', 'SurgUpdatedBy', 'StaffKey', 'CreatedBy'
  ];
  
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
        data: dataToPush,
        apiKey: config.scriptSecret || ''
      })
    }, 60000);

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
      } else if ('NotificationKey' in parsed[0]) {
        const nMap = new Map();
        parsed.forEach((n: any, i: number) => {
          const k = n.NotificationKey || `notif_no_key_${i}`;
          n.NotificationKey = k;
          n.IsRead = n.IsRead === true || String(n.IsRead || '').trim().toLowerCase() === 'true';
          nMap.set(k, n);
        });
        parsed = Array.from(nMap.values());
      } else if ('MarkKey' in parsed[0]) {
        const mMap = new Map();
        parsed.forEach((m: any, i: number) => {
          const k = m.MarkKey || `mark_no_key_${i}`;
          m.MarkKey = k;
          m.Score = Number(m.Score || 1);
          mMap.set(k, m);
        });
        parsed = Array.from(mMap.values());
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
    scriptSecret: config.scriptSecret || '',
    isSynced: !!config.scriptUrl
  });
});

app.post('/api/sync-config', async (req, res) => {
  const { scriptUrl, scriptSecret } = req.body;
  
  if (!scriptUrl) {
    // Disconnect sync
    saveSyncConfig({ scriptUrl: '', scriptSecret: '' });
    return res.json({ success: true, message: "Disconnected visual sheet integration. Switched back to local database." });
  }

  // Pin check of URL format
  if (!scriptUrl.startsWith('https://script.google.com/')) {
    return res.status(400).json({ error: "Địa chỉ Apps Script không hợp lệ! URL phải bắt đầu bằng https://script.google.com/" });
  }

  try {
    // First, call action=setup to configure the API key in the Apps Script
    let setupUrl = `${scriptUrl}?action=setup`;
    if (scriptSecret) {
      setupUrl += `&apiKey=${encodeURIComponent(scriptSecret)}`;
    }
    console.log(`Setting up API Key on Google Sheet: ${setupUrl}`);
    const setupRes = await fetchWithTimeout(setupUrl, { method: 'GET' }, 10000);
    if (!setupRes.ok) {
      throw new Error(`Google Apps Script setup trả về lỗi HTTP ${setupRes.status}`);
    }

    const setupText = (await setupRes.text()).trim();
    if (setupText.startsWith('<!DOCTYPE') || setupText.startsWith('<html') || setupText.startsWith('<!doctype')) {
      throw new Error(
        "Apps Script của bạn đang trả về một trang Web HTML thay vì dữ liệu JSON. Điều này thường do 2 nguyên nhân sau:\n\n" +
        "1. Bạn chưa cấp quyền 'Anyone' (Bất kỳ ai) khi deploy: Trong Google Apps Script, hãy nhấn 'Triển khai mới' (New deployment) -> phần 'Who has access' (Ai có quyền truy cập) bắt buộc phải chọn 'Anyone' (Bất kỳ ai) sau đó nhấn Deploy rồi lấy link mới.\n\n" +
        "2. Bạn dán nhầm link chỉnh sửa thiết kế hoặc link của nhà phát triển (kết thúc bằng /dev) thay vì URL của Web App chính thức được cấp sau khi nhấn Deploy."
      );
    }

    let setupData;
    try {
      setupData = JSON.parse(setupText);
    } catch (parseErr) {
      throw new Error(`Đầu ra nhận được từ Apps Script không phải là JSON hợp lệ. Vui lòng kiểm tra lại nội dung dán vào Code.gs. Phản hồi thô: ${setupText.substring(0, 150)}...`);
    }

    if (setupData.status === 'error') {
      throw new Error(setupData.message || "Không thể cấu hình mã API Key cho Apps Script.");
    }

    // Verify scriptUrl responds properly with test action
    let testUrl = `${scriptUrl}?action=test`;
    if (scriptSecret) {
      testUrl += `&apiKey=${encodeURIComponent(scriptSecret)}`;
    }
    console.log(`Testing connection & initializing database worksheets on URL: ${testUrl}`);
    const testRes = await fetchWithTimeout(testUrl, { method: 'GET' }, 10000);
    
    if (!testRes.ok) {
      throw new Error(`Google Apps Script test trả về lỗi HTTP ${testRes.status}`);
    }

    const testText = await testRes.text();
    const cleanText = testText.trim();
    const testData = JSON.parse(cleanText);

    if (testData.status !== 'success') {
      throw new Error(testData.message || "Không thể khởi động kết nối dữ liệu! Hãy đảm bảo Apps Script được triển khai đúng quyền truy cập ('Anyone').");
    }

    // Save and immediately trigger full initial pull sync
    saveSyncConfig({ scriptUrl, scriptSecret });
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

const DEFAULT_SECRETARY_STAFF_KEY = '01442';
const FALLBACK_SECRETARY_STAFF_KEY = '88888';
const DEFAULT_SCHEDULER_STAFF_KEY = '01541';
const FALLBACK_SCHEDULER_STAFF_KEY = '77777';

function resolveStaff(candidate: string | undefined | null, staffList: Staff[]): Staff | undefined {
  return resolveStaffByNameOrKey(candidate, staffList);
}

function resolveStaffByPreferredKeys(staffList: Staff[], keys: string[]): Staff | undefined {
  return keys.map(key => staffList.find(staff => String(staff.StaffKey) === key)).find(Boolean);
}

function getDefaultSecretary(staffList: Staff[]): Staff | undefined {
  return resolveStaffByPreferredKeys(staffList, [DEFAULT_SECRETARY_STAFF_KEY, FALLBACK_SECRETARY_STAFF_KEY])
    || resolveStaff('BS. Tài', staffList);
}

function getDefaultScheduler(staffList: Staff[]): Staff | undefined {
  return resolveStaffByPreferredKeys(staffList, [DEFAULT_SCHEDULER_STAFF_KEY, FALLBACK_SCHEDULER_STAFF_KEY])
    || resolveStaff('BS. Hiếu', staffList);
}

function getPatientContext(patientKey: string | undefined, patients: Patient[]) {
  const patient = patients.find(p => String(p.PatientKey || '') === String(patientKey || ''));
  return {
    patient,
    PatientKey: patient?.PatientKey || patientKey || '',
    PatientID: patient?.PatientID1 || '',
    PatientName: patient?.PatientName || patient?.OtherPatientName || ''
  };
}

function appendNotificationIfMissing(input: Omit<Notification, 'NotificationKey' | 'CreatedTime' | 'IsRead'> & Partial<Pick<Notification, 'NotificationKey' | 'CreatedTime' | 'IsRead'>>): Notification | null {
  if (!input.StaffKey || !input.DedupKey) return null;
  const notifications = readDB<Notification>(NOTIFICATIONS_FILE, []);
  const existing = notifications.find(item => item.DedupKey === input.DedupKey && item.StaffKey === input.StaffKey);
  if (existing) return existing;

  const record: Notification = {
    NotificationKey: input.NotificationKey || createUniqueKey('notif', notifications.map(item => item.NotificationKey)),
    StaffKey: input.StaffKey,
    StaffName: input.StaffName || '',
    Title: input.Title,
    Message: input.Message,
    Severity: input.Severity || 'info',
    RelatedEntityType: input.RelatedEntityType,
    RelatedEntityKey: input.RelatedEntityKey,
    PatientKey: input.PatientKey,
    PatientID: input.PatientID,
    PatientName: input.PatientName,
    DedupKey: input.DedupKey,
    IsRead: input.IsRead ?? false,
    CreatedTime: input.CreatedTime || newTimestamp(),
    ReadTime: input.ReadTime || ''
  };

  notifications.push(record);
  writeDB(NOTIFICATIONS_FILE, notifications);
  markLocalMutation();
  recentLocalEdits.set(`Notification_${record.NotificationKey}`, { timestamp: Date.now(), data: record });
  syncToGoogleSheets('Notification', 'insert', record.NotificationKey, record).catch(err => {
    console.error('Error syncing notification insert:', err);
  });
  return record;
}

function appendDoctorMarkIfMissing(input: Omit<DoctorPerformanceMark, 'MarkKey' | 'CreatedTime' | 'Score' | 'CreatedBy'> & Partial<Pick<DoctorPerformanceMark, 'MarkKey' | 'CreatedTime' | 'Score' | 'CreatedBy'>>): DoctorPerformanceMark | null {
  if (!input.StaffKey || !input.DedupKey) return null;
  const marks = readDB<DoctorPerformanceMark>(DOCTOR_MARKS_FILE, []);
  const existing = marks.find(item => item.DedupKey === input.DedupKey && item.StaffKey === input.StaffKey);
  if (existing) return existing;

  const record: DoctorPerformanceMark = {
    MarkKey: input.MarkKey || createUniqueKey('mark', marks.map(item => item.MarkKey)),
    StaffKey: input.StaffKey,
    StaffName: input.StaffName || '',
    MarkType: input.MarkType,
    Score: input.Score ?? 1,
    Label: input.Label,
    Reason: input.Reason,
    RelatedEntityType: input.RelatedEntityType,
    RelatedEntityKey: input.RelatedEntityKey,
    PatientKey: input.PatientKey,
    PatientID: input.PatientID,
    PatientName: input.PatientName,
    DedupKey: input.DedupKey,
    CreatedBy: input.CreatedBy || 'workflow-monitor',
    CreatedTime: input.CreatedTime || newTimestamp()
  };

  marks.push(record);
  writeDB(DOCTOR_MARKS_FILE, marks);
  markLocalMutation();
  recentLocalEdits.set(`DoctorPerformanceMark_${record.MarkKey}`, { timestamp: Date.now(), data: record });
  syncToGoogleSheets('DoctorPerformanceMark', 'insert', record.MarkKey, record).catch(err => {
    console.error('Error syncing doctor mark insert:', err);
  });
  return record;
}

function parseDateOnly(raw: string | undefined): Date | null {
  const value = String(raw || '').trim().split('T')[0];
  if (!value) return null;
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function daysSince(raw: string | undefined, now = new Date()): number {
  const date = parseDateOnly(raw);
  if (!date) return 0;
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.floor((today.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
}

function hasConsultResult(consult: Consult): boolean {
  const result = String(consult.ConsultResultID || '').trim().toLowerCase();
  return !!result && !['nodata', 'no data', '-', '—'].includes(result);
}

function isRemovedConsult(consult: Consult): boolean {
  return consult.Removed === true || String(consult.Removed || '').trim().toLowerCase() === 'true';
}

function notifyStaffAboutConsult(staff: Staff | undefined, consult: Consult, patientCtx: ReturnType<typeof getPatientContext>, title: string, message: string, dedupPrefix: string, severity: Notification['Severity'] = 'warning') {
  if (!staff) return;
  appendNotificationIfMissing({
    StaffKey: staff.StaffKey,
    StaffName: staff.StaffName,
    Title: title,
    Message: message,
    Severity: severity,
    RelatedEntityType: 'Consult',
    RelatedEntityKey: consult.ConsultKey,
    PatientKey: patientCtx.PatientKey,
    PatientID: patientCtx.PatientID,
    PatientName: patientCtx.PatientName,
    DedupKey: `${dedupPrefix}:${consult.ConsultKey}:${staff.StaffKey}`
  });
}

function createSecretaryOverrideMark(consult: Consult, patientCtx: ReturnType<typeof getPatientContext>, staffList: Staff[], actorKey = 'workflow-monitor') {
  const secretary = getDefaultSecretary(staffList);
  if (!secretary) return;
  appendDoctorMarkIfMissing({
    StaffKey: secretary.StaffKey,
    StaffName: secretary.StaffName,
    MarkType: 'missing_staff_result',
    Label: 'Không hoàn thành điền kết quả staff',
    Reason: `BN ${patientCtx.PatientID || patientCtx.PatientName || consult.PatientKey} đã phải xếp bổ sung do thiếu kết quả hội chẩn.`,
    RelatedEntityType: 'Consult',
    RelatedEntityKey: consult.ConsultKey,
    PatientKey: patientCtx.PatientKey,
    PatientID: patientCtx.PatientID,
    PatientName: patientCtx.PatientName,
    DedupKey: `mark:secretary-missing-staff-result:${consult.ConsultKey}`,
    CreatedBy: actorKey
  });
  notifyStaffAboutConsult(
    secretary,
    consult,
    patientCtx,
    'Thiếu kết quả hội chẩn',
    `BN ${patientCtx.PatientID || patientCtx.PatientName || consult.PatientKey} đã phải xếp bổ sung vì chưa có kết quả hội chẩn.`,
    'notif:secretary-missing-staff-result'
  );
}

function createSchedulerEmergencyTransferMark(consult: Consult, patientCtx: ReturnType<typeof getPatientContext>, staffList: Staff[], actorKey = 'workflow-monitor') {
  const scheduler = getDefaultScheduler(staffList);
  if (!scheduler) return;
  appendDoctorMarkIfMissing({
    StaffKey: scheduler.StaffKey,
    StaffName: scheduler.StaffName,
    MarkType: 'scheduler_missing_transfer',
    Label: 'Không hoàn thành chuyển phòng TT',
    Reason: `BN ${patientCtx.PatientID || patientCtx.PatientName || consult.PatientKey} phải dùng thông tim cấp cứu do chưa được chuyển phòng TT.`,
    RelatedEntityType: 'Consult',
    RelatedEntityKey: consult.ConsultKey,
    PatientKey: patientCtx.PatientKey,
    PatientID: patientCtx.PatientID,
    PatientName: patientCtx.PatientName,
    DedupKey: `mark:scheduler-missing-transfer:${consult.ConsultKey}`,
    CreatedBy: actorKey
  });
  notifyStaffAboutConsult(
    scheduler,
    consult,
    patientCtx,
    'Thiếu thao tác chuyển phòng TT',
    `BN ${patientCtx.PatientID || patientCtx.PatientName || consult.PatientKey} phải vượt quyền bằng thông tim cấp cứu vì chưa được chuyển phòng TT.`,
    'notif:scheduler-missing-transfer'
  );
}

function handleConsultWorkflowMutation(previous: Consult, updated: Consult, updateData: Partial<Consult>, staffList: Staff[], patients: Patient[]) {
  const patientCtx = getPatientContext(updated.PatientKey, patients);
  const actorKey = String(updateData.ConsultResultUpdatedBy || updateData.CheckDeviceUpdatedBy || 'workflow-monitor');

  const wasPendingResult = !hasConsultResult(previous);
  const nowHasResult = hasConsultResult(updated);
  const isAdHocSchedulingActivation = wasPendingResult
    && nowHasResult
    && String(updateData.ConsultNote || '').includes('Kích hoạt xếp lịch bổ sung');
  if (isAdHocSchedulingActivation) {
    createSecretaryOverrideMark(updated, patientCtx, staffList, actorKey);
  }

  const wasTransferred = previous.TransferredToCathLab === true || String(previous.TransferredToCathLab || '').trim().toLowerCase() === 'true';
  const nowTransferred = updated.TransferredToCathLab === true || String(updated.TransferredToCathLab || '').trim().toLowerCase() === 'true';
  const isEmergencyTransferOverride = !wasTransferred
    && nowTransferred
    && String(updateData.PriorityOrder || '').trim() === 'Cấp cứu'
    && String(updateData.CheckDeviceUpdatedBy || '').trim();
  if (isEmergencyTransferOverride) {
    createSchedulerEmergencyTransferMark(updated, patientCtx, staffList, actorKey);
  }
}

function runWorkflowMonitor() {
  const staffList = readDB<Staff>(STAFF_FILE, defaultStaff);
  const patients = readDB<Patient>(PATIENTS_FILE, defaultPatients);
  const consults = readDB<Consult>(CONSULTS_FILE, defaultConsults);
  const cathlabs = readDB<CathLab>(CATHLABS_FILE, defaultCathlabs);
  let notificationsBefore = readDB<Notification>(NOTIFICATIONS_FILE, []).length;
  let marksBefore = readDB<DoctorPerformanceMark>(DOCTOR_MARKS_FILE, []).length;

  const secretary = getDefaultSecretary(staffList);

  consults.forEach(consult => {
    if (isRemovedConsult(consult)) return;
    const patientCtx = getPatientContext(consult.PatientKey, patients);
    const patientLabel = patientCtx.PatientID || patientCtx.PatientName || consult.PatientKey;
    const requestByStaff = resolveStaff(consult.RequestBy, staffList) || resolveStaff(consult.ConsultCreateBy, staffList);

    if (!hasConsultResult(consult)) {
      const overdueDays = daysSince(consult.ConsultDate);
      if (overdueDays > 3) {
        const message = `BN ${patientLabel} của ${consult.RequestBy || 'BS đăng ký'} đăng ký chưa có KQ hội chẩn.`;
        notifyStaffAboutConsult(requestByStaff, consult, patientCtx, 'Chưa có kết quả hội chẩn', message, 'notif:pending-staff-result');
        notifyStaffAboutConsult(secretary, consult, patientCtx, 'Chưa có kết quả hội chẩn', message, 'notif:pending-staff-result');
      }
      if (overdueDays > 28 && requestByStaff) {
        appendDoctorMarkIfMissing({
          StaffKey: requestByStaff.StaffKey,
          StaffName: requestByStaff.StaffName,
          MarkType: 'requester_overdue_staff_result',
          Label: 'Không hoàn thành theo dõi kết quả hội chẩn',
          Reason: `BN ${patientLabel} đã quá ${overdueDays} ngày từ ngày đăng ký nhưng chưa có kết quả hội chẩn.`,
          RelatedEntityType: 'Consult',
          RelatedEntityKey: consult.ConsultKey,
          PatientKey: patientCtx.PatientKey,
          PatientID: patientCtx.PatientID,
          PatientName: patientCtx.PatientName,
          DedupKey: `mark:requester-overdue-staff-result:${consult.ConsultKey}`,
          CreatedBy: 'workflow-monitor'
        });
      }
    }

    const plannedOverdueDays = daysSince(consult.PlannedCathLabDate);
    const hasCathResult = cathlabs.some(cath => String(cath.ConsultKey || '') === String(consult.ConsultKey || ''));
    const eligibleForCath = consult.TransferredToCathLab === true
      || String(consult.TransferredToCathLab || '').trim().toLowerCase() === 'true'
      || (consult.CheckDevice === 'Đủ' && consult.CallStatus === 'Đồng ý');
    if (consult.PlannedCathLabDate && plannedOverdueDays > 30 && eligibleForCath && !hasCathResult) {
      const ptvAssistant = resolveStaff(consult.Scheduled2ndInterventionist, staffList);
      if (ptvAssistant) {
        appendDoctorMarkIfMissing({
          StaffKey: ptvAssistant.StaffKey,
          StaffName: ptvAssistant.StaffName,
          MarkType: 'missing_cath_result',
          Label: 'Không hoàn thành điền kết quả thông tim',
          Reason: `BN ${patientLabel} đã quá ${plannedOverdueDays} ngày từ ngày dự kiến thông tim nhưng chưa có kết quả thông tim.`,
          RelatedEntityType: 'Consult',
          RelatedEntityKey: consult.ConsultKey,
          PatientKey: patientCtx.PatientKey,
          PatientID: patientCtx.PatientID,
          PatientName: patientCtx.PatientName,
          DedupKey: `mark:missing-cath-result:${consult.ConsultKey}:${ptvAssistant.StaffKey}`,
          CreatedBy: 'workflow-monitor'
        });
        notifyStaffAboutConsult(
          ptvAssistant,
          consult,
          patientCtx,
          'Chưa điền kết quả thông tim',
          `BN ${patientLabel} đã quá 1 tháng từ ngày dự kiến thông tim nhưng chưa có kết quả thông tim.`,
          'notif:missing-cath-result',
          'critical'
        );
      }
    }
  });

  const notificationsAfter = readDB<Notification>(NOTIFICATIONS_FILE, []).length;
  const marksAfter = readDB<DoctorPerformanceMark>(DOCTOR_MARKS_FILE, []).length;
  return {
    notificationsCreated: Math.max(0, notificationsAfter - notificationsBefore),
    marksCreated: Math.max(0, marksAfter - marksBefore)
  };
}

app.get('/api/all', requireAuth, async (_req, res) => {
  await syncFromGoogleSheets();
  const rawStaff = readDB<Staff>(STAFF_FILE, defaultStaff);
  res.json({
    patients: readDB<Patient>(PATIENTS_FILE, defaultPatients),
    consults: readDB<Consult>(CONSULTS_FILE, defaultConsults),
    staff: rawStaff.map(stripPassword),
    cathlabs: readDB<CathLab>(CATHLABS_FILE, defaultCathlabs),
    operations: readDB<Operation>(OPERATIONS_FILE, []),
    cmrs: readDB<CMR>(CMRS_FILE, defaultCmrs),
    sources: readDB<Source>(SOURCES_FILE, []),
    deviceTemplates: readDB<DeviceTemplate>(DEVICE_TEMPLATES_FILE, []),
    rolePresets: ensureRolePresetsDB(),
    notifications: readDB<Notification>(NOTIFICATIONS_FILE, []),
    doctorPerformanceMarks: readDB<DoctorPerformanceMark>(DOCTOR_MARKS_FILE, [])
  });
});

app.get('/api/notifications', requireAuth, async (req, res) => {
  await syncFromGoogleSheets();
  const staffKey = String(req.query.staffKey || '').trim();
  let notifications = readDB<Notification>(NOTIFICATIONS_FILE, []);
  if (staffKey) {
    notifications = notifications.filter(item => String(item.StaffKey || '') === staffKey);
  }
  notifications.sort((a, b) => String(b.CreatedTime || '').localeCompare(String(a.CreatedTime || '')));
  res.json(notifications);
});

app.post('/api/notifications', requireAuth, async (req, res) => {
  const record = appendNotificationIfMissing(req.body);
  res.status(record ? 201 : 400).json(record || { error: 'Notification requires StaffKey and DedupKey' });
});

app.put('/api/notifications/:key/read', requireAuth, async (req, res) => {
  const notifications = readDB<Notification>(NOTIFICATIONS_FILE, []);
  const key = req.params.key;
  const index = notifications.findIndex(item => item.NotificationKey === key);
  if (index === -1) {
    res.status(404).json({ error: 'Notification not found' });
    return;
  }

  notifications[index] = {
    ...notifications[index],
    IsRead: true,
    ReadTime: notifications[index].ReadTime || newTimestamp()
  };
  writeDB(NOTIFICATIONS_FILE, notifications);
  markLocalMutation();
  recentLocalEdits.set(`Notification_${notifications[index].NotificationKey}`, { timestamp: Date.now(), data: notifications[index] });
  syncToGoogleSheets('Notification', 'update', notifications[index].NotificationKey, notifications[index]).catch(err => {
    console.error('Error syncing notification read update:', err);
  });
  res.json(notifications[index]);
});

app.get('/api/doctor-performance-marks', requireAuth, async (req, res) => {
  await syncFromGoogleSheets();
  const staffKey = String(req.query.staffKey || '').trim();
  let marks = readDB<DoctorPerformanceMark>(DOCTOR_MARKS_FILE, []);
  if (staffKey) {
    marks = marks.filter(item => String(item.StaffKey || '') === staffKey);
  }
  marks.sort((a, b) => String(b.CreatedTime || '').localeCompare(String(a.CreatedTime || '')));
  res.json(marks);
});

app.post('/api/doctor-performance-marks', requireAuth, async (req, res) => {
  const record = appendDoctorMarkIfMissing(req.body);
  res.status(record ? 201 : 400).json(record || { error: 'Doctor performance mark requires StaffKey and DedupKey' });
});

type BatchEndpointConfig<T> = {
  type: 'Patient' | 'Consult' | 'CathLab' | 'Notification' | 'DoctorPerformanceMark';
  file: string;
  defaults: T[];
  keyField: keyof T & string;
  prefix: string;
  normalize?: (record: any) => T;
};

function getBatchEndpointConfig(endpoint: string): BatchEndpointConfig<any> | null {
  const configs: Record<string, BatchEndpointConfig<any>> = {
    patients: { type: 'Patient', file: PATIENTS_FILE, defaults: defaultPatients, keyField: 'PatientKey', prefix: 'pat' },
    consults: {
      type: 'Consult',
      file: CONSULTS_FILE,
      defaults: defaultConsults,
      keyField: 'ConsultKey',
      prefix: 'con',
      normalize: record => applyDiagnosisNormalization(record, ['DiagnosisID'])
    },
    cathlabs: {
      type: 'CathLab',
      file: CATHLABS_FILE,
      defaults: defaultCathlabs,
      keyField: 'CathKey',
      prefix: 'cath',
      normalize: record => applyDiagnosisNormalization(record, ['DiagnosisID', 'PostDiagnosisID'])
    },
    notifications: { type: 'Notification', file: NOTIFICATIONS_FILE, defaults: [], keyField: 'NotificationKey', prefix: 'notif' },
    'doctor-performance-marks': { type: 'DoctorPerformanceMark', file: DOCTOR_MARKS_FILE, defaults: [], keyField: 'MarkKey', prefix: 'mark' }
  };
  return configs[endpoint] || null;
}

app.post('/api/batch-write', requireAuth, async (req, res) => {
  try {
    const operations = Array.isArray(req.body?.operations) ? req.body.operations : [];
    if (operations.length === 0) {
      res.status(400).json({ error: 'Batch write requires operations' });
      return;
    }

    const savedRecords: any[] = [];
    for (const operation of operations) {
      const endpoint = String(operation.endpoint || '').trim();
      const config = getBatchEndpointConfig(endpoint);
      if (!config) {
        res.status(400).json({ error: `Unsupported batch endpoint: ${endpoint}` });
        return;
      }

      const records = readDB<any>(config.file, config.defaults);
      const isUpdate = ['PUT', 'PATCH'].includes(String(operation.method || 'POST').toUpperCase());
      const incoming = config.normalize ? config.normalize(operation.data || {}) : { ...(operation.data || {}) };
      const requestedKey = String(operation.key || incoming[config.keyField] || '').trim();
      const existingIndex = requestedKey
        ? records.findIndex(record => String(record[config.keyField] || '') === requestedKey)
        : -1;
      const finalKey = requestedKey || createUniqueKey(config.prefix, records.map(record => record[config.keyField]));
      const nextRecord = existingIndex >= 0
        ? { ...records[existingIndex], ...incoming, [config.keyField]: finalKey }
        : { ...incoming, [config.keyField]: finalKey };

      if (endpoint === 'patients') {
        nextRecord.PatientCreateTime = nextRecord.PatientCreateTime || newTimestamp();
      } else if (endpoint === 'consults') {
        nextRecord.ConsultCreateTime = nextRecord.ConsultCreateTime || newTimestamp();
      } else if (endpoint === 'notifications') {
        nextRecord.CreatedTime = nextRecord.CreatedTime || newTimestamp();
        nextRecord.IsRead = nextRecord.IsRead ?? false;
      } else if (endpoint === 'doctor-performance-marks') {
        nextRecord.CreatedTime = nextRecord.CreatedTime || newTimestamp();
        nextRecord.CreatedBy = nextRecord.CreatedBy || 'HIS_IMPORT';
        nextRecord.Score = nextRecord.Score ?? 1;
      }

      if (existingIndex >= 0) {
        records[existingIndex] = nextRecord;
      } else {
        records.push(nextRecord);
      }

      writeDB<any>(config.file, records);
      recentLocalEdits.set(`${config.type}_${finalKey}`, { timestamp: Date.now(), data: nextRecord });
      syncToGoogleSheets(config.type, existingIndex >= 0 || isUpdate ? 'update' : 'insert', finalKey, nextRecord).catch(err => {
        console.error(`Error syncing batch ${endpoint}:`, err);
      });
      savedRecords.push(nextRecord);
    }

    markLocalMutation();
    res.json({ success: true, count: savedRecords.length, records: savedRecords });
  } catch (err) {
    console.error('Error in POST /api/batch-write:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/workflow-monitor/run', requireAuth, async (_req, res) => {
  try {
    await syncFromGoogleSheets();
    const result = runWorkflowMonitor();
    res.json({ success: true, ...result });
  } catch (err) {
    console.error('Error running workflow monitor:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// --- CHD Daily Brief ---
app.get('/api/chd-brief/today', async (_req, res) => {
  try {
    const today = new Date();
    const dateIso = formatDateISO(today);
    const topic = getTopicForDate(today);
    const content = loadBriefContent(dateIso);
    const status = getPipelineStatus();
    res.json({
      dateIso,
      dateVN: formatDateVN(today),
      topic,
      content,
      status,
      hasDocx: fs.existsSync(docxPath(dateIso)),
    });
  } catch (err) {
    console.error('Error in GET /api/chd-brief/today:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/chd-brief/generate', async (req, res) => {
  try {
    const force = Boolean(req.body?.force);
    const result = await runPipeline({ force });
    res.json(result);
  } catch (err) {
    console.error('Error in POST /api/chd-brief/generate:', err);
    res.status(500).json({ error: err instanceof Error ? err.message : 'Internal server error' });
  }
});

app.get('/api/chd-brief/history', (_req, res) => {
  try {
    res.json(getBriefHistory());
  } catch (err) {
    console.error('Error in GET /api/chd-brief/history:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/chd-brief/download/:date', (req, res) => {
  try {
    const date = String(req.params.date || '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      res.status(400).json({ error: 'Invalid date format' });
      return;
    }
    const filePath = docxPath(date);
    if (!fs.existsSync(filePath)) {
      res.status(404).json({ error: 'File not found' });
      return;
    }
    res.download(filePath, `CHD_Brief_${date}.docx`);
  } catch (err) {
    console.error('Error in GET /api/chd-brief/download:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/chd-brief/announcement/:date', (req, res) => {
  try {
    const date = String(req.params.date || '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      res.status(400).json({ error: 'Invalid date format' });
      return;
    }
    const content = loadBriefContent(date);
    if (!content) {
      res.status(404).json({ error: 'Brief not found for this date' });
      return;
    }
    res.type('text/plain; charset=utf-8').send(formatAnnouncementVN(content));
  } catch (err) {
    console.error('Error in GET /api/chd-brief/announcement:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/chd-brief/content/:date', (req, res) => {
  try {
    const date = String(req.params.date || '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      res.status(400).json({ error: 'Invalid date format' });
      return;
    }
    const content = loadBriefContent(date);
    if (!content) {
      res.status(404).json({ error: 'Brief not found for this date' });
      return;
    }
    res.json(content);
  } catch (err) {
    console.error('Error in GET /api/chd-brief/content:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/chd-brief/status', (_req, res) => {
  res.json(getPipelineStatus());
});

// Routes
// Full staff list — requires auth, strips passwords
app.get('/api/staff', requireAuth, async (req, res) => {
  await syncFromGoogleSheets();
  const staff = readDB<Staff>(STAFF_FILE, defaultStaff);
  res.json(staff.map(stripPassword));
});

app.put('/api/staff/:key', requireAuth, async (req, res) => {
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

    if (updateData.Password === undefined || updateData.Password === null || String(updateData.Password).trim() === '') {
      delete updateData.Password;
    } else {
      updateData.Password = hashPassword(String(updateData.Password).trim(), staff[index].StaffKey);
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

app.get('/api/role-presets', requireAuth, async (req, res) => {
  await syncFromGoogleSheets();
  res.json(ensureRolePresetsDB());
});

app.post('/api/role-presets', requireAdmin, async (req, res) => {
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

app.put('/api/role-presets/:key', requireAdmin, async (req, res) => {
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

app.delete('/api/role-presets/:key', requireAdmin, async (req, res) => {
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

app.get('/api/patients', requireAuth, async (req, res) => {
  await syncFromGoogleSheets();
  const patients = readDB<Patient>(PATIENTS_FILE, defaultPatients);
  res.json(patients);
});

app.post('/api/patients', requireAuth, async (req, res) => {
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

app.put('/api/patients/:key', requireAuth, async (req, res) => {
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

app.get('/api/consults', requireAuth, async (req, res) => {
  await syncFromGoogleSheets();
  const consults = readDB<Consult>(CONSULTS_FILE, defaultConsults);
  res.json(consults);
});

app.get('/api/operations', requireAuth, async (req, res) => {
  await syncFromGoogleSheets();
  const operations = readDB<any>(OPERATIONS_FILE, []);
  res.json(operations);
});

app.get('/api/cmrs', requireAuth, async (req, res) => {
  await syncFromGoogleSheets();
  const cmrs = readDB<CMR>(CMRS_FILE, defaultCmrs);
  res.json(cmrs);
});

app.post('/api/cmrs', requireAuth, async (req, res) => {
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

app.put('/api/cmrs/:key', requireAuth, async (req, res) => {
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

app.get('/api/sources', requireAuth, async (req, res) => {
  await syncFromGoogleSheets();
  const sources = readDB<Source>(SOURCES_FILE, []);
  res.json(sources);
});

app.get('/api/device-templates', requireAuth, async (req, res) => {
  await syncFromGoogleSheets();
  const deviceTemplates = readDB<DeviceTemplate>(DEVICE_TEMPLATES_FILE, []);
  res.json(deviceTemplates);
});

app.post('/api/sources', requireAuth, async (req, res) => {
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

app.post('/api/sources/update-all', requireAuth, async (req, res) => {
  try {
    const { PatientAddress, DiagnosisID, ResultConsultID, CathMethod, diagnosisRenames } = req.body || {};

    if (!Array.isArray(PatientAddress) || !Array.isArray(DiagnosisID) || !Array.isArray(ResultConsultID) || !Array.isArray(CathMethod)) {
      res.status(400).json({ error: 'Invalid payload: expected arrays for PatientAddress, DiagnosisID, ResultConsultID, and CathMethod.' });
      return;
    }

    // 1. Cascade DiagnosisID changes
    if (Array.isArray(diagnosisRenames) && diagnosisRenames.length > 0) {
      const consults = readDB<Consult>(CONSULTS_FILE, defaultConsults);
      let consultsChanged = false;
      
      const cathlabs = readDB<CathLab>(CATHLABS_FILE, defaultCathlabs);
      let cathlabsChanged = false;
      
      const cmrs = readDB<CMR>(CMRS_FILE, []);
      let cmrsChanged = false;
      
      const templates = readDB<DeviceTemplate>(DEVICE_TEMPLATES_FILE, []);
      let templatesChanged = false;

      for (const rename of diagnosisRenames) {
        const oldId = String(rename.oldVal || '').trim();
        const newId = String(rename.newVal || '').trim();
        if (oldId && newId && oldId !== newId) {
          // Consults
          consults.forEach(c => {
            if (c.DiagnosisID === oldId) {
              c.DiagnosisID = newId;
              consultsChanged = true;
              syncToGoogleSheets('Consult', 'update', c.ConsultKey, c).catch(() => {});
            }
          });
          
          // Cathlabs
          cathlabs.forEach(cl => {
            let clChanged = false;
            if (cl.DiagnosisID === oldId) {
              cl.DiagnosisID = newId;
              clChanged = true;
            }
            if (cl.PostDiagnosisID === oldId) {
              cl.PostDiagnosisID = newId;
              clChanged = true;
            }
            if (clChanged) {
              cathlabsChanged = true;
              syncToGoogleSheets('CathLab', 'update', cl.CathKey, cl).catch(() => {});
            }
          });

          // CMRs
          cmrs.forEach(cmr => {
            if (cmr.CMRDiagnosisID === oldId) {
              cmr.CMRDiagnosisID = newId;
              cmrsChanged = true;
              syncToGoogleSheets('CMR', 'update', cmr.CMRKey, cmr).catch(() => {});
            }
          });

          // DeviceTemplates
          templates.forEach(t => {
            if (t.DiagnosisID === oldId) {
              t.DiagnosisID = newId;
              templatesChanged = true;
              syncToGoogleSheets('DeviceTemplate', 'update', t.DeviceName, t).catch(() => {});
            }
          });
        }
      }

      if (consultsChanged) writeDB(CONSULTS_FILE, consults);
      if (cathlabsChanged) writeDB(CATHLABS_FILE, cathlabs);
      if (cmrsChanged) writeDB(CMRS_FILE, cmrs);
      if (templatesChanged) writeDB(DEVICE_TEMPLATES_FILE, templates);
    }

    // 2. Reconstruct sources sheet
    const existingSources = readDB<Source>(SOURCES_FILE, []);
    const maxLen = Math.max(
      PatientAddress.length,
      DiagnosisID.length,
      ResultConsultID.length,
      CathMethod.length
    );

    const nextSources: Source[] = [];
    for (let i = 0; i < maxLen; i++) {
      const existing = existingSources[i] || {};
      nextSources.push({
        ...existing,
        PatientAddress: PatientAddress[i] || '',
        DiagnosisID: DiagnosisID[i] || '',
        ResultConsultID: ResultConsultID[i] || '',
        CathMethod: CathMethod[i] || ''
      });
    }

    writeDB<Source>(SOURCES_FILE, nextSources);
    markLocalMutation();

    // 3. Sync to Google Sheets
    syncToGoogleSheets('Source', 'sync_sources' as any, '', nextSources).catch(err => {
      console.error('Error syncing sources update-all to google sheets background:', err);
    });

    res.json({ success: true, count: nextSources.length });
  } catch (err) {
    console.error('Error in POST /api/sources/update-all:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/consults', requireAuth, async (req, res) => {
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
app.put('/api/consults/:key', requireAuth, async (req, res) => {
  const consults = readDB<Consult>(CONSULTS_FILE, defaultConsults);
  const key = req.params.key;
  const updateData: Partial<Consult> = req.body;
  
  const index = consults.findIndex(c => c.ConsultKey === key);
  if (index !== -1) {
    const previousConsult = { ...consults[index] };
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

    try {
      const staffList = readDB<Staff>(STAFF_FILE, defaultStaff);
      const patients = readDB<Patient>(PATIENTS_FILE, defaultPatients);
      handleConsultWorkflowMutation(previousConsult, consults[index], updateData, staffList, patients);
    } catch (err) {
      console.error('Error evaluating consult workflow mutation:', err);
    }
    
    res.json(consults[index]);
  } else {
    res.status(404).json({ error: 'Consult not found' });
  }
});

app.get('/api/cathlabs', requireAuth, async (req, res) => {
  await syncFromGoogleSheets();
  const cathlabs = readDB<CathLab>(CATHLABS_FILE, defaultCathlabs);
  res.json(cathlabs);
});

app.post('/api/cathlabs', requireAuth, async (req, res) => {
  const cathlabs = readDB<CathLab>(CATHLABS_FILE, defaultCathlabs);
  const newCathLab: CathLab = applyDiagnosisNormalization(req.body, ['DiagnosisID', 'PostDiagnosisID']);
  
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

app.put('/api/cathlabs/:key', requireAuth, async (req, res) => {
  const cathlabs = readDB<CathLab>(CATHLABS_FILE, defaultCathlabs);
  const key = req.params.key;
  const index = cathlabs.findIndex(c => c.CathKey === key);
  if (index !== -1) {
    cathlabs[index] = applyDiagnosisNormalization(
      { ...cathlabs[index], ...req.body },
      ['DiagnosisID', 'PostDiagnosisID']
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

// Reset Database API — Admin only
app.post('/api/reset', requireAdmin, (req, res) => {
  writeDB<Patient>(PATIENTS_FILE, defaultPatients);
  writeDB<Consult>(CONSULTS_FILE, defaultConsults);
  writeDB<Staff>(STAFF_FILE, defaultStaff);
  res.json({ message: "Database reset to defaults successfully" });
});

const WORKFLOW_MONITOR_INTERVAL_MS = 60 * 60 * 1000;

setInterval(() => {
  try {
    const result = runWorkflowMonitor();
    if (result.notificationsCreated > 0 || result.marksCreated > 0) {
      console.log(`Workflow monitor created ${result.notificationsCreated} notifications and ${result.marksCreated} marks.`);
    }
  } catch (err) {
    console.error('Workflow monitor interval failed:', err);
  }
}, WORKFLOW_MONITOR_INTERVAL_MS);

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
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api/')) {
        return next();
      }
      res.sendFile(path.join(distPath, 'index.html'));
    });
    app.use('/api', (_req, res) => {
      res.status(404).json({ error: 'API route not found' });
    });
  }

  if (!process.env.VERCEL) {
    app.listen(PORT, "0.0.0.0", () => {
      console.log(`Server running on http://0.0.0.0:${PORT}`);
      startChdBriefScheduler();
    });
  }
}

launch();

export default app;
