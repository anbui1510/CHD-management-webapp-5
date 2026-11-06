/**
 * Node smoke test: sheet_meta.value round-trips cellStyles; merge keeps local paints.
 * Run: node src/lichkhoa/logic/sheetStore/weekUiPersist.test.js
 */
import { exportWeekRows, importWeekRows } from './week.js';
import { importTabsToStore, exportStoreToTabs } from './bundle.js';
import { SHEET_TABS } from './constants.js';

function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'assertion failed');
}

const sheetId = 'sheet_test_1';
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
        grid: { s1: [{ S: 'A', R: '', C: '', T: '' }] },
        weeks: {},
        cellStyles: { 'w|s1|0|S': { bold: true, bg: '#ff0000' } },
        roomTable: { matrix: [['x']], labels: ['BS'], colWidths: [80], rowHeights: [28] },
      }],
    },
  },
};

const tabs = exportStoreToTabs(localStore);
const weekRows = tabs[SHEET_TABS.LICH_TUAN];
assert(weekRows.length > 1, 'export week rows');
const meta = weekRows.find((row, i) => i > 0 && row[0] === 'sheet_meta') || weekRows[1];
assert(String(meta[meta.length - 1] || '').includes('cellStyles'), 'sheet_meta.value includes cellStyles JSON');

const imported = importWeekRows(weekRows);
assert(imported.sheets[0].cellStyles?.['w|s1|0|S']?.bold === true, 'importWeekRows restores cellStyles');
assert(imported.sheets[0].roomTable?.matrix?.[0]?.[0] === 'x', 'importWeekRows restores roomTable');

// Pull with empty remote UI + local paints → merge keeps local
const remoteTabs = exportStoreToTabs({
  ...localStore,
  sheetsByDept: {
    dept_tim_mach: {
      activeSheetId: sheetId,
      sheets: [{
        id: sheetId,
        name: 'Sheet 1',
        startDate: '2026-11-03',
        grid: { s1: [{ S: 'B', R: '', C: '', T: '' }] },
        weeks: {},
      }],
    },
  },
});
// Strip UI from remote export by clearing value on sheet_meta
const remoteWeek = remoteTabs[SHEET_TABS.LICH_TUAN].map((row, index) => {
  if (index === 0) return row;
  if (row[0] === 'sheet_meta') return row.map((cell, col) => (col === row.length - 1 ? '' : cell));
  return row;
});
remoteTabs[SHEET_TABS.LICH_TUAN] = remoteWeek;

const merged = importTabsToStore(remoteTabs, localStore);
const mergedSheet = merged.sheetsByDept.dept_tim_mach.sheets[0];
assert(mergedSheet.cellStyles?.['w|s1|0|S']?.bold === true, 'merge preserves local cellStyles when remote empty');
assert(mergedSheet.roomTable?.matrix?.[0]?.[0] === 'x', 'merge preserves local roomTable when remote empty');

// Remote has styles + local has newer key → both present, local wins conflict
const localWithExtra = {
  ...localStore,
  sheetsByDept: {
    dept_tim_mach: {
      activeSheetId: sheetId,
      sheets: [{
        ...localStore.sheetsByDept.dept_tim_mach.sheets[0],
        cellStyles: {
          'w|s1|0|S': { bold: true, bg: '#00ff00' },
          'w|s1|0|R': { italic: true },
        },
      }],
    },
  },
};
const remoteWithStyles = exportStoreToTabs(localStore);
const merged2 = importTabsToStore(remoteWithStyles, localWithExtra);
const styles2 = merged2.sheetsByDept.dept_tim_mach.sheets[0].cellStyles;
assert(styles2['w|s1|0|S']?.bg === '#00ff00', 'local cellStyles win on conflict');
assert(styles2['w|s1|0|R']?.italic === true, 'local-only style keys kept');

console.log('weekUiPersist.test.js: ok');
