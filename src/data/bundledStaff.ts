import type { Staff } from '../types';
import bundledStaffRecords from '../../data/staff.json';

/** Full staff roster shipped with the webapp bundle (offline / Cloudflare fallback). */
export const BUNDLED_STAFF: Staff[] = bundledStaffRecords as Staff[];

export function getActiveBundledStaff(): Staff[] {
  return BUNDLED_STAFF.filter(staff => !String(staff.FireDate || '').trim());
}

export function mergeStaffWithBundledPasswords(staffList: Staff[]): Staff[] {
  const bundledByKey = new Map(BUNDLED_STAFF.map(staff => [String(staff.StaffKey || '').trim(), staff]));
  return staffList.map(staff => {
    const bundled = bundledByKey.get(String(staff.StaffKey || '').trim());
    if (!bundled) return staff;
    if (String(staff.Password || '').trim()) return staff;
    return { ...bundled, ...staff, Password: bundled.Password };
  });
}
