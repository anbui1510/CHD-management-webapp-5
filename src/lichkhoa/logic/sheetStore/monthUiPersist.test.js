/**
 * Node test: Month schedule persistence, export/import round-trip,
 * and merge preservation when remote LichThang is empty or has differing sheet IDs.
 * Run: node src/lichkhoa/logic/sheetStore/monthUiPersist.test.js
 */
import { exportStoreToTabs, importTabsToStore } from './bundle.js';
import { exportMonthRows, importMonthRows, applyMonthToSheet } from './month.js';
import { SHEET_TABS, MONTH_HEADERS } from './constants.js';

function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'assertion failed');
}

const sheetId = 'sheet_test_tim_mach_1';
const localStore = {
  activeDeptId: 'dept_tim_mach',
  departments: [{
    id: 'dept_tim_mach',
    name: 'Khoa Tim Mạch',
    code: 'TIM_MACH',
    staff: [],
    tasks: [],
    leaveEntries: [],
    studyEntries: [],
  }],
  sheetsByDept: {
    dept_tim_mach: {
      activeSheetId: sheetId,
      sheets: [{
        id: sheetId,
        name: 'Sheet 1',
        startDate: '2026-11-03',
        monthKey: '2026-11',
        monthGrid: {
          '2026-11-01|truc_ngay|S': 'BS An',
          '2026-11-02|truc_ngay|S': 'BS Binh',
          '2026-11-03|c1|S': 'BS Cuong',
        },
        monthRoles: [
          { key: 'truc_ngay', label: 'Trực Ngày' },
          { key: 'c1', label: 'Cột 1' },
        ],
        monthColumnOrder: ['c1', 'c2'],
        monthColumnTitles: { c1: 'Cột 1' },
        monthMerges: [{ s: { r: 1, c: 1 }, e: { r: 1, c: 2 } }],
        grid: {},
        weeks: {},
      }],
    },
  },
};

// 1. Export round-trip
const tabs = exportStoreToTabs(localStore);
const monthRows = tabs[SHEET_TABS.LICH_THANG];
assert(monthRows && monthRows.length > 1, 'exportStoreToTabs generates LichThang rows');

const importedMonth = importMonthRows(monthRows);
const bucket = importedMonth.get(sheetId);
assert(bucket, 'importMonthRows finds bucket for sheetId');
assert(bucket.monthGrid['2026-11-01|truc_ngay|S'] === 'BS An', 'importMonthRows restores cell value');
assert(bucket.monthKey === '2026-11', 'importMonthRows restores monthKey');
assert(bucket.monthRoles?.length === 2, 'importMonthRows restores monthRoles');

// 2. Remote sheet has EMPTY LichThang -> importTabsToStore MUST preserve local monthGrid
const remoteTabsEmptyMonth = {
  ...tabs,
  [SHEET_TABS.LICH_THANG]: [MONTH_HEADERS],
};
const mergedFromEmpty = importTabsToStore(remoteTabsEmptyMonth, localStore);
const sheetAfterEmptyRemote = mergedFromEmpty.sheetsByDept.dept_tim_mach.sheets[0];
assert(
  sheetAfterEmptyRemote.monthGrid?.['2026-11-01|truc_ngay|S'] === 'BS An',
  'merge keeps local monthGrid when remote LichThang is empty'
);
assert(
  sheetAfterEmptyRemote.monthRoles?.length === 2,
  'merge keeps local monthRoles when remote LichThang is empty'
);
assert(
  sheetAfterEmptyRemote.monthKey === '2026-11',
  'merge keeps local monthKey when remote LichThang is empty'
);

// 3. Remote sheet has differing sheetId -> fallback matches by name/index
const remoteTabsDiffSheetId = {
  ...tabs,
  [SHEET_TABS.LICH_THANG]: tabs[SHEET_TABS.LICH_THANG].map((row, i) => {
    if (i === 0) return row;
    const next = [...row];
    next[1] = 'sheet_remote_diff_99'; // row.sheetId
    return next;
  }),
};
const mergedFromDiffId = importTabsToStore(remoteTabsDiffSheetId, localStore);
const sheetAfterDiffId = mergedFromDiffId.sheetsByDept.dept_tim_mach.sheets[0];
assert(
  sheetAfterDiffId.monthGrid?.['2026-11-01|truc_ngay|S'] === 'BS An',
  'fallback preserves/matches monthGrid even when sheetId differs'
);

// 4. Remote has partial cells + local has newer local cells -> local cells preserved
const localWithNewerEdits = {
  ...localStore,
  sheetsByDept: {
    dept_tim_mach: {
      activeSheetId: sheetId,
      sheets: [{
        ...localStore.sheetsByDept.dept_tim_mach.sheets[0],
        monthGrid: {
          '2026-11-01|truc_ngay|S': 'BS An',
          '2026-11-02|truc_ngay|S': 'BS Dung Mới', // edited locally
          '2026-11-04|truc_ngay|S': 'BS Em', // new local entry
        },
      }],
    },
  },
};
const mergedWithNewer = importTabsToStore(tabs, localWithNewerEdits);
const sheetAfterNewer = mergedWithNewer.sheetsByDept.dept_tim_mach.sheets[0];
assert(
  sheetAfterNewer.monthGrid?.['2026-11-02|truc_ngay|S'] === 'BS Dung Mới',
  'local edited month cell wins over older remote cell'
);
assert(
  sheetAfterNewer.monthGrid?.['2026-11-04|truc_ngay|S'] === 'BS Em',
  'new local month cell preserved on merge'
);

console.log('monthUiPersist.test.js: ok');
