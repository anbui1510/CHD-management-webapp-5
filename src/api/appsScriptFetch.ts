import { handleChdBriefRequest } from './chdBriefBridge';
import { buildWebPushPayload } from '../push/pushPayload';
import { getAppVersionPayload } from '../appVersion';
import { BUNDLED_STAFF, mergeStaffWithBundledPasswords } from '../data/bundledStaff';
import type { Staff, Source, Consult, Patient, Notification } from '../types';
import {
  fetchAppsScriptWithRetry,
  formatAppsScriptFetchError,
  formatAppsScriptHttpError
} from '../utils/appsScriptRetry';
import { sanitizeNotificationFields } from '../utils/workflowMessages';

type SheetData = {
  patients: any[];
  consults: any[];
  staff: any[];
  cathlabs: any[];
  operations: any[];
  cmrs: any[];
  transplants: any[];
  sources: any[];
  deviceTemplates: any[];
  rolePresets: any[];
  notifications: any[];
  doctorPerformanceMarks: any[];
};

type SheetType = 'Patient' | 'Consult' | 'Staff' | 'CathLab' | 'Operation' | 'CMR' | 'Transplant' | 'Source' | 'DeviceTemplate' | 'RolePreset' | 'Notification' | 'DoctorPerformanceMark';

const SCRIPT_URL_STORAGE_KEY = 'chd_apps_script_url';
const SCRIPT_SECRET_STORAGE_KEY = 'chd_apps_script_secret';

const isLikelyMobileDevice = (): boolean => {
  if (typeof navigator === 'undefined' || typeof window === 'undefined') return false;
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
    || (navigator.maxTouchPoints > 1 && window.innerWidth < 1024);
};

const getAppsScriptFetchTimeout = (force: boolean): number => {
  const desktopTimeout = force ? 60000 : 20000;
  if (!isLikelyMobileDevice()) return desktopTimeout;
  return force ? 90000 : 45000;
};

const fetchWithTimeout = async (url: string, init?: RequestInit, timeout = 60000): Promise<Response> => {
  const nativeFetch = (typeof window !== 'undefined' && (window as any).__CHD_NATIVE_FETCH__) || fetch;
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await nativeFetch(url, {
      ...init,
      signal: controller.signal
    });
    clearTimeout(id);
    return response;
  } catch (error) {
    clearTimeout(id);
    throw error;
  }
};

const getScriptSecret = () =>
  localStorage.getItem(SCRIPT_SECRET_STORAGE_KEY) ||
  String(viteEnv.VITE_GOOGLE_SCRIPT_SECRET || viteEnv.VITE_GOOGLE_SCRIPT_API_KEY || '').trim();

const clearMemoryCache = (): void => {
  cache = null;
  pendingLoad = null;
  pendingLoadIsForce = false;
  staffCache = null;
  pendingStaffLoad = null;
};

const setScriptSecret = (secret: string): boolean => {
  const trimmed = secret.trim();
  const previous = getScriptSecret();
  if (trimmed === previous) return false;

  if (trimmed) {
    localStorage.setItem(SCRIPT_SECRET_STORAGE_KEY, trimmed);
  } else {
    localStorage.removeItem(SCRIPT_SECRET_STORAGE_KEY);
  }
  clearMemoryCache();
  return true;
};
const viteEnv = (import.meta as any).env || {};

const EMPTY_DATA: SheetData = {
  patients: [],
  consults: [],
  staff: BUNDLED_STAFF,
  cathlabs: [],
  operations: [],
  cmrs: [],
  transplants: [],
  sources: [],
  deviceTemplates: [],
  rolePresets: [],
  notifications: [],
  doctorPerformanceMarks: []
};

const endpointMap: Record<string, { type: SheetType; collection: keyof SheetData; keyField: string; prefix: string }> = {
  patients: { type: 'Patient', collection: 'patients', keyField: 'PatientKey', prefix: 'pat' },
  consults: { type: 'Consult', collection: 'consults', keyField: 'ConsultKey', prefix: 'con' },
  staff: { type: 'Staff', collection: 'staff', keyField: 'StaffKey', prefix: 'staff' },
  cathlabs: { type: 'CathLab', collection: 'cathlabs', keyField: 'CathKey', prefix: 'cath' },
  operations: { type: 'Operation', collection: 'operations', keyField: 'SurgKey', prefix: 'surg' },
  cmrs: { type: 'CMR', collection: 'cmrs', keyField: 'CMRKey', prefix: 'cmr' },
  transplants: { type: 'Transplant', collection: 'transplants', keyField: 'TransKey', prefix: 'trans' },
  sources: { type: 'Source', collection: 'sources', keyField: 'DiagnosisID', prefix: 'source' },
  'device-templates': { type: 'DeviceTemplate', collection: 'deviceTemplates', keyField: 'DeviceName', prefix: 'device' },
  'role-presets': { type: 'RolePreset', collection: 'rolePresets', keyField: 'RolePresetID', prefix: 'preset' },
  notifications: { type: 'Notification', collection: 'notifications', keyField: 'NotificationKey', prefix: 'notif' },
  'doctor-performance-marks': { type: 'DoctorPerformanceMark', collection: 'doctorPerformanceMarks', keyField: 'MarkKey', prefix: 'mark' }
};

let cache: SheetData | null = null;
let pendingLoad: Promise<SheetData> | null = null;
let pendingLoadIsForce = false;
let staffCache: any[] | null = null;
let pendingStaffLoad: Promise<any[]> | null = null;

// ─────────────────────────────────────────────────────────────────
// BRIDGE AUTH LAYER
// Client-side token system for Cloudflare / static deployments
// Mirrors the auth system in server.ts but runs in-browser memory.
// Tokens are valid for 8 hours and slide on activity.
// ─────────────────────────────────────────────────────────────────

const BRIDGE_SESSION_TTL_MS = 8 * 60 * 60 * 1000; // 8 hours
const BRIDGE_SESSION_STORAGE_KEY = 'chd_bridge_sessions_v1';
const CHD_AUTH_STAFF_KEY = 'CHD_AUTH_STAFF_KEY';

const bridgeTokenStore = new Map<string, { staffKey: string; expiresAt: number }>();

const readBridgeSessionEntries = (): Record<string, { staffKey: string; expiresAt: number }> => {
  try {
    const raw = localStorage.getItem(BRIDGE_SESSION_STORAGE_KEY);
    if (raw) return JSON.parse(raw) as Record<string, { staffKey: string; expiresAt: number }>;
  } catch {
    // ignore corrupt storage
  }

  // Migrate legacy sessionStorage entries (cleared often on iOS PWA reopen)
  try {
    const legacyRaw = sessionStorage.getItem(BRIDGE_SESSION_STORAGE_KEY);
    if (!legacyRaw) return {};
    const legacyEntries = JSON.parse(legacyRaw) as Record<string, { staffKey: string; expiresAt: number }>;
    localStorage.setItem(BRIDGE_SESSION_STORAGE_KEY, legacyRaw);
    sessionStorage.removeItem(BRIDGE_SESSION_STORAGE_KEY);
    return legacyEntries;
  } catch {
    return {};
  }
};

const writeBridgeSessionEntries = (entries: Record<string, { staffKey: string; expiresAt: number }>): void => {
  try {
    localStorage.setItem(BRIDGE_SESSION_STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // ignore quota / private mode errors
  }
};

function hydrateBridgeSessions(): void {
  try {
    const entries = readBridgeSessionEntries();
    const now = Date.now();
    const kept: Record<string, { staffKey: string; expiresAt: number }> = {};
    for (const [token, session] of Object.entries(entries)) {
      if (now < session.expiresAt) {
        bridgeTokenStore.set(token, session);
        kept[token] = session;
      }
    }
    writeBridgeSessionEntries(kept);

    const storedToken = localStorage.getItem('CHD_AUTH_TOKEN');
    const storedStaffKey = localStorage.getItem(CHD_AUTH_STAFF_KEY);
    if (storedToken && storedStaffKey && !bridgeTokenStore.has(storedToken)) {
      const restored = { staffKey: storedStaffKey, expiresAt: Date.now() + BRIDGE_SESSION_TTL_MS };
      bridgeTokenStore.set(storedToken, restored);
      kept[storedToken] = restored;
      writeBridgeSessionEntries(kept);
    }
  } catch {
    // ignore corrupt session storage
  }
}

function persistBridgeSession(token: string, session: { staffKey: string; expiresAt: number }): void {
  try {
    const entries = readBridgeSessionEntries();
    entries[token] = session;
    writeBridgeSessionEntries(entries);
  } catch {
    // ignore quota / private mode errors
  }
}

function removeBridgeSession(token: string): void {
  bridgeTokenStore.delete(token);
  try {
    const entries = readBridgeSessionEntries();
    delete entries[token];
    writeBridgeSessionEntries(entries);
    if (localStorage.getItem('CHD_AUTH_TOKEN') === token) {
      localStorage.removeItem(CHD_AUTH_STAFF_KEY);
    }
  } catch {
    // ignore
  }
}

function bridgeGenerateToken(): string {
  const arr = new Uint8Array(32);
  crypto.getRandomValues(arr);
  return Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('');
}

function bridgeCreateSession(staffKey: string): string {
  const token = bridgeGenerateToken();
  const session = { staffKey, expiresAt: Date.now() + BRIDGE_SESSION_TTL_MS };
  bridgeTokenStore.set(token, session);
  persistBridgeSession(token, session);
  try {
    localStorage.setItem(CHD_AUTH_STAFF_KEY, staffKey);
  } catch {
    // ignore quota errors
  }
  return token;
}

function bridgeResolveSession(token: string): string | null {
  let session = bridgeTokenStore.get(token);
  if (!session) {
    const storedToken = localStorage.getItem('CHD_AUTH_TOKEN');
    const storedStaffKey = localStorage.getItem(CHD_AUTH_STAFF_KEY);
    if (storedToken === token && storedStaffKey) {
      session = { staffKey: storedStaffKey, expiresAt: Date.now() + BRIDGE_SESSION_TTL_MS };
      bridgeTokenStore.set(token, session);
      persistBridgeSession(token, session);
    } else {
      return null;
    }
  }
  if (Date.now() >= session.expiresAt) {
    removeBridgeSession(token);
    return null;
  }
  // Slide expiry on activity
  session.expiresAt = Date.now() + BRIDGE_SESSION_TTL_MS;
  persistBridgeSession(token, session);
  return session.staffKey;
}

function bridgeRevokeToken(token: string): void {
  removeBridgeSession(token);
}

async function bridgeHashPassword(password: string, salt: string): Promise<string> {
  const msgUint8 = new TextEncoder().encode(password + ':' + salt);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/** Extract Bearer token from request init headers */
function extractBridgeToken(init?: RequestInit): string | null {
  const rawHeaders = init?.headers;
  if (!rawHeaders) return localStorage.getItem('CHD_AUTH_TOKEN');

  let auth = '';
  let xToken = '';

  if (typeof Headers !== 'undefined' && rawHeaders instanceof Headers) {
    auth = rawHeaders.get('Authorization') || rawHeaders.get('authorization') || '';
    xToken = rawHeaders.get('x-auth-token') || rawHeaders.get('X-Auth-Token') || '';
  } else if (Array.isArray(rawHeaders)) {
    for (const [key, value] of rawHeaders) {
      const lowerKey = key.toLowerCase();
      if (lowerKey === 'authorization') auth = value;
      if (lowerKey === 'x-auth-token') xToken = value;
    }
  } else if (typeof rawHeaders === 'object') {
    const record = rawHeaders as Record<string, string>;
    auth = record['Authorization'] || record['authorization'] || '';
    xToken = record['x-auth-token'] || record['X-Auth-Token'] || '';
  }

  if (auth.startsWith('Bearer ')) return auth.slice(7).trim();
  if (xToken.trim()) return xToken.trim();
  return localStorage.getItem('CHD_AUTH_TOKEN');
}

/** Returns 401 response if no valid session. Returns null if session is valid. */
function requireAuthBridge(init?: RequestInit): Response | null {
  const token = extractBridgeToken(init);
  if (!token) {
    return jsonResponse({ error: 'Yêu cầu đăng nhập để truy cập tài nguyên này.' }, { status: 401 });
  }
  const staffKey = bridgeResolveSession(token);
  if (!staffKey) {
    return jsonResponse({ error: 'Phiên đăng nhập đã hết hạn hoặc không hợp lệ. Vui lòng đăng nhập lại.' }, { status: 401 });
  }
  return null; // valid
}

/** Strip Password field from a staff record */
function stripBridgePassword<T extends Record<string, any>>(staff: T): Omit<T, 'Password'> {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { Password, ...safe } = staff as any;
  return safe;
}

/** Strip passwords from a full data bundle, return safe copy */
function sanitizeDataBundle(data: SheetData): SheetData {
  return {
    ...data,
    staff: Array.isArray(data.staff) ? data.staff.map(stripBridgePassword) : []
  };
}

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

const getScriptUrl = () =>
  localStorage.getItem(SCRIPT_URL_STORAGE_KEY) ||
  String(viteEnv.VITE_GOOGLE_SCRIPT_URL || '').trim();

const isLocalHost = () => ['localhost', '127.0.0.1', '0.0.0.0'].includes(window.location.hostname);

/** Client-side Sheets pull health (used when Express /api/sync/status is unavailable on Cloudflare). */
let clientSheetsPullState = {
  lastPullAt: 0,
  lastPullOk: true,
  lastPullMessage: '',
  lastPushAt: 0,
  lastPushOk: true,
  lastPushMessage: ''
};

const markClientPullOk = (message = 'Đã kéo dữ liệu mới từ Google Sheets.') => {
  clientSheetsPullState = {
    ...clientSheetsPullState,
    lastPullAt: Date.now(),
    lastPullOk: true,
    lastPullMessage: message
  };
};

const markClientPullFailed = (error: unknown) => {
  const message = formatAppsScriptFetchError(error);
  clientSheetsPullState = {
    ...clientSheetsPullState,
    lastPullAt: Date.now(),
    lastPullOk: false,
    lastPullMessage: message
  };
};

let backgroundPullRetryTimer: ReturnType<typeof setTimeout> | null = null;
let backgroundPullRetryAttempt = 0;

export const getClientSheetsSyncStatus = () => ({
  configured: !!getScriptUrl(),
  lastPullAt: clientSheetsPullState.lastPullAt,
  lastPullOk: clientSheetsPullState.lastPullOk,
  lastPullMessage: clientSheetsPullState.lastPullMessage,
  lastPushAt: clientSheetsPullState.lastPushAt,
  lastPushOk: clientSheetsPullState.lastPushOk,
  lastPushMessage: clientSheetsPullState.lastPushMessage
});

const setScriptUrl = (scriptUrl: string): boolean => {
  const trimmed = scriptUrl.trim();
  const previous = getScriptUrl();
  if (trimmed === previous) {
    if (trimmed && !localStorage.getItem(SCRIPT_URL_STORAGE_KEY)) {
      localStorage.setItem(SCRIPT_URL_STORAGE_KEY, trimmed);
    }
    return false;
  }

  if (trimmed) {
    localStorage.setItem(SCRIPT_URL_STORAGE_KEY, trimmed);
  } else {
    localStorage.removeItem(SCRIPT_URL_STORAGE_KEY);
  }
  clearMemoryCache();
  void clearPersistedData();
  return true;
};

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

const normalizeData = (data: Partial<SheetData>): SheetData => ({
  ...EMPTY_DATA,
  ...data,
  patients: Array.isArray(data.patients) ? data.patients : [],
  consults: Array.isArray(data.consults) ? data.consults : [],
  staff: Array.isArray(data.staff) && data.staff.length > 0 ? data.staff : BUNDLED_STAFF,
  cathlabs: Array.isArray(data.cathlabs) ? data.cathlabs : [],
  operations: Array.isArray(data.operations) ? data.operations : [],
  cmrs: Array.isArray(data.cmrs) ? data.cmrs : [],
  transplants: Array.isArray(data.transplants) ? data.transplants : [],
  sources: Array.isArray(data.sources) ? data.sources : [],
  deviceTemplates: Array.isArray(data.deviceTemplates) ? data.deviceTemplates : [],
  rolePresets: Array.isArray(data.rolePresets) ? data.rolePresets : [],
  notifications: Array.isArray(data.notifications) ? data.notifications : [],
  doctorPerformanceMarks: Array.isArray(data.doctorPerformanceMarks) ? data.doctorPerformanceMarks : []
});

const resolveOfflineStaffList = (): Staff[] => {
  staffCache = BUNDLED_STAFF;
  return staffCache;
};

const refreshStaffInBackground = (): void => {
  if (!getScriptUrl() || pendingStaffLoad) return;
  void loadStaffOnly(true).catch(err => {
    console.warn('Background staff sync failed:', err);
  });
};

const loadStaffOnly = async (force = false): Promise<Staff[]> => {
  const scriptUrl = getScriptUrl();

  if (!force) {
    if (staffCache?.length) {
      refreshStaffInBackground();
      return staffCache;
    }
    if (cache?.staff?.length) {
      staffCache = mergeStaffWithBundledPasswords(cache.staff);
      refreshStaffInBackground();
      return staffCache;
    }
    if (pendingStaffLoad) return pendingStaffLoad;

    const cachedStaff = await getPersistedData('staff_data');
    if (cachedStaff && Array.isArray(cachedStaff) && cachedStaff.length > 0 && cachedStaff[0].Role !== undefined) {
      staffCache = mergeStaffWithBundledPasswords(cachedStaff);
      refreshStaffInBackground();
      return staffCache;
    }

    if (!scriptUrl) {
      return resolveOfflineStaffList();
    }
  }

  if (!scriptUrl) {
    return resolveOfflineStaffList();
  }

  if (pendingStaffLoad && !force) return pendingStaffLoad;

  const apiKey = getScriptSecret();
  let fetchUrl = `${scriptUrl}?action=getStaff`;
  if (apiKey) {
    fetchUrl += `&apiKey=${encodeURIComponent(apiKey)}`;
  }

  pendingStaffLoad = fetchAppsScriptWithRetry(
    () => fetchWithTimeout(fetchUrl, undefined, getAppsScriptFetchTimeout(force)),
    { maxAttempts: force ? 3 : 2 }
  )
    .then(async res => {
      const contentType = res.headers.get('Content-Type') || '';
      const text = await res.text();
      if (!res.ok) throw new Error(formatAppsScriptHttpError(res.status));
      if (contentType.includes('text/html') || text.trim().startsWith('<')) {
        throw new Error('Apps Script đang trả về HTML.');
      }
      const parsed = JSON.parse(text);
      const staffList = Array.isArray(parsed.staff) && parsed.staff.length > 0
        ? parsed.staff
        : BUNDLED_STAFF;
      staffCache = mergeStaffWithBundledPasswords(staffList);
      void setPersistedData('staff_data', staffCache.map(stripBridgePassword));
      if (cache) {
        cache.staff = staffCache;
      }
      return staffCache!;
    })
    .catch(err => {
      if (staffCache?.length) return staffCache;
      console.warn('Staff sync failed, using bundled roster:', err);
      return resolveOfflineStaffList();
    })
    .finally(() => {
      pendingStaffLoad = null;
    });

  return pendingStaffLoad;
};




const fetchAllDataFromNetwork = async (force = false): Promise<SheetData> => {
  if (pendingLoad) {
    // A soft fetch must not satisfy a force sync — wait and retry with force.
    if (force && !pendingLoadIsForce) {
      await pendingLoad.catch(() => undefined);
    } else {
      return pendingLoad;
    }
  }

  if (!getScriptUrl()) {
    await ensureSyncConfigHydrated();
  }

  const scriptUrl = getScriptUrl();

  if (!scriptUrl) {
    if (isLocalHost()) {
      pendingLoadIsForce = force;
      pendingLoad = (async () => {
        const nativeFetch = (window as any).__CHD_NATIVE_FETCH__ || window.fetch;
        const localRes = await nativeFetch('/api/all');
        if (!localRes.ok) throw new Error(`Local database HTTP ${localRes.status}`);
        const localData = await localRes.json();
        cache = normalizeData(localData);
        staffCache = mergeStaffWithBundledPasswords(cache.staff);
        cache.staff = staffCache;
        void setPersistedData('all_data', {
          ...localData,
          staff: Array.isArray(cache.staff) ? cache.staff.map(stripBridgePassword) : []
        });
        markClientPullOk('Đã tải dữ liệu từ máy chủ local.');
        return cache;
      })().finally(() => {
        pendingLoad = null;
        pendingLoadIsForce = false;
      });
      return pendingLoad;
    }
    return Promise.resolve(normalizeData({ staff: BUNDLED_STAFF }));
  }

  const apiKey = getScriptSecret();
  let fetchUrl = `${scriptUrl}?action=getAll`;
  if (apiKey) {
    fetchUrl += `&apiKey=${encodeURIComponent(apiKey)}`;
  }

  pendingLoadIsForce = force;
  pendingLoad = fetchAppsScriptWithRetry(
    () => fetchWithTimeout(fetchUrl, undefined, getAppsScriptFetchTimeout(force)),
    { maxAttempts: force ? 3 : 2 }
  )
    .then(async res => {
      const contentType = res.headers.get('Content-Type') || '';
      const text = await res.text();
      if (!res.ok) throw new Error(formatAppsScriptHttpError(res.status));
      if (contentType.includes('text/html') || text.trim().startsWith('<')) {
        const scriptError = text.match(/<div[^>]*>([^<]+)<\/div>\s*<\/body>/i)?.[1]?.trim();
        throw new Error(
          scriptError
            ? `Apps Script lỗi: ${scriptError}`
            : 'Apps Script đang trả về HTML. Hãy deploy Web app với quyền truy cập Anyone và copy đúng Web app URL.'
        );
      }
      const parsed = JSON.parse(text);
      cache = normalizeData(parsed);
      if (Array.isArray(cache.staff)) {
        staffCache = mergeStaffWithBundledPasswords(cache.staff);
        cache.staff = staffCache;
      }
      void setPersistedData('all_data', {
        ...parsed,
        staff: Array.isArray(cache.staff) ? cache.staff.map(stripBridgePassword) : []
      });
      if (Array.isArray(cache.staff)) {
        void setPersistedData('staff_data', cache.staff.map(stripBridgePassword));
      }
      markClientPullOk();
      return cache;
    })
    .catch(async err => {
      markClientPullFailed(err);

      const cachedAll = cache || await hydrateCacheFromPersisted();
      if (cachedAll) {
        scheduleBackgroundPullRetry();
        return cachedAll;
      }

      if (isLocalHost()) {
        console.warn('Google Apps Script connection failed. Falling back to local offline Express database...', err);
        const nativeFetch = (window as any).__CHD_NATIVE_FETCH__ || window.fetch;
        try {
          const localRes = await nativeFetch('/api/all');
          if (localRes.ok) {
            const localData = await localRes.json();
            cache = normalizeData(localData);
            staffCache = mergeStaffWithBundledPasswords(cache.staff);
            cache.staff = staffCache;
            return cache;
          }
        } catch (fallbackErr) {
          console.error('Local Express database fallback also failed:', fallbackErr);
        }
      }

      throw err;
    })
    .finally(() => {
      pendingLoad = null;
      pendingLoadIsForce = false;
    });

  return pendingLoad;
};

const refreshAllDataInBackground = (): void => {
  if (!getScriptUrl() || pendingLoad) return;
  void fetchAllDataFromNetwork(true)
    .then(data => {
      if (typeof window !== 'undefined' && data.patients.length + data.consults.length > 0) {
        window.dispatchEvent(new CustomEvent('chd-bridge-data-updated'));
      }
    })
    .catch(err => {
      console.warn('Background data sync failed:', err);
    });
};

const scheduleBackgroundPullRetry = () => {
  if (!getScriptUrl() || backgroundPullRetryTimer) return;
  if (backgroundPullRetryAttempt >= 5) return;

  const delayMs = Math.min(120000, 15000 * (backgroundPullRetryAttempt + 1));
  backgroundPullRetryTimer = setTimeout(() => {
    backgroundPullRetryTimer = null;
    backgroundPullRetryAttempt += 1;
    void fetchAllDataFromNetwork(true)
      .then(data => {
        backgroundPullRetryAttempt = 0;
        if (typeof window !== 'undefined' && data.patients.length + data.consults.length > 0) {
          window.dispatchEvent(new CustomEvent('chd-bridge-data-updated'));
        }
      })
      .catch(() => {
        scheduleBackgroundPullRetry();
      });
  }, delayMs);
};

const hydrateCacheFromPersisted = async (): Promise<SheetData | null> => {
  const cachedAll = await getPersistedData('all_data');
  const hasClinicalData =
    (Array.isArray(cachedAll?.patients) && cachedAll.patients.length > 0) ||
    (Array.isArray(cachedAll?.consults) && cachedAll.consults.length > 0);
  if (
    cachedAll &&
    hasClinicalData &&
    Array.isArray(cachedAll.staff) &&
    cachedAll.staff.length > 0 &&
    cachedAll.staff[0].Role !== undefined
  ) {
    cache = normalizeData(cachedAll);
    staffCache = mergeStaffWithBundledPasswords(cache.staff);
    cache.staff = staffCache;
    return cache;
  }
  return null;
};

/** Memory/IndexedDB snapshot only — no network, no background refresh. */
export const peekPersistedAllData = async (): Promise<SheetData | null> => {
  const hasClinical = (data: SheetData | null | undefined) =>
    !!data && (
      (Array.isArray(data.patients) && data.patients.length > 0) ||
      (Array.isArray(data.consults) && data.consults.length > 0)
    );

  if (cache && hasClinical(cache)) {
    return sanitizeDataBundle(cache);
  }

  const persisted = await hydrateCacheFromPersisted();
  if (persisted && hasClinical(persisted)) {
    return sanitizeDataBundle(persisted);
  }

  const rawCached = await getPersistedData('all_data');
  if (rawCached && hasClinical(rawCached)) {
    return sanitizeDataBundle(normalizeData(rawCached));
  }
  return null;
};

/** Current in-memory cache after a bridge update (sync, no IDB round-trip). */
export const getInMemoryAllData = (): SheetData | null => {
  if (!cache) return null;
  const hasClinical =
    (Array.isArray(cache.patients) && cache.patients.length > 0) ||
    (Array.isArray(cache.consults) && cache.consults.length > 0);
  return hasClinical ? sanitizeDataBundle(cache) : null;
};

const loadAllData = async (force = false): Promise<SheetData> => {
  if (force) {
    return fetchAllDataFromNetwork(true);
  }

  if (cache) {
    refreshAllDataInBackground();
    return cache;
  }

  if (pendingLoad) return pendingLoad;

  const persisted = await hydrateCacheFromPersisted();
  if (persisted) {
    refreshAllDataInBackground();
    return persisted;
  }

  return fetchAllDataFromNetwork(force);
};


const findCachedRecord = (
  endpoint: string,
  key: string | undefined,
  config: (typeof endpointMap)[string]
) => {
  if (!key || !cache) return undefined;
  const collection = cache[config.collection] as any[];
  return collection.find(item =>
    String(getRecordKey(item, config) || '').trim().toLowerCase() === String(key).trim().toLowerCase() ||
    (endpoint === 'patients' && String(item.PatientID1 || '').trim().toLowerCase() === String(key).trim().toLowerCase())
  );
};

const upsertCachedRecord = (config: (typeof endpointMap)[string], record: any, isInsert: boolean) => {
  if (!cache) {
    cache = { ...EMPTY_DATA };
  }
  const collection = [...(cache[config.collection] as any[])];
  const recordKey = String(getRecordKey(record, config) || '').trim().toLowerCase();
  const index = collection.findIndex(item =>
    String(getRecordKey(item, config) || '').trim().toLowerCase() === recordKey
  );
  if (index >= 0) {
    collection[index] = record;
  } else if (isInsert) {
    collection.push(record);
  } else {
    collection.push(record);
  }
  cache = {
    ...cache,
    [config.collection]: collection
  };
};

const deleteCachedRecord = (config: (typeof endpointMap)[string], key: string): boolean => {
  if (!cache) return false;
  const normalizedKey = String(key).trim().toLowerCase();
  const collection = [...(cache[config.collection] as any[])];
  const index = collection.findIndex(item =>
    String(getRecordKey(item, config) || '').trim().toLowerCase() === normalizedKey
  );
  if (index < 0) return false;
  collection.splice(index, 1);
  cache = {
    ...cache,
    [config.collection]: collection
  };
  void setPersistedData('all_data', sanitizeDataBundle(cache));
  return true;
};

const syncRecordToScript = (payload: { type: SheetType; action: 'insert' | 'update'; key: string; data: any }) => {
  const scriptUrl = getScriptUrl();
  if (!scriptUrl) return;

  const apiKey = getScriptSecret();
  void fetchAppsScriptWithRetry(
    () => fetchWithTimeout(scriptUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ ...payload, apiKey })
    }),
    { maxAttempts: 3 }
  ).then(async (response) => {
    const text = await response.text();
    if (!response.ok) {
      console.error(`Background upsert sync HTTP ${response.status}:`, text);
      return;
    }
    try {
      const result = JSON.parse(text);
      if (result.status === 'error') {
        console.error('Background upsert sync error:', result.message);
      }
    } catch {
      console.error('Background upsert sync returned invalid JSON:', text);
    }
  }).catch((err) => {
    console.error('Background upsert sync failed:', err);
  });
};

const postToScript = async (
  payload: { type: SheetType; action: 'insert' | 'update'; key: string; data: any },
  config: (typeof endpointMap)[string],
  record: any,
  isInsert: boolean
) => {
  const scriptUrl = getScriptUrl();
  if (!scriptUrl) throw new Error('Chưa cấu hình Google Apps Script URL');

  const apiKey = getScriptSecret();
  const response = await fetchAppsScriptWithRetry(
    () => fetchWithTimeout(scriptUrl, {
      method: 'POST',
      // text/plain avoids a browser preflight, which Apps Script Web Apps do not handle well.
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ ...payload, apiKey })
    }),
    { maxAttempts: 3 }
  );

  const text = await response.text();
  if (!response.ok) throw new Error(formatAppsScriptHttpError(response.status));
  const result = JSON.parse(text);
  if (result.status === 'error') {
    throw new Error(result.message || 'Apps Script không thể ghi dữ liệu');
  }
  upsertCachedRecord(config, record, isInsert);
  return result;
};

const postBatchToScript = async (operations: Array<{ type: SheetType; action: 'insert' | 'update'; key: string; data: any }>) => {
  const scriptUrl = getScriptUrl();
  if (!scriptUrl) throw new Error('Chưa cấu hình Google Apps Script URL');

  const apiKey = getScriptSecret();
  const response = await fetchAppsScriptWithRetry(
    () => fetchWithTimeout(scriptUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: 'batch', operations, apiKey })
    }),
    { maxAttempts: 3 }
  );

  const text = await response.text();
  if (!response.ok) throw new Error(formatAppsScriptHttpError(response.status));
  const result = JSON.parse(text);
  if (result.status === 'error') {
    throw new Error(result.message || 'Apps Script không thể ghi dữ liệu theo lô');
  }
  return result;
};

const deleteFromScript = async (payload: { type: SheetType; key: string }) => {
  const scriptUrl = getScriptUrl();
  if (!scriptUrl) throw new Error('Chưa cấu hình Google Apps Script URL');

  const apiKey = getScriptSecret();
  const response = await fetchAppsScriptWithRetry(
    () => fetchWithTimeout(scriptUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: 'delete', ...payload, apiKey })
    }),
    { maxAttempts: 3 }
  );

  const text = await response.text();
  if (!response.ok) throw new Error(formatAppsScriptHttpError(response.status));
  let result: { status?: string; message?: string };
  try {
    result = JSON.parse(text);
  } catch {
    throw new Error(
      'Apps Script trả về phản hồi không hợp lệ khi xóa. Kiểm tra URL Web app và deploy lại Apps Script.'
    );
  }
  if (result.status === 'error') {
    throw new Error(result.message || 'Apps Script không thể xóa dữ liệu');
  }
  return result;
};

const formatDeleteSheetError = (type: SheetType, key: string, message: string): string => {
  const lower = message.toLowerCase();
  if (lower.includes('not found')) {
    return (
      `Không tìm thấy ${type}Key "${key}" trên Google Sheets. ` +
      'Dòng vẫn còn trên Sheet — kiểm tra cột khóa (vd. ConsultKey) khớp với app, ' +
      'rồi deploy lại Apps Script (Extensions → Deploy → Web app mới).'
    );
  }
  if (lower.includes('unknown action')) {
    return 'Apps Script chưa có action delete — cần copy code mới từ app CHD và deploy lại Web app.';
  }
  if (lower.includes('unauthorized') || lower.includes('invalid or missing api key')) {
    return 'API Key Google Sheets không khớp — kiểm tra GOOGLE_SCRIPT_SECRET trên Cloudflare và Script Properties.';
  }
  if (lower.includes('sheet not found')) {
    return `Không tìm thấy tab "${type}" trên Google Sheets.`;
  }
  return message;
};

const appendNotificationIfMissingBridge = async (input: Notification): Promise<Notification | null> => {
  if (!input.StaffKey || !input.DedupKey) return null;

  if (!cache) {
    try {
      await loadAllData();
    } catch {
      // fall through
    }
  }
  if (!cache) return null;

  const notifications = Array.isArray(cache.notifications) ? cache.notifications : [];
  const existing = notifications.find(
    item => item.DedupKey === input.DedupKey && item.StaffKey === input.StaffKey
  );
  if (existing) return existing as Notification;

  const record: Notification = {
    ...input,
    ...sanitizeNotificationFields(input),
    NotificationKey: input.NotificationKey || createKey('notif'),
    CreatedTime: input.CreatedTime || new Date().toISOString(),
    IsRead: input.IsRead ?? false,
  };

  upsertCachedRecord(endpointMap.notifications, record, true);

  const scriptUrl = getScriptUrl();
  if (scriptUrl) {
    try {
      await postToScript(
        { type: 'Notification', action: 'insert', key: record.NotificationKey, data: record },
        endpointMap.notifications,
        record,
        true
      );
    } catch (err) {
      console.error('Scheduler notification sync failed:', err);
    }
  }

  deliverWebPushForNotification(record);
  return record;
};

const maybeNotifySchedulerAboutConsultMutation = async (
  _previous: Consult | undefined,
  _updated: Consult
): Promise<void> => {
  // Không gửi thông báo chuông/push khi Consult đủ điều kiện xếp lịch.
};

const createKey = (prefix: string) => `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

const getRecordKey = (record: any, config: (typeof endpointMap)[string]) => {
  if (config.collection === 'cmrs') return record.CMRKey || record.CMRkey;
  if (config.collection === 'transplants') return record.TransKey;
  return record[config.keyField];
};

const prepareRecordForInsert = async (endpoint: string, record: any, config: (typeof endpointMap)[string]) => {
  const next = { ...(record || {}) };
  if (!getRecordKey(next, config)) {
    next[config.keyField] = createKey(config.prefix);
  }
  if (endpoint === 'patients') {
    next.PatientCreateTime = next.PatientCreateTime || new Date().toISOString();
  }
  if (endpoint === 'consults') {
    next.ConsultCreateTime = next.ConsultCreateTime || new Date().toISOString();
  }
  if (endpoint === 'cmrs') {
    next.CMRKey = next.CMRKey || next.CMRkey || createKey(config.prefix);
    next.UpdateTime = next.UpdateTime || new Date().toISOString();
  }
  if (endpoint === 'transplants') {
    next.TransKey = next.TransKey || createKey(config.prefix);
    next.TransCreatedTime = next.TransCreatedTime || new Date().toISOString();
    next.TransUpdateTime = next.TransUpdateTime || new Date().toISOString();
  }
  if (endpoint === 'notifications') {
    next.NotificationKey = next.NotificationKey || createKey(config.prefix);
    next.CreatedTime = next.CreatedTime || new Date().toISOString();
    next.IsRead = next.IsRead ?? false;
  }
  if (endpoint === 'doctor-performance-marks') {
    next.MarkKey = next.MarkKey || createKey(config.prefix);
    next.CreatedTime = next.CreatedTime || new Date().toISOString();
    next.CreatedBy = next.CreatedBy || 'HIS_IMPORT';
    next.Score = next.Score ?? 1;
  }
  return next;
};

const deliverWebPushForNotification = (record: Record<string, unknown>): void => {
  const staffKey = String(record?.StaffKey || '').trim();
  if (!staffKey) return;

  const nativeFetch = (window as any).__CHD_NATIVE_FETCH__ as typeof fetch | undefined;
  if (!nativeFetch) return;

  const payload = buildWebPushPayload(record as any);
  const body = JSON.stringify({ StaffKey: staffKey, ...payload });

  const send = () =>
    nativeFetch('/api/push/deliver', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    }).then(async res => {
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      return res.json() as Promise<{ sent?: number; skipped?: boolean; needsResubscribe?: boolean; errors?: string[] }>;
    });

  void send()
    .then(result => {
      if (result.skipped) {
        console.warn('[web-push] Server chưa cấu hình VAPID — không gửi được push OS.');
      } else if (result.needsResubscribe) {
        console.warn('[web-push] Subscription hết hạn — cần Tắt/Bật lại thông báo trên thiết bị nhận:', staffKey, result.errors);
      } else if (!result.sent) {
        console.warn('[web-push] Không gửi được push OS cho StaffKey', staffKey, result.errors);
      }
    })
    .catch(err => {
      console.warn('[web-push] Deliver failed, retrying once:', err);
      void send().catch(retryErr => {
        console.warn('[web-push] Deliver retry failed:', retryErr);
      });
    });
};

const upsertRecord = async (endpoint: string, keyFromPath: string | undefined, method: string, init?: RequestInit) => {
  const config = endpointMap[endpoint];
  if (!config) return jsonResponse({ error: `Unsupported endpoint: ${endpoint}` }, { status: 404 });

  const incoming = await parseBody(init);
  const isUpdate = method === 'PUT' || method === 'PATCH';
  const key = keyFromPath ? decodeURIComponent(keyFromPath) : getRecordKey(incoming, config);

  let existing = findCachedRecord(endpoint, key, config);
  if (isUpdate && !existing && !cache) {
    await loadAllData();
    existing = findCachedRecord(endpoint, key, config);
  }

  let record = isUpdate
    ? { ...(existing || {}), ...incoming }
    : await prepareRecordForInsert(endpoint, incoming, config);

  if (endpoint === 'cmrs') {
    record.CMRKey = record.CMRKey || record.CMRkey || key || createKey(config.prefix);
    record.UpdateTime = new Date().toISOString();
  }
  if (endpoint === 'transplants') {
    record.TransKey = record.TransKey || key || createKey(config.prefix);
    record.TransUpdateTime = new Date().toISOString();
  }

  const finalKey = getRecordKey(record, config) || key || createKey(config.prefix);
  record[config.keyField] = finalKey;

  const isInsert = !(existing || isUpdate);
  upsertCachedRecord(config, record, isInsert);
  syncRecordToScript({
    type: config.type,
    action: existing || isUpdate ? 'update' : 'insert',
    key: String(finalKey),
    data: record
  });

  if (endpoint === 'notifications' && isInsert && record?.StaffKey) {
    deliverWebPushForNotification(record);
  }

  if (endpoint === 'consults') {
    const previousConsult = existing ? ({ ...existing } as Consult) : undefined;
    void maybeNotifySchedulerAboutConsultMutation(previousConsult, record as Consult);
  }

  return jsonResponse(record, { status: existing || isUpdate ? 200 : 201 });
};

const deleteRecord = async (endpoint: string, keyFromPath: string | undefined) => {
  const config = endpointMap[endpoint];
  if (!config) return jsonResponse({ error: `Unsupported endpoint: ${endpoint}` }, { status: 404 });
  if (!keyFromPath) return jsonResponse({ error: 'Missing record key' }, { status: 400 });

  const key = decodeURIComponent(keyFromPath);

  if (!cache) {
    try {
      await loadAllData();
    } catch {
      // fall through — hydrate from persisted below
    }
  }
  if (!cache) {
    const persisted = await hydrateCacheFromPersisted();
    if (persisted) cache = persisted;
  }
  if (!cache) {
    const rawCached = await getPersistedData('all_data');
    if (rawCached) {
      cache = normalizeData(rawCached);
    }
  }

  let existing = findCachedRecord(endpoint, key, config);
  if (!existing && cache) {
    const collection = cache[config.collection] as any[];
    existing = collection.find(item => {
      const recordKey = String(getRecordKey(item, config) || '').trim();
      const target = String(key).trim();
      return recordKey === target || recordKey.toLowerCase() === target.toLowerCase();
    });
  }
  if (!existing) {
    return jsonResponse({ error: 'Record not found' }, { status: 404 });
  }

  const finalKey = String(getRecordKey(existing, config) || key);

  const scriptUrl = getScriptUrl();
  if (!scriptUrl) {
    return jsonResponse(
      { error: 'Chưa cấu hình Google Apps Script URL — không thể xóa trên Google Sheets.' },
      { status: 400 }
    );
  }

  try {
    await deleteFromScript({ type: config.type, key: finalKey });
  } catch (err) {
    const raw = err instanceof Error ? err.message : 'Không thể xóa trên Google Sheets';
    const message = formatDeleteSheetError(config.type, finalKey, raw);
    return jsonResponse({ error: message, key: finalKey, type: config.type }, { status: 502 });
  }

  deleteCachedRecord(config, finalKey);

  return jsonResponse({ success: true, [config.keyField]: finalKey });
};

const batchWriteRecords = async (init?: RequestInit) => {
  const body = await parseBody(init);
  const incomingOperations = Array.isArray(body.operations) ? body.operations : [];
  if (incomingOperations.length === 0) {
    return jsonResponse({ error: 'Batch write requires operations' }, { status: 400 });
  }

  if (!cache) {
    try {
      await loadAllData();
    } catch {
      cache = { ...EMPTY_DATA };
    }
  }

  const scriptOperations: Array<{ type: SheetType; action: 'insert' | 'update'; key: string; data: any }> = [];
  const responseRecords: any[] = [];

  for (const operation of incomingOperations) {
    const endpoint = String(operation.endpoint || '').trim();
    const method = String(operation.method || 'POST').toUpperCase();
    const config = endpointMap[endpoint];
    if (!config) {
      return jsonResponse({ error: `Unsupported batch endpoint: ${endpoint}` }, { status: 400 });
    }

    const isUpdate = method === 'PUT' || method === 'PATCH';
    const prepared = isUpdate
      ? { ...(findCachedRecord(endpoint, operation.key, config) || {}), ...(operation.data || {}) }
      : await prepareRecordForInsert(endpoint, operation.data || {}, config);
    const finalKey = operation.key || getRecordKey(prepared, config) || createKey(config.prefix);
    prepared[config.keyField] = finalKey;
    if (endpoint === 'cmrs') {
      prepared.CMRKey = prepared.CMRKey || prepared.CMRkey || finalKey;
      prepared.UpdateTime = prepared.UpdateTime || new Date().toISOString();
    }

    scriptOperations.push({
      type: config.type,
      action: isUpdate ? 'update' : 'insert',
      key: String(finalKey),
      data: prepared
    });
    responseRecords.push(prepared);
  }

  await postBatchToScript(scriptOperations);

  scriptOperations.forEach((operation, index) => {
    const config = Object.values(endpointMap).find(item => item.type === operation.type);
    if (config) upsertCachedRecord(config, responseRecords[index], operation.action === 'insert');
  });

  for (let i = 0; i < incomingOperations.length; i += 1) {
    const endpoint = String(incomingOperations[i]?.endpoint || '').trim();
    const method = String(incomingOperations[i]?.method || 'POST').toUpperCase();
    if (endpoint === 'notifications' && method === 'POST') {
      deliverWebPushForNotification(responseRecords[i]);
    }
  }

  return jsonResponse({ success: true, count: responseRecords.length, records: responseRecords });
};

const handleApiRequest = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response | null> => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
  const parsed = new URL(url, window.location.origin);
  if (parsed.origin !== window.location.origin || !parsed.pathname.startsWith('/api/')) return null;

  const scriptUrl = getScriptUrl();
  const method = String(init?.method || (input instanceof Request ? input.method : 'GET') || 'GET').toUpperCase();
  const parts = parsed.pathname.replace(/^\/api\/?/, '').split('/').filter(Boolean);
  const endpoint = parts[0] || '';
  const key = parts[1];

  if (endpoint === 'version' && method === 'GET') {
    return jsonResponse(getAppVersionPayload());
  }

  if (endpoint === 'sync' && parts[1] === 'status' && method === 'GET') {
    // Local Express owns authoritative pull/push flags; bridge owns them on Cloudflare.
    if (isLocalHost()) return null;
    const authErr = requireAuthBridge(init);
    if (authErr) return authErr;
    return jsonResponse(getClientSheetsSyncStatus());
  }

  if (endpoint === 'sync-config') {
    if (parts[1] === 'sync' && method === 'POST') {
      cache = null;
      await loadAllData(true);
      return jsonResponse({ message: 'Đã tải lại dữ liệu từ Google Sheets.' });
    }
    return null;
  }

  if (endpoint === 'reset') {
    // Require Admin for reset in bridge mode
    if (!isLocalHost()) {
      const authErr = requireAuthBridge(init);
      if (authErr) return authErr;
    }
    return jsonResponse({ message: 'Reset local database không khả dụng khi chạy bằng Apps Script.' }, { status: 400 });
  }

  if (endpoint === 'batch-write' && method === 'POST') {
    if (!isLocalHost()) {
      const authErr = requireAuthBridge(init);
      if (authErr) return authErr;
    }
    if (!scriptUrl) {
      if (isLocalHost()) return null;
      return jsonResponse({ error: 'Chưa kết nối Google Apps Script URL trong mục Google Sheets.' }, { status: 400 });
    }
    return batchWriteRecords(init);
  }

  // ─── AUTH ENDPOINTS (Bridge implementation) ─────────────────────────────

  if (endpoint === 'auth') {
    const subAction = parts[1];

    // POST /api/auth/login
    if (subAction === 'login' && method === 'POST') {
      const body = await parseBody(init);
      const { StaffKey, Password } = body || {};
      if (!StaffKey || !Password) {
        return jsonResponse({ error: 'Vui lòng nhập mã nhân viên và mật khẩu.' }, { status: 400 });
      }

      const verifyLocally = async () => {
        let staffList: Staff[] = [];
        try {
          staffList = staffCache ?? (scriptUrl ? await loadStaffOnly(false) : BUNDLED_STAFF);
        } catch (e) {
          console.warn('Failed to load staff list for local fallback, using bundled roster:', e);
          staffList = BUNDLED_STAFF;
        }
        const localStaff = staffList.find((s: Staff) => String(s.StaffKey || '').trim() === String(StaffKey).trim())
          ?? BUNDLED_STAFF.find((s: Staff) => String(s.StaffKey || '').trim() === String(StaffKey).trim());
        if (!localStaff) {
          return jsonResponse({ error: 'Mã nhân viên không tồn tại!' }, { status: 401 });
        }
        const expectedPassword = String(localStaff.Password || '1111').trim();
        const inputPassword = String(Password).trim();
        const hashedInput = await bridgeHashPassword(inputPassword, String(localStaff.StaffKey));
        
        if (inputPassword !== expectedPassword && hashedInput !== expectedPassword) {
          return jsonResponse({ error: 'Mật khẩu không đúng. Vui lòng thử lại!' }, { status: 401 });
        }
        const token = bridgeCreateSession(String(localStaff.StaffKey));
        return jsonResponse({ token, staff: stripBridgePassword(localStaff) });
      };

      // Local verification only — instant login without waiting for Apps Script
      return verifyLocally();
    }

    // POST /api/auth/logout
    if (subAction === 'logout' && method === 'POST') {
      const token = extractBridgeToken(init);
      if (token) bridgeRevokeToken(token);

      // Clear in-memory cache only; persisted IndexedDB stays for fast re-login.
      await clearLocalCache();

      return jsonResponse({ success: true });
    }

    // GET /api/auth/me
    if (subAction === 'me' && method === 'GET') {
      const token = extractBridgeToken(init);
      if (!token) return jsonResponse({ error: 'Yêu cầu đăng nhập.' }, { status: 401 });
      const staffKey = bridgeResolveSession(token);
      if (!staffKey) return jsonResponse({ error: 'Phiên đăng nhập đã hết hạn.' }, { status: 401 });
      let staffList: Staff[];
      try {
        staffList = cache?.staff ?? (scriptUrl ? await loadStaffOnly(false) : BUNDLED_STAFF);
      } catch {
        staffList = BUNDLED_STAFF;
      }
      const staff = staffList.find((s: any) => String(s.StaffKey) === staffKey);
      if (!staff) return jsonResponse({ error: 'Tài khoản không còn tồn tại.' }, { status: 401 });
      return jsonResponse(staff);
    }

    return jsonResponse({ error: 'Không tìm thấy endpoint auth.' }, { status: 404 });
  }

  // GET /api/staff/public — only StaffKey + StaffName + Avatar + Name + Role, no auth required
  if (endpoint === 'staff' && key === 'public' && method === 'GET') {
    let staffList: Staff[];
    try {
      staffList = staffCache ?? (scriptUrl ? await loadStaffOnly(false) : BUNDLED_STAFF);
    } catch {
      staffList = BUNDLED_STAFF;
    }
    const resolvedStaff = mergeStaffWithBundledPasswords(staffList);
    const publicList = resolvedStaff
      .filter((s: Staff) => !s.FireDate || !String(s.FireDate).trim())
      .map((s: Staff) => ({
        StaffKey: s.StaffKey,
        StaffName: s.StaffName,
        Name: s.Name || '',
        Role: s.Role || '',
        Avatar: s.Avatar || ''
      }));
    return jsonResponse(publicList);
  }

  if (endpoint === 'all' && method === 'GET') {
    // Require auth in bridge mode (non-localhost)
    if (!isLocalHost()) {
      const authErr = requireAuthBridge(init);
      if (authErr) return authErr;
    }
    let resolvedScriptUrl = scriptUrl;
    if (!resolvedScriptUrl) {
      await ensureSyncConfigHydrated();
      resolvedScriptUrl = getScriptUrl();
    }
    if (!resolvedScriptUrl) {
      if (isLocalHost()) return null;
      const cached = await hydrateCacheFromPersisted();
      if (cached) {
        return jsonResponse({
          ...sanitizeDataBundle(cached),
          _syncWarning: 'Chưa đồng bộ cấu hình Google Sheets cho thiết bị này. Mở app trên máy tính đã kết nối Sheets một lần, hoặc vào mục Google Sheets để cấu hình.'
        });
      }
      return jsonResponse(
        {
          ...sanitizeDataBundle(EMPTY_DATA),
          _syncWarning: 'Chưa cấu hình Google Apps Script URL. Mở app trên máy tính đã liên kết Google Sheets (đăng nhập một lần để đồng bộ), hoặc vào mục Google Sheets trên máy tính để cấu hình.'
        },
        { status: 503 }
      );
    }
    const force = parsed.searchParams.get('force') === 'true' || parsed.searchParams.get('refresh') === 'true';
    try {
      const allData = await loadAllData(force);
      const syncStatus = getClientSheetsSyncStatus();
      return jsonResponse({
        ...sanitizeDataBundle(allData),
        _syncStatus: syncStatus,
        ...(syncStatus.configured && !syncStatus.lastPullOk && syncStatus.lastPullMessage
          ? { _syncWarning: syncStatus.lastPullMessage }
          : {})
      });
    } catch (err) {
      const cached = await hydrateCacheFromPersisted();
      if (cached) {
        markClientPullFailed(err);
        scheduleBackgroundPullRetry();
        return jsonResponse({
          ...sanitizeDataBundle(cached),
          _syncWarning: formatAppsScriptFetchError(err),
          _syncStatus: getClientSheetsSyncStatus()
        });
      }
      return jsonResponse(
        { error: formatAppsScriptFetchError(err) },
        { status: 503 }
      );
    }
  }

  if (endpoint === 'proxy' && parts[1] === 'drive-export') {
    const target = parsed.searchParams.get('url') || '';
    if (!target) return textResponse('Missing url', { status: 400 });
    return fetch(target);
  }

  if (endpoint === 'notifications' && parts[2] === 'read' && method === 'PUT') {
    return upsertRecord('notifications', key, method, {
      ...init,
      body: JSON.stringify({ IsRead: true, ReadTime: new Date().toISOString() })
    });
  }

  // CHD Daily Brief: try real server first, fallback to client cache
  if (endpoint === 'chd-brief') {
    const nativeFetch = (window as any).__CHD_NATIVE_FETCH__ as typeof fetch | undefined;
    return handleChdBriefRequest(parts, method, init, nativeFetch || fetch);
  }

  if (endpoint === 'workflow-monitor') {
    return null;
  }

  // Web Push runs on Cloudflare Worker — bypass bridge mock API
  if (endpoint === 'push') {
    return null;
  }

  if (endpoint === 'staff' && method === 'GET') {
    if (!scriptUrl) {
      if (isLocalHost()) return null;
      return jsonResponse(EMPTY_DATA.staff);
    }
    const staffData = await loadStaffOnly();
    return jsonResponse(staffData);
  }

  if (endpoint === 'sources' && parts[1] === 'update-all' && method === 'POST') {
    if (!isLocalHost()) {
      const authErr = requireAuthBridge(init);
      if (authErr) return authErr;
    }
    if (!scriptUrl) {
      if (isLocalHost()) return null;
      return jsonResponse({ error: 'Chưa kết nối Google Apps Script URL trong mục Google Sheets.' }, { status: 400 });
    }

    const body = await parseBody(init);
    const { PatientAddress, DiagnosisID, ResultConsultID, CathMethod, diagnosisRenames } = body || {};

    if (!Array.isArray(PatientAddress) || !Array.isArray(DiagnosisID) || !Array.isArray(ResultConsultID) || !Array.isArray(CathMethod)) {
      return jsonResponse({ error: 'Invalid payload: expected arrays for PatientAddress, DiagnosisID, ResultConsultID, and CathMethod.' }, { status: 400 });
    }

    if (!cache) {
      await loadAllData();
    }

    // 1. Cascade DiagnosisID changes client-side in the cache
    if (Array.isArray(diagnosisRenames) && diagnosisRenames.length > 0 && cache) {
      const consults = [...cache.consults];
      let consultsChanged = false;
      const cathlabs = [...cache.cathlabs];
      let cathlabsChanged = false;
      const cmrs = [...cache.cmrs];
      let cmrsChanged = false;
      const templates = [...cache.deviceTemplates];
      let templatesChanged = false;

      const scriptOperations: Array<{ type: SheetType; action: 'insert' | 'update'; key: string; data: any }> = [];

      for (const rename of diagnosisRenames) {
        const oldId = String(rename.oldVal || '').trim();
        const newId = String(rename.newVal || '').trim();
        if (oldId && newId && oldId !== newId) {
          // Consults
          consults.forEach((c, idx) => {
            if (c.DiagnosisID === oldId) {
              const updated = { ...c, DiagnosisID: newId };
              consults[idx] = updated;
              consultsChanged = true;
              scriptOperations.push({ type: 'Consult', action: 'update', key: c.ConsultKey, data: updated });
            }
          });
          
          // Cathlabs
          cathlabs.forEach((cl, idx) => {
            let clChanged = false;
            const updated = { ...cl };
            if (cl.DiagnosisID === oldId) {
              updated.DiagnosisID = newId;
              clChanged = true;
            }
            if (cl.PostDiagnosisID === oldId) {
              updated.PostDiagnosisID = newId;
              clChanged = true;
            }
            if (clChanged) {
              cathlabs[idx] = updated;
              cathlabsChanged = true;
              scriptOperations.push({ type: 'CathLab', action: 'update', key: cl.CathKey, data: updated });
            }
          });

          // CMRs
          cmrs.forEach((cmr, idx) => {
            if (cmr.CMRDiagnosisID === oldId) {
              const updated = { ...cmr, CMRDiagnosisID: newId };
              cmrs[idx] = updated;
              cmrsChanged = true;
              scriptOperations.push({ type: 'CMR', action: 'update', key: cmr.CMRKey, data: updated });
            }
          });

          // DeviceTemplates
          templates.forEach((t, idx) => {
            if (t.DiagnosisID === oldId) {
              const updated = { ...t, DiagnosisID: newId };
              templates[idx] = updated;
              templatesChanged = true;
              scriptOperations.push({ type: 'DeviceTemplate', action: 'update', key: t.DeviceName, data: updated });
            }
          });
        }
      }

      if (consultsChanged) cache.consults = consults;
      if (cathlabsChanged) cache.cathlabs = cathlabs;
      if (cmrsChanged) cache.cmrs = cmrs;
      if (templatesChanged) cache.deviceTemplates = templates;

      if (scriptOperations.length > 0) {
        await postBatchToScript(scriptOperations);
      }
    }

    // 2. Reconstruct sources in the client cache
    const existingSources = cache ? cache.sources : [];
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

    if (cache) {
      cache.sources = nextSources;
      void setPersistedData('all_data', sanitizeDataBundle(cache));
    }

    // 3. Sync to Google Sheets
    await fetchWithTimeout(scriptUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({
        action: 'sync_sources',
        type: 'Source',
        key: '',
        data: nextSources,
        apiKey: getScriptSecret()
      })
    });

    return jsonResponse({ success: true, count: nextSources.length });
  }

  const config = endpointMap[endpoint];
  if (!config) return jsonResponse({ error: `Unsupported API endpoint: ${endpoint}` }, { status: 404 });

  if (!scriptUrl) {
    if (isLocalHost()) return null;
    if (method === 'GET') return jsonResponse(EMPTY_DATA[config.collection]);
    return jsonResponse({ error: 'Chưa kết nối Google Apps Script URL trong mục Google Sheets.' }, { status: 400 });
  }

  // Protect all data-sensitive endpoints in bridge mode
  if (!isLocalHost()) {
    const authErr = requireAuthBridge(init);
    if (authErr) return authErr;
  }

  if (method === 'GET') {
    const force = parsed.searchParams.get('force') === 'true' || parsed.searchParams.get('refresh') === 'true';
    if (endpoint === 'staff') {
      const staffList = await loadStaffOnly(force);
      // Strip passwords from full staff list
      return jsonResponse(staffList.map(stripBridgePassword));
    }
    const allData = await loadAllData(force);
    return jsonResponse(allData[config.collection]);
  }

  if (method === 'POST' || method === 'PUT' || method === 'PATCH') {
    return upsertRecord(endpoint, key, method, init);
  }

  if (method === 'DELETE') {
    return deleteRecord(endpoint, key);
  }

  return jsonResponse({ error: `Unsupported method: ${method}` }, { status: 405 });
};

export const clearLocalCache = async (): Promise<void> => {
  cache = null;
  staffCache = null;
  pendingLoad = null;
  pendingLoadIsForce = false;
  pendingStaffLoad = null;
};

export const clearAllPersistedCache = async (): Promise<void> => {
  await clearLocalCache();
  await clearPersistedData();
};

const applySyncConfigRecord = (scriptUrl: string, scriptSecret?: string): boolean => {
  const trimmedUrl = String(scriptUrl || '').trim();
  if (!trimmedUrl) return false;
  setScriptUrl(trimmedUrl);
  const secret = String(scriptSecret || '').trim();
  if (secret) setScriptSecret(secret);
  return true;
};

export async function migrateLocalSyncConfigToServer(): Promise<boolean> {
  if (typeof window === 'undefined') return false;

  const localUrl = localStorage.getItem(SCRIPT_URL_STORAGE_KEY) || getScriptUrl();
  if (!localUrl) return false;

  const nativeFetch = (window as any).__CHD_NATIVE_FETCH__ as typeof fetch | undefined;
  const requestFetch = nativeFetch || window.fetch.bind(window);
  const localSecret = getScriptSecret();

  try {
    const migrateRes = await requestFetch('/api/sync-config/migrate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scriptUrl: localUrl, scriptSecret: localSecret }),
    });
    if (!migrateRes.ok) {
      const err = await migrateRes.json().catch(() => ({})) as { error?: string };
      console.warn('Failed to migrate sync config to server:', err.error || migrateRes.status);
      return false;
    }
    applySyncConfigRecord(localUrl, localSecret);
    return true;
  } catch (err) {
    console.warn('Failed to migrate sync config to server:', err);
    return false;
  }
}

export async function hydrateSyncConfigFromServer(): Promise<boolean> {
  if (typeof window === 'undefined') return false;

  const nativeFetch = (window as any).__CHD_NATIVE_FETCH__ as typeof fetch | undefined;
  const requestFetch = nativeFetch || window.fetch.bind(window);

  try {
    const res = await requestFetch('/api/sync-config');
    if (!res.ok) return false;
    const data = await res.json() as { scriptUrl?: string; scriptSecret?: string; isSynced?: boolean };

    if (data.scriptUrl) {
      return applySyncConfigRecord(data.scriptUrl, data.scriptSecret);
    }

    return migrateLocalSyncConfigToServer();
  } catch (err) {
    console.warn('Failed to hydrate sync config from server:', err);
    return false;
  }
}

export async function ensureSyncConfigHydrated(): Promise<boolean> {
  if (getScriptUrl()) {
    void migrateLocalSyncConfigToServer();
    return true;
  }
  return hydrateSyncConfigFromServer();
}

export const installAppsScriptFetchBridge = () => {
  if (typeof window === 'undefined') return;
  if ((window as any).__CHD_APPS_SCRIPT_FETCH_BRIDGE__) return;
  (window as any).__CHD_APPS_SCRIPT_FETCH_BRIDGE__ = true;

  hydrateBridgeSessions();

  const builtInUrl = String(viteEnv.VITE_GOOGLE_SCRIPT_URL || '').trim();
  if (builtInUrl && !localStorage.getItem(SCRIPT_URL_STORAGE_KEY)) {
    localStorage.setItem(SCRIPT_URL_STORAGE_KEY, builtInUrl);
  }
  const builtInSecret = String(
    viteEnv.VITE_GOOGLE_SCRIPT_SECRET || viteEnv.VITE_GOOGLE_SCRIPT_API_KEY || ''
  ).trim();
  if (builtInSecret && !localStorage.getItem(SCRIPT_SECRET_STORAGE_KEY)) {
    localStorage.setItem(SCRIPT_SECRET_STORAGE_KEY, builtInSecret);
  }

  const nativeFetch = window.fetch.bind(window);
  (window as any).__CHD_NATIVE_FETCH__ = nativeFetch;
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const handled = await handleApiRequest(input, init);
    if (handled) return handled;
    return nativeFetch(input, init);
  };
};
