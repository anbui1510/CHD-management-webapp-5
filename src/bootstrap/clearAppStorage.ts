const DB_NAME = 'chd_database_v5';
const STORE_NAME = 'cache_store';

const PRESERVE_LOCAL_KEYS = [
  'chd_apps_script_url',
  'chd_apps_script_secret',
  'CHD_APP_BUILD_ID',
  // Module 7 — giữ cache lịch/task qua deploy; Sheet vẫn là nguồn chính khi pull.
  'LICHKHOA_DATA_STORE_V1',
  'LICHKHOA_SEED_VERSION_V1',
  'LICHKHOA_CLOUD_META_V1',
  'LICHKHOA_SHEET_ID',
  'LICHKHOA_SHEET_URL',
] as const;

export function isPreservedLocalStorageKey(key: string, preserveAuth = true): boolean {
  if (!key) return false;
  // Cấu hình hạ tầng & Module 7
  if ((PRESERVE_LOCAL_KEYS as readonly string[]).includes(key)) return true;
  // Thông tin đăng nhập
  if (preserveAuth && (key === 'CHD_AUTH_TOKEN' || key === 'CHD_AUTH_STAFF_KEY' || key === 'CurrentStaffKey')) return true;
  // Cài đặt người dùng: Thời gian tự động đăng xuất & hoạt động
  if (key.startsWith('SessionTimeout_') || key.startsWith('LastActivity_')) return true;
  // Cài đặt người dùng: Tùy chọn thẻ Home & Truy cập nhanh
  if (key === 'home_selected_stats' || key === 'home_quick_shortcuts') return true;
  // Cài đặt người dùng: Mobile quick tabs
  if (key.startsWith('mobile_quick_tabs_')) return true;
  // Cài đặt người dùng: Trạng thái đóng nhắc nhở push/pwa
  if (key === 'push_prompt_dismissed' || key === 'pwa_install_dismissed' || key === 'notification_push_delivery_keys') return true;
  // Khóa lịch khoa
  if (key.startsWith('LICHKHOA_') || key.startsWith('TIM_MACH_')) return true;
  // Cache bản tin giao ban
  if (key.startsWith('chd_daily_brief_')) return true;
  return false;
}

function preserveLocalStorageValues(): Record<string, string> {
  const preserved: Record<string, string> = {};
  if (typeof localStorage === 'undefined') return preserved;
  for (let i = 0; i < localStorage.length; i += 1) {
    const key = localStorage.key(i);
    if (!key) continue;
    if (isPreservedLocalStorageKey(key, true)) {
      const value = localStorage.getItem(key);
      if (value !== null) preserved[key] = value;
    }
  }
  return preserved;
}

function restoreLocalStorageValues(values: Record<string, string>): void {
  for (const [key, value] of Object.entries(values)) {
    localStorage.setItem(key, value);
  }
}

async function deleteIndexedDb(): Promise<void> {
  if (typeof indexedDB === 'undefined') return;
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(DB_NAME);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () => resolve();
  });
}

export async function clearAppRuntimeCaches(): Promise<void> {
  if (typeof window === 'undefined') return;

  if ('caches' in window) {
    const keys = await caches.keys();
    await Promise.all(keys.map(key => caches.delete(key)));
  }

  if ('serviceWorker' in navigator) {
    const regs = await navigator.serviceWorker.getRegistrations();
    await Promise.all(regs.map(reg => reg.unregister()));
  }
}

export async function clearAppStorage(options?: {
  preserveScriptConfig?: boolean;
  preserveAuth?: boolean;
  preserveMedicalCache?: boolean;
  preserveUserSettings?: boolean;
}): Promise<void> {
  if (typeof window === 'undefined') return;

  const preserveScriptConfig = options?.preserveScriptConfig !== false;
  const preserveAuth = options?.preserveAuth === true;
  const preserveMedicalCache = options?.preserveMedicalCache === true;
  const preserveUserSettings = options?.preserveUserSettings !== false;
  const preserved = (preserveScriptConfig || preserveUserSettings) ? preserveLocalStorageValues() : {};

  const authToken = preserveAuth ? localStorage.getItem('CHD_AUTH_TOKEN') : null;
  const authStaffKey = preserveAuth ? localStorage.getItem('CHD_AUTH_STAFF_KEY') : null;

  if (!preserveAuth) {
    localStorage.removeItem('CHD_AUTH_TOKEN');
    localStorage.removeItem('CHD_AUTH_STAFF_KEY');
    localStorage.removeItem('CurrentStaffKey');
  }

  if (!preserveScriptConfig && !preserveUserSettings) {
    localStorage.clear();
  } else {
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (!key) continue;
      if (isPreservedLocalStorageKey(key, preserveAuth)) continue;
      keysToRemove.push(key);
    }
    keysToRemove.forEach(key => localStorage.removeItem(key));
  }

  if (preserveScriptConfig || preserveUserSettings) {
    restoreLocalStorageValues(preserved);
  }
  if (preserveAuth) {
    if (authToken) localStorage.setItem('CHD_AUTH_TOKEN', authToken);
    if (authStaffKey) localStorage.setItem('CHD_AUTH_STAFF_KEY', authStaffKey);
  }

  await clearAppRuntimeCaches();

  if (!preserveMedicalCache) {
    try {
      await deleteIndexedDb();
    } catch (err) {
      console.warn('Failed to delete IndexedDB:', err);
    }
  }
}

export function clearAppStorageAndReload(): void {
  void clearAppStorage().finally(() => {
    window.location.reload();
  });
}

if (typeof window !== 'undefined') {
  (window as any).__CHD_clearAppStorageAndReload = clearAppStorageAndReload;
}
