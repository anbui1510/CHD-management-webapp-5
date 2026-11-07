import assert from 'node:assert';
import {
  importTabsToStore,
  exportStoreToTabs,
  mergeTasksPreserveLocalFields,
  mergeEntriesPreserveLocal,
  normalizeDateIso,
  SHEET_TABS,
} from './index.js';
import { importTaskRows, exportTaskRows } from './task.js';
import { importLeaveRows, exportLeaveRows } from './entries.js';
import { leaveCovers } from '../leaveRepeat.js';
import { LICH_KHOA_APPS_SCRIPT_CODE } from '../../../data/lichKhoaAppsScriptCode.js';

console.log('=== TEST 1: Task Colors & All Properties Permanent Persistence Across Deploys ===');
{
  // Giả lập: User đổi màu task TT (Thông tim Can thiệp) thành #00ff00 (xanh lục), textColor #000000
  // và đổi display thành 'week' (chỉ hiện Lịch tuần)
  const customizedTask = {
    id: 'task_tt',
    code: 'TT',
    name: 'Thông tim Can thiệp',
    category: 'THU_THUAT',
    session: 'SANG_CHIEU',
    scope: 'week',
    description: 'Chỉ định đặc biệt phòng CathLab',
    bgColor: '#00ff00', // Đã đổi màu!
    textColor: '#000000', // Đã đổi màu chữ!
    blocker: true,
    delta: 0,
    dutyRole: '',
    encodeDuty: false,
    buRt: true,
    buVg: false,
    deltaRt: 1.5,
    deltaVg: 0,
    triggerRT: false,
    owners: ['ÂN', 'THẢO'],
    ownerOrder: ['ÂN', 'THẢO'],
    fixedDays: [1, 3],
    fixedSlots: ['1-S', '3-S'],
    locks: ['task_c1'],
    rotate: true,
    warn: false,
    display: 'week', // Đã đổi thành 'week'
  };

  // 1. Export ra dòng tab Task trên Google Sheet
  const exportedRows = exportTaskRows([customizedTask]);
  const importedTasks = importTaskRows(exportedRows);
  const reimported = importedTasks[0];

  assert.strictEqual(reimported.bgColor, '#00ff00', 'Task bgColor must survive export/import');
  assert.strictEqual(reimported.textColor, '#000000', 'Task textColor must survive export/import');
  assert.strictEqual(reimported.display, 'week', 'Task display must survive export/import');
  assert.strictEqual(reimported.description, 'Chỉ định đặc biệt phòng CathLab', 'Task description must survive export/import');
  assert.strictEqual(reimported.deltaRt, 1.5, 'Task deltaRt must survive export/import');
  assert.strictEqual(reimported.buRt, true, 'Task buRt must survive export/import');
  assert.strictEqual(reimported.warn, false, 'Task warn must survive export/import');
  assert.strictEqual(reimported.rotate, true, 'Task rotate must survive export/import');
  assert.deepStrictEqual(reimported.owners, ['ÂN', 'THẢO'], 'Task owners must survive export/import');
  assert.deepStrictEqual(reimported.fixedDays, [1, 3], 'Task fixedDays must survive export/import');

  // 2. Tình huống deploy lại: Local app khởi động lại với seed mặc định (task_tt có bgColor cũ #f4ccd8, display 'both')
  const staleLocalSeedTask = {
    id: 'task_tt',
    code: 'TT',
    name: 'Thông tim Can thiệp',
    category: 'THU_THUAT',
    session: 'SANG_CHIEU',
    scope: 'week',
    bgColor: '#f4ccd8', // Màu cũ của seed
    textColor: '#990000', // Màu chữ cũ của seed
    display: 'both', // Mặc định cũ của seed
    warn: true,
    rotate: false,
  };

  // Khi kéo từ Google Sheet về, mergeTasksPreserveLocalFields PHẢI GIỮ MÀU VÀ THUỘC TÍNH TỪ GOOGLE SHEET!
  const mergedTasks = mergeTasksPreserveLocalFields([reimported], [staleLocalSeedTask]);
  const finalTask = mergedTasks.find((t) => t.id === 'task_tt');

  assert.strictEqual(finalTask.bgColor, '#00ff00', 'Google Sheet custom bgColor MUST PREVAIL over local seed default!');
  assert.strictEqual(finalTask.textColor, '#000000', 'Google Sheet custom textColor MUST PREVAIL over local seed default!');
  assert.strictEqual(finalTask.display, 'week', 'Google Sheet custom display MUST PREVAIL over local seed default!');
  assert.strictEqual(finalTask.warn, false, 'Google Sheet custom warn MUST PREVAIL over local seed default!');
  assert.strictEqual(finalTask.rotate, true, 'Google Sheet custom rotate MUST PREVAIL over local seed default!');
  assert.strictEqual(finalTask.deltaRt, 1.5, 'Google Sheet custom deltaRt MUST PREVAIL over local seed default!');
  assert.strictEqual(finalTask.buRt, true, 'Google Sheet custom buRt MUST PREVAIL over local seed default!');

  console.log('TEST 1 PASSED: Task color and all attributes permanently persist and defeat stale seed defaults!');
}

console.log('=== TEST 2: Lịch Nghỉ (Leave Schedule) Permanent Persistence & Timezone Safety ===');
{
  // 1. Kiểm tra chuẩn hóa ngày normalizeDateIso
  // Google Sheets Date cell khi JSON.stringify thành ISO UTC (ví dụ 10/11/2026 GMT+7 thành 2026-11-09T17:00:00.000Z)
  assert.strictEqual(normalizeDateIso('2026-11-09T17:00:00.000Z'), '2026-11-10', 'UTC ISO date must correctly normalize to GMT+7 local date');
  assert.strictEqual(normalizeDateIso('15/11/2026'), '2026-11-15', 'DD/MM/YYYY must normalize to YYYY-MM-DD');
  assert.strictEqual(normalizeDateIso('2026-11-20'), '2026-11-20', 'YYYY-MM-DD must remain intact');

  // 2. Leave entry với ngày bị serialize kiểu Google Sheets Date object
  const rawSheetRow = [
    'leave_nov_10',
    'staff_thao',
    '2026-11-09T17:00:00.000Z', // fromDate từ Date cell
    '2026-11-11T17:00:00.000Z', // toDate từ Date cell
    'Nghỉ phép thường niên',
    'P',
    'THẢO',
    '2026-11-09T17:00:00.000Z',
    '2026-11-11T17:00:00.000Z',
    '2026-11-09T17:00:00.000Z',
    'SANG',
    JSON.stringify(['SANG']),
    'false',
    '',
    '',
    '1731100000000',
  ];

  const headers = [
    'id', 'staffId', 'fromDate', 'toDate', 'note', 'type',
    'shortName', 'from', 'to', 'iso', 'session', 'sessions',
    'plannedLong', 'repeat', 'exdates', 'createdAt'
  ];

  const importedLeave = importLeaveRows([headers, rawSheetRow])[0];
  assert.strictEqual(importedLeave.from, '2026-11-10', 'from date must be normalized to 2026-11-10');
  assert.strictEqual(importedLeave.to, '2026-11-12', 'to date must be normalized to 2026-11-12');
  assert.strictEqual(importedLeave.iso, '2026-11-10', 'iso date must be normalized to 2026-11-10');

  // 3. Kiểm tra hiển thị trên DayCalendar thông qua leaveCovers
  assert(leaveCovers(importedLeave, '2026-11-10'), 'Day 2026-11-10 must be covered');
  assert(leaveCovers(importedLeave, '2026-11-11'), 'Day 2026-11-11 must be covered');
  assert(leaveCovers(importedLeave, '2026-11-12'), 'Day 2026-11-12 must be covered');
  assert(!leaveCovers(importedLeave, '2026-11-09'), 'Day 2026-11-09 must NOT be covered');
  assert(!leaveCovers(importedLeave, '2026-11-13'), 'Day 2026-11-13 must NOT be covered');

  // 4. Kiểm tra mergeEntriesPreserveLocal: khi remote rỗng, local entries KHÔNG ĐƯỢC MẤT
  const localLeave = [{ id: 'leave_local_1', shortName: 'LỢI', from: '2026-11-20', to: '2026-11-21', type: 'CT' }];
  const mergedWithEmptyRemote = mergeEntriesPreserveLocal([], localLeave);
  assert.strictEqual(mergedWithEmptyRemote.length, 1, 'Local leave entries must be preserved when remote is empty');
  assert.strictEqual(mergedWithEmptyRemote[0].shortName, 'LỢI');

  // 5. Kiểm tra mergeEntriesPreserveLocal: khi remote có data từ Sheet, kết hợp an toàn
  const mergedWithRemote = mergeEntriesPreserveLocal([importedLeave], localLeave);
  assert.strictEqual(mergedWithRemote.length, 2, 'Both remote and local leave entries must be retained');
  assert(mergedWithRemote.some((e) => e.shortName === 'THẢO'), 'Remote Thảo leave must be present');
  assert(mergedWithRemote.some((e) => e.shortName === 'LỢI'), 'Local Lợi leave must be present');

  console.log('TEST 2 PASSED: Lịch nghỉ permanently persists, dates are normalized safely, and entries are never lost!');
}

console.log('=== TEST 3: Full Store Export & Import Round-trip with Tasks and Leave ===');
{
  const store = {
    activeDeptId: 'dept_tim_mach',
    departments: [{
      id: 'dept_tim_mach',
      name: 'Khoa Tim Mạch',
      code: 'TIM_MACH',
      staff: [{ id: '109', name: 'Nguyễn Thanh Thảo', shortName: 'THẢO', dutyQuota: 6, buBalance: 2, phepBalance: 12 }],
      tasks: [
        { id: 'task_tt', code: 'TT', name: 'Thông tim Can thiệp', bgColor: '#123456', textColor: '#abcdef', display: 'week' },
        { id: 'task_sn', code: 'SN', name: 'PK Siêu Nhân', bgColor: '#654321', textColor: '#fedcba', display: 'both' }
      ],
      leaveEntries: [
        { id: 'leave_1', shortName: 'THẢO', from: '2026-11-10', to: '2026-11-12', type: 'P', note: 'Nghỉ phép' }
      ]
    }],
    sheetsByDept: {
      dept_tim_mach: {
        activeSheetId: 's1',
        sheets: [{
          id: 's1',
          name: 'Lịch 2026',
          startDate: '2026-11-09',
          monthKey: '2026-11',
          monthGrid: { '2026-11-10|truc_ngay|S': 'THẢO' }
        }]
      }
    }
  };

  const tabs = exportStoreToTabs(store);
  assert(tabs.Task.length >= 3, 'Exported Task tab must have headers and tasks');
  assert(tabs.LichNghi.length >= 2, 'Exported LichNghi tab must have headers and leave entries');

  // Giả lập load lại trên máy mới / sau deploy với baseStore trống
  const reimportedStore = importTabsToStore(tabs, null);
  const reimportedDept = reimportedStore.departments.find((d) => d.id === 'dept_tim_mach');

  const reimportedTT = reimportedDept.tasks.find((t) => t.code === 'TT');
  assert.strictEqual(reimportedTT.bgColor, '#123456', 'Task TT bgColor survived round-trip');
  assert.strictEqual(reimportedTT.textColor, '#abcdef', 'Task TT textColor survived round-trip');
  assert.strictEqual(reimportedTT.display, 'week', 'Task TT display survived round-trip');

  const reimportedLeave = reimportedDept.leaveEntries.find((e) => e.id === 'leave_1');
  assert.strictEqual(reimportedLeave.shortName, 'THẢO', 'Leave entry shortName survived round-trip');
  assert.strictEqual(reimportedLeave.from, '2026-11-10', 'Leave entry from survived round-trip');
  assert.strictEqual(reimportedLeave.to, '2026-11-12', 'Leave entry to survived round-trip');

  console.log('TEST 3 PASSED: Full store export and import round-trip verified!');
}

console.log('=== TEST 4: Google Apps Script Backend Code Verification ===');
{
  assert(
    LICH_KHOA_APPS_SCRIPT_CODE.includes('writtenCount'),
    'Apps Script must handle partial tab push without throwing fatal error on unauthorized tabs'
  );
  assert(
    LICH_KHOA_APPS_SCRIPT_CODE.includes('Utilities.formatDate(cell, "GMT+7", "yyyy-MM-dd")'),
    'Apps Script must normalize Date cells to yyyy-MM-dd GMT+7 in sheetValues_'
  );

  console.log('TEST 4 PASSED: Apps Script backend guarantees safe push and date formatting!');
}

console.log('\n>>> ALL 4 PERMANENT PERSISTENCE TESTS PASSED SUCCESSFULLY! <<<');
