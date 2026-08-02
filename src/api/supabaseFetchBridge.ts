import { handleChdBriefRequest } from './chdBriefBridge';
import { getSupabase } from './supabaseClient';
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

const loadStaffOnly = async (forceRefresh = false): Promise<any[]> => {
  if (!forceRefresh && staffCache) return staffCache;
  if (pendingStaffLoad && !forceRefresh) return pendingStaffLoad;

  const promise = (async () => {
    try {
      const supabase = await getSupabase();
      const { data, error } = await supabase.from('Staff').select('*');
      if (error) throw error;
      const parsed = (data || []).map((item: any) => toFrontendRecord('staff', item));
      const finalStaff = parsed.length > 0 ? parsed : DEFAULT_STAFF;
      staffCache = finalStaff;
      await setPersistedData('staff_cache', staffCache);
      return finalStaff;
    } catch (e) {
      console.error('Lỗi tải danh sách Staff từ Supabase:', e);
      const cached = await getPersistedData('staff_cache');
      if (cached) {
        staffCache = cached;
        return cached;
      }
      return DEFAULT_STAFF;
    } finally {
      pendingStaffLoad = null;
    }
  })();
  pendingStaffLoad = promise;
  return promise;
};

const loadAllData = async (forceRefresh = false): Promise<SheetData> => {
  if (!forceRefresh && cache) return cache;
  if (pendingLoad && !forceRefresh) return pendingLoad;

  const promise = (async () => {
    try {
      const tables = [
        { name: 'Patient', key: 'patients' },
        { name: 'Consult', key: 'consults' },
        { name: 'Staff', key: 'staff' },
        { name: 'CathLab', key: 'cathlabs' },
        { name: 'Operation', key: 'operations' },
        { name: 'CMR', key: 'cmrs' },
        { name: 'Source', key: 'sources' },
        { name: 'DeviceTemplate', key: 'deviceTemplates' },
        { name: 'RolePreset', key: 'rolePresets' },
        { name: 'Notification', key: 'notifications' },
        { name: 'DoctorPerformanceMark', key: 'doctorPerformanceMarks' }
      ];
      
      const supabase = await getSupabase();
      const results = await Promise.all(
        tables.map(async t => {
          const { data, error } = await supabase.from(t.name).select('*');
          if (error) throw error;
          return { key: t.key, data: (data || []).map((item: any) => toFrontendRecord(t.key, item)) };
        })
      );
      
      const newData: Partial<SheetData> = {};
      results.forEach(r => {
        newData[r.key as keyof SheetData] = r.data;
      });
      
      const finalData = normalizeData(newData);
      if (!finalData.staff || finalData.staff.length === 0) {
        finalData.staff = DEFAULT_STAFF;
      }
      cache = finalData;
      if (finalData.staff && finalData.staff.length > 0) staffCache = finalData.staff;
      
      await setPersistedData('chd_bundle_cache', finalData);
      return finalData;
    } catch (e) {
      console.error('Lỗi tải toàn bộ dữ liệu từ Supabase:', e);
      const cached = await getPersistedData('chd_bundle_cache');
      if (cached) {
        cache = cached;
        if (cached.staff && cached.staff.length > 0) staffCache = cached.staff;
        return cached;
      }
      return EMPTY_DATA;
    } finally {
      pendingLoad = null;
    }
  })();
  pendingLoad = promise;
  return promise;
};

const isUUID = (str: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(str);

const upsertRecord = async (endpoint: string, key: string | undefined, method: 'POST'|'PUT'|'PATCH', init: RequestInit) => {
  const config = endpointMap[endpoint];
  if (!config) return jsonResponse({ error: `Unsupported API endpoint: ${endpoint}` }, { status: 404 });
  
  if (!isLocalHost()) {
    const authErr = requireAuthBridge(init);
    if (authErr) return authErr;
  }
  
  try {
    const body = await parseBody(init);
    
    // Fix non-UUID ids for new records created by frontend (e.g., pat_12345)
    if (body.id && !isUUID(body.id)) {
      body.id = crypto.randomUUID();
    } else if (!body.id) {
      body.id = crypto.randomUUID();
    }
    
    const dbRecord = toSupabaseRecord(endpoint, body);
    
    // Convert undefined to null for Supabase if needed, but upsert usually handles it
    const supabase = await getSupabase();
    const { data, error } = await supabase.from(config.table).upsert(dbRecord).select().single();
    if (error) throw error;
    
    // update cache
    if (cache) {
      const arr = (cache[config.collection] as any[]);
      const idx = arr.findIndex(item => item[config.keyField] === data[config.keyField]);
      if (idx > -1) {
        arr[idx] = toFrontendRecord(endpoint, data);
      } else {
        arr.push(toFrontendRecord(endpoint, data));
      }
      await setPersistedData('chd_bundle_cache', cache);
    }
    
    if (endpoint === 'staff') staffCache = null; // force reload staff
    
    return jsonResponse(toFrontendRecord(endpoint, data));
  } catch (e: any) {
    console.error(`Error saving ${endpoint}:`, e);
    return jsonResponse({ error: e.message || 'Lỗi khi lưu dữ liệu' }, { status: 500 });
  }
};

const deleteRecord = async (endpoint: string, key: string, init: RequestInit) => {
  const config = endpointMap[endpoint];
  if (!config) return jsonResponse({ error: `Unsupported API endpoint: ${endpoint}` }, { status: 404 });
  
  if (!isLocalHost()) {
    const authErr = requireAuthBridge(init);
    if (authErr) return authErr;
  }

  try {
    const supabase = await getSupabase();
    const { error } = await supabase.from(config.table).delete().eq(config.keyField, key);
    if (error) throw error;

    if (cache) {
      const arr = (cache[config.collection] as any[]);
      const idx = arr.findIndex(item => item[config.keyField] === key);
      if (idx > -1) {
        arr.splice(idx, 1);
      }
      await setPersistedData('chd_bundle_cache', cache);
    }
    
    if (endpoint === 'staff') staffCache = null;

    return jsonResponse({ success: true, id: key });
  } catch (e: any) {
    console.error(`Error deleting ${endpoint}:`, e);
    return jsonResponse({ error: e.message || 'Lỗi khi xóa dữ liệu' }, { status: 500 });
  }
}

const handleApiRequest = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response | null> => {
  let urlObj: URL;
  if (typeof input === 'string') {
    if (input.startsWith('/')) {
      urlObj = new URL(input, window.location.origin);
    } else {
      urlObj = new URL(input);
    }
  } else if (input instanceof Request) {
    urlObj = new URL(input.url);
  } else {
    urlObj = input as URL;
  }

  if (!urlObj.pathname.startsWith('/api/')) {
    return null; 
  }

  const path = urlObj.pathname.replace('/api/', '');
  const parts = path.split('/').filter(Boolean);
  if (parts.length === 0) return null;

  const endpoint = parts[0];
  const key = parts[1];
  const method = init?.method || 'GET';

  if (endpoint === 'auth') {
    if (path === 'auth/login' && method === 'POST') {
      try {
        const body = await parseBody(init);
        const { username, password } = body;
        console.log('[DEBUG LOGIN] Attempting login for username:', username);
        const staffList = await loadStaffOnly();
        console.log('[DEBUG LOGIN] Staff list count:', staffList.length);
        const user = staffList.find(s => s.StaffName === username || s.id === username);
        if (!user) {
          console.log('[DEBUG LOGIN] User not found in staffList!');
          return jsonResponse({ error: 'Sai tên đăng nhập hoặc mật khẩu' }, { status: 401 });
        }
        console.log('[DEBUG LOGIN] User found:', user.StaffName, 'StaffKey:', user.StaffKey);
        const expectedPassword = String(user.Password || '1111').trim();
        const inputPassword = String(password).trim();
        
        let hashedInput = '';
        try {
          hashedInput = await bridgeHashPassword(inputPassword, String(user.StaffKey || user.id));
        } catch (hashErr) {
          console.log('[DEBUG LOGIN] bridgeHashPassword error:', hashErr);
        }

        console.log('[DEBUG LOGIN] inputPassword:', inputPassword);
        console.log('[DEBUG LOGIN] expectedPassword:', expectedPassword);
        console.log('[DEBUG LOGIN] hashedInput:', hashedInput);

        if (inputPassword !== expectedPassword && hashedInput !== expectedPassword) {
          console.log('[DEBUG LOGIN] Password mismatch!');
          return jsonResponse({ error: 'Sai tên đăng nhập hoặc mật khẩu' }, { status: 401 });
        }
        console.log('[DEBUG LOGIN] Login success for:', user.StaffName);
        const token = bridgeCreateSession(user.id);
        const safeUser = stripBridgePassword(user);
        return jsonResponse({ staff: safeUser, token });
      } catch (e) {
        return jsonResponse({ error: 'Lỗi server khi đăng nhập' }, { status: 500 });
      }
    }
    if (path === 'auth/me' && method === 'GET') {
      const authErr = requireAuthBridge(init);
      if (authErr) return authErr;
      const token = extractBridgeToken(init);
      if (!token) return jsonResponse({ error: 'Unauthorized' }, { status: 401 });
      const staffKey = bridgeResolveSession(token);
      if (!staffKey) return jsonResponse({ error: 'Unauthorized' }, { status: 401 });
      const staffList = await loadStaffOnly();
      const user = staffList.find(s => s.id === staffKey);
      if (!user) return jsonResponse({ error: 'User not found' }, { status: 404 });
      return jsonResponse(stripBridgePassword(user));
    }
    if (path === 'auth/logout' && method === 'POST') {
      const token = extractBridgeToken(init);
      if (token) bridgeRevokeToken(token);
      return jsonResponse({ success: true });
    }
    return jsonResponse({ error: 'Invalid auth endpoint' }, { status: 404 });
  }

  if (endpoint === 'all') {
    const authErr = requireAuthBridge(init);
    if (authErr) return authErr;
    const force = urlObj.searchParams.get('force') === 'true' || urlObj.searchParams.get('refresh') === 'true';
    const allData = await loadAllData(force);
    return jsonResponse(allData);
  }

  if (endpoint === 'chd-brief') {
    const nativeFetch = (window as any).__CHD_NATIVE_FETCH__ as typeof fetch | undefined;
    return handleChdBriefRequest(parts, method, init, nativeFetch || fetch);
  }

  if (endpoint === 'workflow-monitor') {
    return null;
  }

  if (endpoint === 'staff' && method === 'GET') {
    const force = urlObj.searchParams.get('force') === 'true' || urlObj.searchParams.get('refresh') === 'true';
    const staffData = await loadStaffOnly(force);
    return jsonResponse(staffData.map(stripBridgePassword));
  }

  const config = endpointMap[endpoint];
  if (!config) return null; // Allow unhandled endpoints to fall through to native fetch (e.g., server.ts)

  if (!isLocalHost()) {
    const authErr = requireAuthBridge(init);
    if (authErr) return authErr;
  }

  if (method === 'GET') {
    const force = urlObj.searchParams.get('force') === 'true' || urlObj.searchParams.get('refresh') === 'true';
    const allData = await loadAllData(force);
    return jsonResponse(allData[config.collection]);
  }

  if (method === 'POST' || method === 'PUT' || method === 'PATCH') {
    return upsertRecord(endpoint, key, method, init);
  }
  
  if (method === 'DELETE' && key) {
    return deleteRecord(endpoint, key, init);
  }

  return jsonResponse({ error: `Unsupported method: ${method}` }, { status: 405 });
};

export const clearLocalCache = async (): Promise<void> => {
  cache = null;
  staffCache = null;
  pendingLoad = null;
  pendingStaffLoad = null;
  await clearPersistedData();
};

export const installSupabaseFetchBridge = () => {
  if (typeof window === 'undefined') return;
  if ((window as any).__CHD_SUPABASE_FETCH_BRIDGE__) return;
  (window as any).__CHD_SUPABASE_FETCH_BRIDGE__ = true;

  const nativeFetch = window.fetch.bind(window);
  (window as any).__CHD_NATIVE_FETCH__ = nativeFetch;
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const handled = await handleApiRequest(input, init);
    if (handled) return handled;
    return nativeFetch(input, init);
  };
};
