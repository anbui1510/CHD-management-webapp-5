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

function foldName(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function isSamePerson(nameA, nameB) {
  if (!nameA || !nameB) return false;
  const fA = foldName(nameA);
  const fB = foldName(nameB);
  if (fA === fB) return true;
  // Bỏ tiền tố BS., Bác sĩ...
  const strip = (n) => n.replace(/^(bs\.?|bac\s*si|ths\.?|ts\.?|dd\.?)\s+/i, '').trim();
  return strip(fA) === strip(fB);
}

function deriveShortName(staff, used, reservedByOther = null, selfId = '', staffName = '') {
  const fromName = String(staff.StaffName || staff.Name || staff.StaffKey || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  let base = (fromName[fromName.length - 1] || staff.StaffKey || 'NV').toUpperCase().slice(0, 8);

  const isTaken = (candidate) => {
    if (used.has(candidate)) return true;
    if (reservedByOther) {
      const owner = reservedByOther.get(candidate);
      if (owner && owner.id !== String(selfId) && !isSamePerson(owner.name, staffName)) {
        return true;
      }
    }
    return false;
  };

  if (!isTaken(base)) return base;
  let i = 2;
  while (isTaken(`${base}${i}`)) i += 1;
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
  const byName = new Map(existing.map((s) => [foldName(s.name), s]));
  const byShort = new Map(existing.map((s) => [String(s.shortName || '').trim().toUpperCase(), s]));
  const localStaff = existing.filter((s) => isHandAddedLocalStaff(s));

  // Giữ ưu tiên shortName đã có cho chính chủ — tránh thành viên duyệt trước chiếm mất
  const reservedByOther = new Map();
  for (const s of existing) {
    const sn = String(s.shortName || '').trim().toUpperCase();
    if (sn) {
      reservedByOther.set(sn, { id: String(s.id), name: s.name });
    }
  }

  const usedShort = new Set();
  const next = [];

  for (const chd of chdStaffList || []) {
    if (!isActiveChdStaff(chd)) continue;
    const id = String(chd.StaffKey || '').trim();
    if (!id) continue;
    const prev = byId.get(id)
      || byName.get(foldName(chd.StaffName || chd.Name))
      || (chd.Name ? byShort.get(String(chd.Name).trim().toUpperCase()) : null)
      || {};
    const visible = parseShowInLichKhoa(chd.ShowInLichKhoa ?? prev.showInLichKhoa);
    if (!visible) continue;

    const targetName = String(chd.StaffName || chd.Name || prev.name || id);
    let shortName = String(prev.shortName || '').trim().toUpperCase();

    // Nếu tên viết tắt đang có đuôi số 2 (VD: THẢO2) nhưng tên gốc (THẢO) hoàn toàn chưa ai lấy -> phục hồi tên gốc
    const fromParts = targetName.trim().split(/\s+/).filter(Boolean);
    const baseCandidate = (fromParts[fromParts.length - 1] || '').toUpperCase().slice(0, 8);
    if (baseCandidate && shortName === `${baseCandidate}2` && !usedShort.has(baseCandidate)) {
      const owner = reservedByOther.get(baseCandidate);
      if (!owner || owner.id === String(id) || isSamePerson(owner.name, targetName)) {
        shortName = baseCandidate;
      }
    }

    if (!shortName || usedShort.has(shortName)) {
      shortName = deriveShortName(chd, usedShort, reservedByOther, id, targetName);
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
