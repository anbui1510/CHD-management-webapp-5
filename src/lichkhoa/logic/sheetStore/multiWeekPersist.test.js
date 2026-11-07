import assert from 'node:assert/strict';
import { exportStoreToTabs, importTabsToStore } from './bundle.js';

const cell = (S) => ({ S, R: '', C: '', T: '' });
const mk = (startDate, grid, weeks) => ({
  activeDeptId: 'd',
  departments: [{ id: 'd', name: 'K', code: 'K', staff: [], tasks: [], leaveEntries: [], studyEntries: [] }],
  sheetsByDept: { d: { activeSheetId: 's1', sheets: [{ id: 's1', name: 'Sheet 1', startDate, grid, weeks }] } },
});

// Local: đang ở tuần B (11-09), đã có tuần A (11-02) trong weeks
const local = mk('2026-11-09', { a: [cell('B1')] }, { '2026-11-02': { grid: { a: [cell('A1'), cell('A2')] } } });
const tabs = exportStoreToTabs(local);

// 1) Export → import không mất dữ liệu / không lẫn tuần (không có local)
const fresh = importTabsToStore(tabs, null).sheetsByDept.d.sheets[0];
assert.equal(fresh.startDate, '2026-11-09');
assert.equal(fresh.grid.a[0].S, 'B1');
assert.equal(fresh.grid.a[1], undefined, 'tuần A không được lẫn vào tuần B');
assert.equal(fresh.weeks['2026-11-02'].grid.a[1].S, 'A2');

// 2) Local đã nhảy sang tuần C, remote cũ ở tuần B → pull không được kéo về tuần B, không mất tuần nào
const local2 = mk('2026-11-16', { a: [cell('C1')] }, {
  '2026-11-02': { grid: { a: [cell('A1'), cell('A2')] } },
  '2026-11-09': { grid: { a: [cell('B1')] } },
});
const m = importTabsToStore(tabs, local2).sheetsByDept.d.sheets[0];
assert.equal(m.startDate, '2026-11-16');
assert.equal(m.grid.a[0].S, 'C1');
assert.equal(m.weeks['2026-11-09'].grid.a[0].S, 'B1');
assert.equal(m.weeks['2026-11-02'].grid.a[1].S, 'A2');

// 3) Local sửa ô (đã có giá trị ở remote) → local thắng
const local3 = mk('2026-11-09', { a: [cell('SỬA')] }, { '2026-11-02': { grid: { a: [cell('A1'), cell('A2')] } } });
const m3 = importTabsToStore(tabs, local3).sheetsByDept.d.sheets[0];
assert.equal(m3.grid.a[0].S, 'SỬA');
console.log('multiWeekPersist OK');
