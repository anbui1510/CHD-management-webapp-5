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

export async function clearAppStorage(options?: { preserveScriptConfig?: boolean }): Promise<void> {
  if (typeof window === 'undefined') return;

  const preserveScriptConfig = options?.preserveScriptConfig !== false;
  const preserved = preserveScriptConfig ? preserveLocalStorageValues() : {};

  localStorage.removeItem('CHD_AUTH_TOKEN');

  if (!preserveScriptConfig) {
    localStorage.clear();
  } else {
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (!key) continue;
      if (PRESERVE_LOCAL_KEYS.includes(key as (typeof PRESERVE_LOCAL_KEYS)[number])) continue;
      keysToRemove.push(key);
    }
    keysToRemove.forEach(key => localStorage.removeItem(key));
  }

  if (preserveScriptConfig) {
    restoreLocalStorageValues(preserved);
  }

  if ('caches' in window) {
    const keys = await caches.keys();
    await Promise.all(keys.map(key => caches.delete(key)));
  }

  if ('serviceWorker' in navigator) {
    const regs = await navigator.serviceWorker.getRegistrations();
    await Promise.all(regs.map(reg => reg.unregister()));
  }

  try {
    await deleteIndexedDb();
  } catch (err) {
    console.warn('Failed to delete IndexedDB:', err);
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
