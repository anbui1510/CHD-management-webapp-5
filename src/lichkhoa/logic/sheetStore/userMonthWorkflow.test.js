import assert from 'node:assert/strict';
import { generateWeeklySchedule } from '../schedulerEngine.js';
import { exportStoreToTabs, importTabsToStore } from './bundle.js';
import seed from '../../data/tim-mach-seed.json' with { type: 'json' };

console.log('--- RUNNING USER MONTH WORKFLOW & POURING TEST ---');

// 1. Staff and tasks from seed + custom local staff (Nguyễn Thái Hưng)
const baseStaff = [
  ...seed.department.staff,
  {
    id: 'local_hung_123',
    name: 'Nguyễn Thái Hưng',
    shortName: 'HƯNG',
    career: 'Bác sĩ',
    source: 'local_manual',
    showInLichKhoa: true
  }
];
const taskList = seed.department.tasks;

// 2. User custom month roles (from screenshot: TC, TK1, C1, SN, RO, TC, SA, TT chính, TT phụ, TTCC phụ)
const monthRoles = [
  { key: 'truc_chinh', label: 'TC' },
  { key: 'truc_kem', label: 'TK1' },
  { key: 'cot1', label: 'C1' },
  { key: 'sn', label: 'SN' },
  { key: 'ro', label: 'RO' },
  { key: 'tc', label: 'TC' },
  { key: 'sa', label: 'SA' },
  { key: 'tt_chinh', label: 'TT chính' },
  { key: 'tt_phu', label: 'TT phụ' },
  { key: 'ttcc', label: 'TTCC phụ' }
];

// User inputs with doctor prefixes and formats
const monthGrid = {
  '2026-11-09|truc_chinh|S': 'BS. ÂN',
  '2026-11-09|truc_chinh|C': 'BS. ÂN',
  '2026-11-09|truc_kem|S': 'Bs. Thảo',
  '2026-11-09|truc_kem|C': 'Bs. Thảo',
  '2026-11-09|cot1|S': 'BS. Nguyễn Thái Hưng',
  '2026-11-09|cot1|C': 'BS. Nguyễn Thái Hưng',
  '2026-11-10|truc_chinh|S': 'BS ÂN',
  '2026-11-10|truc_chinh|C': 'BS ÂN',
};

// 3. Run auto-scheduler for week starting 2026-11-09
const scheduleRes = generateWeeklySchedule({
  startDate: '2026-11-09',
  staffList: baseStaff,
  taskList,
  monthGrid,
  monthRoles,
  daySessions: ['S', 'C'],
  leaveEntries: [],
  studyEntries: [],
  roomTable: { matrix: [] },
  sheets: []
});

// Verify BS. ÂN receives duty tasks
const anDay0 = scheduleRes.grid['ÂN']?.[0];
assert(anDay0, 'Doctor ÂN should have day 0 schedule');
assert(anDay0.S === 'TN', `Doctor ÂN day 0 S should be TN, got ${anDay0.S}`);
assert(anDay0.C === 'VG', `Doctor ÂN day 0 C should be VG, got ${anDay0.C}`);

// Verify Bs. Thảo receives TK1
const thaoDay0 = scheduleRes.grid['THẢO']?.[0];
assert(thaoDay0, 'Doctor THẢO should have day 0 schedule');
assert(thaoDay0.S === 'TK1', `Doctor THẢO day 0 S should be TK1, got ${thaoDay0.S}`);
assert(thaoDay0.C === 'TK1', `Doctor THẢO day 0 C should be TK1, got ${thaoDay0.C}`);

// Verify BS. Nguyễn Thái Hưng receives C1 / VG
const hungDay0 = scheduleRes.grid['HƯNG']?.[0];
assert(hungDay0, 'Doctor HƯNG should have day 0 schedule');
assert(hungDay0.S === 'TN', `Doctor HƯNG day 0 S should be TN, got ${hungDay0.S}`);
assert(hungDay0.C === 'VG', `Doctor HƯNG day 0 C should be VG, got ${hungDay0.C}`);

// Verify Tuesday (day 1) RT (ra trực) for ÂN after Monday VG
const anDay1 = scheduleRes.grid['ÂN']?.[1];
assert(anDay1, 'Doctor ÂN should have day 1 schedule');
assert(anDay1.isRT === true, 'Doctor ÂN should be marked ra trực on day 1');

console.log('STEP 1 PASSED: Auto-scheduler correctly poured month data with prefixes to week grid!');

// 4. Test Store Persistence across multiple sheets and remote pulls
const deptId = 'dept_tim_mach';
const initialStore = {
  activeDeptId: deptId,
  departments: [{
    id: deptId,
    name: 'Khoa Tim Mạch',
    code: 'TIM_MACH',
    staff: baseStaff,
    tasks: taskList,
    leaveEntries: [],
    studyEntries: [],
  }],
  sheetsByDept: {
    [deptId]: {
      activeSheetId: 'sheet_custom_user_week',
      sheets: [
        {
          id: 'sheet_dept_tim_mach_1',
          name: 'Sheet 1',
          startDate: '2026-09-14',
          monthKey: '2026-11',
          monthGrid,
          monthRoles,
          grid: {}
        },
        {
          id: 'sheet_custom_user_week',
          name: 'Tuần từ: 9/11 đến 15/11',
          startDate: '2026-11-09',
          monthKey: '2026-11',
          monthGrid,
          monthRoles,
          grid: scheduleRes.grid
        }
      ]
    }
  }
};

// Export to Google Sheet tabs
const exportedTabs = exportStoreToTabs(initialStore);
const lichThangTab = exportedTabs['LichThang'];
assert(Array.isArray(lichThangTab) && lichThangTab.length > 5, 'LichThang tab must have cell rows exported');
const cellRow = lichThangTab.find(row => row[4] === '2026-11-09|truc_chinh|S');
assert(cellRow, 'Exported LichThang tab must contain 2026-11-09|truc_chinh|S');
assert(cellRow[5] === 'BS. ÂN', 'Exported LichThang value must be BS. ÂN');

console.log('STEP 2 PASSED: Exported store to Google Sheet tabs preserves all month cells cleanly.');

// 5. Simulate remote Google Sheet pull where LichThang was empty or has no cells
const emptyRemoteTabs = {
  _meta: [['key', 'value'], ['updatedAt', '2026-11-07T12:00:00Z'], ['activeDeptId', deptId]],
  LichTuan: [['recordType', 'sheetId', 'sheetName', 'startDate', 'dayIndex', 'slot', 'value', 'staffId', 'weekStart']],
  LichThang: [['recordType', 'sheetId', 'monthKey', 'field', 'key', 'value']],
  NhanSu: [],
  Task: [],
  LichNghi: [],
  LichHoc: []
};

const mergedAfterRemotePull = importTabsToStore(emptyRemoteTabs, initialStore);
const deptSheetsAfterPull = mergedAfterRemotePull.sheetsByDept[deptId].sheets;

// Active sheet ID must remain on the user's active sheet!
assert(
  mergedAfterRemotePull.sheetsByDept[deptId].activeSheetId === 'sheet_custom_user_week',
  `Active sheet ID must not be hijacked; got ${mergedAfterRemotePull.sheetsByDept[deptId].activeSheetId}`
);

// Month cells must NOT be wiped!
deptSheetsAfterPull.forEach(sh => {
  assert(sh.monthGrid, `Sheet ${sh.id} must have monthGrid`);
  assert(
    sh.monthGrid['2026-11-09|truc_chinh|S'] === 'BS. ÂN',
    `Sheet ${sh.id} must preserve month cell; got ${sh.monthGrid['2026-11-09|truc_chinh|S']}`
  );
  assert(
    sh.monthRoles && sh.monthRoles.find(r => r.label === 'TC'),
    `Sheet ${sh.id} must preserve custom month roles (TC)`
  );
});

console.log('STEP 3 PASSED: Local month data and activeSheetId are 100% preserved after remote pull!');
console.log('ALL TESTS PASSED SUCCESSFULLY!');
