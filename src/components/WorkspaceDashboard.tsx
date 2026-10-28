import React, { useMemo } from 'react';
import {
  Heart,
  ClipboardList,
  PenTool,
  SlidersHorizontal,
  Archive,
  Calendar,
  Activity,
  Award,
  ShieldCheck,
  Scissors,
  UserCog,
  FileText,
  HelpCircle,
  LayoutDashboard,
} from 'lucide-react';
import type { AppModule } from '../auth/permissions';

interface WorkspaceDashboardProps {
  onNavigate: (menu: string) => void;
  patientCount: number;
  pendingConsultCount: number;
  pendingMriCount?: number;
  canAccessModule: (module: AppModule) => boolean;
}

type WorkspaceTile = {
  module: AppModule;
  target?: string;
  label: string;
  description: string;
  icon: React.ReactNode;
  iconBg: string;
  highlight?: boolean;
};

type WorkspaceSection = {
  title: string;
  tiles: WorkspaceTile[];
};

export default function WorkspaceDashboard({
  onNavigate,
  patientCount,
  pendingConsultCount,
  pendingMriCount = 0,
  canAccessModule,
}: WorkspaceDashboardProps) {
  const sections = useMemo<WorkspaceSection[]>(() => {
    const all: WorkspaceSection[] = [
      {
        title: '1. QUẢN LÝ BỆNH NHÂN - LỊCH HẸN',
        tiles: [
          {
            module: 'patients',
            label: 'Hồ sơ bệnh án',
            description: `${patientCount} BN trong hệ thống`,
            icon: <Heart className="w-6 h-6 text-primary" />,
            iconBg: 'bg-pink-50',
          },
          {
            module: 'schedule-view',
            label: 'Lịch thông tim dự kiến',
            description: 'Lịch phòng Cathlab',
            icon: <Calendar className="w-6 h-6 text-primary" />,
            iconBg: 'bg-rose-50',
          },
          {
            module: 'mri-calendar',
            label: 'Lịch chụp MRI tim',
            description: 'Lịch các ca dự kiến chụp MRI',
            icon: <Calendar className="w-6 h-6 text-purple-600" />,
            iconBg: 'bg-purple-50',
          },
        ],
      },
      {
        title: '2. QUẢN LÝ HỘI CHẨN',
        tiles: [
          {
            module: 'consult-list',
            label: 'Hội chẩn',
            description: `${pendingConsultCount} lượt staff hoàn tất`,
            icon: <ClipboardList className="w-6 h-6 text-teal-600" />,
            iconBg: 'bg-teal-50',
            highlight: true,
          },
          {
            module: 'results-staff',
            label: 'Nhập kết quả staff',
            description: 'Ca đang đợi nhận định',
            icon: <PenTool className="w-6 h-6 text-blue-600" />,
            iconBg: 'bg-blue-50',
          },
        ],
      },
      {
        title: '3. QUẢN LÝ THÔNG TIM',
        tiles: [
          {
            module: 'schedule-tt',
            label: 'Xếp lịch & Dụng cụ',
            description: 'Phân ca can thiệp',
            icon: <SlidersHorizontal className="w-6 h-6 text-emerald-600" />,
            iconBg: 'bg-emerald-50',
          },
          {
            module: 'cathlab-room',
            label: 'Phòng thông tim',
            description: 'Kiểm soát ca thủ thuật',
            icon: <ShieldCheck className="w-6 h-6 text-teal-600" />,
            iconBg: 'bg-teal-50',
          },
          {
            module: 'cathlab-report',
            label: 'Báo cáo thông tim',
            description: 'Thống kê & báo cáo số liệu',
            icon: <FileText className="w-6 h-6 text-pink-650" />,
            iconBg: 'bg-pink-50',
          },
          {
            module: 'archive',
            label: 'Lưu trữ',
            description: 'Đã chuyển phòng TT & ca lưu trữ',
            icon: <Archive className="w-6 h-6 text-slate-500" />,
            iconBg: 'bg-slate-50',
          },
        ],
      },
      {
        title: '4. QUẢN LÝ PHẪU THUẬT',
        tiles: [
          {
            module: 'surgery-room',
            label: 'Phòng phẫu thuật',
            description: 'Kiểm soát ca phẫu thuật tim',
            icon: <Scissors className="w-6 h-6 text-rose-600" />,
            iconBg: 'bg-rose-50',
          },
          {
            module: 'surgery-scheduler',
            label: 'Xếp lịch phẫu thuật',
            description: 'Phân ca mổ tim',
            icon: <SlidersHorizontal className="w-6 h-6 text-rose-600" />,
            iconBg: 'bg-rose-50',
          },
          {
            module: 'surgery-schedule-view',
            label: 'Lịch phẫu thuật dự kiến',
            description: 'Lịch phòng mổ tim',
            icon: <Calendar className="w-6 h-6 text-rose-600" />,
            iconBg: 'bg-rose-50',
          },
        ],
      },
      {
        title: '5. QUẢN LÝ GHÉP TIM',
        tiles: [
          {
            module: 'heart-transplant',
            label: 'Quản lý ghép tim',
            description: 'Danh sách chờ ghép tim & hồ sơ tiêu chuẩn',
            icon: <Heart className="w-6 h-6 text-pink-600" />,
            iconBg: 'bg-pink-50',
          },
        ],
      },
      {
        title: '6. QUẢN LÝ MRI TIM',
        tiles: [
          {
            module: 'mri-overview',
            label: 'Tổng quan MRI',
            description: 'Biểu đồ, số liệu & lịch chụp MRI',
            icon: <LayoutDashboard className="w-6 h-6 text-purple-600" />,
            iconBg: 'bg-purple-50',
          },
          {
            module: 'mri-register',
            label: 'Đăng ký MRI tim',
            description: 'Danh sách đăng ký chụp MRI',
            icon: <Activity className="w-6 h-6 text-purple-600" />,
            iconBg: 'bg-purple-50',
          },
          {
            module: 'mri-scheduler',
            label: 'Xếp lịch MRI',
            description: `${pendingMriCount} ca MRI cần theo dõi`,
            icon: <Activity className="w-6 h-6 text-purple-600" />,
            iconBg: 'bg-purple-50',
          },
          {
            module: 'mri-result',
            label: 'Điền KQ MRI tim',
            description: 'Danh sách chờ điền kết quả MRI tim',
            icon: <PenTool className="w-6 h-6 text-purple-600" />,
            iconBg: 'bg-purple-50',
          },
        ],
      },
      {
        title: '6. QUẢN LÝ NHÂN SỰ',
        tiles: [
          {
            module: 'staff-mgmt',
            label: 'Phân quyền nhân sự',
            description: 'Vai trò mẫu · module · tài khoản',
            icon: <UserCog className="w-6 h-6 text-indigo-600" />,
            iconBg: 'bg-indigo-50',
          },
          {
            module: 'staff-marks',
            target: 'staff-mgmt:marks',
            label: 'Thống kê sẹo workflow',
            description: 'Tổng hợp sẹo · xếp hạng · sự kiện',
            icon: <Award className="w-6 h-6 text-red-600" />,
            iconBg: 'bg-red-50',
          },
          {
            module: 'staff-settings',
            target: 'staff-mgmt:settings',
            label: 'Cài đặt danh mục',
            description: 'Tỉnh thành · chẩn đoán · phương pháp',
            icon: <SlidersHorizontal className="w-6 h-6 text-pink-600" />,
            iconBg: 'bg-pink-50',
          },
          {
            module: 'staff-guide',
            target: 'staff-mgmt:guide',
            label: 'Hướng dẫn sử dụng',
            description: 'Quy trình · vượt quyền · phạt sẹo',
            icon: <HelpCircle className="w-6 h-6 text-emerald-600" />,
            iconBg: 'bg-emerald-50',
          },
        ],
      },
    ];

    return all
      .map(section => ({
        ...section,
        tiles: section.tiles.filter(tile => canAccessModule(tile.module)),
      }))
      .filter(section => section.tiles.length > 0);
  }, [canAccessModule, patientCount, pendingConsultCount, pendingMriCount]);

  if (sections.length === 0) {
    return (
      <div className="flex items-center justify-center p-12 animate-in fade-in duration-300">
        <div className="max-w-md text-center bg-white border border-slate-200 rounded-xl p-8 shadow-sm">
          <p className="text-sm font-bold text-slate-500">
            Tài khoản chưa được cấp quyền module nào. Liên hệ Admin để được phân quyền.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5 md:space-y-8 animate-in fade-in duration-300 p-2 sm:p-4">
      {sections.map(section => (
        <div key={section.title}>
          <h2 className="text-[10px] md:text-[11px] font-extrabold text-slate-500 uppercase tracking-wider mb-2 md:mb-4 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-primary shrink-0" /> {section.title}
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-4">
            {section.tiles.map(tile => (
              <button
                key={`${tile.module}-${tile.target || tile.label}`}
                type="button"
                onClick={() => onNavigate(tile.target || tile.module)}
                className={`bg-white border rounded-2xl p-3.5 sm:p-5 hover:shadow-md transition text-left group flex flex-col min-h-0 max-lg:aspect-[4/3] lg:aspect-auto ${
                  tile.highlight
                    ? 'border-pink-500 shadow-sm hover:bg-pink-50'
                    : 'hover:border-pink-300'
                }`}
              >
                <div
                  className={`w-11 h-11 sm:w-12 sm:h-12 ${tile.iconBg} rounded-xl flex items-center justify-center mb-2 sm:mb-4 shrink-0 group-hover:scale-105 transition-transform [&_svg]:w-6 [&_svg]:h-6`}
                >
                  {tile.icon}
                </div>
                <h3 className="font-extrabold text-sm sm:text-base text-primary mb-1 leading-snug line-clamp-2">
                  {tile.label}
                </h3>
                <p className="text-xs sm:text-sm text-slate-500 leading-snug line-clamp-2">
                  {tile.description}
                </p>
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
