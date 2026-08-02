const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, '../src/api/supabaseFetchBridge.ts');
let content = fs.readFileSync(file, 'utf8');

const loadStaffIdx = content.lastIndexOf('const loadStaffOnly = async');
const oldTop = content.substring(0, loadStaffIdx);
const restOfFile = content.substring(loadStaffIdx);

const newTop = `import { handleChdBriefRequest } from './chdBriefBridge';
import { supabase } from './supabaseClient';
import type { Staff } from '../types';

type SheetData = {
  patients: any[];
  consults: any[];
  staff: any[];
  cathlabs: any[];
  operations: any[];
  cmrs: any[];
  sources: any[];
  deviceTemplates: any[];
  rolePresets: any[];
  notifications: any[];
  doctorPerformanceMarks: any[];
};

type SheetType = 'Patient' | 'Consult' | 'Staff' | 'CathLab' | 'Operation' | 'CMR' | 'Source' | 'DeviceTemplate' | 'RolePreset' | 'Notification' | 'DoctorPerformanceMark';

const DEFAULT_STAFF: any[] = [
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
  }
];

const EMPTY_DATA: SheetData = {
  patients: [],
  consults: [],
  staff: DEFAULT_STAFF,
  cathlabs: [],
  operations: [],
  cmrs: [],
  sources: [],
  deviceTemplates: [],
  rolePresets: [],
  notifications: [],
  doctorPerformanceMarks: []
};

const endpointMap: Record<string, { type: SheetType; collection: keyof SheetData; keyField: string; prefix: string; table: string }> = {
  patients: { type: 'Patient', collection: 'patients', keyField: 'id', prefix: 'pat', table: 'Patient' },
  consults: { type: 'Consult', collection: 'consults', keyField: 'id', prefix: 'con', table: 'Consult' },
  staff: { type: 'Staff', collection: 'staff', keyField: 'id', prefix: 'staff', table: 'Staff' },
  cathlabs: { type: 'CathLab', collection: 'cathlabs', keyField: 'id', prefix: 'cath', table: 'CathLab' },
  operations: { type: 'Operation', collection: 'operations', keyField: 'id', prefix: 'surg', table: 'Operation' },
  cmrs: { type: 'CMR', collection: 'cmrs', keyField: 'id', prefix: 'cmr', table: 'CMR' },
  sources: { type: 'Source', collection: 'sources', keyField: 'DiagnosisID', prefix: 'source', table: 'Source' },
  'device-templates': { type: 'DeviceTemplate', collection: 'deviceTemplates', keyField: 'DeviceName', prefix: 'device', table: 'DeviceTemplate' },
  'role-presets': { type: 'RolePreset', collection: 'rolePresets', keyField: 'id', prefix: 'preset', table: 'RolePreset' },
  notifications: { type: 'Notification', collection: 'notifications', keyField: 'id', prefix: 'notif', table: 'Notification' },
  'doctor-performance-marks': { type: 'DoctorPerformanceMark', collection: 'doctorPerformanceMarks', keyField: 'id', prefix: 'mark', table: 'DoctorPerformanceMark' }
};

let cache: SheetData | null = null;
let pendingLoad: Promise<SheetData> | null = null;
let staffCache: any[] | null = null;
let pendingStaffLoad: Promise<any[]> | null = null;

// IndexedDB Helper Wrapper
const DB_NAME = 'chd_database_v5';
const STORE_NAME = 'cache_store';

const getDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is not supported'));
      return;
    }
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
};

const getPersistedData = async (key: string): Promise<any | null> => {
  try {
    const db = await getDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(key);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  } catch (err) {
    console.warn('Failed to read from IndexedDB:', err);
    return null;
  }
};

const setPersistedData = async (key: string, val: any): Promise<void> => {
  try {
    const db = await getDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.put(val, key);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } catch (err) {
    console.warn('Failed to write to IndexedDB:', err);
  }
};

const clearPersistedData = async (): Promise<void> => {
  try {
    const db = await getDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.clear();
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } catch (err) {
    console.warn('Failed to clear IndexedDB:', err);
  }
};

const isLocalHost = () => ['localhost', '127.0.0.1', '0.0.0.0'].includes(window.location.hostname);

const jsonResponse = (body: unknown, init?: ResponseInit) =>
  new Response(JSON.stringify(body), {
    status: init?.status || 200,
    statusText: init?.statusText,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers || {})
    }
  });

const textResponse = (body: string, init?: ResponseInit) =>
  new Response(body, {
    status: init?.status || 200,
    statusText: init?.statusText,
    headers: {
      'Content-Type': 'text/plain',
      ...(init?.headers || {})
    }
  });

const parseBody = async (init?: RequestInit): Promise<any> => {
  if (!init?.body) return {};
  if (typeof init.body === 'string') return JSON.parse(init.body || '{}');
  return JSON.parse(String(init.body));
};

function parseTextArray(val: any): string[] {
  if (Array.isArray(val)) return val;
  if (!val) return [];
  if (typeof val === 'string') {
    try {
      const parsed = JSON.parse(val);
      if (Array.isArray(parsed)) return parsed;
    } catch {
      return val.split(',').map(s => s.trim()).filter(Boolean);
    }
  }
  return [String(val)];
}

function stringifyTextArray(val: any): string {
  if (!val) return '';
  if (typeof val === 'string') return val;
  if (Array.isArray(val)) return JSON.stringify(val);
  return String(val);
}

function toFrontendRecord(endpoint: string, record: any): any {
  if (!record) return record;
  const res = { ...record };

  if (endpoint === 'consults') {
    if (res.ConsultMember !== undefined) res.ConsultMember = parseTextArray(res.ConsultMember);
  } else if (endpoint === 'cathlabs') {
    if (res.CathMethod !== undefined) res.CathMethod = parseTextArray(res.CathMethod);
  }

  return res;
}

function toSupabaseRecord(endpoint: string, record: any): any {
  if (!record) return record;
  const res = { ...record };

  if (endpoint === 'consults') {
    if (res.ConsultMember !== undefined) res.ConsultMember = stringifyTextArray(res.ConsultMember);
  } else if (endpoint === 'cathlabs') {
    if (res.CathMethod !== undefined) res.CathMethod = stringifyTextArray(res.CathMethod);
  }

  return res;
}

const BRIDGE_SESSION_TTL_MS = 8 * 60 * 60 * 1000; // 8 hours
const bridgeTokenStore = new Map<string, { staffKey: string; expiresAt: number }>();

function bridgeGenerateToken(): string {
  const arr = new Uint8Array(32);
  crypto.getRandomValues(arr);
  return Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('');
}

function bridgeCreateSession(staffKey: string): string {
  const token = bridgeGenerateToken();
  bridgeTokenStore.set(token, { staffKey, expiresAt: Date.now() + BRIDGE_SESSION_TTL_MS });
  return token;
}

function bridgeResolveSession(token: string): string | null {
  const session = bridgeTokenStore.get(token);
  if (!session) return null;
  if (Date.now() >= session.expiresAt) {
    bridgeTokenStore.delete(token);
    return null;
  }
  session.expiresAt = Date.now() + BRIDGE_SESSION_TTL_MS;
  return session.staffKey;
}

function bridgeRevokeToken(token: string): void {
  bridgeTokenStore.delete(token);
}

async function bridgeHashPassword(password: string, salt: string): Promise<string> {
  const msgUint8 = new TextEncoder().encode(password + ':' + salt);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

function extractBridgeToken(init?: RequestInit): string | null {
  const headers = init?.headers as Record<string, string> | undefined;
  if (!headers) return localStorage.getItem('CHD_AUTH_TOKEN');
  const auth = headers['Authorization'] || headers['authorization'] || '';
  if (auth.startsWith('Bearer ')) return auth.slice(7).trim();
  const xToken = headers['x-auth-token'] || headers['X-Auth-Token'] || '';
  if (xToken.trim()) return xToken.trim();
  return localStorage.getItem('CHD_AUTH_TOKEN');
}

function requireAuthBridge(init?: RequestInit): Response | null {
  const token = extractBridgeToken(init);
  if (!token) {
    return jsonResponse({ error: 'Yêu cầu đăng nhập để truy cập tài nguyên này.' }, { status: 401 });
  }
  const staffKey = bridgeResolveSession(token);
  if (!staffKey) {
    return jsonResponse({ error: 'Phiên đăng nhập đã hết hạn hoặc không hợp lệ. Vui lòng đăng nhập lại.' }, { status: 401 });
  }
  return null; 
}

function stripBridgePassword<T extends Record<string, any>>(staff: T): Omit<T, 'Password'> {
  const { Password, ...safe } = staff as any;
  return safe;
}

function sanitizeDataBundle(data: SheetData): SheetData {
  return {
    ...data,
    staff: Array.isArray(data.staff) ? data.staff.map(stripBridgePassword) : []
  };
}

const normalizeData = (data: Partial<SheetData>): SheetData => ({
  ...EMPTY_DATA,
  ...data,
  patients: Array.isArray(data.patients) ? data.patients : [],
  consults: Array.isArray(data.consults) ? data.consults : [],
  staff: Array.isArray(data.staff) ? data.staff : [],
  cathlabs: Array.isArray(data.cathlabs) ? data.cathlabs : [],
  operations: Array.isArray(data.operations) ? data.operations : [],
  cmrs: Array.isArray(data.cmrs) ? data.cmrs : [],
  sources: Array.isArray(data.sources) ? data.sources : [],
  deviceTemplates: Array.isArray(data.deviceTemplates) ? data.deviceTemplates : [],
  rolePresets: Array.isArray(data.rolePresets) ? data.rolePresets : [],
  notifications: Array.isArray(data.notifications) ? data.notifications : [],
  doctorPerformanceMarks: Array.isArray(data.doctorPerformanceMarks) ? data.doctorPerformanceMarks : []
});

`;

fs.writeFileSync(file, newTop + restOfFile, 'utf8');
console.log('Completely rebuilt top of supabaseFetchBridge.ts');
