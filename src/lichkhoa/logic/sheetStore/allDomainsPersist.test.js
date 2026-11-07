/**
 * Comprehensive verification of persistence across all Module 7 domains:
 * - Hand-added local staff (e.g. Nguyễn Thái Hưng local_*)
 * - Custom shortName (e.g. THẢO vs THẢO2) and staff fields
 * - Custom and edited tasks (owners, order, locks)
 * - Leave entries (Lịch nghỉ)
 * - Study entries (Lịch học)
 * - Week sheets and grid cells (Bảng sheet & Lịch tuần)
 * - Month schedule cells and roles (Lịch tháng)
 *
 * Run: node src/lichkhoa/logic/sheetStore/allDomainsPersist.test.js
 */
import assert from 'node:assert';
import { exportStoreToTabs, importTabsToStore } from './bundle.js';
import { SHEET_TABS } from './constants.js';
import { mergeChdStaffIntoDept } from '../../auth/mergeChdStaff.js';

console.log('--- TEST 1: Preserve hand-added local staff & custom shortName ---');
{
  const localStaff = [
    {
      id: '01378',
      name: 'Bùi Tuấn Ân',
      shortName: 'ÂN',
      position: 'BS Cột 2',
      dutyQuota: 6,
      buBalance: 1,
      phepBalance: 12,
      source: 'chd',
      showInLichKhoa: 'On',
    },
    {
      id: 'staff_thao',
      name: 'Nguyễn Thanh Thảo',
      shortName: 'THẢO', // User corrected THẢO2 -> THẢO locally
      position: 'BS Cột 2',
      dutyQuota: 6,
      buBalance: 0,
      phepBalance: 12,
      source: 'chd',
      showInLichKhoa: 'On',
    },
    {
      id: 'local_1730000001',
      name: 'Nguyễn Thái Hưng', // Hand-added support staff
      shortName: 'HƯNG',
      position: 'Hỗ trợ',
      dutyQuota: 2,
      buBalance: 0,
      phepBalance: 12,
      source: 'local',
      showInLichKhoa: 'On',
    },
  ];

  const baseStore = {
    activeDeptId: 'dept_tim_mach',
    departments: [
      {
        id: 'dept_tim_mach',
        name: 'Khoa Tim Mạch',
        code: 'TIM_MACH',
        staff: localStaff,
        tasks: [{ id: 'task_1', code: 'TK', name: 'Trực khoa', owners: ['ÂN', 'THẢO'] }],
        leaveEntries: [{ id: 'leave_1', staffId: 'staff_thao', fromDate: '2026-11-10', toDate: '2026-11-12' }],
        studyEntries: [{ id: 'study_1', staffId: 'local_1730000001', fromDate: '2026-11-01', toDate: '2026-11-30' }],
      },
    ],
    sheetsByDept: {
      dept_tim_mach: {
        activeSheetId: 'sh_1',
        sheets: [
          {
            id: 'sh_1',
            name: 'Tuần 1',
            startDate: '2026-11-02',
            grid: {
              HƯNG: [{ S: 'TK', R: '', C: '', T: '' }],
            },
            monthGrid: {
              '2026-11-05|truc_ngay|S': 'THẢO',
            },
          },
          {
            id: 'sh_2',
            name: 'Tuần 2',
            startDate: '2026-11-09',
            grid: {},
          },
        ],
      },
    },
  };

  // Remote Google Sheet has stale staff data (missing Hưng, Thảo has THẢO2)
  const remoteTabs = {
    [SHEET_TABS.META]: [
      ['key', 'value'],
      ['schemaVersion', '4'],
      ['activeDeptId', 'dept_tim_mach'],
      ['deptName', 'Khoa Tim Mạch'],
      ['deptCode', 'TIM_MACH'],
    ],
    [SHEET_TABS.NHAN_SU]: [
      ['id', 'name', 'shortName', 'title', 'dutyQuota', 'buBalance', 'phepBalance', 'email', 'loginEmail', 'position', 'studyFrom', 'studyTo', 'deptId', 'deptLabel', 'showInLichKhoa', 'source', 'accessRole', 'access_week', 'access_month', 'access_leave', 'access_study', 'access_calendar', 'access_dashboard', 'access_staff', 'access_tasks'],
      ['01378', 'Bùi Tuấn Ân', 'ÂN', '', '6', '1', '12', '', '', 'BS Cột 2', '', '', '', '', 'On', 'chd', 'member', '', '', '', '', '', '', '', ''],
      ['staff_thao', 'Nguyễn Thanh Thảo', 'THẢO2', '', '6', '0', '12', '', '', 'BS Cột 2', '', '', '', '', 'On', 'chd', 'member', '', '', '', '', '', '', '', ''],
      // Note: "local_1730000001" (Nguyễn Thái Hưng) is completely missing from remote!
    ],
    [SHEET_TABS.TASK]: [
      ['id', 'code', 'name', 'category', 'session', 'scope', 'description', 'bgColor', 'textColor', 'blocker', 'delta', 'dutyRole', 'encodeDuty', 'buRt', 'buVg', 'deltaRt', 'deltaVg', 'triggerRT', 'ownersJson', 'ownerOrderJson', 'fixedDaysJson', 'fixedSlotsJson', 'locksJson'],
      ['task_remote', 'C1', 'Cột 1', 'Lâm sàng', 'S', 'week', '', '', '', 'false', '0', '', 'false', 'false', 'false', '0', '0', 'false', '[]', '[]', '[]', '[]', '[]'],
    ],
    [SHEET_TABS.LICH_NGHI]: [
      ['id', 'staffId', 'fromDate', 'toDate', 'note', 'type'],
      ['leave_remote', '01378', '2026-11-20', '2026-11-21', 'Nghỉ phép', 'phep'],
    ],
    [SHEET_TABS.LICH_HOC]: [
      ['id', 'staffId', 'fromDate', 'toDate', 'note'],
      ['study_remote', '01378', '2026-11-15', '2026-11-16', 'Học CK'],
    ],
    [SHEET_TABS.LICH_TUAN]: [
      ['recordType', 'sheetId', 'sheetName', 'startDate', 'weekStart', 'staffId', 'dayIndex', 'slot', 'value'],
      ['sheet_meta', 'sh_1', 'Tuần 1', '2026-11-02', '', '', '', '', ''],
      // Remote only has sh_1!
    ],
    [SHEET_TABS.LICH_THANG]: [
      ['sheetId', 'field', 'key', 'value'],
      ['sh_1', 'meta', 'monthKey', '2026-11'],
    ],
  };

  const merged = importTabsToStore(remoteTabs, baseStore);
  const dept = merged.departments.find((d) => d.id === 'dept_tim_mach');

  // 1. Hand-added local staff "Nguyễn Thái Hưng" MUST be preserved!
  const hung = dept.staff.find((s) => s.name === 'Nguyễn Thái Hưng');
  assert(hung, 'Nguyễn Thái Hưng must be preserved on remote pull');
  assert.strictEqual(hung.id, 'local_1730000001');
  assert.strictEqual(hung.shortName, 'HƯNG');

  // 2. Custom shortName "THẢO" must be preserved over remote's "THẢO2"!
  const thao = dept.staff.find((s) => s.id === 'staff_thao');
  assert(thao, 'Nguyễn Thanh Thảo must be present');
  assert.strictEqual(thao.shortName, 'THẢO', 'Custom shortName THẢO must be preserved over remote THẢO2');

  // 3. Local task must be merged with remote task!
  assert(dept.tasks.some((t) => t.id === 'task_1'), 'Local task_1 must be preserved');
  assert(dept.tasks.some((t) => t.id === 'task_remote'), 'Remote task_remote must be included');

  // 4. Local leave and study entries must be preserved!
  assert(dept.leaveEntries.some((e) => e.id === 'leave_1'), 'Local leave_1 must be preserved');
  assert(dept.leaveEntries.some((e) => e.id === 'leave_remote'), 'Remote leave_remote must be included');
  assert(dept.studyEntries.some((e) => e.id === 'study_1'), 'Local study_1 must be preserved');
  assert(dept.studyEntries.some((e) => e.id === 'study_remote'), 'Remote study_remote must be included');

  // 5. Local sheets (Tuần 2) and local week grid cells must be preserved!
  const deptSheets = merged.sheetsByDept.dept_tim_mach.sheets;
  assert.strictEqual(deptSheets.length, 2, 'Both Tuần 1 and Tuần 2 must be preserved');
  assert(deptSheets.some((sh) => sh.id === 'sh_2'), 'Local sh_2 must be preserved');
  const sh1 = deptSheets.find((sh) => sh.id === 'sh_1');
  assert(sh1.grid?.HƯNG?.[0]?.S === 'TK', 'Local grid cell for HƯNG must be preserved');
  assert.strictEqual(sh1.monthGrid?.['2026-11-05|truc_ngay|S'], 'THẢO', 'Month grid cell must be preserved');

  console.log('TEST 1 PASSED: Local staff, shortName, tasks, entries, and sheets safely merged.');
}

console.log('--- TEST 2: mergeChdStaffIntoDept reservation logic ---');
{
  const dept = {
    id: 'dept_tim_mach',
    name: 'Khoa Tim Mạch',
    staff: [
      {
        id: 'staff_thao',
        name: 'Nguyễn Thanh Thảo',
        shortName: 'THẢO', // Existing doctor with THẢO
        source: 'chd',
        showInLichKhoa: 'On',
      },
      {
        id: 'local_hung',
        name: 'Nguyễn Thái Hưng',
        shortName: 'HƯNG',
        source: 'local',
        showInLichKhoa: 'On',
      },
    ],
  };

  // Suppose another staff in CHD with last name Thảo comes BEFORE Nguyễn Thanh Thảo in the list
  const chdStaffList = [
    {
      StaffKey: 'staff_other_thao',
      StaffName: 'Phan Thị Thu Thảo',
      ShowInLichKhoa: 'On',
    },
    {
      StaffKey: 'staff_thao',
      StaffName: 'Nguyễn Thanh Thảo',
      ShowInLichKhoa: 'On',
    },
  ];

  const merged = mergeChdStaffIntoDept(dept, chdStaffList);

  const thaoDoctor = merged.staff.find((s) => s.id === 'staff_thao');
  assert(thaoDoctor, 'Doctor Nguyễn Thanh Thảo must be present');
  assert.strictEqual(thaoDoctor.shortName, 'THẢO', 'Nguyễn Thanh Thảo keeps THẢO because it was reserved for her');

  const otherThao = merged.staff.find((s) => s.id === 'staff_other_thao');
  assert(otherThao, 'Other Thảo must be present');
  assert.strictEqual(otherThao.shortName, 'THẢO2', 'Other Thảo derives THẢO2 without stealing THẢO');

  const hungLocal = merged.staff.find((s) => s.id === 'local_hung');
  assert(hungLocal, 'Hand-added local staff Nguyễn Thái Hưng must be retained');
  assert.strictEqual(hungLocal.shortName, 'HƯNG');

  console.log('TEST 2 PASSED: ShortName collision handled gracefully without overwriting existing staff.');
}

console.log('--- TEST 3: Round-trip export to tabs retains all data ---');
{
  const store = {
    activeDeptId: 'dept_tim_mach',
    departments: [
      {
        id: 'dept_tim_mach',
        name: 'Khoa Tim Mạch',
        code: 'TIM_MACH',
        staff: [
          { id: 'local_hung', name: 'Nguyễn Thái Hưng', shortName: 'HƯNG', position: 'Hỗ trợ', source: 'local', showInLichKhoa: 'On' },
          { id: 'staff_thao', name: 'Nguyễn Thanh Thảo', shortName: 'THẢO', position: 'BS Cột 2', source: 'chd', showInLichKhoa: 'On' },
        ],
        tasks: [{ id: 'task_1', code: 'TK', name: 'Trực khoa', owners: ['THẢO', 'HƯNG'] }],
        leaveEntries: [{ id: 'leave_1', staffId: 'staff_thao', fromDate: '2026-11-01', toDate: '2026-11-02' }],
        studyEntries: [{ id: 'study_1', staffId: 'local_hung', fromDate: '2026-11-05', toDate: '2026-11-06' }],
      },
    ],
    sheetsByDept: {
      dept_tim_mach: {
        activeSheetId: 'sh_1',
        sheets: [
          {
            id: 'sh_1',
            name: 'Tuần 1',
            startDate: '2026-11-02',
            grid: {
              HƯNG: [{ S: 'TK', R: '', C: '', T: '' }],
            },
            monthGrid: {
              '2026-11-05|truc_ngay|S': 'THẢO',
            },
          },
        ],
      },
    },
  };

  const exportedTabs = exportStoreToTabs(store);
  assert(exportedTabs[SHEET_TABS.NHAN_SU].some((row) => row.includes('Nguyễn Thái Hưng')), 'NhanSu tab must contain Nguyễn Thái Hưng');
  assert(exportedTabs[SHEET_TABS.NHAN_SU].some((row) => row.includes('THẢO')), 'NhanSu tab must contain THẢO');
  assert(exportedTabs[SHEET_TABS.TASK].some((row) => row.includes('Trực khoa')), 'Task tab must contain Trực khoa');
  assert(exportedTabs[SHEET_TABS.LICH_NGHI].some((row) => row.includes('leave_1')), 'LichNghi tab must contain leave_1');
  assert(exportedTabs[SHEET_TABS.LICH_HOC].some((row) => row.includes('study_1')), 'LichHoc tab must contain study_1');

  // Import tabs into a blank store
  const reimported = importTabsToStore(exportedTabs, null);
  const reimportedDept = reimported.departments[0];
  assert(reimportedDept.staff.some((s) => s.name === 'Nguyễn Thái Hưng' && s.shortName === 'HƯNG'), 'Reimported staff retains Nguyễn Thái Hưng');
  assert(reimportedDept.staff.some((s) => s.id === 'staff_thao' && s.shortName === 'THẢO'), 'Reimported staff retains THẢO');
  assert(reimportedDept.tasks.some((t) => t.id === 'task_1'), 'Reimported tasks retain task_1');
  assert(reimportedDept.leaveEntries.some((e) => e.id === 'leave_1'), 'Reimported leave retain leave_1');
  assert(reimportedDept.studyEntries.some((e) => e.id === 'study_1'), 'Reimported study retain study_1');

  console.log('TEST 3 PASSED: Full round-trip export & reimport verified.');
}

console.log('\nALL 3 INTEGRATION PERSISTENCE TESTS PASSED SUCCESSFULLY!');
