// ==========================================================================
// SHARED CONSTANTS: STAFF POSITIONS & TASK CATEGORIES
// ==========================================================================

/** Vị trí công tác (thay cho «Chức danh» cũ). */
export const POSITION_OPTIONS = [
  'Bác sĩ cột 1',
  'Bác sĩ cột 2',
  'Bác sĩ cột 3',
  'Giảng viên',
  'Học viên',
  'Hỗ trợ',
];

export const DEFAULT_STAFF_POSITION = POSITION_OPTIONS[0];

/** Vị trí cần khoảng thời gian (lịch tuần / phân công bệnh phòng trong khoảng). */
export function positionShowsStudyRange(position) {
  const p = String(position || '').trim().toLowerCase();
  return p === 'học viên' || p === 'hỗ trợ';
}

function fold(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

/** Map dữ liệu cũ (BS Cột 1, Học Viên…) → giá trị mới. */
export function normalizeLegacyPosition(raw) {
  const s = String(raw || '').trim();
  if (!s) return DEFAULT_STAFF_POSITION;
  const f = fold(s);
  const map = new Map([
    [fold('BS Cột 1'), 'Bác sĩ cột 1'],
    [fold('BS Cột 2'), 'Bác sĩ cột 2'],
    [fold('BS Cột 3'), 'Bác sĩ cột 3'],
    [fold('BS Trưởng Khoa'), 'Bác sĩ cột 1'],
    [fold('BS Phó khoa'), 'Bác sĩ cột 2'],
    [fold('BS Học viên'), 'Học viên'],
    [fold('Hỗ trợ khoa'), 'Hỗ trợ'],
    [fold('Trực gác'), 'Hỗ trợ'],
    [fold('Trưởng Khoa'), 'Bác sĩ cột 1'],
    [fold('Phó Khoa'), 'Bác sĩ cột 2'],
    [fold('BS CK1'), 'Bác sĩ cột 2'],
    [fold('BS Trẻ'), 'Bác sĩ cột 1'],
    [fold('Học Viên'), 'Học viên'],
    [fold('Hỗ Trợ'), 'Hỗ trợ'],
  ]);
  if (map.has(f)) return map.get(f);
  if (POSITION_OPTIONS.includes(s)) return s;
  return s;
}

export function getQuotaForPosition(position, fallback = 6) {
  switch (String(position || '').trim()) {
    case 'Bác sĩ cột 1':
    case 'Bác sĩ cột 2':
    case 'Bác sĩ cột 3':
      return 6;
    case 'Giảng viên':
      return 4;
    case 'Học viên':
      return 9;
    case 'Hỗ trợ':
      return 0;
    default:
      return fallback;
  }
}

/** Định mức mặc định khi dữ liệu cũ chỉ có title (Chức danh). */
export function getQuotaForLegacyTitle(title, fallback = 6) {
  switch (String(title || '').trim()) {
    case 'Trưởng Khoa': return 2;
    case 'Phó Khoa': return 4;
    case 'BS CK1': return 6;
    case 'BS Trẻ': return 7;
    case 'Học Viên': return 9;
    case 'Hỗ Trợ': return 0;
    default: return fallback;
  }
}

// Nhóm nghiệp vụ mặc định (không xóa được). Nhóm do người dùng tạo lưu ở dept.customCategories
export const DEFAULT_CATEGORIES = [
  { key: 'THUONG_TRUC', label: 'Thường Trực' },
  { key: 'PHONG_KHAM', label: 'Phòng Khám' },
  { key: 'THU_THUAT', label: 'Thủ Thuật / Phẫu Thuật' },
  { key: 'CHUYEN_MON', label: 'Chuyên Môn Đặc Thù' },
  { key: 'GIANG_DAY', label: 'Giảng Dạy' },
  { key: 'NGHI_VANG', label: 'Nghỉ / Công Tác' }
];

export function getCategoriesForDept(dept) {
  const custom = (dept?.customCategories || []).map(c => ({ ...c, custom: true }));
  return [...DEFAULT_CATEGORIES.map(c => ({ ...c, custom: false })), ...custom];
}
