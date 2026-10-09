import type { Staff } from '../types';
import bundledStaffRecords from '../../data/staff.json';

function withoutPassword(staff: Staff): Staff {
  return { ...staff, Password: '' };
}

/** Roster shipped for the login dropdown. Passwords are never included. */
export const BUNDLED_STAFF: Staff[] = (bundledStaffRecords as Staff[]).map(withoutPassword);

export function getActiveBundledStaff(): Staff[] {
  return BUNDLED_STAFF.filter(staff => !String(staff.FireDate || '').trim());
}

export function mergeStaffWithBundledPasswords(staffList: Staff[]): Staff[] {
  const bundledByKey = new Map(BUNDLED_STAFF.map(staff => [String(staff.StaffKey || '').trim(), staff]));
  return staffList.map(staff => {
    const bundled = bundledByKey.get(String(staff.StaffKey || '').trim());
    const merged = bundled ? { ...bundled, ...staff } : { ...staff };
    return withoutPassword(merged);
  });
}
