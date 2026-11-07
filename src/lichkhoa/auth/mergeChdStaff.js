import { MEMBER_DEFAULT } from '../logic/access.js';
import { formatShowInLichKhoa, parseShowInLichKhoa } from '../logic/showInLichKhoa.js';
import { isHandAddedLocalStaff, markChdScheduleStaff, migrateTaskOwnerIds } from '../logic/staffSource.js';
import {
  getQuotaForLegacyTitle,
  getQuotaForPosition,
  normalizeLegacyPosition,
} from '../store/constants.js';

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
 * Chỉ giữ HV/hỗ trợ thêm tay (`local_*`). Bác sĩ seed/sao lưu `doc_*` bị bỏ — roster = Sheet Staff CHD.
 */
export function mergeChdStaffIntoDept(dept, chdStaffList) {
  const existing = Array.isArray(dept?.staff) ? dept.staff : [];
  const byId = new Map(existing.map((s) => [String(s.id), s]));
  const localStaff = existing.filter((s) => isHandAddedLocalStaff(s));
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
    const career = String(chd.Career || '').trim();
    const position = normalizeLegacyPosition(prev.position || prev.title || career || '');

    next.push(markChdScheduleStaff({
      ...prev,
      id,
      // Họ tên đầy đủ = StaffName (Sheet CHD); Name là tên ngắn có chức danh (BS. …).
      name: String(chd.StaffName || chd.Name || prev.name || id),
      shortName,
      email: String(chd.Email || prev.email || ''),
      loginEmail: '',
      title: prev.title || career || '',
      position,
      dutyQuota: prev.dutyQuota ?? getQuotaForPosition(position, getQuotaForLegacyTitle(career, 6)),
      buBalance: prev.buBalance ?? 0,
      phepBalance: prev.phepBalance ?? 12,
      accessRole: prev.accessRole || (isAdmin ? 'admin' : 'member'),
      access: prev.access || { ...MEMBER_DEFAULT, ...(isAdmin ? Object.fromEntries(
        Object.keys(MEMBER_DEFAULT).map((k) => [k, 'edit'])
      ) : {}) },
      deptId: dept.id,
      deptLabel,
      showInLichKhoa: formatShowInLichKhoa(true),
    }));
  }

  const chdIds = new Set(next.map((s) => String(s.id)));
  for (const local of localStaff) {
    if (chdIds.has(String(local.id))) continue;
    let shortName = String(local.shortName || '').trim().toUpperCase();
    if (!shortName) continue;
    if (usedShort.has(shortName)) {
      let i = 2;
      while (usedShort.has(`${shortName}${i}`)) i += 1;
      shortName = `${shortName}${i}`;
    }
    usedShort.add(shortName);
    next.push({
      ...local,
      source: 'local',
      shortName,
      deptId: local.deptId || dept.id,
      deptLabel: local.deptLabel || dept.name,
      showInLichKhoa: formatShowInLichKhoa(parseShowInLichKhoa(local.showInLichKhoa)),
    });
  }

  return {
    ...dept,
    staff: next,
    ...(dept?.tasks ? { tasks: migrateTaskOwnerIds(dept.tasks, next) } : {})
  };
}

export function mergeChdStaffIntoStore(store, chdStaffList) {
  if (!store?.departments?.length) return store;
  return {
    ...store,
    departments: store.departments.map((dept) => mergeChdStaffIntoDept(dept, chdStaffList)),
  };
}
