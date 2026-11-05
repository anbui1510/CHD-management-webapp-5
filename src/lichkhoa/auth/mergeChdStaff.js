import { MEMBER_DEFAULT } from '../logic/access.js';
import { formatShowInLichKhoa, parseShowInLichKhoa } from '../logic/showInLichKhoa.js';

function isActiveChdStaff(staff) {
  return staff && !String(staff.FireDate || '').trim();
}

function deriveShortName(staff, used) {
  const fromName = String(staff.StaffName || staff.Name || staff.StaffKey || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  let base = (fromName[fromName.length - 1] || staff.StaffKey || 'NV').toUpperCase().slice(0, 8);
  if (!used.has(base)) return base;
  let i = 2;
  while (used.has(`${base}${i}`)) i += 1;
  return `${base}${i}`;
}

function chdDepartmentLabel(chd) {
  return String(chd?.Department || '').trim();
}

/**
 * Merge CHD Staff list into schedule department staff (NhanSu).
 * Identity + Department + ShowInLichKhoa from CHD; preserve schedule fields on the row.
 */
export function mergeChdStaffIntoDept(dept, chdStaffList) {
  const existing = Array.isArray(dept?.staff) ? dept.staff : [];
  const byId = new Map(existing.map((s) => [String(s.id), s]));
  const usedShort = new Set();
  const next = [];

  for (const chd of chdStaffList || []) {
    if (!isActiveChdStaff(chd)) continue;
    const id = String(chd.StaffKey || '').trim();
    if (!id) continue;
    const prev = byId.get(id) || {};
    const visible = parseShowInLichKhoa(chd.ShowInLichKhoa ?? prev.showInLichKhoa);
    if (!visible) continue;

    let shortName = String(prev.shortName || '').trim().toUpperCase();
    if (!shortName || usedShort.has(shortName)) {
      shortName = deriveShortName(chd, usedShort);
    }
    usedShort.add(shortName);

    const isAdmin = chd.Role === 'Admin';
    const deptLabel = chdDepartmentLabel(chd) || String(prev.deptLabel || '').trim() || dept.name;

    next.push({
      ...prev,
      id,
      name: String(chd.Name || chd.StaffName || prev.name || id),
      shortName,
      email: String(chd.Email || prev.email || ''),
      loginEmail: '',
      title: prev.title || chd.Career || 'BS CK1',
      position: prev.position || 'BS Cột 2',
      dutyQuota: prev.dutyQuota ?? 6,
      buBalance: prev.buBalance ?? 0,
      phepBalance: prev.phepBalance ?? 12,
      accessRole: prev.accessRole || (isAdmin ? 'admin' : 'member'),
      access: prev.access || { ...MEMBER_DEFAULT, ...(isAdmin ? Object.fromEntries(
        Object.keys(MEMBER_DEFAULT).map((k) => [k, 'edit'])
      ) : {}) },
      deptId: dept.id,
      deptLabel,
      showInLichKhoa: formatShowInLichKhoa(true),
    });
  }

  return { ...dept, staff: next };
}

export function mergeChdStaffIntoStore(store, chdStaffList) {
  if (!store?.departments?.length) return store;
  return {
    ...store,
    departments: store.departments.map((dept) => mergeChdStaffIntoDept(dept, chdStaffList)),
  };
}
