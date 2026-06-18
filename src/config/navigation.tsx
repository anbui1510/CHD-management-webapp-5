import type { ReactNode } from 'react';
import type { AppModule } from '../auth/permissions';
import {
  Activity,
  Archive,
  CalendarDays,
  ClipboardList,
  Database,
  Download,
  FileText,
  Heart,
  Home,
  LayoutDashboard,
  UserCog,
} from 'lucide-react';

export type ActiveMenuId =
  | AppModule
  | 'profile'
  | 'consult-form';

export interface NavMenuItem {
  id: ActiveMenuId;
  label: string;
  shortLabel?: string;
}

export const SIDEBAR_MENU_ITEMS: NavMenuItem[] = [
  { id: 'home', label: 'Home' },
  { id: 'workspace', label: 'Không gian làm việc' },
  { id: 'patients', label: 'Hồ sơ bệnh án' },
  { id: 'consult-list', label: 'Hội chẩn' },
  { id: 'results-staff', label: 'Nhập kết quả staff' },
  { id: 'schedule-tt', label: 'Xếp lịch & Dụng cụ' },
  { id: 'mri-register', label: 'Đăng ký MRI' },
  { id: 'mri-scheduler', label: 'Xếp lịch MRI' },
  { id: 'mri-result', label: 'Điền KQ MRI' },
  { id: 'mri-calendar', label: 'Lịch chụp MRI' },
  { id: 'google-sheets', label: 'Virtual Google Sheets' },
  { id: 'excel-export', label: 'Bảng Filter_Consult' },
  { id: 'staff-mgmt', label: 'Quản lý nhân sự' },
];

export const MOBILE_BOTTOM_TAB_ITEMS: NavMenuItem[] = [
  { id: 'home', label: 'Trang chủ', shortLabel: 'Home' },
  { id: 'results-staff', label: 'Staff', shortLabel: 'Staff' },
  { id: 'schedule-tt', label: 'Xếp lịch', shortLabel: 'Lịch' },
  { id: 'patients', label: 'Hồ sơ', shortLabel: 'Hồ sơ' },
];

export const MOBILE_MORE_MENU_IDS: ActiveMenuId[] = [
  'workspace',
  'consult-list',
  'consult-form',
  'schedule-view',
  'cathlab-room',
  'archive',
  'mri-register',
  'mri-scheduler',
  'mri-result',
  'mri-calendar',
  'surgery-room',
  'surgery-scheduler',
  'surgery-schedule-view',
  'google-sheets',
  'excel-export',
  'staff-mgmt',
];

const MOBILE_MORE_LABELS: Partial<Record<ActiveMenuId, string>> = {
  workspace: 'Không gian làm việc',
  'consult-list': 'Hội chẩn',
  'consult-form': 'Đăng ký hội chẩn',
  'schedule-view': 'Xem lịch thông tim',
  'cathlab-room': 'Phòng thông tim',
  archive: 'Lưu trữ',
  'mri-register': 'Đăng ký MRI',
  'mri-scheduler': 'Xếp lịch MRI',
  'mri-result': 'Điền KQ MRI',
  'mri-calendar': 'Lịch chụp MRI',
  'surgery-room': 'Phòng mổ tim',
  'surgery-scheduler': 'Xếp lịch mổ',
  'surgery-schedule-view': 'Xem lịch mổ',
  'google-sheets': 'Virtual Google Sheets',
  'excel-export': 'Bảng Filter_Consult',
  'staff-mgmt': 'Quản lý nhân sự',
};

export function getMobileMoreMenuItems(): NavMenuItem[] {
  return MOBILE_MORE_MENU_IDS.map(id => ({
    id,
    label: MOBILE_MORE_LABELS[id] || id,
  }));
}

export function getNavIcon(id: ActiveMenuId, className = 'w-4 h-4'): ReactNode {
  switch (id) {
    case 'home':
      return <Home className={className} />;
    case 'workspace':
      return <LayoutDashboard className={className} />;
    case 'patients':
      return <Heart className={className} />;
    case 'consult-list':
    case 'consult-form':
      return <ClipboardList className={className} />;
    case 'results-staff':
      return <FileText className={className} />;
    case 'schedule-tt':
    case 'schedule-view':
    case 'mri-calendar':
    case 'surgery-schedule-view':
      return <CalendarDays className={className} />;
    case 'mri-register':
    case 'mri-scheduler':
    case 'mri-result':
      return <Activity className={className} />;
    case 'google-sheets':
      return <Database className={className} />;
    case 'excel-export':
      return <Download className={className} />;
    case 'staff-mgmt':
    case 'profile':
      return <UserCog className={className} />;
    case 'archive':
      return <Archive className={className} />;
    default:
      return <LayoutDashboard className={className} />;
  }
}

export function isBottomTabActive(activeMenu: ActiveMenuId, tabId: ActiveMenuId): boolean {
  if (tabId === 'schedule-tt') {
    return activeMenu === 'schedule-tt' || activeMenu === 'schedule-view';
  }
  if (tabId === 'results-staff') {
    return activeMenu === 'results-staff';
  }
  return activeMenu === tabId;
}

export function isMoreMenuActive(activeMenu: ActiveMenuId): boolean {
  return MOBILE_MORE_MENU_IDS.includes(activeMenu);
}
