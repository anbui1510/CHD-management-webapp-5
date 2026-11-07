import { SCHEMA_VERSION, SHEET_TABS } from './constants.js';
import { exportLeaveRows, exportStudyRows, importLeaveRows, importStudyRows } from './entries.js';
import { applyMonthToSheet, exportMonthRows, importMonthRows } from './month.js';
import { exportNhanSuRows, importNhanSuRows } from './nhanSu.js';
import { exportTaskRows, importTaskRows } from './task.js';
import { metaObjectToRows, metaRowsToObject } from './tableUtils.js';
import { exportWeekRows, importWeekRows } from './week.js';
import { purgeBackupImportedStaff } from '../staffSource.js';

/**
 * Trường lịch tuần/tháng — round-trip qua sheet_meta.value hoặc merge từ local.
 * Thanh công cụ (cellStyles), merge ô, freeze, phân công phòng… thuộc nhóm này.
 */
const SHEET_MERGE_PRESERVE_KEYS = [
  'roomTable', 'roomColumns', 'roomAssignments',
  'cellStyles', 'weekMerges', 'monthMerges', 'freeze',
  'warnings', 'roomWarnings', 'buGrants', 'buPosted', 'leaveCuts',
  'cathGrid', 'cathRoles',
];

function isEmptyPreserveValue(value) {
  if (value == null) return true;
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === 'object') return Object.keys(value).length === 0;
  return false;
}

function mergeSheetsPreserveLocalFields(remoteSheets, localSheets) {
  if (!Array.isArray(remoteSheets) || !remoteSheets.length) return remoteSheets;
  const byId = new Map((localSheets || []).filter(Boolean).map((sh) => [sh.id, sh]));
  return remoteSheets.map((sh) => {
    const prev = byId.get(sh.id);
    if (!prev) return sh;
    const patch = {};
    for (const key of SHEET_MERGE_PRESERVE_KEYS) {
      if (!(key in prev) || isEmptyPreserveValue(prev[key])) continue;
      const remoteVal = sh[key];
      if (isEmptyPreserveValue(remoteVal)) {
        // Sheet chưa có / trống → giữ bản máy.
        patch[key] = prev[key];
        continue;
      }
      // cellStyles: luôn gộp, local thắng key trùng (tránh pull ~2s xóa format vừa tô).
      if (key === 'cellStyles' && typeof remoteVal === 'object' && typeof prev[key] === 'object') {
        patch[key] = { ...remoteVal, ...prev[key] };
      }
      // Khác (roomTable, merges…): Sheet đã có thì giữ remote (đã nằm trên sh).
    }
    return Object.keys(patch).length ? { ...sh, ...patch } : sh;
  });
}

/** Giữ studyFrom/studyTo/position lịch khi NhanSu Sheet chưa có cột hoặc để trống. */
function mergeStaffPreserveLocalFields(remoteStaff, localStaff) {
  if (!Array.isArray(remoteStaff) || !remoteStaff.length) return remoteStaff;
  const byId = new Map((localStaff || []).filter(Boolean).map((s) => [String(s.id), s]));
  return remoteStaff.map((s) => {
    const prev = byId.get(String(s.id));
    if (!prev) return s;
    const next = { ...s };
    if (!next.studyFrom && prev.studyFrom) next.studyFrom = prev.studyFrom;
    if (!next.studyTo && prev.studyTo) next.studyTo = prev.studyTo;
    if (!String(next.position || '').trim() && prev.position) next.position = prev.position;
    if (next.dutyQuota == null && prev.dutyQuota != null) next.dutyQuota = prev.dutyQuota;
    return next;
  });
}

/**
 * @param {Record<string, string[][]>} tabs — tên tab → values (含 header)
 * @param {object} baseStore — store hiện tại (giữ dept id / sheets phụ nếu thiếu tab)
 */
export function importTabsToStore(tabs, baseStore = null) {
  const meta = metaRowsToObject(tabs[SHEET_TABS.META] || []);
  const staff = importNhanSuRows(tabs[SHEET_TABS.NHAN_SU] || []);
  const tasks = importTaskRows(tabs[SHEET_TABS.TASK] || []);
  const leaveEntries = importLeaveRows(tabs[SHEET_TABS.LICH_NGHI] || []);
  const studyEntries = importStudyRows(tabs[SHEET_TABS.LICH_HOC] || []);
  const weekBlock = importWeekRows(tabs[SHEET_TABS.LICH_TUAN] || []);
  const monthBySheet = importMonthRows(tabs[SHEET_TABS.LICH_THANG] || []);

  const deptId = meta.activeDeptId || baseStore?.activeDeptId || 'dept_tim_mach';
  const prevDept = baseStore?.departments?.find((d) => d.id === deptId)
    || baseStore?.departments?.[0]
    || { id: deptId, name: meta.deptName || 'Khoa', code: meta.deptCode || 'DEPT', staff: [], tasks: [] };

  let sheets = weekBlock.sheets?.length ? weekBlock.sheets : (baseStore?.sheetsByDept?.[deptId]?.sheets || []);
  const prevSheets = baseStore?.sheetsByDept?.[deptId]?.sheets;
  sheets = mergeSheetsPreserveLocalFields(sheets, prevSheets);
  sheets = sheets.map((sh) => applyMonthToSheet(sh, monthBySheet.get(sh.id)));

  // Không fallback sang staff seed/doc_* khi NhanSu trống — CHD merge sẽ điền từ Sheet Staff.
  const mergedStaff = staff.length
    ? mergeStaffPreserveLocalFields(staff, purgeBackupImportedStaff(prevDept.staff))
    : purgeBackupImportedStaff(prevDept.staff).filter((s) => String(s.id || '').startsWith('local_'));

  const department = {
    ...prevDept,
    id: deptId,
    name: meta.deptName || prevDept.name,
    code: meta.deptCode || prevDept.code,
    staff: purgeBackupImportedStaff(mergedStaff),
    tasks: tasks.length ? tasks : prevDept.tasks,
    leaveEntries: leaveEntries.length ? leaveEntries : (prevDept.leaveEntries || []),
    studyEntries: studyEntries.length ? studyEntries : (prevDept.studyEntries || []),
  };

  const sheetsByDept = {
    ...(baseStore?.sheetsByDept || {}),
    [deptId]: {
      activeSheetId: weekBlock.activeSheetId || baseStore?.sheetsByDept?.[deptId]?.activeSheetId || sheets[0]?.id,
      sheets,
    },
  };

  return {
    ...(baseStore || {}),
    activeDeptId: deptId,
    departments: [
      department,
      ...(baseStore?.departments || []).filter((d) => d.id !== deptId),
    ],
    sheetsByDept,
    _sheetMeta: { schemaVersion: SCHEMA_VERSION, updatedAt: meta.updatedAt || null },
  };
}

export function exportStoreToTabs(store) {
  const deptId = store.activeDeptId || store.departments?.[0]?.id;
  const dept = store.departments?.find((d) => d.id === deptId) || store.departments?.[0];
  const deptSheets = store.sheetsByDept?.[deptId];

  const meta = {
    schemaVersion: SCHEMA_VERSION,
    updatedAt: new Date().toISOString(),
    activeDeptId: deptId,
    deptName: dept?.name || '',
    deptCode: dept?.code || '',
  };

  return {
    [SHEET_TABS.META]: metaObjectToRows(meta),
    [SHEET_TABS.NHAN_SU]: exportNhanSuRows(dept?.staff),
    [SHEET_TABS.TASK]: exportTaskRows(dept?.tasks),
    [SHEET_TABS.LICH_NGHI]: exportLeaveRows(dept?.leaveEntries),
    [SHEET_TABS.LICH_HOC]: exportStudyRows(dept?.studyEntries),
    [SHEET_TABS.LICH_TUAN]: exportWeekRows(deptSheets),
    [SHEET_TABS.LICH_THANG]: exportMonthRows(deptSheets),
    [SHEET_TABS.DASHBOARD]: [['metric', 'staffId', 'label', 'value', 'updatedAt']],
  };
}
