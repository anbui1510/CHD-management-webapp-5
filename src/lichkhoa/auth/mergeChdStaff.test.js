/**
 * Run: node src/lichkhoa/auth/mergeChdStaff.test.js
 */
import { mergeChdStaffIntoDept } from './mergeChdStaff.js';
import { isBackupImportedStaff, isHandAddedLocalStaff } from '../logic/staffSource.js';

function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'assertion failed');
}

const dept = {
  id: 'dept_tim_mach',
  name: 'Khoa Tim Mạch',
  staff: [
    { id: '00017', name: 'BS Lợi CHD', shortName: 'LOI', source: 'chd', dutyQuota: 2 },
    { id: 'doc_1', name: 'Phan Tiến Lợi', shortName: 'LOI2', source: 'local', dutyQuota: 2 },
    { id: 'doc_2', name: 'Trần Công Bảo Phụng', shortName: 'PHUNG2', source: 'local', dutyQuota: 4 },
    { id: 'local_hv1', name: 'HV Test', shortName: 'HV1', source: 'local', dutyQuota: 9, position: 'Học viên' },
  ],
};

const chd = [
  { StaffKey: '00017', StaffName: 'Phan Tiến Lợi', Name: 'BS. Lợi', Role: 'Admin', ShowInLichKhoa: 'On', Department: 'Khoa Tim mạch' },
  { StaffKey: '00776', StaffName: 'Trần Công Bảo Phụng', Name: 'BS. Phụng', Role: 'User', ShowInLichKhoa: 'On', Department: 'Khoa Tim mạch' },
];

const next = mergeChdStaffIntoDept(dept, chd);
const ids = next.staff.map((s) => s.id);

assert(ids.includes('00017'), 'keeps CHD 00017');
assert(ids.includes('00776'), 'adds CHD 00776');
assert(ids.includes('local_hv1'), 'keeps hand-added local_*');
assert(!ids.includes('doc_1'), 'drops doc_1 backup');
assert(!ids.includes('doc_2'), 'drops doc_2 backup');
assert(next.staff.every((s) => !isBackupImportedStaff(s)), 'no backup rows left');
assert(isHandAddedLocalStaff(next.staff.find((s) => s.id === 'local_hv1')), 'HV still hand-added');

console.log('mergeChdStaff.test.js: ok');
