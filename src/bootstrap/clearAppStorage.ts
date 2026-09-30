const DB_NAME = 'chd_database_v5';
const STORE_NAME = 'cache_store';

const PRESERVE_LOCAL_KEYS = [
  'chd_apps_script_url',
  'chd_apps_script_secret',
  'CHD_APP_BUILD_ID',
] as const;

function preserveLocalStorageValues(): Record<string, string> {
  const preserved: Record<string, string> = {};
  for (const key of PRESERVE_LOCAL_KEYS) {
    const value = localStorage.getItem(key);
    if (value) preserved[key] = value;
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
}): Promise<void> {
  if (typeof window === 'undefined') return;

  const preserveScriptConfig = options?.preserveScriptConfig !== false;
  const preserveAuth = options?.preserveAuth === true;
  const preserveMedicalCache = options?.preserveMedicalCache === true;
  const preserved = preserveScriptConfig ? preserveLocalStorageValues() : {};

  const authToken = preserveAuth ? localStorage.getItem('CHD_AUTH_TOKEN') : null;
  const authStaffKey = preserveAuth ? localStorage.getItem('CHD_AUTH_STAFF_KEY') : null;

  if (!preserveAuth) {
    localStorage.removeItem('CHD_AUTH_TOKEN');
    localStorage.removeItem('CHD_AUTH_STAFF_KEY');
  }

  if (!preserveScriptConfig) {
    localStorage.clear();
  } else {
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (!key) continue;
      if (PRESERVE_LOCAL_KEYS.includes(key as (typeof PRESERVE_LOCAL_KEYS)[number])) continue;
      // preserveAuth must win over the generic key sweep (token is not in PRESERVE_LOCAL_KEYS)
      if (preserveAuth && (key === 'CHD_AUTH_TOKEN' || key === 'CHD_AUTH_STAFF_KEY')) continue;
      keysToRemove.push(key);
    }
    keysToRemove.forEach(key => localStorage.removeItem(key));
  }

  if (preserveScriptConfig) {
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
