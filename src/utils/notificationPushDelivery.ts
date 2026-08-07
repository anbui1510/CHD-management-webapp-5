const STORAGE_KEY = 'chd_os_push_delivered_v1';
const MAX_ENTRIES = 800;

export function getOsPushDeliveredKeys(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as unknown;
    return new Set(Array.isArray(parsed) ? parsed.map(String) : []);
  } catch {
    return new Set();
  }
}

export function hasOsPushBeenDelivered(notificationKey: string): boolean {
  const key = String(notificationKey || '').trim();
  if (!key) return false;
  return getOsPushDeliveredKeys().has(key);
}

export function markOsPushDelivered(notificationKey: string): void {
  const key = String(notificationKey || '').trim();
  if (!key) return;
  const keys = getOsPushDeliveredKeys();
  keys.add(key);
  localStorage.setItem(STORAGE_KEY, JSON.stringify([...keys].slice(-MAX_ENTRIES)));
}
