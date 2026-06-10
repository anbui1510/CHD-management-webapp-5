import React from 'react';
import { motion } from 'motion/react';
import { 
  Users, 
  Workflow, 
  CheckCircle, 
  Activity, 
  CalendarDays,
  FileText,
  HeartPulse
} from 'lucide-react';

interface HomeDashboardProps {
  onNavigate: (menu: string) => void;
  patientCount: number;
  pendingConsultCount: number;
  completedConsultCount: number;
  onOpenScheduler: (type: string) => void;
  onOpenRules: (type: string) => void;
  currentStaffName?: string;
}

export default function HomeDashboard({
  onNavigate,
  patientCount,
  pendingConsultCount,
  completedConsultCount,
  onOpenScheduler,
  onOpenRules,
  currentStaffName
}: HomeDashboardProps) {
  
  const stats = [
    { label: "Tổng bệnh nhi", value: patientCount, icon: <Users className="w-5 h-5 text-blue-500" />, bg: "bg-blue-50" },
    { label: "Ca chờ hội chẩn", value: pendingConsultCount, icon: <Workflow className="w-5 h-5 text-amber-500" />, bg: "bg-amber-50" },
    { label: "Ca đã hội chẩn", value: completedConsultCount, icon: <CheckCircle className="w-5 h-5 text-emerald-500" />, bg: "bg-emerald-50" }
  ];

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div className="bg-gradient-to-r from-pink-600 to-[#d2145a] rounded-3xl p-6 sm:p-8 text-white shadow-md relative overflow-hidden">
        <div className="absolute right-0 top-0 opacity-10 pointer-events-none transform translate-x-10 -translate-y-10">
          <HeartPulse className="w-48 h-48" />
        </div>
        <div className="relative z-10 max-w-2xl">
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight mb-2">
            Xin chào, {currentStaffName || 'Bác sĩ'}!
          </h1>
          <p className="text-pink-100 font-medium text-sm sm:text-base leading-relaxed">
            Hệ thống Quản lý bệnh nhân Tim bẩm sinh (CHD MANAGEMENT V4.0). Đây là không gian làm việc số hóa giúp bạn theo dõi xuyên suốt từ lúc đăng ký hội chẩn, can thiệp cho đến lúc phẫu thuật.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {stats.map((stat, idx) => (
          <motion.div 
            key={idx}
            whileHover={{ y: -2 }}
            className="bg-white rounded-2xl p-5 border border-slate-150 shadow-sm flex items-center justify-between"
          >
            <div>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">{stat.label}</p>
              <p className="text-2xl font-black text-slate-800">{stat.value}</p>
            </div>
            <div className={`p-3 rounded-xl ${stat.bg}`}>
              {stat.icon}
            </div>
          </motion.div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white border border-slate-150 rounded-2xl p-5 shadow-sm">
          <h3 className="font-extrabold text-slate-800 text-sm mb-4 flex items-center gap-2">
            <Activity className="w-4 h-4 text-pink-600" /> TRUY CẬP NHANH
          </h3>
          <div className="grid grid-cols-2 gap-3">
            <button 
              onClick={() => onNavigate('patients')}
              className="flex flex-col items-center justify-center p-4 rounded-xl bg-slate-50 hover:bg-pink-50 border border-slate-100 hover:border-pink-200 transition group text-center"
            >
              <div className="w-10 h-10 rounded-full bg-white shadow-sm flex items-center justify-center mb-2 group-hover:scale-110 transition-transform">
                <Users className="w-5 h-5 text-slate-600 group-hover:text-pink-600" />
              </div>
              <span className="text-xs font-bold text-slate-700 group-hover:text-pink-700">Danh sách Bệnh nhi</span>
            </button>

            <button 
              onClick={() => onNavigate('consult-list')}
              className="flex flex-col items-center justify-center p-4 rounded-xl bg-slate-50 hover:bg-amber-50 border border-slate-100 hover:border-amber-200 transition group text-center"
            >
              <div className="w-10 h-10 rounded-full bg-white shadow-sm flex items-center justify-center mb-2 group-hover:scale-110 transition-transform">
                <Workflow className="w-5 h-5 text-slate-600 group-hover:text-amber-600" />
              </div>
              <span className="text-xs font-bold text-slate-700 group-hover:text-amber-700">Danh sách Hội chẩn</span>
            </button>

            <button 
              onClick={() => onNavigate('results-staff')}
              className="flex flex-col items-center justify-center p-4 rounded-xl bg-slate-50 hover:bg-emerald-50 border border-slate-100 hover:border-emerald-200 transition group text-center"
            >
              <div className="w-10 h-10 rounded-full bg-white shadow-sm flex items-center justify-center mb-2 group-hover:scale-110 transition-transform">
                <FileText className="w-5 h-5 text-slate-600 group-hover:text-emerald-600" />
              </div>
              <span className="text-xs font-bold text-slate-700 group-hover:text-emerald-700">KQ Hội chẩn</span>
            </button>

            <button 
              onClick={() => onNavigate('schedule-tt')}
              className="flex flex-col items-center justify-center p-4 rounded-xl bg-slate-50 hover:bg-blue-50 border border-slate-100 hover:border-blue-200 transition group text-center"
            >
              <div className="w-10 h-10 rounded-full bg-white shadow-sm flex items-center justify-center mb-2 group-hover:scale-110 transition-transform">
                <CalendarDays className="w-5 h-5 text-slate-600 group-hover:text-blue-600" />
              </div>
              <span className="text-xs font-bold text-slate-700 group-hover:text-blue-700">Phòng Thông tim</span>
            </button>
          </div>
        </div>

        <div className="bg-white border border-slate-150 rounded-2xl p-5 shadow-sm">
           <h3 className="font-extrabold text-slate-800 text-sm mb-4 flex items-center gap-2">
            <FileText className="w-4 h-4 text-pink-600" /> HƯỚNG DẪN & QUY TRÌNH
          </h3>
          <div className="space-y-2">
            <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
              <p className="font-bold text-xs text-slate-800 mb-1">Quy định Đăng ký Staff</p>
              <p className="text-[11px] text-slate-500 leading-relaxed">
                Đảm bảo cập nhật đầy đủ thông tin hành chính, chẩn đoán chi tiết và dự kiến dụng cụ, giá tiền trước 14h hàng ngày để hội chẩn.
              </p>
            </div>
            <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
              <p className="font-bold text-xs text-slate-800 mb-1">Hoàn thành KQ Hội chẩn</p>
              <p className="text-[11px] text-slate-500 leading-relaxed">
                Bác sĩ trực chính có trách nhiệm bổ sung kết quả hội chẩn lên hệ thống để theo dõi và chuẩn bị dụng cụ.
              </p>
            </div>
            <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
              <p className="font-bold text-xs text-slate-800 mb-1">Xác nhận Can thiệp / Phẫu thuật</p>
              <p className="text-[11px] text-slate-500 leading-relaxed">
                Phòng thông tim và khoa ngoại lồng ngực phối hợp xem danh sách ưu tiên để phân bổ lịch trình.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
