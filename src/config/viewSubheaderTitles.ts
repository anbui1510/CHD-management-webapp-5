import type { ActiveMenuId } from './navigation';

/** Tên view hiển thị trên subheader desktop (trái). */
export const VIEW_SUBHEADER_TITLES: Partial<Record<ActiveMenuId, string>> = {
  home: 'Trang chủ',
  workspace: 'Không gian làm việc',
  profile: 'Hồ sơ cá nhân',
  patients: 'Hồ sơ bệnh án',
  'consult-list': 'Đăng ký hội chẩn',
  'consult-form': 'Đăng ký hội chẩn',
  'results-staff': 'Nhập kết quả staff',
  'schedule-tt': 'Xếp lịch & Dụng cụ',
  'schedule-view': 'Lịch thông tim dự kiến',
  'cathlab-room': 'Phòng thông tim',
  'cathlab-report': 'Báo cáo thông tim',
  'heart-transplant': 'Quản lý ghép tim',
  'mri-overview': 'Tổng quan MRI',
  'mri-register': 'Đăng ký MRI tim',
  'mri-scheduler': 'Xếp lịch MRI',
  'mri-result': 'Điền kết quả MRI tim',
  'mri-calendar': 'Lịch chụp MRI tim',
  'surgery-room': 'Phòng phẫu thuật',
  'surgery-scheduler': 'Xếp lịch phẫu thuật',
  'surgery-schedule-view': 'Lịch phẫu thuật dự kiến',
  archive: 'Lưu trữ',
  'lich-khoa-sheet': 'Xếp lịch khoa',
  'lich-khoa-dashboard': 'Dashboard lịch khoa',
  'lich-khoa-tasks': 'Quản lý task lịch',
  'lich-khoa-staff': 'Nhân sự xếp lịch',
  'lich-khoa-calendar': 'Lịch google khoa',
  'lich-khoa-sheets': 'Virtual Sheets lịch khoa',
  'google-sheets': 'Virtual Google Sheets',
  'excel-export': 'Bảng Filter & Export',
  'staff-mgmt': 'Quản lý nhân sự',
  'chd-daily-brief': 'CHD Daily Brief',
};

export function getViewSubheaderTitle(menuId: ActiveMenuId): string {
  return VIEW_SUBHEADER_TITLES[menuId] ?? 'CHD Management';
}
