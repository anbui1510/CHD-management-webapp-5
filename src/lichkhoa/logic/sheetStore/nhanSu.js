import { NHAN_SU_HEADERS } from './constants.js';
import { normalizeAccess } from '../access.js';
import { objectsToRows, rowsToObjects } from './tableUtils.js';

/** TC-F304-02 */
export function importNhanSuRows(rows) {
  const objs = rowsToObjects(rows, NHAN_SU_HEADERS);
  return objs.map((row) => {
    const access = normalizeAccess({
      week: row.access_week,
      month: row.access_month,
      leave: row.access_leave,
      study: row.access_study,
      calendar: row.access_calendar,
      dashboard: row.access_dashboard,
      staff: row.access_staff,
      tasks: row.access_tasks,
    });
    const staff = {
      id: String(row.id || '').trim(),
      name: String(row.name || '').trim(),
      shortName: String(row.shortName || '').trim(),
      title: String(row.title || '').trim(),
      dutyQuota: Number(row.dutyQuota) || 0,
      buBalance: Number(row.buBalance) || 0,
      phepBalance: Number(row.phepBalance) || 0,
      email: String(row.email || '').trim(),
      loginEmail: String(row.loginEmail || '').trim(),
      position: String(row.position || '').trim(),
    };
    if (row.deptId) staff.deptId = String(row.deptId).trim();
    if (row.deptLabel) staff.deptLabel = String(row.deptLabel).trim();
    if (row.accessRole) staff.accessRole = String(row.accessRole).trim();
    if (Object.values(access).some((v) => v !== undefined)) staff.access = access;
    return staff;
  }).filter((s) => s.id);
}

export function exportNhanSuRows(staffList) {
  const objects = (staffList || []).map((s) => {
    const access = s.access || {};
    return {
      id: s.id,
      name: s.name,
      shortName: s.shortName,
      title: s.title,
      dutyQuota: s.dutyQuota,
      buBalance: s.buBalance,
      phepBalance: s.phepBalance,
      email: s.email,
      loginEmail: s.loginEmail || '',
      position: s.position || '',
      deptId: s.deptId || '',
      deptLabel: s.deptLabel || '',
      accessRole: s.accessRole || '',
      access_week: access.week ?? '',
      access_month: access.month ?? '',
      access_leave: access.leave ?? '',
      access_study: access.study ?? '',
      access_calendar: access.calendar ?? '',
      access_dashboard: access.dashboard ?? '',
      access_staff: access.staff ?? '',
      access_tasks: access.tasks ?? '',
    };
  });
  return objectsToRows(objects, NHAN_SU_HEADERS);
}

export function findStaffByEmail(staffList, email) {
  const e = String(email || '').trim().toLowerCase();
  if (!e) return null;
  return (staffList || []).find((s) => {
    const login = String(s.loginEmail || '').trim().toLowerCase();
    const em = String(s.email || '').trim().toLowerCase();
    return login === e || (!login && em === e);
  }) || null;
}
