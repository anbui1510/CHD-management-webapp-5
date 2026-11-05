// ==========================================================================
// SHARED CONSTANTS: STAFF TITLES, POSITIONS & TASK CATEGORIES
// ==========================================================================

// Chức danh -> định mức ca trực mặc định / tháng
export const TITLE_OPTIONS = [
  { value: 'Trưởng Khoa', quota: 2 },
  { value: 'Phó Khoa', quota: 4 },
  { value: 'BS CK1', quota: 6 },
  { value: 'BS Trẻ', quota: 7 },
  { value: 'Học Viên', quota: 9 }
];

// Vị trí trực của bác sĩ trong khoa
export const POSITION_OPTIONS = [
  'BS Trưởng Khoa',
  'BS Phó khoa',
  'BS Cột 1',
  'BS Cột 2',
  'BS Cột 3',
  'BS Học viên'
];

// Gợi ý Vị trí mặc định dựa trên Chức danh (dùng khi dữ liệu cũ chưa có trường Vị trí)
export function derivePositionFromTitle(title) {
  switch (title) {
    case 'Trưởng Khoa': return 'BS Trưởng Khoa';
    case 'Phó Khoa': return 'BS Phó khoa';
    case 'BS CK1': return 'BS Cột 2';
    case 'BS Trẻ': return 'BS Cột 1';
    case 'Học Viên': return 'BS Học viên';
    default: return 'BS Cột 1';
  }
}

export function getQuotaForTitle(title, fallback = 6) {
  const found = TITLE_OPTIONS.find(t => t.value === title);
  return found ? found.quota : fallback;
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
