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
  Newspaper,
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
  { id: 'chd-daily-brief', label: 'CHD Daily Brief' },
  { id: 'staff-mgmt', label: 'Quản lý nhân sự' },
];

export const MOBILE_BOTTOM_TAB_ITEMS: NavMenuItem[] = [
  { id: 'home', label: 'Trang chủ', shortLabel: 'Home' },
  { id: 'results-staff', label: 'Staff', shortLabel: 'Staff' },
  { id: 'schedule-tt', label: 'Xếp lịch', shortLabel: 'Lịch' },
  { id: 'patients', label: 'Hồ sơ', shortLabel: 'Hồ sơ' },
];

const MOBILE_SHORT_LABELS: Partial<Record<ActiveMenuId, string>> = {
  workspace: 'Workspace',
  'consult-list': 'Hội chẩn',
  'consult-form': 'ĐK HC',
  'schedule-view': 'Lịch TT',
  'cathlab-room': 'P.TT',
  archive: 'Lưu trữ',
  'mri-register': 'ĐK MRI',
  'mri-scheduler': 'XL MRI',
  'mri-result': 'KQ MRI',
  'mri-calendar': 'Lịch MRI',
  'surgery-room': 'P.Mổ',
  'surgery-scheduler': 'XL Mổ',
  'surgery-schedule-view': 'Lịch Mổ',
  'google-sheets': 'Sheets',
  'excel-export': 'Export',
  'chd-daily-brief': 'Brief',
  'staff-mgmt': 'Nhân sự',
};

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
  'chd-daily-brief',
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
  'chd-daily-brief': 'CHD Daily Brief',
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
    case 'chd-daily-brief':
      return <Newspaper className={className} />;
    case 'staff-mgmt':
    case 'profile':
      return <UserCog className={className} />;
    case 'archive':
      return <Archive className={className} />;
    default:
      return <LayoutDashboard className={className} />;
  }
}

export function getMobileNavItem(id: ActiveMenuId): NavMenuItem {
  const preset = MOBILE_BOTTOM_TAB_ITEMS.find(tab => tab.id === id);
  if (preset) return preset;
  const label = MOBILE_MORE_LABELS[id] || id;
  const shortLabel = MOBILE_SHORT_LABELS[id] || label.split(' ')[0]?.slice(0, 8) || label;
  return { id, label, shortLabel };
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

export function isMoreMenuActive(activeMenu: ActiveMenuId, quickTabIds: ActiveMenuId[] = []): boolean {
  if (activeMenu === 'home' || quickTabIds.includes(activeMenu)) return false;
  return MOBILE_MORE_MENU_IDS.includes(activeMenu);
}
