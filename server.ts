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
import { createClient } from '@supabase/supabase-js';
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
// SUPABASE CLIENT & IN-MEMORY CACHE
// ─────────────────────────────────────────────────────────────────
const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);
// Initial Staff Data
const defaultStaff: Staff[] = [
  {
    id: "11111",
    StaffName: "Admin",
    Name: "Admin",
    Password: "1111",
    Role: "Admin",
    Email: "admin@hospital.vn",
    FireDate: ""
  },
  {
    id: "01378",
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
    id: "01651",
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
    id: "02000",
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
    id: "33333",
    StaffName: "BS. Lợi",
    Password: "user",
    Role: "User",
    Email: "loi@company.com",
    FireDate: ""
  },
  {
    id: "44444",
    StaffName: "BS. Phụng",
    Password: "user",
    Role: "User",
    Email: "phung@company.com",
    FireDate: ""
  },
  {
    id: "55555",
    StaffName: "BS. Thịnh",
    Password: "user",
    Role: "User",
    Email: "thinh@company.com",
    FireDate: ""
  },
  {
    id: "77777",
    StaffName: "BS. Hiếu",
    Password: "user",
    Role: "User",
    Email: "hieu@company.com",
    FireDate: ""
  },
  {
    id: "88888",
    StaffName: "BS. Tài",
    Password: "user",
    Role: "User",
    Email: "tai@company.com",
    FireDate: ""
  },
  {
    id: "99999",
    StaffName: "BS. Hùng",
    Password: "user",
    Role: "User",
    Email: "hung@company.com",
    FireDate: ""
  },
  {
    id: "10000",
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
    id: "pat_001",
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
    id: "pat_002",
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
    id: "pat_003",
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
    id: "con_001",
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
    id: "con_002",
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
const defaultCathlabs: CathLab[] = [];
const defaultCmrs: CMR[] = [];
// In-memory cache to replace local JSON files
const memoryDb: Record<string, any[]> = {
  Patient: [...defaultPatients],
  Consult: [...defaultConsults],
  Staff: [...defaultStaff],
  CathLab: [...defaultCathlabs],
  Operation: [],
  CMR: [...defaultCmrs],
  Source: [],
  DeviceTemplate: [],
  RolePreset: [],
  Notification: [],
  DoctorPerformanceMark: []
};
let lastCacheFetch = 0;
const CACHE_TTL_MS = 10000; // 10 seconds
async function ensureTableCache(table: string, defaults: any[] = []): Promise<any[]> {
  try {
    if (Date.now() - lastCacheFetch > CACHE_TTL_MS) {
      const { data, error } = await supabase.from(table).select('*');
      if (!error && data && data.length > 0) {
        memoryDb[table] = data;
      } else if (!memoryDb[table] || memoryDb[table].length === 0) {
        memoryDb[table] = defaults;
      }
    }
  } catch (err) {
    console.error(`Supabase fetch error for ${table}:`, err);
  }
  return memoryDb[table] || defaults;
}
async function mutateTableRecord(table: string, action: 'insert' | 'update', keyField: string, keyVal: string, record: any): Promise<boolean> {
  try {
    const list = memoryDb[table] || [];
    const index = list.findIndex(r => String(r[keyField] || '') === String(keyVal));
    if (index >= 0) {
      list[index] = { ...list[index], ...record };
    } else {
      list.push(record);
    }
    memoryDb[table] = list;
    if (action === 'insert') {
      await supabase.from(table).insert(record);
    } else {
      await supabase.from(table).update(record).eq(keyField, keyVal);
    }
    return true;
  } catch (err) {
    console.error(`Supabase mutation error for ${table}:`, err);
    return false;
  }
}
function cleanSheetText(val: any): string {
  if (val === undefined || val === null) return '';
  let str = String(val).trim();
  if (str.startsWith("'")) {
    str = str.substring(1);
  }
  return str;
}
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
/** Extract Bearer token from Authorization header or cookie */
function extractBearerToken(req: express.Request): string | null {
  const cookieHeader = req.headers['cookie'] || '';
  const match = cookieHeader.match(/(?:^|;)\s*CHD_AUTH_TOKEN\s*=\s*([^;]+)/);
  if (match) {
    return match[1].trim();
  }
  const auth = req.headers['authorization'] || '';
  if (auth.startsWith('Bearer ')) return auth.slice(7).trim();
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
  requireAuth(req, res, async () => {
    const staffKey = (req as any).staffKey as string;
    const staffList = await ensureTableCache('Staff', defaultStaff);
    const staff = staffList.find(s => String(s.id) === staffKey);
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
    const staffList = await ensureTableCache('Staff', defaultStaff);
    const localStaff = staffList.find(s => String(s.id || '').trim() === String(StaffKey).trim());
    let staffMember: Staff | undefined;
    if (localStaff) {
      const hashedInput = hashPassword(Password, String(StaffKey));
      const isPlaintextMatch = (String(localStaff.Password || '').trim() === String(Password).trim());
      const isHashedMatch = (String(localStaff.Password || '').trim() === String(hashedInput).trim());
      if (isPlaintextMatch || isHashedMatch) {
        staffMember = localStaff;
        if (isPlaintextMatch && !isHashedMatch) {
          localStaff.Password = hashedInput;
          await mutateTableRecord('Staff', 'update', 'StaffKey', localStaff.id, localStaff);
        }
      }
    }
    if (!staffMember) {
      res.status(401).json({ error: 'Mã nhân viên hoặc mật khẩu không đúng.' });
      return;
    }
    if (staffMember.FireDate && String(staffMember.FireDate).trim()) {
      res.status(403).json({ error: `Tài khoản đã bị vô hiệu hóa (nghỉ việc ngày: ${staffMember.FireDate}).` });
      return;
    }
    const token = createSession(String(staffMember.id));
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
app.get('/api/auth/me', requireAuth, async (req, res) => {
  const staffKey = (req as any).staffKey as string;
  const staffList = await ensureTableCache('Staff', defaultStaff);
  const staff = staffList.find(s => String(s.id) === staffKey);
  if (!staff) {
    res.status(401).json({ error: 'Tài khoản không còn tồn tại.' });
    return;
  }
  res.json(stripPassword(staff));
});
app.get('/api/staff/public', async (_req, res) => {
  const staffList = await ensureTableCache('Staff', defaultStaff);
  const publicList = staffList
    .filter(s => !s.FireDate || !String(s.FireDate).trim())
    .map(s => ({
      StaffKey: s.id,
      StaffName: s.StaffName,
      Name: s.Name || '',
      Role: s.Role || '',
      Avatar: (s as any).Avatar || ''
    }));
  res.json(publicList);
});
const BUILD_TIMESTAMP = String(Date.now());
app.get('/api/version', (_req, res) => {
  res.json({ version: '5.0.0', buildTime: BUILD_TIMESTAMP });
});
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
// Dummy Sync Config Router Endpoints to satisfy frontend checks without Google Sheets
app.get('/api/sync-config', (_req, res) => {
  res.json({
    scriptUrl: '',
    scriptSecret: '',
    isSynced: false,
    message: 'Google Sheets sync disabled in favor of Supabase'
  });
});
app.post('/api/sync-config', (_req, res) => {
  res.json({ success: true, message: "Switched completely to Supabase database." });
});
app.post('/api/sync-config/sync', (_req, res) => {
  res.json({ success: true, message: "Đồng bộ thành công dữ liệu mới nhất từ Supabase!" });
});
async function ensureRolePresetsDB(): Promise<RolePreset[]> {
  const existing = await ensureTableCache('RolePreset', []);
  if (existing.length === 0) {
    const seeded = resolveRolePresetRecords(DEFAULT_ROLE_PRESET_RECORDS);
    memoryDb['RolePreset'] = seeded;
    for (const item of seeded) {
      await mutateTableRecord('RolePreset', 'insert', 'RolePresetID', item.id, item);
    }
    return seeded;
  }
  const resolved = resolveRolePresetRecords(existing);
  if (JSON.stringify(resolved) !== JSON.stringify(existing)) {
    memoryDb['RolePreset'] = resolved;
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
  return keys.map(key => staffList.find(staff => String(staff.id) === key)).find(Boolean);
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
  const patient = patients.find(p => String(p.id || '') === String(patientKey || ''));
  return {
    patient,
    id: patient?.id || patientKey || '',
    PatientID: patient?.PatientID1 || '',
    PatientName: patient?.PatientName || patient?.OtherPatientName || ''
  };
}
async function appendNotificationIfMissing(input: Omit<Notification, 'id' | 'CreatedTime' | 'IsRead'> & Partial<Pick<Notification, 'id' | 'CreatedTime' | 'IsRead'>>): Promise<Notification | null> {
  if (!input.StaffKey || !input.DedupKey) return null;
  const notifications = await ensureTableCache('Notification', []);
  const existing = notifications.find(item => item.DedupKey === input.DedupKey && item.StaffKey === input.StaffKey);
  if (existing) return existing;
  const record: Notification = {
    id: input.id || crypto.randomUUID(),
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
  await mutateTableRecord('Notification', 'insert', 'id', record.id, record);
  return record;
}
async function appendDoctorMarkIfMissing(input: Omit<DoctorPerformanceMark, 'id' | 'CreatedTime' | 'Score' | 'CreatedBy'> & Partial<Pick<DoctorPerformanceMark, 'id' | 'CreatedTime' | 'Score' | 'CreatedBy'>>): Promise<DoctorPerformanceMark | null> {
  if (!input.StaffKey || !input.DedupKey) return null;
  const marks = await ensureTableCache('DoctorPerformanceMark', []);
  const existing = marks.find(item => item.DedupKey === input.DedupKey && item.StaffKey === input.StaffKey);
  if (existing) return existing;
  const record: DoctorPerformanceMark = {
    id: input.id || crypto.randomUUID(),
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
  await mutateTableRecord('DoctorPerformanceMark', 'insert', 'id', record.id, record);
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
async function notifyStaffAboutConsult(staff: Staff | undefined, consult: Consult, patientCtx: ReturnType<typeof getPatientContext>, title: string, message: string, dedupPrefix: string, severity: Notification['Severity'] = 'warning') {
  if (!staff) return;
  await appendNotificationIfMissing({
    StaffKey: staff.id,
    StaffName: staff.StaffName,
    Title: title,
    Message: message,
    Severity: severity,
    RelatedEntityType: 'Consult',
    RelatedEntityKey: consult.id,
    PatientKey: patientCtx.id,
    PatientID: patientCtx.PatientID,
    PatientName: patientCtx.PatientName,
    DedupKey: `${dedupPrefix}:${consult.id}:${staff.id}`
  });
}
async function createSecretaryOverrideMark(consult: Consult, patientCtx: ReturnType<typeof getPatientContext>, staffList: Staff[], actorKey = 'workflow-monitor') {
  const secretary = getDefaultSecretary(staffList);
  if (!secretary) return;
  await appendDoctorMarkIfMissing({
    StaffKey: secretary.id,
    StaffName: secretary.StaffName,
    MarkType: 'missing_staff_result',
    Label: 'Không hoàn thành điền kết quả staff',
    Reason: `BN ${patientCtx.PatientID || patientCtx.PatientName || consult.PatientKey} đã phải xếp bổ sung do thiếu kết quả hội chẩn.`,
    RelatedEntityType: 'Consult',
    RelatedEntityKey: consult.id,
    PatientKey: patientCtx.id,
    PatientID: patientCtx.PatientID,
    PatientName: patientCtx.PatientName,
    DedupKey: `mark:secretary-missing-staff-result:${consult.id}`,
    CreatedBy: actorKey
  });
  await notifyStaffAboutConsult(
    secretary,
    consult,
    patientCtx,
    'Thiếu kết quả hội chẩn',
    `BN ${patientCtx.PatientID || patientCtx.PatientName || consult.PatientKey} đã phải xếp bổ sung vì chưa có kết quả hội chẩn.`,
    'notif:secretary-missing-staff-result'
  );
}
async function createSchedulerEmergencyTransferMark(consult: Consult, patientCtx: ReturnType<typeof getPatientContext>, staffList: Staff[], actorKey = 'workflow-monitor') {
  const scheduler = getDefaultScheduler(staffList);
  if (!scheduler) return;
  await appendDoctorMarkIfMissing({
    StaffKey: scheduler.id,
    StaffName: scheduler.StaffName,
    MarkType: 'scheduler_missing_transfer',
    Label: 'Không hoàn thành chuyển phòng TT',
    Reason: `BN ${patientCtx.PatientID || patientCtx.PatientName || consult.PatientKey} phải dùng thông tim cấp cứu do chưa được chuyển phòng TT.`,
    RelatedEntityType: 'Consult',
    RelatedEntityKey: consult.id,
    PatientKey: patientCtx.id,
    PatientID: patientCtx.PatientID,
    PatientName: patientCtx.PatientName,
    DedupKey: `mark:scheduler-missing-transfer:${consult.id}`,
    CreatedBy: actorKey
  });
  await notifyStaffAboutConsult(
    scheduler,
    consult,
    patientCtx,
    'Thiếu thao tác chuyển phòng TT',
    `BN ${patientCtx.PatientID || patientCtx.PatientName || consult.PatientKey} phải vượt quyền bằng thông tim cấp cứu vì chưa được chuyển phòng TT.`,
    'notif:scheduler-missing-transfer'
  );
}
async function handleConsultWorkflowMutation(previous: Consult, updated: Consult, updateData: Partial<Consult>, staffList: Staff[], patients: Patient[]) {
  const patientCtx = getPatientContext(updated.PatientKey, patients);
  const actorKey = String(updateData.ConsultResultUpdatedBy || updateData.CheckDeviceUpdatedBy || 'workflow-monitor');
  const wasPendingResult = !hasConsultResult(previous);
  const nowHasResult = hasConsultResult(updated);
  const isAdHocSchedulingActivation = wasPendingResult
    && nowHasResult
    && String(updateData.ConsultNote || '').includes('Kích hoạt xếp lịch bổ sung');
  if (isAdHocSchedulingActivation) {
    await createSecretaryOverrideMark(updated, patientCtx, staffList, actorKey);
  }
  const wasTransferred = previous.TransferredToCathLab === true || String(previous.TransferredToCathLab || '').trim().toLowerCase() === 'true';
  const nowTransferred = updated.TransferredToCathLab === true || String(updated.TransferredToCathLab || '').trim().toLowerCase() === 'true';
  const isEmergencyTransferOverride = !wasTransferred
    && nowTransferred
    && String(updateData.PriorityOrder || '').trim() === 'Cấp cứu'
    && String(updateData.CheckDeviceUpdatedBy || '').trim();
  if (isEmergencyTransferOverride) {
    await createSchedulerEmergencyTransferMark(updated, patientCtx, staffList, actorKey);
  }
}
async function runWorkflowMonitor() {
  const staffList = await ensureTableCache('Staff', defaultStaff);
  const patients = await ensureTableCache('Patient', defaultPatients);
  const consults = await ensureTableCache('Consult', defaultConsults);
  const cathlabs = await ensureTableCache('CathLab', defaultCathlabs);
  let notificationsBefore = (await ensureTableCache('Notification', [])).length;
  let marksBefore = (await ensureTableCache('DoctorPerformanceMark', [])).length;
  const secretary = getDefaultSecretary(staffList);
  for (const consult of consults) {
    if (isRemovedConsult(consult)) continue;
    const patientCtx = getPatientContext(consult.PatientKey, patients);
    const patientLabel = patientCtx.PatientID || patientCtx.PatientName || consult.PatientKey;
    const requestByStaff = resolveStaff(consult.RequestBy, staffList) || resolveStaff(consult.ConsultCreateBy, staffList);
    if (!hasConsultResult(consult)) {
      const overdueDays = daysSince(consult.ConsultDate);
      if (overdueDays > 3) {
        const message = `BN ${patientLabel} của ${consult.RequestBy || 'BS đăng ký'} đăng ký chưa có KQ hội chẩn.`;
        await notifyStaffAboutConsult(requestByStaff, consult, patientCtx, 'Chưa có kết quả hội chẩn', message, 'notif:pending-staff-result');
        await notifyStaffAboutConsult(secretary, consult, patientCtx, 'Chưa có kết quả hội chẩn', message, 'notif:pending-staff-result');
      }
      if (overdueDays > 28 && requestByStaff) {
        await appendDoctorMarkIfMissing({
          StaffKey: requestByStaff.id,
          StaffName: requestByStaff.StaffName,
          MarkType: 'requester_overdue_staff_result',
          Label: 'Không hoàn thành theo dõi kết quả hội chẩn',
          Reason: `BN ${patientLabel} đã quá ${overdueDays} ngày từ ngày đăng ký nhưng chưa có kết quả hội chẩn.`,
          RelatedEntityType: 'Consult',
          RelatedEntityKey: consult.id,
          PatientKey: patientCtx.id,
          PatientID: patientCtx.PatientID,
          PatientName: patientCtx.PatientName,
          DedupKey: `mark:requester-overdue-staff-result:${consult.id}`,
          CreatedBy: 'workflow-monitor'
        });
      }
    }
    const plannedOverdueDays = daysSince(consult.PlannedCathLabDate);
    const hasCathResult = cathlabs.some(cath => String(cath.ConsultKey || '') === String(consult.id || ''));
    const eligibleForCath = consult.TransferredToCathLab === true
      || String(consult.TransferredToCathLab || '').trim().toLowerCase() === 'true'
      || (consult.CheckDevice === 'Đủ' && consult.CallStatus === 'Đồng ý');
    if (consult.PlannedCathLabDate && plannedOverdueDays > 30 && eligibleForCath && !hasCathResult) {
      const ptvAssistant = resolveStaff(consult.Scheduled2ndInterventionist, staffList);
      if (ptvAssistant) {
        await appendDoctorMarkIfMissing({
          StaffKey: ptvAssistant.id,
          StaffName: ptvAssistant.StaffName,
          MarkType: 'missing_cath_result',
          Label: 'Không hoàn thành điền kết quả thông tim',
          Reason: `BN ${patientLabel} đã quá ${plannedOverdueDays} ngày từ ngày dự kiến thông tim nhưng chưa có kết quả thông tim.`,
          RelatedEntityType: 'Consult',
          RelatedEntityKey: consult.id,
          PatientKey: patientCtx.id,
          PatientID: patientCtx.PatientID,
          PatientName: patientCtx.PatientName,
          DedupKey: `mark:missing-cath-result:${consult.id}:${ptvAssistant.id}`,
          CreatedBy: 'workflow-monitor'
        });
        await notifyStaffAboutConsult(
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
  }
  const notificationsAfter = (await ensureTableCache('Notification', [])).length;
  const marksAfter = (await ensureTableCache('DoctorPerformanceMark', [])).length;
  return {
    notificationsCreated: Math.max(0, notificationsAfter - notificationsBefore),
    marksCreated: Math.max(0, marksAfter - marksBefore)
  };
}
app.get('/api/all', requireAuth, async (_req, res) => {
  const rawStaff = await ensureTableCache('Staff', defaultStaff);
  res.json({
    patients: await ensureTableCache('Patient', defaultPatients),
    consults: await ensureTableCache('Consult', defaultConsults),
    staff: rawStaff.map(stripPassword),
    cathlabs: await ensureTableCache('CathLab', defaultCathlabs),
    operations: await ensureTableCache('Operation', []),
    cmrs: await ensureTableCache('CMR', defaultCmrs),
    sources: await ensureTableCache('Source', []),
    deviceTemplates: await ensureTableCache('DeviceTemplate', []),
    rolePresets: await ensureRolePresetsDB(),
    notifications: await ensureTableCache('Notification', []),
    doctorPerformanceMarks: await ensureTableCache('DoctorPerformanceMark', [])
  });
});
app.get('/api/notifications', requireAuth, async (req, res) => {
  const staffKey = String(req.query.staffKey || '').trim();
  let notifications = await ensureTableCache('Notification', []);
  if (staffKey) {
    notifications = notifications.filter(item => String(item.StaffKey || '') === staffKey);
  }
  notifications.sort((a, b) => String(b.CreatedTime || '').localeCompare(String(a.CreatedTime || '')));
  res.json(notifications);
});
app.post('/api/notifications', requireAuth, async (req, res) => {
  const record = await appendNotificationIfMissing(req.body);
  res.status(record ? 201 : 400).json(record || { error: 'Notification requires StaffKey and DedupKey' });
});
app.put('/api/notifications/:key/read', requireAuth, async (req, res) => {
  const notifications = await ensureTableCache('Notification', []);
  const key = req.params.key;
  const index = notifications.findIndex(item => item.NotificationKey === key);
  if (index === -1) {
    res.status(404).json({ error: 'Notification not found' });
    return;
  }
  const updated = {
    ...notifications[index],
    IsRead: true,
    ReadTime: notifications[index].ReadTime || newTimestamp()
  };
  await mutateTableRecord('Notification', 'update', 'NotificationKey', updated.NotificationKey, updated);
  res.json(updated);
});
app.get('/api/doctor-performance-marks', requireAuth, async (req, res) => {
  const staffKey = String(req.query.staffKey || '').trim();
  let marks = await ensureTableCache('DoctorPerformanceMark', []);
  if (staffKey) {
    marks = marks.filter(item => String(item.StaffKey || '') === staffKey);
  }
  marks.sort((a, b) => String(b.CreatedTime || '').localeCompare(String(a.CreatedTime || '')));
  res.json(marks);
});
app.post('/api/doctor-performance-marks', requireAuth, async (req, res) => {
  const record = await appendDoctorMarkIfMissing(req.body);
  res.status(record ? 201 : 400).json(record || { error: 'Doctor performance mark requires StaffKey and DedupKey' });
});
type BatchEndpointConfig<T> = {
  type: 'Patient' | 'Consult' | 'CathLab' | 'Notification' | 'DoctorPerformanceMark';
  defaults: T[];
  keyField: keyof T & string;
  prefix: string;
  normalize?: (record: any) => T;
};
function getBatchEndpointConfig(endpoint: string): BatchEndpointConfig<any> | null {
  const configs: Record<string, BatchEndpointConfig<any>> = {
    patients: { type: 'Patient', defaults: defaultPatients, keyField: 'PatientKey', prefix: 'pat' },
    consults: {
      type: 'Consult',
      defaults: defaultConsults,
      keyField: 'ConsultKey',
      prefix: 'con',
      normalize: record => applyDiagnosisNormalization(record, ['DiagnosisID'])
    },
    cathlabs: {
      type: 'CathLab',
      defaults: defaultCathlabs,
      keyField: 'CathKey',
      prefix: 'cath',
      normalize: record => applyDiagnosisNormalization(record, ['DiagnosisID', 'PostDiagnosisID'])
    },
    notifications: { type: 'Notification', defaults: [], keyField: 'NotificationKey', prefix: 'notif' },
    'doctor-performance-marks': { type: 'DoctorPerformanceMark', defaults: [], keyField: 'id', prefix: 'mark' }
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
      const records = await ensureTableCache(config.type, config.defaults);
      const isUpdate = ['PUT', 'PATCH'].includes(String(operation.method || 'POST').toUpperCase());
      const incoming = config.normalize ? config.normalize(operation.data || {}) : { ...(operation.data || {}) };
      const requestedKey = String(operation.key || incoming[config.keyField] || '').trim();
      const existingIndex = requestedKey
        ? records.findIndex(record => String(record[config.keyField] || '') === requestedKey)
        : -1;
      const finalKey = requestedKey || crypto.randomUUID();
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
      await mutateTableRecord(config.type, existingIndex >= 0 || isUpdate ? 'update' : 'insert', config.keyField, finalKey, nextRecord);
      savedRecords.push(nextRecord);
    }
    res.json({ success: true, count: savedRecords.length, records: savedRecords });
  } catch (err) {
    console.error('Error in POST /api/batch-write:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});
app.post('/api/workflow-monitor/run', requireAuth, async (_req, res) => {
  try {
    const result = await runWorkflowMonitor();
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
app.get('/api/staff', requireAuth, async (_req, res) => {
  const staff = await ensureTableCache('Staff', defaultStaff);
  res.json(staff.map(stripPassword));
});
app.put('/api/staff/:key', requireAuth, async (req, res) => {
  try {
    const staff = await ensureTableCache('Staff', defaultStaff);
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
    const updated = { ...staff[index], ...updateData, StaffKey: staff[index].StaffKey };
    await mutateTableRecord('Staff', 'update', 'StaffKey', updated.StaffKey, updated);
    res.json(updated);
  } catch (err) {
    console.error('Error in PUT /api/staff/:key:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});
app.get('/api/role-presets', requireAuth, async (_req, res) => {
  res.json(await ensureRolePresetsDB());
});
app.post('/api/role-presets', requireAdmin, async (req, res) => {
  try {
    const presets = await ensureRolePresetsDB();
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
      while (presets.some(item => item.id === presetId)) {
        presetId = `${slugifyRolePresetId(label)}-${suffix++}`;
      }
    }
    if (presets.some(item => item.id === presetId)) {
      res.status(409).json({ error: 'RolePresetID already exists' });
      return;
    }
    const record: RolePreset = {
      id: presetId,
      RolePresetLabel: label,
      RolePresetDescription: String(body.RolePresetDescription || '').trim(),
      Permissions: String(body.Permissions || 'home,workspace').trim(),
      SortOrder: body.SortOrder ?? presets.length + 1,
      IsSystem: false,
    };
    await mutateTableRecord('RolePreset', 'insert', 'id', record.id, record);
    res.status(201).json(record);
  } catch (err) {
    console.error('Error in POST /api/role-presets:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});
app.put('/api/role-presets/:key', requireAdmin, async (req, res) => {
  try {
    const presets = await ensureRolePresetsDB();
    const key = req.params.key;
    const index = presets.findIndex(item => item.id === key);
    if (index === -1) {
      res.status(404).json({ error: 'Role preset not found' });
      return;
    }
    const body = req.body || {};
    const updated: RolePreset = {
      ...presets[index],
      ...body,
      id: presets[index].id,
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
    await mutateTableRecord('RolePreset', 'update', 'id', updated.id, updated);
    res.json(updated);
  } catch (err) {
    console.error('Error in PUT /api/role-presets/:key:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});
app.delete('/api/role-presets/:key', requireAdmin, async (req, res) => {
  try {
    const presets = await ensureRolePresetsDB();
    const key = req.params.key;
    if (isSystemRolePresetId(key)) {
      res.status(403).json({ error: 'Cannot delete system role preset' });
      return;
    }
    const index = presets.findIndex(item => item.id === key);
    if (index === -1) {
      res.status(404).json({ error: 'Role preset not found' });
      return;
    }
    presets.splice(index, 1);
    memoryDb['RolePreset'] = presets;
    await supabase.from('RolePreset').delete().eq('RolePresetID', key);
    res.json({ success: true, RolePresetID: key });
  } catch (err) {
    console.error('Error in DELETE /api/role-presets/:key:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});
app.get('/api/patients', requireAuth, async (_req, res) => {
  res.json(await ensureTableCache('Patient', defaultPatients));
});
app.post('/api/patients', requireAuth, async (req, res) => {
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
  
  newPatient.id = newPatient.id || crypto.randomUUID();
  newPatient.PatientCreateTime = newPatient.PatientCreateTime || newTimestamp();
  
  await mutateTableRecord('Patient', 'insert', 'id', newPatient.id, newPatient);
  res.status(201).json(newPatient);
});
app.put('/api/patients/:key', requireAuth, async (req, res) => {
  const patients = await ensureTableCache('Patient', defaultPatients);
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
    String(p.id || '').trim().toLowerCase() === String(key || '').trim().toLowerCase() || 
    String(p.PatientID1 || '').trim().toLowerCase() === String(key || '').trim().toLowerCase()
  );
  if (index !== -1) {
    const updated = { ...patients[index], ...updateData };
    await mutateTableRecord('Patient', 'update', 'PatientKey', updated.PatientKey, updated);
    res.json(updated);
  } else {
    res.status(404).json({ error: 'Patient not found' });
  }
});
app.get('/api/consults', requireAuth, async (_req, res) => {
  res.json(await ensureTableCache('Consult', defaultConsults));
});
app.get('/api/operations', requireAuth, async (_req, res) => {
  res.json(await ensureTableCache('Operation', []));
});
app.get('/api/cmrs', requireAuth, async (_req, res) => {
  res.json(await ensureTableCache('CMR', defaultCmrs));
});
app.post('/api/cmrs', requireAuth, async (req, res) => {
  const cmrs = await ensureTableCache('CMR', defaultCmrs);
  const newCmr: CMR = applyDiagnosisNormalization(req.body, ['CMRDiagnosisID']);
  const requestedCmrKey = newCmr.CMRKey || newCmr.CMRkey;
  const cmrKeyExists = requestedCmrKey && cmrs.some(cmr => String(cmr.id || cmr.id || '') === String(requestedCmrKey));
  newCmr.CMRKey = requestedCmrKey && !cmrKeyExists ? requestedCmrKey : crypto.randomUUID();
  newCmr.UpdateTime = newCmr.UpdateTime || newTimestamp();
  
  await mutateTableRecord('CMR', 'insert', 'CMRKey', newCmr.CMRKey, newCmr);
  res.status(201).json(newCmr);
});
app.put('/api/cmrs/:key', requireAuth, async (req, res) => {
  try {
    const cmrs = await ensureTableCache('CMR', defaultCmrs);
    const key = req.params.key;
    const index = cmrs.findIndex(m =>
      String(m.CMRKey || '').trim().toLowerCase() === String(key || '').trim().toLowerCase() ||
      String(m.CMRkey || '').trim().toLowerCase() === String(key || '').trim().toLowerCase()
    );
    if (index !== -1) {
      const updated = applyDiagnosisNormalization(
        { ...cmrs[index], ...req.body, UpdateTime: newTimestamp() },
        ['CMRDiagnosisID']
      );
      updated.CMRKey = updated.CMRKey || updated.CMRkey || key;
      await mutateTableRecord('CMR', 'update', 'CMRKey', updated.CMRKey, updated);
      res.json(updated);
    } else {
      res.status(404).json({ error: 'CMR record not found' });
    }
  } catch (err) {
    console.error('Error in PUT /api/cmrs/:key:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});
app.get('/api/sources', requireAuth, async (_req, res) => {
  res.json(await ensureTableCache('Source', []));
});
app.get('/api/device-templates', requireAuth, async (_req, res) => {
  res.json(await ensureTableCache('DeviceTemplate', []));
});
app.post('/api/sources', requireAuth, async (req, res) => {
  const sources = await ensureTableCache('Source', []);
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
  await mutateTableRecord('Source', existingIndex >= 0 ? 'update' : 'insert', 'DiagnosisID', diagnosisID, sourceRecord);
  res.status(existingIndex >= 0 ? 200 : 201).json(sourceRecord);
});
app.post('/api/consults', requireAuth, async (req, res) => {
  const consults = await ensureTableCache('Consult', defaultConsults);
  const newConsult: Consult = applyDiagnosisNormalization(req.body, ['DiagnosisID']);
  
  const requestedConsultKey = newConsult.id;
  const consultKeyExists = requestedConsultKey && consults.some(c => String(c.id || '') === String(requestedConsultKey));
  newConsult.id = requestedConsultKey && !consultKeyExists ? requestedConsultKey : crypto.randomUUID();
  newConsult.ConsultCreateTime = newConsult.ConsultCreateTime || newTimestamp();
  
  await mutateTableRecord('Consult', 'insert', 'id', newConsult.id, newConsult);
  res.status(201).json(newConsult);
});
app.put('/api/consults/:key', requireAuth, async (req, res) => {
  const consults = await ensureTableCache('Consult', defaultConsults);
  const key = req.params.key;
  const updateData: Partial<Consult> = req.body;
  
  const index = consults.findIndex(c => c.id === key);
  if (index !== -1) {
    const previousConsult = { ...consults[index] };
    const updated = applyDiagnosisNormalization(
      { ...consults[index], ...updateData },
      ['DiagnosisID']
    );
    await mutateTableRecord('Consult', 'update', 'ConsultKey', updated.ConsultKey, updated);
    try {
      const staffList = await ensureTableCache('Staff', defaultStaff);
      const patients = await ensureTableCache('Patient', defaultPatients);
      await handleConsultWorkflowMutation(previousConsult, updated, updateData, staffList, patients);
    } catch (err) {
      console.error('Error evaluating consult workflow mutation:', err);
    }
    
    res.json(updated);
  } else {
    res.status(404).json({ error: 'Consult not found' });
  }
});
app.get('/api/cathlabs', requireAuth, async (_req, res) => {
  res.json(await ensureTableCache('CathLab', defaultCathlabs));
});
app.post('/api/cathlabs', requireAuth, async (req, res) => {
  const cathlabs = await ensureTableCache('CathLab', defaultCathlabs);
  const newCathLab: CathLab = applyDiagnosisNormalization(req.body, ['DiagnosisID', 'PostDiagnosisID']);
  
  const requestedCathKey = newCathLab.id;
  const cathKeyExists = requestedCathKey && cathlabs.some(cath => String(cath.id || '') === String(requestedCathKey));
  newCathLab.id = requestedCathKey && !cathKeyExists ? requestedCathKey : crypto.randomUUID();
  
  await mutateTableRecord('CathLab', 'insert', 'id', newCathLab.id, newCathLab);
  res.status(201).json(newCathLab);
});
app.put('/api/cathlabs/:key', requireAuth, async (req, res) => {
  const cathlabs = await ensureTableCache('CathLab', defaultCathlabs);
  const key = req.params.key;
  const index = cathlabs.findIndex(c => c.CathKey === key);
  if (index !== -1) {
    const updated = applyDiagnosisNormalization(
      { ...cathlabs[index], ...req.body },
      ['DiagnosisID', 'PostDiagnosisID']
    );
    await mutateTableRecord('CathLab', 'update', 'CathKey', updated.CathKey, updated);
    res.json(updated);
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
app.post('/api/reset', requireAdmin, (_req, res) => {
  memoryDb['Patient'] = [...defaultPatients];
  memoryDb['Consult'] = [...defaultConsults];
  memoryDb['Staff'] = [...defaultStaff];
  res.json({ message: "Database reset to defaults successfully in memory" });
});
const WORKFLOW_MONITOR_INTERVAL_MS = 60 * 60 * 1000;
setInterval(async () => {
  try {
    const result = await runWorkflowMonitor();
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