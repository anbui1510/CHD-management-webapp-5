import { SCHEMA_VERSION, SHEET_TABS } from './constants.js';
import { exportLeaveRows, exportStudyRows, importLeaveRows, importStudyRows } from './entries.js';
import { applyMonthToSheet, exportMonthRows, importMonthRows } from './month.js';
import { exportNhanSuRows, importNhanSuRows } from './nhanSu.js';
import { exportTaskRows, importTaskRows } from './task.js';
import { metaObjectToRows, metaRowsToObject } from './tableUtils.js';
import { exportWeekRows, importWeekRows } from './week.js';

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
  sheets = sheets.map((sh) => applyMonthToSheet(sh, monthBySheet.get(sh.id)));

  const department = {
    ...prevDept,
    id: deptId,
    name: meta.deptName || prevDept.name,
    code: meta.deptCode || prevDept.code,
    staff: staff.length ? staff : prevDept.staff,
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
