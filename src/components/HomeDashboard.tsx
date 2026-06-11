import React, { useState, useMemo } from 'react';
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
  ChevronRight,
  ChevronUp,
  ChevronDown
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
  const [chartMetric, setChartMetric] = useState<'cathlabs' | 'staff_consults' | 'cathlabs_yearly'>('cathlabs');
  const [chartYear, setChartYear] = useState<number>(2026);
  const [isConfiguringChartMetric, setIsConfiguringChartMetric] = useState(false);
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

  // Compute latest consults map to mimic CathLab waitlist logic
  const latestConsultsMap = useMemo(() => {
    const map = new Map<string, string>();
    const sorted = [...(consults || [])].sort((a, b) => {
      const aDate = a.ConsultDate || '';
      const bDate = b.ConsultDate || '';
      if (aDate !== bDate) return bDate.localeCompare(aDate);
      return (b.ConsultCreateTime || '').localeCompare(a.ConsultCreateTime || '');
    });

    sorted.forEach(c => {
      if (!c.PatientKey) return;
      if (!map.has(c.PatientKey)) {
        map.set(c.PatientKey, c.ConsultKey);
      }
    });
    return map;
  }, [consults]);

  const eligibleWaitlist = useMemo(() => {
    const ELIGIBLE_RESULTS = [
      "Can thiệp thông tim",
      "Chụp chẩn đoán +/- can thiệp",
      "Chụp chẩn đoán-Đo kháng lực",
      "Chụp chẩn đoán/Đo kháng lực",
      "Tiền Glenn",
      "Tiền Fontan",
      "Điện sinh lý"
    ];

    return (consults || []).filter(c => {
      // Must have ConsultDate of 2026-01-01 or later
      if (!c.ConsultDate) return false;
      const formattedConsultDate = getFormattedDateKey(c.ConsultDate);
      if (formattedConsultDate < '2026-01-01') return false;

      if (latestConsultsMap.get(c.PatientKey) !== c.ConsultKey) return false;
      if (c.Removed === true || (c as any).Removed === 'Có' || (c as any).Removed === 'yes') return false;
      if ((c as any).TransferredToCathLab === true || (c as any).TransferredToCathLab === 'Yes' || (c as any).TransferredToCathLab === 'Có') return false;
      if (!ELIGIBLE_RESULTS.includes(c.ConsultResultID || '')) return false;

      if (
        c.CallStatus === "Đã can thiệp/mổ" || 
        c.CallStatus === "Loại" || 
        c.CallStatus === "Đã làm nơi khác" || 
        c.CallStatus === "Muốn theo dõi nơi khác"
      ) return false;

      const pat = (patients || []).find(p => p.PatientKey == c.PatientKey);
      if (!pat) return false;
      if (pat.Outcome === "Tử vong" || pat.Outcome === "Nặng xin về") return false;

      return true;
    });
  }, [consults, patients, latestConsultsMap]);

  const scheduledCathLabCount = useMemo(() => {
    return eligibleWaitlist.filter(c => !!c.PlannedCathLabDate).length;
  }, [eligibleWaitlist]);

  const completedCathLabCount = (cathlabs || []).length;

  const monthlyCathData = useMemo(() => {
    const counts: Record<string, number> = {};
    
    if (chartMetric === 'cathlabs_yearly') {
      const yearlyCounts: Record<string, number> = {};
      (cathlabs || []).forEach(cath => {
        if (!cath.CathDate) return;
        const formatted = getFormattedDateKey(cath.CathDate);
        if (formatted && formatted.length >= 4) {
          const year = formatted.substring(0, 4);
          yearlyCounts[year] = (yearlyCounts[year] || 0) + 1;
        }
      });
      const currentYear = 2026;
      const result = [];
      // Show years starting from 2018
      for (let y = 2018; y <= currentYear; y++) {
        const yearStr = String(y);
        result.push({
          monthKey: yearStr,
          label: yearStr,
          value: yearlyCounts[yearStr] || 0
        });
      }
      return result;
    }

    if (chartMetric === 'cathlabs') {
      (cathlabs || []).forEach(cath => {
        if (!cath.CathDate) return;
        const formatted = getFormattedDateKey(cath.CathDate);
        if (formatted && formatted.length >= 7) {
          const year = formatted.substring(0, 4);
          const month = formatted.substring(5, 7);
          if (parseInt(year) === chartYear) {
            counts[month] = (counts[month] || 0) + 1;
          }
        }
      });
    } else {
      (consults || []).forEach(c => {
        if (c.ConsultType !== 'Staff thông') return;
        const isRemoved = c.Removed === true || String(c.Removed).toUpperCase() === 'TRUE' || String(c.Removed).toLowerCase() === 'có' || String(c.Removed).toLowerCase() === 'yes';
        if (isRemoved) return;
        if (!c.ConsultDate) return;
        const formatted = getFormattedDateKey(c.ConsultDate);
        if (formatted && formatted.length >= 7) {
          const year = formatted.substring(0, 4);
          const month = formatted.substring(5, 7);
          if (parseInt(year) === chartYear) {
            counts[month] = (counts[month] || 0) + 1;
          }
        }
      });
    }

    const shortYear = String(chartYear).substring(2);
    const result = [];
    for (let m = 1; m <= 12; m++) {
      const padM = String(m).padStart(2, '0');
      result.push({
        monthKey: `${chartYear}-${padM}`,
        label: `${padM}/${shortYear}`,
        value: counts[padM] || 0
      });
    }
    return result;
  }, [cathlabs, consults, chartMetric, chartYear]);

  const maxCathCount = useMemo(() => {
    const vals = monthlyCathData.map(d => d.value);
    const max = Math.max(...vals, 1);
    return max;
  }, [monthlyCathData]);

  const totalCathInChart = useMemo(() => {
    return monthlyCathData.reduce((sum, d) => sum + d.value, 0);
  }, [monthlyCathData]);

  const missingDeviceCount = useMemo(() => {
    return eligibleWaitlist.filter(c => !c.PlannedCathLabDate && c.CheckDevice === 'Thiếu').length;
  }, [eligibleWaitlist]);

  const pendingSchedulingCount = useMemo(() => {
    return eligibleWaitlist.filter(c => !c.PlannedCathLabDate).length;
  }, [eligibleWaitlist]);

  const pendingCathStaffCount = (consults || []).filter(c => 
    c.ConsultType === 'Staff thông' && 
    (!c.ConsultResultID || ['nodata', 'no data', '—', '-'].includes(String(c.ConsultResultID).trim().toLowerCase())) && 
    !c.Removed
  ).length;

  const pendingSurgStaffCount = (consults || []).filter(c => 
    c.ConsultType === 'Staff mổ' && 
    (!c.ConsultResultID || ['nodata', 'no data', '—', '-'].includes(String(c.ConsultResultID).trim().toLowerCase())) && 
    !c.Removed
  ).length;

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

  const STATS_POOL = [
    { id: 'da-thong', label: "Đã thông tim", value: completedCathLabCount, icon: <CheckCircle className="w-8 h-8 text-emerald-500" />, bg: "bg-emerald-50", color: "text-emerald-950", border: "border-emerald-100" },
    { id: 'da-xep-lich', label: "Đã xếp lịch", value: scheduledCathLabCount, icon: <Activity className="w-8 h-8 text-amber-500" />, bg: "bg-amber-50", color: "text-amber-950", border: "border-amber-100" },
    { id: 'cho-xep-lich', label: "Chờ xếp lịch", value: pendingSchedulingCount, icon: <CalendarDays className="w-8 h-8 text-blue-500" />, bg: "bg-blue-50", color: "text-blue-950", border: "border-blue-100" },
    { id: 'thieu-dung-cu', label: "Thiếu dụng cụ", value: missingDeviceCount, icon: <AlertTriangle className="w-8 h-8 text-rose-500" />, bg: "bg-rose-50", color: "text-rose-950", border: "border-rose-100" },
    { id: 'cho-staff-thong', label: "Chờ staff thông", value: pendingCathStaffCount, icon: <Users className="w-8 h-8 text-purple-500" />, bg: "bg-purple-50", color: "text-purple-950", border: "border-purple-100" },
    { id: 'cho-staff-mo', label: "Chờ staff mổ", value: pendingSurgStaffCount, icon: <Users className="w-8 h-8 text-indigo-500" />, bg: "bg-indigo-50", color: "text-indigo-950", border: "border-indigo-100" },
    { id: 'ca-cho-staff', label: "Ca chờ staff", value: pendingCathStaffCount + pendingSurgStaffCount, icon: <Users className="w-8 h-8 text-indigo-500" />, bg: "bg-indigo-50", color: "text-indigo-950", border: "border-indigo-100" },
    { id: 'da-hoi-chan', label: "Ca đã hội chẩn", value: completedConsultCount, icon: <CheckCircle className="w-8 h-8 text-teal-500" />, bg: "bg-teal-50", color: "text-teal-950", border: "border-teal-100" }
  ];

  const [selectedStatIds, setSelectedStatIds] = useState<string[]>(() => {
    const saved = localStorage.getItem('home_selected_stats');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          return parsed.map((id: string) => id === 'cho-thong' ? 'da-xep-lich' : id);
        }
      } catch (e) {
        // Fallback
      }
    }
    return ['da-thong', 'da-xep-lich', 'cho-xep-lich', 'thieu-dung-cu'];
  });

  const [isConfiguringStats, setIsConfiguringStats] = useState(false);

  const handleToggleStat = (id: string) => {
    setSelectedStatIds(prev => {
      let next;
      if (prev.includes(id)) {
        next = prev.filter(x => x !== id);
      } else {
        next = [...prev, id];
      }
      localStorage.setItem('home_selected_stats', JSON.stringify(next));
      return next;
    });
  };

  const visibleStats = STATS_POOL.filter(s => selectedStatIds.includes(s.id));

  return (
    <div className="h-full flex flex-col overflow-hidden bg-slate-50 pt-2 px-4 pb-4 sm:pt-2 sm:px-5 sm:pb-5 space-y-3 sm:space-y-4 animate-in fade-in duration-300">
      <div style={{ width: '1098.02px', height: '90px' }} className="bg-gradient-to-r from-pink-600 to-[#d2145a] rounded-3xl px-5 sm:px-6 text-white shadow-sm relative overflow-hidden shrink-0 flex items-center">
        <div className="absolute right-0 top-0 opacity-10 pointer-events-none transform translate-x-10 -translate-y-10">
          <HeartPulse className="w-48 h-48 animate-pulse" />
        </div>
        <div className="relative z-10 max-w-4xl">
          <h1 className="text-base sm:text-lg font-extrabold tracking-tight mb-0.5 leading-none">
            Xin chào, {currentStaffName || 'Bác sĩ'}!
          </h1>
          <p className="text-pink-100 font-semibold text-[10px] sm:text-[11px] leading-snug">
            Hệ thống Quản lý bệnh nhân Tim bẩm sinh (CHD MANAGEMENT V5.0). Đây là không gian làm việc số hóa giúp bạn theo dõi xuyên suốt từ lúc đăng ký hội chẩn, chuẩn bị, xếp lịch, can thiệp và theo dõi tái khám bệnh nhân
          </p>
        </div>
      </div>

      <div className="relative shrink-0 z-20">
        <div className="absolute top-0 right-0 -mt-6">
           <button
             onClick={() => setIsConfiguringStats(!isConfiguringStats)}
             className="group text-[10px] text-slate-400 hover:text-slate-700 flex items-center bg-slate-100 hover:bg-slate-200 px-2 py-1 rounded-full border border-slate-200 transition"
           >
             <Settings className={`w-3 h-3 ${isConfiguringStats ? '' : 'group-hover:animate-spin'}`} />
             {isConfiguringStats ? (
               <span className="opacity-100 ml-1">Xong</span>
             ) : (
               <span className="max-w-0 opacity-0 overflow-hidden group-hover:max-w-[150px] group-hover:opacity-100 group-hover:ml-1 transition-all duration-300 whitespace-nowrap">
                 Tùy chọn hiển thị
               </span>
             )}
           </button>
        </div>
        
        {isConfiguringStats && (
          <div className="absolute right-0 top-3 bg-white border border-slate-200 shadow-xl rounded-xl p-3 z-50 w-72">
            <p className="text-[10px] font-bold text-slate-400 mb-2 uppercase tracking-wider">Chọn thẻ hiển thị ({selectedStatIds.length}/{STATS_POOL.length}):</p>
            <div className="space-y-1 max-h-60 overflow-y-auto">
              {STATS_POOL.map(stat => (
                <label key={stat.id} className="flex items-center gap-2 text-[11px] font-bold text-slate-700 hover:bg-slate-50 p-2 rounded-lg cursor-pointer transition">
                  <input 
                    type="checkbox" 
                    checked={selectedStatIds.includes(stat.id)} 
                    onChange={() => handleToggleStat(stat.id)}
                    className="rounded text-pink-600 focus:ring-pink-500 cursor-pointer"
                  />
                  <div className={`scale-50 -my-3 origin-left`}>{stat.icon}</div>
                  {stat.label}
                </label>
              ))}
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
          {visibleStats.map((stat, idx) => (
            <motion.div 
              key={idx}
              whileHover={{ y: -1 }}
              className={`bg-white rounded-2xl p-3 border ${stat.border} shadow-sm flex flex-col justify-between relative overflow-hidden group min-h-[85px]`}
            >
              <div className="absolute top-1 right-1 opacity-[0.08] transform group-hover:scale-110 group-hover:rotate-6 transition-all duration-300">
                {stat.icon}
              </div>
              <div className="z-10 relative">
                <span className="text-[10px] font-black uppercase text-slate-500 tracking-tight">{stat.label}</span>
                <p className={`text-3xl font-black mt-0.5 font-mono ${stat.color} leading-none`}>{stat.value}</p>
              </div>
            </motion.div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 flex-1 min-h-0 min-w-0 pb-1">
        
        {/* LEFT COLUMN: Chart + Quick Access */}
        <div className="flex flex-col space-y-4 h-full min-h-0 lg:max-w-[538.003px] w-full">
          
          {/* BIỂU ĐỒ THỐNG KÊ TIM THEO THÁNG */}
          <div 
            style={{ height: '130px', width: '538.003px' }} 
            className="bg-white border border-slate-150 rounded-2xl p-3 shadow-sm flex items-center justify-between shrink-0 relative max-w-full z-20"
          >
            {/* Title & Total info */}
            <div className="flex flex-col justify-center shrink-0 pr-3 border-r border-[#f1f5f9] h-full w-[155px]">
              <span className="text-[10px] font-black uppercase text-[#d2145a] tracking-tight flex items-center gap-1 shrink-0">
                <span className="w-1.5 h-1.5 rounded-full bg-[#d2145a] animate-pulse shrink-0"></span>
                <span className="truncate">Thống kê {chartMetric === 'cathlabs' ? 'thông tim' : chartMetric === 'cathlabs_yearly' ? 'thông tim năm' : 'staff thông'}</span>
              </span>
              <div className="mt-1 flex items-baseline gap-1 bg-slate-50 border border-slate-100 rounded-lg px-2 py-0.5 max-w-max">
                <span className="text-[10px] text-slate-500 font-bold">Tổng:</span>
                <span className="text-xs font-black font-mono text-[#d2145a]">{totalCathInChart}</span>
                <span className="text-[9px] text-slate-400 font-bold">ca</span>
              </div>
            </div>

            {/* Render Bars */}
            <div className="flex-1 flex items-end justify-around h-full px-2 my-0.5">
              {monthlyCathData.map((d) => {
                const percentage = Math.max((d.value / maxCathCount) * 100, 4);
                return (
                  <div key={d.monthKey} className="flex flex-col items-center justify-end h-full group relative flex-1">
                    {/* Tooltip */}
                    <div className="absolute bottom-full mb-1 opacity-0 group-hover:opacity-100 transition-opacity bg-slate-800 text-white font-mono text-[9px] font-black px-1.5 py-0.5 rounded shadow-lg pointer-events-none z-50 whitespace-nowrap transform -translate-y-0.5 scale-90">
                      {d.value} ca
                    </div>

                    {/* Bar visual */}
                    <div className="w-2.5 bg-slate-50 rounded-t-md relative overflow-hidden flex-1 flex items-end">
                      <motion.div
                        initial={{ height: 0 }}
                        animate={{ height: `${percentage}%` }}
                        transition={{ duration: 0.8, ease: "easeOut" }}
                        className="w-full bg-gradient-to-t from-pink-500 to-[#d2145a] rounded-t-md group-hover:from-pink-600 group-hover:to-pink-700 transition-all cursor-pointer"
                      />
                    </div>

                    {/* X-axis Month Label */}
                    <span className="text-[8px] font-black text-slate-400 font-mono mt-1 shrink-0">
                      {d.label.split('/')[0]}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Controls panel: 2 buttons on vertical line */}
            <div className="flex flex-col items-center justify-between border-l border-[#f1f5f9] pl-2.5 h-full py-0.5 shrink-0 select-none">
              {/* Option 1: Metric Gear/Config Popup */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setIsConfiguringChartMetric(!isConfiguringChartMetric)}
                  className={`p-1 rounded-lg border transition-all ${
                    isConfiguringChartMetric 
                      ? 'bg-pink-100 border-pink-200 text-[#d2145a]' 
                      : 'bg-slate-50 border-slate-200 text-slate-500 hover:bg-slate-100 hover:text-slate-800'
                  }`}
                  title="Tùy chọn loại thống kê"
                >
                  <Settings className={`w-3.5 h-3.5 ${isConfiguringChartMetric ? 'rotate-45' : ''} transition-transform`} />
                </button>

                {isConfiguringChartMetric && (
                  <div className="absolute right-0 top-7 bg-white border border-slate-200 shadow-xl rounded-xl p-2 z-50 w-44 animate-in fade-in slide-in-from-top-1 duration-150">
                    <p className="text-[9px] font-black text-slate-400 mb-1.5 uppercase tracking-wider">Loại thống kê:</p>
                    <button
                      type="button"
                      onClick={() => {
                        setChartMetric('cathlabs');
                        setIsConfiguringChartMetric(false);
                      }}
                      className={`w-full text-left px-2 py-1 rounded-lg text-[10px] font-bold flex items-center gap-1.5 transition ${
                        chartMetric === 'cathlabs' 
                          ? 'bg-pink-50 text-[#d2145a]' 
                          : 'text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      <span className={`w-1.5 h-1.5 rounded-full ${chartMetric === 'cathlabs' ? 'bg-[#d2145a]' : 'bg-transparent border border-slate-400'}`}></span>
                      Số ca thông tim
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setChartMetric('staff_consults');
                        setIsConfiguringChartMetric(false);
                      }}
                      className={`w-full text-left px-2 py-1 rounded-lg text-[10px] font-bold flex items-center gap-1.5 mt-1 transition ${
                        chartMetric === 'staff_consults' 
                          ? 'bg-pink-50 text-[#d2145a]' 
                          : 'text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      <span className={`w-1.5 h-1.5 rounded-full ${chartMetric === 'staff_consults' ? 'bg-[#d2145a]' : 'bg-transparent border border-slate-400'}`}></span>
                      Số ca staff thông
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setChartMetric('cathlabs_yearly');
                        setIsConfiguringChartMetric(false);
                      }}
                      className={`w-full text-left px-2 py-1 rounded-lg text-[10px] font-bold flex items-center gap-1.5 mt-1 transition ${
                        chartMetric === 'cathlabs_yearly' 
                          ? 'bg-pink-50 text-[#d2145a]' 
                          : 'text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      <span className={`w-1.5 h-1.5 rounded-full ${chartMetric === 'cathlabs_yearly' ? 'bg-[#d2145a]' : 'bg-transparent border border-slate-400'}`}></span>
                      Thống kê theo năm
                    </button>
                  </div>
                )}
              </div>

              {/* Option 2: Year Picker (with up & down arrows directly below the first button) */}
              <div className={`flex flex-col items-center border border-slate-100 rounded-lg bg-slate-50 p-0.5 shadow-sm transition-all duration-200 ${chartMetric === 'cathlabs_yearly' ? 'opacity-30 pointer-events-none' : ''}`}>
                <button 
                  type="button"
                  onClick={() => setChartYear(prev => prev + 1)}
                  className="text-slate-400 hover:text-[#d2145a] p-0.5 line-none transition-colors"
                  title="Tăng năm"
                >
                  <ChevronUp className="w-3 h-3" />
                </button>
                <span className="text-[9px] font-extrabold font-mono text-[#d2145a] leading-none my-0.5 px-1 min-w-[24px] text-center">
                  {chartYear}
                </span>
                <button 
                  type="button"
                  onClick={() => setChartYear(prev => prev - 1)}
                  className="text-slate-400 hover:text-[#d2145a] p-0.5 line-none transition-colors"
                  title="Giảm năm"
                >
                  <ChevronDown className="w-3 h-3" />
                </button>
              </div>
            </div>
          </div>

          {/* TRUY CẬP NHANH SECTION */}
          <div className="bg-white border border-slate-150 rounded-2xl p-4 shadow-sm flex flex-col flex-1 overflow-hidden">
            <div className="flex-1 flex flex-col min-h-0">
              <div className="flex items-center justify-between mb-4 shrink-0">
                <h3 className="font-extrabold text-slate-800 text-sm flex items-center gap-2">
                  <Activity className="w-4 h-4 text-pink-600" /> TRUY CẬP NHANH
                </h3>
                <button
                  onClick={() => setIsConfiguring(!isConfiguring)}
                  className="text-xs text-[#d2145a] hover:text-pink-800 font-extrabold flex items-center gap-1 bg-pink-50 hover:bg-pink-100 px-2.5 py-1 rounded-xl transition border border-pink-100 shrink-0"
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
        </div>

        {/* STATS COUNT DASHBOARD SECTION */}
        <div className="bg-white border border-slate-150 rounded-2xl p-4 shadow-sm flex flex-col h-full overflow-hidden">
          <div className="flex-1 min-h-0 flex flex-col">
            {/* WEEKLY CALENDAR SECTION */}
            <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
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
                              const pat = patients.find(p => p.PatientKey == c.PatientKey);
                              
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
