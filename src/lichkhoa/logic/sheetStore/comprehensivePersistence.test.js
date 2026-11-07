import assert from 'node:assert';
import { exportTaskRows, importTaskRows } from './task.js';
import { mergeTasksPreserveLocalFields, mergeStaffPreserveLocalFields, mergeEntriesPreserveLocal } from './bundle.js';
import { mergeChdStaffIntoDept } from '../../auth/mergeChdStaff.js';
import { upgradeStoreFromTimMachSeed } from '../../store/dbStore.js';

console.log('--- COMPREHENSIVE PERSISTENCE TESTS ---');

// 1. Task fields: display, rotate, warn round-trip
console.log('TEST 1: Task display, rotate, warn export/import and merge');
const originalTasks = [
  {
    id: 'task_ttcc_phu',
    code: 'TTCC phụ',
    name: 'Thủ thuật cấp cứu (phụ)',
    category: 'THU_THUAT',
    display: 'week',
    rotate: true,
    warn: false,
    session: 'SANG_CHIEU',
    bgColor: '#ffeef0',
    textColor: '#990000',
  },
  {
    id: 'task_t1',
    code: 'T1*',
    name: 'Task 1 sao',
    category: 'CHUYEN_MON',
    display: 'lower',
    rotate: false,
    warn: true,
  },
  {
    id: 'task_sapk',
    code: 'sapk',
    name: 'Sáng phòng khám',
    category: 'PHONG_KHAM',
    display: 'both',
  },
  {
    id: 'task_t2',
    code: 'T2',
    name: 'Task 2',
    category: 'CHUYEN_MON',
  }
];

const exportedRows = exportTaskRows(originalTasks);
const reimportedTasks = importTaskRows(exportedRows);

const ttccPhu = reimportedTasks.find((t) => t.code === 'TTCC phụ');
assert(ttccPhu, 'TTCC phụ must exist after reimport');
assert.strictEqual(ttccPhu.display, 'week', 'display must be preserved as "week"');
assert.strictEqual(ttccPhu.rotate, true, 'rotate must be true');
assert.strictEqual(ttccPhu.warn, false, 'warn must be false');

const t1 = reimportedTasks.find((t) => t.code === 'T1*');
assert(t1, 'T1* must exist after reimport');
assert.strictEqual(t1.display, 'lower', 'T1* display must be "lower"');
assert.strictEqual(t1.rotate, false, 'T1* rotate must be false');
assert.strictEqual(t1.warn, true, 'T1* warn must be true');

// Test merge: remote tasks (older, missing display) merged with localTasks (having display)
const remoteTasksOlder = [
  {
    id: 'task_ttcc_phu',
    code: 'TTCC phụ',
    name: 'Thủ thuật cấp cứu (phụ)',
    category: 'THU_THUAT',
    // missing display, rotate, warn
  }
];
const mergedTasks = mergeTasksPreserveLocalFields(remoteTasksOlder, originalTasks);
const mergedTtcc = mergedTasks.find((t) => t.code === 'TTCC phụ');
assert(mergedTtcc, 'Merged TTCC phụ must exist');
assert.strictEqual(mergedTtcc.display, 'week', 'Merge must preserve local display="week"');
assert.strictEqual(mergedTtcc.rotate, true, 'Merge must preserve local rotate=true');
assert.strictEqual(mergedTtcc.warn, false, 'Merge must preserve local warn=false');

// Added tasks: T1*, sapk, T2 must survive the merge even if remote only had 1 task
assert(mergedTasks.some((t) => t.code === 'T1*'), 'T1* must be preserved in mergedTasks');
assert(mergedTasks.some((t) => t.code === 'sapk'), 'sapk must be preserved in mergedTasks');
assert(mergedTasks.some((t) => t.code === 'T2'), 'T2 must be preserved in mergedTasks');
console.log('TEST 1 PASSED: Task fields and added tasks are 100% preserved!');

// 2. BS Thao shortName resolution
console.log('TEST 2: BS Nguyễn Thanh Thảo shortName resolves to THẢO not THẢO2');
const deptWithSeedThao = {
  id: 'dept_tim_mach',
  name: 'Khoa Tim Mạch',
  staff: [
    // Seed doc_9
    { id: 'doc_9', name: 'Nguyễn Thanh Thảo', shortName: 'THẢO', source: 'local' }
  ],
  tasks: []
};
const chdStaffList = [
  {
    StaffKey: '109',
    StaffName: 'Nguyễn Thanh Thảo',
    Name: 'BS. Thảo',
    Role: 'Member',
    ShowInLichKhoa: 'On',
    Department: 'Nội Tim Mạch'
  }
];

const mergedDept = mergeChdStaffIntoDept(deptWithSeedThao, chdStaffList);
const bsThao = mergedDept.staff.find((s) => s.id === '109');
assert(bsThao, 'BS Thao (StaffKey 109) must exist in merged staff');
assert.strictEqual(bsThao.shortName, 'THẢO', `Expected shortName "THẢO", but got "${bsThao.shortName}"`);

// Also test recovery if shortName was previously saved as THẢO2
const deptWithThao2 = {
  id: 'dept_tim_mach',
  name: 'Khoa Tim Mạch',
  staff: [
    { id: '109', name: 'Nguyễn Thanh Thảo', shortName: 'THẢO2', source: 'chd' }
  ],
  tasks: []
};
const recoveredDept = mergeChdStaffIntoDept(deptWithThao2, chdStaffList);
const recoveredThao = recoveredDept.staff.find((s) => s.id === '109');
assert.strictEqual(recoveredThao.shortName, 'THẢO', `Expected auto-recovery to "THẢO", got "${recoveredThao.shortName}"`);
console.log('TEST 2 PASSED: BS Nguyễn Thanh Thảo shortName correctly resolves to THẢO!');

// 3. upgradeStoreFromTimMachSeed must never erase monthGrid when week grid is empty
console.log('TEST 3: upgradeStoreFromTimMachSeed preserves monthGrid even when week grid is empty');
const storeWithMonthGridOnly = {
  departments: [{ id: 'dept_tim_mach', name: 'Khoa Tim Mạch', staff: [], tasks: [] }],
  activeDeptId: 'dept_tim_mach',
  sheetsByDept: {
    dept_tim_mach: {
      activeSheetId: 'sheet_1',
      sheets: [
        {
          id: 'sheet_1',
          name: 'Sheet 1',
          startDate: '2026-11-02',
          grid: {}, // empty week grid
          monthGrid: {
            '2026-11-01|truc_ngay|S': 'THẢO',
            '2026-11-02|truc_ngay|S': 'LỢI',
          }
        }
      ]
    }
  }
};

const upgraded = upgradeStoreFromTimMachSeed(storeWithMonthGridOnly);
const upgradedSheet = upgraded.sheetsByDept.dept_tim_mach.sheets[0];
assert(upgradedSheet, 'Sheet must exist');
assert.strictEqual(upgradedSheet.monthGrid['2026-11-01|truc_ngay|S'], 'THẢO', 'Month cell 2026-11-01 must not be wiped');
assert.strictEqual(upgradedSheet.monthGrid['2026-11-02|truc_ngay|S'], 'LỢI', 'Month cell 2026-11-02 must not be wiped');
console.log('TEST 3 PASSED: upgradeStoreFromTimMachSeed preserves user month cells cleanly!');

// 4. Leave entries merge
console.log('TEST 4: Leave entries preservation');
const localLeaves = [
  { id: 'leave_nov_1', staffId: '109', shortName: 'THẢO', fromDate: '2026-11-15', toDate: '2026-11-17', type: 'P' },
  { id: 'leave_nov_2', staffId: '101', shortName: 'LỢI', fromDate: '2026-11-20', toDate: '2026-11-22', type: 'BÙ' }
];
const remoteLeavesEmpty = [];
const mergedLeaves = mergeEntriesPreserveLocal(remoteLeavesEmpty, localLeaves);
assert.strictEqual(mergedLeaves.length, 2, 'All local leaves must be preserved when remote is empty');
assert(mergedLeaves.some((l) => l.id === 'leave_nov_1'));
assert(mergedLeaves.some((l) => l.id === 'leave_nov_2'));
console.log('TEST 4 PASSED: Leave entries safely preserved!');

console.log('\n>>> ALL COMPREHENSIVE PERSISTENCE TESTS PASSED! <<<');
