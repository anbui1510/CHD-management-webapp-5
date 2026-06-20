import type { ActiveMenuId } from '../config/navigation';

export const DEFAULT_MOBILE_QUICK_SLOTS: ActiveMenuId[] = ['results-staff', 'schedule-tt', 'patients'];
export const MOBILE_QUICK_SLOT_COUNT = 3;

export function getMobileQuickTabsStorageKey(staffKey: string) {
  return `chd-v5-mobile-quick-tabs-${staffKey}`;
}

export function loadMobileQuickTabs(staffKey: string): ActiveMenuId[] {
  try {
    const raw = localStorage.getItem(getMobileQuickTabsStorageKey(staffKey));
    if (!raw) return [...DEFAULT_MOBILE_QUICK_SLOTS];
    const parsed = JSON.parse(raw) as ActiveMenuId[];
    if (Array.isArray(parsed) && parsed.length === MOBILE_QUICK_SLOT_COUNT) {
      return parsed;
    }
  } catch {
    // ignore corrupt storage
  }
  return [...DEFAULT_MOBILE_QUICK_SLOTS];
}

export function saveMobileQuickTabs(staffKey: string, slots: ActiveMenuId[]) {
  localStorage.setItem(getMobileQuickTabsStorageKey(staffKey), JSON.stringify(slots));
}

/** Pin a module into the quick-access row (replaces the last slot if new). */
export function pinMobileQuickTab(slots: ActiveMenuId[], menuId: ActiveMenuId): ActiveMenuId[] {
  if (menuId === 'home') return slots;
  if (slots.includes(menuId)) return slots;
  const next = [...slots];
  next[MOBILE_QUICK_SLOT_COUNT - 1] = menuId;
  return next;
}
