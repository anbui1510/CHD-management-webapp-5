import assert from 'node:assert';
import { generateWeeklySchedule, emptyWeekGrid } from '../schedulerEngine.js';
import { importTaskRows, exportTaskRows } from './task.js';
import { mergeTasksPreserveLocalFields } from './bundle.js';

console.log('=== TEST: TC (Trực chính) with Mã hóa vào gác must pour as VG, NEVER TK1 ===');

// 1. Setup realistic tasks matching user database
const taskList = [
  { id: 'task_tn', code: 'TN', name: 'Trực Ngày', category: 'THUONG_TRUC', session: 'SANG', dutyRole: 'truc_ngay', encodeDuty: false, scope: 'week' },
  { id: 'task_vg', code: 'VG', name: 'Vào Gác (Trực Đêm)', category: 'THUONG_TRUC', session: 'DEM', dutyRole: 'vao_gac', encodeDuty: false, scope: 'week' },
  { id: 'task_c1', code: 'C1', name: 'Trực Cột 1 BV', category: 'THUONG_TRUC', session: 'SANG_DEM', dutyRole: 'vao_gac', encodeDuty: true, scope: 'week' },
  { id: 'task_rt', code: 'RT', name: 'Ra Trực', category: 'THUONG_TRUC', session: 'SANG_CHIEU', dutyRole: 'ra_truc', encodeDuty: false, scope: 'week' },
  { id: 'task_tc', code: 'TC', name: 'Trực chính', category: 'THUONG_TRUC', session: 'SANG_CHIEU', dutyRole: 'vao_gac', encodeDuty: true, scope: 'month' },
  { id: 'task_tk1', code: 'TK1', name: 'Trực kèm 1', category: 'THUONG_TRUC', session: 'SANG_CHIEU', dutyRole: 'vao_gac', encodeDuty: false, scope: 'month' },
  { id: 'task_t1', code: 'T1', name: 'Khám 1', category: 'CHUYEN_MON', session: 'SANG', scope: 'week' },
];

const staffList = [
  { id: 'doc_nghi', shortName: 'NGHI', name: 'BS Nghi' },
  { id: 'doc_hieu', shortName: 'HIẾU', name: 'BS Hiếu' },
  { id: 'doc_thinh', shortName: 'THỊNH', name: 'BS Thịnh' },
  { id: 'doc_an', shortName: 'ÂN', name: 'BS Ân' },
  { id: 'doc_duy', shortName: 'DUY', name: 'BS Duy' },
];

// Week starting Monday 2026-11-09
// T2: 2026-11-09, T3: 2026-11-10, T4: 2026-11-11, T5: 2026-11-12
const monthRoles = [
  { key: 'tc', label: 'TC' },
  { key: 'tk1', label: 'TK1' },
];

const monthGrid = {
  // T2 09/11: TC Chiều has NGHI
  '2026-11-09|tc|C': 'NGHI',
  // T3 10/11: TC Chiều has HIẾU, TK1 Chiều has DUY
  '2026-11-10|tc|C': 'HIẾU',
  '2026-11-10|tk1|C': 'DUY',
  // T4 11/11: TC Chiều has THỊNH
  '2026-11-11|tc|C': 'THỊNH',
  // T5 12/11: TC Chiều has ÂN
  '2026-11-12|tc|C': 'ÂN',
};

const result = generateWeeklySchedule({
  startDate: '2026-11-09',
  staffList,
  taskList,
  monthGrid,
  monthRoles,
  daySessions: ['S', 'C'],
  leaveEntries: [],
  sheets: [],
});

const grid = result.grid;

console.log('NGHI T2 (09/11):', grid['NGHI']?.[0]);
console.log('HIẾU T3 (10/11):', grid['HIẾU']?.[1]);
console.log('DUY T3 (10/11):', grid['DUY']?.[1]);
console.log('THỊNH T4 (11/11):', grid['THỊNH']?.[2]);
console.log('ÂN T5 (12/11):', grid['ÂN']?.[3]);

// Assertions:
// 1. NGHI must have VG in C on T2 (day 0), NOT TK1!
assert.strictEqual(grid['NGHI']?.[0]?.C, 'VG', `NGHI on T2 Chiều should be VG, got ${grid['NGHI']?.[0]?.C}`);
// 2. NGHI must have RT on T3 (day 1)
assert.strictEqual(grid['NGHI']?.[1]?.S, 'RT', `NGHI on T3 Sáng should be RT, got ${grid['NGHI']?.[1]?.S}`);

// 3. HIẾU must have VG in C on T3 (day 1), NOT TK1!
assert.strictEqual(grid['HIẾU']?.[1]?.C, 'VG', `HIẾU on T3 Chiều should be VG, got ${grid['HIẾU']?.[1]?.C}`);

// 4. DUY was scheduled for TK1 in monthGrid, so DUY should have TK1!
assert.strictEqual(grid['DUY']?.[1]?.C, 'TK1', `DUY on T3 Chiều should be TK1, got ${grid['DUY']?.[1]?.C}`);

// 5. THỊNH must have VG in C on T4 (day 2), NOT TK1!
assert.strictEqual(grid['THỊNH']?.[2]?.C, 'VG', `THỊNH on T4 Chiều should be VG, got ${grid['THỊNH']?.[2]?.C}`);

// 6. ÂN must have VG in C on T5 (day 3), NOT TK1!
assert.strictEqual(grid['ÂN']?.[3]?.C, 'VG', `ÂN on T5 Chiều should be VG, got ${grid['ÂN']?.[3]?.C}`);

console.log('PART 1 PASSED: TC strictly encodes into VG (never TK1), and TK1 preserves as TK1!');

import { TASK_HEADERS } from './constants.js';

// PART 2: Task sheet import / export normalization
console.log('=== PART 2: Normalization ensures VG never has encodeDuty ===');
const rowsWithBadVg = [
  TASK_HEADERS,
  ['task_vg', 'VG', 'Vào Gác', 'THUONG_TRUC', 'DEM', 'week', '', '', '', 'true', '0', 'vao_gac', 'true', 'false', 'false', '0', '0', 'true', '[]', '[]', '[]', '[]', '[]', 'false', 'true', 'both'],
];
const imported = importTaskRows(rowsWithBadVg);
assert.strictEqual(imported[0].encodeDuty, false, 'importTaskRows must force VG.encodeDuty to false');

const exported = exportTaskRows([{ id: 'task_vg', code: 'VG', encodeDuty: true }]);
const encodeDutyIdx = TASK_HEADERS.indexOf('encodeDuty');
assert.strictEqual(exported[1][encodeDutyIdx], 'false', 'exportTaskRows must force VG.encodeDuty to false string');

const merged = mergeTasksPreserveLocalFields(
  [{ id: 'task_vg', code: 'VG', encodeDuty: true }],
  [{ id: 'task_vg', code: 'VG', encodeDuty: true }]
);
assert.strictEqual(merged[0].encodeDuty, false, 'mergeTasksPreserveLocalFields must force VG.encodeDuty to false');

console.log('PART 2 PASSED: VG is permanently guaranteed to have encodeDuty: false!');

console.log('>>> ALL TC -> VG ENCODING TESTS PASSED 100%! <<<');
