import React, { useState } from 'react';
import { motion } from 'motion/react';
import { 
  Users, 
  Workflow, 
  CheckCircle, 
  Activity, 
  CalendarDays,
  FileText,
  HeartPulse,
  LayoutDashboard,
  Heart,
  ClipboardList,
  Database,
  Download,
  Archive,
  Settings,
  AlertTriangle,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import { Patient, Consult, CathLab } from '../types';

interface HomeDashboardProps {
  onNavigate: (menu: string) => void;
  patientCount: number;
  pendingConsultCount: number;
  completedConsultCount: number;
  onOpenScheduler: (type: string) => void;
  onOpenRules: (type: string) => void;
  currentStaffName?: string;
  patients?: Patient[];
  consults?: Consult[];
  cathlabs?: CathLab[];
}

const SHORTCUTS_POOL = [
  { id: 'workspace', label: 'Không gian làm việc', desc: 'Xem tổng quan công việc', iconName: 'LayoutDashboard', color: 'indigo' },
  { id: 'patients', label: 'Hồ sơ bệnh án', desc: 'Tra cứu & Thêm bệnh nhi', iconName: 'Heart', color: 'pink' },
  { id: 'consult-list', label: 'Đăng ký Hội chẩn', desc: 'Đăng ký staff mới', iconName: 'ClipboardList', color: 'amber' },
  { id: 'results-staff', label: 'KQ Hội chẩn', desc: 'Duyệt chỉ định & nhập kết quả', iconName: 'emerald' },
  { id: 'schedule-tt', label: 'Xếp lịch & Dụng cụ', desc: 'Xem tuần, kiểm dụng cụ', iconName: 'CalendarDays', color: 'rose' },
  { id: 'cathlab-room', label: 'Phòng Thông tim', desc: 'Lịch can thiệp trực tiếp', iconName: 'Activity', color: 'blue' },
  { id: 'google-sheets', label: 'Google Sheets', desc: 'Cơ sở dữ liệu virtual', iconName: 'Database', color: 'violet' },
  { id: 'excel-export', label: 'Bảng Filter & Xuất', desc: 'Xuất biên bản hàng loạt', iconName: 'Download', color: 'cyan' },
  { id: 'archive', label: 'Lưu trữ', desc: 'Danh sách hồ sơ hoãn/mổ', iconName: 'Archive', color: 'slate' },
];

const renderIcon = (name: string, className: string) => {
  switch (name) {
    case 'LayoutDashboard': return <LayoutDashboard className={className} />;
    case 'Heart': return <Heart className={className} />;
    case 'ClipboardList': return <ClipboardList className={className} />;
    case 'FileText': return <FileText className={className} />;
    case 'CalendarDays': return <CalendarDays className={className} />;
    case 'Activity': return <Activity className={className} />;
    case 'Database': return <Database className={className} />;
    case 'Download': return <Download className={className} />;
    case 'Archive': return <Archive className={className} />;
    default: return <Users className={className} />;
  }
};

const getColorClasses = (color: string) => {
  switch (color) {
    case 'pink': return { bg: 'bg-pink-50 hover:bg-pink-100/50 border-pink-100', text: 'text-[#d2145a]' };
    case 'amber': return { bg: 'bg-amber-50 hover:bg-amber-100/50 border-amber-100', text: 'text-amber-600' };
    case 'emerald': return { bg: 'bg-emerald-50 hover:bg-emerald-100/50 border-emerald-100', text: 'text-emerald-600' };
    case 'rose': return { bg: 'bg-rose-50 hover:bg-rose-100/50 border-rose-100', text: 'text-rose-600' };
    case 'blue': return { bg: 'bg-blue-50 hover:bg-blue-100/50 border-blue-100', text: 'text-blue-600' };
    case 'violet': return { bg: 'bg-violet-50 hover:bg-violet-100/50 border-violet-100', text: 'text-violet-600' };
    case 'cyan': return { bg: 'bg-cyan-50 hover:bg-cyan-100/50 border-cyan-100', text: 'text-cyan-600' };
    case 'indigo': return { bg: 'bg-indigo-50 hover:bg-indigo-100/50 border-indigo-100', text: 'text-indigo-600' };
    default: return { bg: 'bg-slate-50 hover:bg-slate-100 border-slate-150', text: 'text-slate-600' };
  }
};

export default function HomeDashboard({
  onNavigate,
  patientCount,
  pendingConsultCount,
  completedConsultCount,
  onOpenScheduler,
  onOpenRules,
  currentStaffName,
  patients = [],
  consults = [],
  cathlabs = []
}: HomeDashboardProps) {
  
  const [isConfiguring, setIsConfiguring] = useState(false);
  const [selectedShortcutIds, setSelectedShortcutIds] = useState<string[]>(() => {
    const saved = localStorage.getItem('home_quick_shortcuts');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed.slice(0, 4);
      } catch (e) {
        console.error(e);
      }
    }
    // Default 4 shortcuts
    return ['patients', 'consult-list', 'results-staff', 'cathlab-room'];
  });

  const handleToggleShortcut = (id: string) => {
    if (selectedShortcutIds.includes(id)) {
      setSelectedShortcutIds(prev => {
        const next = prev.filter(x => x !== id);
        localStorage.setItem('home_quick_shortcuts', JSON.stringify(next));
        return next;
      });
    } else {
      if (selectedShortcutIds.length >= 4) {
        alert("Tối đa hiển thị được 4 view truy cập nhanh! Vui lòng bỏ bớt 1 view trước khi chọn.");
        return;
      }
      setSelectedShortcutIds(prev => {
        const next = [...prev, id];
        localStorage.setItem('home_quick_shortcuts', JSON.stringify(next));
        return next;
      });
    }
  };

  const pendingCathLabCount = consults.filter(c => 
    c.TransferredToCathLab === true && 
    !c.Removed &&
    !cathlabs.some(cath => String(cath.ConsultKey) === String(c.ConsultKey))
  ).length;

  const completedCathLabCount = cathlabs.length;

  const missingDeviceCount = consults.filter(c => c.CheckDevice === 'Thiếu' && !c.Removed).length;

  // Date and Week scheduling for Weekly Calendar
  const [referenceDate, setReferenceDate] = useState(() => {
    const today = new Date();
    // System context year is 2026
    if (today.getFullYear() !== 2026) {
      return new Date(2026, 5, 10); // June 10th, 2026
    }
    return today;
  });

  const getMonday = (d: Date) => {
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(d.setDate(diff));
    monday.setHours(0, 0, 0, 0);
    return monday;
  };

  const getFormattedDateKey = (str: string | undefined): string => {
    if (!str) return '';
    const trimmed = str.trim().split('T')[0];
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
    
    const parts = trimmed.split('-');
    if (parts.length === 3 && parts[2].length === 4) {
      return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
    }
    const slashParts = trimmed.split('/');
    if (slashParts.length === 3) {
      if (slashParts[2].length === 4) {
        return `${slashParts[2]}-${slashParts[1].padStart(2, '0')}-${slashParts[0].padStart(2, '0')}`;
      } else if (slashParts[0].length === 4) {
        return `${slashParts[0]}-${slashParts[1].padStart(2, '0')}-${slashParts[2].padStart(2, '0')}`;
      }
    }
    return trimmed;
  };

  const currentMonday = getMonday(new Date(referenceDate));
  
  const daysOfWeek = Array.from({ length: 7 }, (_, i) => {
    const day = new Date(currentMonday);
    day.setDate(currentMonday.getDate() + i);
    return day;
  });

  const handlePrevWeek = () => {
    setReferenceDate(prev => {
      const next = new Date(prev);
      next.setDate(prev.getDate() - 7);
      return next;
    });
  };

  const handleNextWeek = () => {
    setReferenceDate(prev => {
      const next = new Date(prev);
      next.setDate(prev.getDate() + 7);
      return next;
    });
  };

  const handleResetToToday = () => {
    const today = new Date();
    if (today.getFullYear() !== 2026) {
      setReferenceDate(new Date(2026, 5, 10));
    } else {
      setReferenceDate(today);
    }
  };

  const formatDateToKey = (date: Date) => {
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  };

  const todayKey = formatDateToKey(new Date());

  const getVNMonthDayStr = (date: Date) => {
    const dd = String(date.getDate()).padStart(2, '0');
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    return `${dd}/${mm}`;
  };

  const getVNFullDateStr = (date: Date) => {
    const dd = String(date.getDate()).padStart(2, '0');
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const yyyy = date.getFullYear();
    return `${dd}/${mm}/${yyyy}`;
  };

  const getVNDayName = (dayIndex: number) => {
    const days = ['Chủ Nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];
    return days[dayIndex];
  };

  const stats = [
    { label: "Tổng bệnh nhi", value: patientCount, icon: <Users className="w-5 h-5 text-blue-500" />, bg: "bg-blue-50" },
    { label: "Ca chờ hội chẩn", value: pendingConsultCount, icon: <Workflow className="w-5 h-5 text-amber-500" />, bg: "bg-amber-50" },
    { label: "Ca đã hội chẩn", value: completedConsultCount, icon: <CheckCircle className="w-5 h-5 text-emerald-500" />, bg: "bg-emerald-50" }
  ];

  return (
    <div className="h-full flex flex-col overflow-hidden bg-slate-50 p-4 sm:p-5 space-y-4 animate-in fade-in duration-300">
      <div className="bg-gradient-to-r from-pink-600 to-[#d2145a] rounded-3xl p-5 sm:p-6 text-white shadow-sm relative overflow-hidden shrink-0">
        <div className="absolute right-0 top-0 opacity-10 pointer-events-none transform translate-x-10 -translate-y-10">
          <HeartPulse className="w-48 h-48" />
        </div>
        <div className="relative z-10 max-w-2xl">
          <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight mb-1">
            Xin chào, {currentStaffName || 'Bác sĩ'}!
          </h1>
          <p className="text-pink-100 font-medium text-xs sm:text-sm leading-relaxed">
            Hệ thống Quản lý bệnh nhân Tim bẩm sinh (CHD MANAGEMENT V5.0). Đây là không gian làm việc số hóa giúp bạn theo dõi xuyên suốt từ lúc đăng ký hội chẩn, chuẩn bị, xếp lịch, can thiệp và theo dõi tái khám bệnh nhân
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 shrink-0">
        {stats.map((stat, idx) => (
          <motion.div 
            key={idx}
            whileHover={{ y: -1 }}
            className="bg-white rounded-2xl p-4 border border-slate-150 shadow-sm flex items-center justify-between"
          >
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">{stat.label}</p>
              <p className="text-xl font-black text-slate-800">{stat.value}</p>
            </div>
            <div className={`p-2.5 rounded-xl ${stat.bg}`}>
              {stat.icon}
            </div>
          </motion.div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 flex-1 min-h-0 min-w-0 pb-1">
        
        {/* TRUY CẬP NHANH SECTION */}
        <div className="bg-white border border-slate-150 rounded-2xl p-4 shadow-sm flex flex-col h-full overflow-hidden">
          <div className="flex-1 flex flex-col min-h-0">
            <div className="flex items-center justify-between mb-4 shrink-0">
              <h3 className="font-extrabold text-slate-800 text-sm flex items-center gap-2">
                <Activity className="w-4 h-4 text-pink-600" /> TRUY CẬP NHANH
              </h3>
              <button
                onClick={() => setIsConfiguring(!isConfiguring)}
                className="text-xs text-pink-600 hover:text-pink-800 font-extrabold flex items-center gap-1 bg-pink-50 hover:bg-pink-150/50 px-2.5 py-1 rounded-xl transition border border-pink-100 shrink-0"
              >
                <Settings className="w-3.5 h-3.5 animate-spin-hover" />
                {isConfiguring ? 'Xong' : 'Tùy chọn hiển thị'}
              </button>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto pr-0.5">
              {isConfiguring ? (
                <div className="bg-slate-50 border border-slate-150 rounded-2xl p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Chọn tối đa 4 phím tắt:</span>
                    <span className="text-[10px] text-pink-600 font-bold font-mono">Đã chọn {selectedShortcutIds.length}/4</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {SHORTCUTS_POOL.map(sh => {
                      const isSelected = selectedShortcutIds.includes(sh.id);
                      const colDef = getColorClasses(sh.color || 'slate');
                      return (
                        <button
                          key={sh.id}
                          onClick={() => handleToggleShortcut(sh.id)}
                          className={`flex items-center justify-between p-2 rounded-xl border transition-all text-left ${
                            isSelected 
                              ? `bg-pink-50/50 border-pink-200` 
                              : 'bg-white border-slate-200 hover:bg-slate-50'
                          }`}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${isSelected ? 'bg-white' : 'bg-slate-100'}`}>
                              {renderIcon(sh.iconName, `w-4 h-4 ${isSelected ? 'text-[#d2145a]' : 'text-slate-500'}`)}
                            </div>
                            <div className="min-w-0">
                              <p className="text-[11px] font-bold text-slate-800 leading-tight truncate">{sh.label}</p>
                              <p className="text-[9px] text-slate-400 leading-none mt-0.5 truncate">{sh.desc}</p>
                            </div>
                          </div>
                          <div className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center shrink-0 ${isSelected ? 'border-pink-500 bg-[#d2145a] text-white' : 'border-slate-300 bg-white'}`}>
                            {isSelected && <span className="text-[8px] font-black">✓</span>}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  {selectedShortcutIds.map(sid => {
                    const sh = SHORTCUTS_POOL.find(x => x.id === sid);
                    if (!sh) return null;
                    const colDef = getColorClasses(sh.color || 'slate');
                    return (
                      <button 
                        key={sh.id}
                        onClick={() => onNavigate(sh.id)}
                        className="flex flex-col items-center justify-center p-4 rounded-2xl bg-slate-50 hover:bg-pink-50 border border-slate-100 hover:border-pink-150 transition group text-center h-24 shadow-sm"
                      >
                        <div className="w-9 h-9 rounded-full bg-white shadow-sm flex items-center justify-center mb-1.5 group-hover:scale-110 transition-transform">
                          {renderIcon(sh.iconName, `w-4 h-4 text-slate-600 group-hover:${colDef.text}`)}
                        </div>
                        <span className="text-[11px] font-black text-slate-700 tracking-tight group-hover:text-[#d2145a]">{sh.label}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* STATS COUNT DASHBOARD SECTION */}
        <div className="bg-white border border-slate-150 rounded-2xl p-4 shadow-sm flex flex-col h-full overflow-hidden">
          <div className="flex-1 min-h-0 flex flex-col">
            <div className="grid grid-cols-3 gap-2.5 shrink-0">
              
              {/* Card 1: Chờ thông tim */}
              <div className="bg-amber-50/75 border border-amber-200/50 rounded-2xl p-2 sm:p-2.5 flex flex-col justify-between min-h-[90px] relative overflow-hidden group">
                <div className="absolute top-1.5 right-1.5 opacity-10">
                  <Activity className="w-6 h-6 text-amber-600" />
                </div>
                <div>
                  <span className="text-[8px] sm:text-[9px] font-black uppercase text-amber-800 tracking-tight">Chờ thông tim</span>
                  <p className="text-xl sm:text-2xl font-black text-amber-950 mt-0.5 font-mono">{pendingCathLabCount}</p>
                </div>
                <p className="text-[8px] text-amber-700/85 font-extrabold leading-tight">Chờ chuyển phòng</p>
              </div>

              {/* Card 2: Đã thông tim */}
              <div className="bg-emerald-50/75 border border-emerald-200/50 rounded-2xl p-2 sm:p-2.5 flex flex-col justify-between min-h-[90px] relative overflow-hidden group">
                <div className="absolute top-1.5 right-1.5 opacity-10">
                  <CheckCircle className="w-6 h-6 text-emerald-600" />
                </div>
                <div>
                  <span className="text-[8px] sm:text-[9px] font-black uppercase text-emerald-800 tracking-tight">Đã thông tim</span>
                  <p className="text-xl sm:text-2xl font-black text-emerald-950 mt-0.5 font-mono">{completedCathLabCount}</p>
                </div>
                <p className="text-[8px] text-emerald-700/85 font-extrabold leading-tight">Can thiệp thành công</p>
              </div>

              {/* Card 3: Thiếu dụng cụ */}
              <div className="bg-rose-50/75 border border-rose-200/50 rounded-2xl p-2 sm:p-2.5 flex flex-col justify-between min-h-[90px] relative overflow-hidden group">
                <div className="absolute top-1.5 right-1.5 opacity-10">
                  <AlertTriangle className="w-6 h-6 text-rose-600" />
                </div>
                <div>
                  <span className="text-[8px] sm:text-[9px] font-black uppercase text-rose-800 tracking-tight">Thiếu dụng cụ</span>
                  <p className="text-xl sm:text-2xl font-black text-rose-950 mt-0.5 font-mono">{missingDeviceCount}</p>
                </div>
                <p className="text-[8px] text-rose-700/85 font-extrabold leading-tight">Ca thiếu vật tư</p>
              </div>

            </div>

            {/* WEEKLY CALENDAR SECTION */}
            <div className="mt-3.5 pt-3.5 border-t border-slate-150 flex-1 min-h-0 flex flex-col overflow-hidden">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3 shrink-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <CalendarDays className="w-4 h-4 text-[#d2145a] shrink-0" />
                  <span className="text-xs font-black text-slate-800 uppercase tracking-tight shrink-0">Lịch can thiệp dự kiến</span>
                  <span className="text-[10px] font-black text-[#d2145a] font-mono bg-pink-100/50 border border-pink-100 px-2 py-0.5 rounded-full shrink-0">
                    {getVNFullDateStr(daysOfWeek[0])} - {getVNFullDateStr(daysOfWeek[6])}
                  </span>
                </div>
                
                <div className="flex items-center gap-1 shrink-0 self-end sm:self-auto">
                  <button
                    onClick={handlePrevWeek}
                    className="p-1 hover:bg-slate-100 rounded-lg border border-slate-200 transition text-slate-600 cursor-pointer"
                    title="Tuần trước"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={handleResetToToday}
                    className="text-[9px] font-black uppercase text-[#d2145a] bg-pink-50 hover:bg-pink-100 border border-pink-100 px-2 py-0.5 rounded-lg transition cursor-pointer"
                  >
                    Hôm nay
                  </button>
                  <button
                    onClick={handleNextWeek}
                    className="p-1 hover:bg-slate-100 rounded-lg border border-slate-200 transition text-slate-600 cursor-pointer"
                    title="Tuần sau"
                  >
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Day rows stack (Only this scrollable) */}
              <div className="flex-1 min-h-0 overflow-y-auto pr-1 space-y-2">
                {(() => {
                  const validDays = daysOfWeek.filter(day => {
                    const dayKey = formatDateToKey(day);
                    return consults.some(c => !c.Removed && c.PlannedCathLabDate && getFormattedDateKey(c.PlannedCathLabDate) === dayKey);
                  });

                  if (validDays.length === 0) {
                    return (
                      <div className="bg-slate-50 border border-slate-150 rounded-xl p-4 text-center">
                        <span className="text-[10px] text-slate-400 font-medium italic">Không có ca can thiệp dự kiến nào được lên lịch trong tuần này</span>
                      </div>
                    );
                  }

                  return validDays.map((day) => {
                    const dayKey = formatDateToKey(day);
                    const isToday = dayKey === todayKey;
                    const dayName = getVNDayName(day.getDay());
                    const dayNumStr = getVNMonthDayStr(day);
                    
                    const dayConsults = consults.filter(c => {
                      if (!c.PlannedCathLabDate || c.Removed) return false;
                      return getFormattedDateKey(c.PlannedCathLabDate) === dayKey;
                    });

                    return (
                      <div 
                        key={dayKey}
                        className={`flex flex-col sm:flex-row gap-2 p-2.5 rounded-xl border transition ${
                          isToday 
                            ? 'bg-pink-50/30 border-pink-200 shadow-sm shadow-pink-100/50' 
                            : 'bg-white border-slate-150 hover:border-slate-300'
                        }`}
                      >
                        {/* Day Label */}
                        <div className="flex sm:flex-col items-baseline sm:items-center justify-between sm:justify-center w-full sm:w-[80px] shrink-0 pb-1 sm:pb-0 sm:border-r border-slate-100">
                          <span className={`text-[10px] font-black tracking-tight ${isToday ? 'text-[#d2145a]' : 'text-slate-700'}`}>
                            {dayName}
                          </span>
                          <span className="text-[9px] font-extrabold font-mono text-slate-400 sm:mt-0.5">
                            {dayNumStr}
                          </span>
                          {isToday && (
                            <span className="hidden sm:block text-[8px] font-black bg-[#d2145a] text-white px-1.5 py-0.5 rounded-full font-mono uppercase mt-1">
                              Today
                            </span>
                          )}
                        </div>

                        {/* Content Area */}
                        <div className="flex-1 min-w-0 flex flex-col gap-1.5 justify-center pl-0 sm:pl-2">
                          <div className="grid grid-cols-1 gap-1.5">
                            {dayConsults.map((c) => {
                              const pat = patients.find(p => p.PatientKey === c.PatientKey);
                              
                              return (
                                <div 
                                  key={c.ConsultKey}
                                  className="flex items-center justify-between gap-1.5 bg-slate-50 hover:bg-slate-100/80 border border-slate-150/70 p-2 rounded-lg transition"
                                >
                                  <span className="text-[11px] font-black text-slate-800 uppercase truncate">
                                    {pat?.PatientName || 'Không rõ tên'}
                                  </span>
                                  <span className="text-[9px] font-extrabold font-mono text-[#d2145a] bg-pink-50 border border-pink-150 px-1.5 py-0.2 rounded shrink-0">
                                    {c.DiagnosisID || 'N/A'}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    );
                  });
                })()}
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
