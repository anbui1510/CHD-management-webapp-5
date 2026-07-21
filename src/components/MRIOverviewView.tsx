import React, { useState, useMemo, useEffect } from 'react';
import { motion } from 'motion/react';
import {
  Activity,
  CalendarDays,
  CheckCircle,
  AlertTriangle,
  Users,
  Settings,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ChevronDown,
  LayoutDashboard,
  Heart,
  ClipboardList,
  Database,
  Download,
  Info,
  SlidersHorizontal,
} from 'lucide-react';
import { Patient, Consult, CMR, findPatientByKey, normalizePatientKey } from '../types';

interface MRIOverviewViewProps {
  patients: Patient[];
  consults: Consult[];
  cmrs: CMR[];
  sources?: any[];
  staffList?: any[];
  currentStaffName?: string;
  onNavigate: (menu: string) => void;
}

type PiePeriodMode = 'all' | 'month' | 'quarter' | 'year';

interface PieSegment {
  label: string;
  value: number;
  color: string;
  percent: number;
}

const PIE_COLORS = ['#7c3aed', '#a855f7', '#0891b2', '#059669', '#f59e0b', '#2563eb', '#e11d48'];

const getFormattedDateKey = (str?: string): string => {
  if (!str) return '';
  const trimmed = String(str).trim().split('T')[0];
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;

  const slashParts = trimmed.split('/');
  if (slashParts.length === 3) {
    if (slashParts[2].length === 4) {
      return `${slashParts[2]}-${slashParts[1].padStart(2, '0')}-${slashParts[0].padStart(2, '0')}`;
    }
    if (slashParts[0].length === 4) {
      return `${slashParts[0]}-${slashParts[1].padStart(2, '0')}-${slashParts[2].padStart(2, '0')}`;
    }
  }

  const dashParts = trimmed.split('-');
  if (dashParts.length === 3 && dashParts[2].length === 4) {
    return `${dashParts[2]}-${dashParts[1].padStart(2, '0')}-${dashParts[0].padStart(2, '0')}`;
  }

  return trimmed;
};

const formatDateToKey = (date: Date) => {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
};

const getMonday = (date: Date): Date => {
  const day = date.getDay();
  const diff = date.getDate() - day + (day === 0 ? -6 : 1);
  return new Date(date.setDate(diff));
};

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

export default function MRIOverviewView({
  patients = [],
  consults = [],
  cmrs = [],
  sources = [],
  staffList = [],
  currentStaffName,
  onNavigate,
}: MRIOverviewViewProps) {
  // Calendar states
  const [referenceDate, setReferenceDate] = useState<Date>(() => new Date());

  // Histogram states
  const [chartYear, setChartYear] = useState<number>(2026);

  // Pie chart states
  const [hoveredPieSegment, setHoveredPieSegment] = useState<PieSegment | null>(null);
  const [piePeriodMode, setPiePeriodMode] = useState<PiePeriodMode>('all');
  const [pieFilterYear, setPieFilterYear] = useState<number>(2026);
  const [pieFilterMonth, setPieFilterMonth] = useState<number>(6);
  const [pieFilterQuarter, setPieFilterQuarter] = useState<number>(2);

  // Build unified list of MRI items
  const patientsByKey = useMemo(() => {
    const map = new Map<string, Patient>();
    patients.forEach(patient => {
      if (patient.PatientKey) map.set(String(patient.PatientKey).trim().toLowerCase(), patient);
      if (patient.PatientID1) map.set(String(patient.PatientID1).trim().toLowerCase(), patient);
    });
    return map;
  }, [patients]);

  const allMriItems = useMemo(() => {
    const normalizedCmrs = cmrs.map((cmr, index) => {
      const key = cmr.CMRKey || cmr.CMRkey || `cmr_no_key_${index}`;
      const patient =
        patientsByKey.get(String(cmr.PatientKey || '').trim().toLowerCase()) ||
        patientsByKey.get(String(cmr.MBN || '').trim().toLowerCase());
      const consult = consults.find(c => c.ConsultKey && c.ConsultKey === cmr.ConsultKey);

      return {
        ...cmr,
        CMRKey: key,
        PatientKey: cmr.PatientKey || patient?.PatientKey || '',
        __patient: patient,
        __consult: consult
      };
    });

    const existingConsultKeys = new Set(normalizedCmrs.map(cmr => String(cmr.ConsultKey || '').trim()).filter(Boolean));
    const existingPatientKeys = new Set(normalizedCmrs.map(cmr => String(cmr.PatientKey || '').trim()).filter(Boolean));

    const syntheticFromConsults = consults
      .filter(consult => String(consult.ConsultResultID || '').trim().toLowerCase() === 'chụp mri')
      .filter(consult => {
        if (consult.ConsultKey && existingConsultKeys.has(String(consult.ConsultKey).trim())) return false;
        if (consult.PatientKey && existingPatientKeys.has(String(consult.PatientKey).trim())) return false;
        const patient = patientsByKey.get(String(consult.PatientKey || '').trim().toLowerCase());
        const outcome = String(patient?.Outcome || '').trim().toLowerCase();
        return outcome !== 'tử vong' && outcome !== 'nặng xin về';
      })
      .map((consult) => {
        const patient = patientsByKey.get(String(consult.PatientKey || '').trim().toLowerCase());
        return {
          CMRKey: `pending_${consult.ConsultKey}`,
          ConsultKey: consult.ConsultKey,
          PatientKey: consult.PatientKey,
          MBN: patient?.PatientID1 || '',
          'Họ và tên': patient?.PatientName || '',
          PatientWeight: consult.PatientWeight || '',
          CMRDiagnosisID: consult.DiagnosisID || '',
          CMRDiagnosis: consult.DetailDiagnosis || '',
          CMRRequest: consult.DetailConsultResult || consult.ConsultNote || '',
          DepartRequest: consult.Department || '',
          CMRCallStatus: '',
          __patient: patient,
          __consult: consult,
          __isSynthetic: true
        };
      });

    return [...normalizedCmrs, ...syntheticFromConsults];
  }, [cmrs, consults, patientsByKey]);

  // Aggregate stats
  const stats = useMemo(() => {
    const completed = allMriItems.filter(item => !!getFormattedDateKey(item.CMRDate));
    const scheduledPending = allMriItems.filter(item => !!getFormattedDateKey(item.CMRScheduledDate) && !getFormattedDateKey(item.CMRDate));
    const unscheduledPending = allMriItems.filter(item => !getFormattedDateKey(item.CMRScheduledDate) && !getFormattedDateKey(item.CMRDate));
    const anesthesiaRequired = allMriItems.filter(item => item.Anesthesia === 'Khám gây mê trước' && !getFormattedDateKey(item.CMRDate));

    return {
      completedCount: completed.length,
      scheduledPendingCount: scheduledPending.length,
      unscheduledPendingCount: unscheduledPending.length,
      anesthesiaCount: anesthesiaRequired.length,
      completedList: completed,
      scheduledPendingList: scheduledPending
    };
  }, [allMriItems]);

  // Histogram calculation (Monthly completed scans)
  const monthlyData = useMemo(() => {
    const counts = Array.from({ length: 12 }, (_, i) => ({
      monthKey: i + 1,
      label: `Tháng ${i + 1}`,
      value: 0,
    }));

    stats.completedList.forEach(item => {
      const dateStr = getFormattedDateKey(item.CMRDate || item.CMRScheduledDate);
      if (!dateStr) return;
      const date = new Date(dateStr);
      if (date.getFullYear() === chartYear) {
        const month = date.getMonth();
        if (month >= 0 && month < 12) {
          counts[month].value += 1;
        }
      }
    });

    const maxCount = Math.max(...counts.map(c => c.value), 1);
    const totalCount = counts.reduce((sum, c) => sum + c.value, 0);

    return { counts, maxCount, totalCount };
  }, [stats.completedList, chartYear]);

  // Pie chart calculation (Completed MRI by diagnosis)
  const pieData = useMemo(() => {
    const filtered = stats.completedList.filter(item => {
      const dateStr = getFormattedDateKey(item.CMRDate || item.CMRScheduledDate);
      if (!dateStr) return false;
      const date = new Date(dateStr);
      
      if (piePeriodMode === 'month') {
        return date.getFullYear() === pieFilterYear && (date.getMonth() + 1) === pieFilterMonth;
      }
      if (piePeriodMode === 'quarter') {
        const q = Math.floor(date.getMonth() / 3) + 1;
        return date.getFullYear() === pieFilterYear && q === pieFilterQuarter;
      }
      if (piePeriodMode === 'year') {
        return date.getFullYear() === pieFilterYear;
      }
      return true; // all
    });

    const countsMap = new Map<string, number>();
    filtered.forEach(item => {
      const diag = String(item.CMRDiagnosisID || 'Chưa rõ').trim().toUpperCase();
      countsMap.set(diag, (countsMap.get(diag) || 0) + 1);
    });

    const total = filtered.length;
    const sorted = Array.from(countsMap.entries())
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value);

    const segments: PieSegment[] = sorted.map((item, idx) => ({
      label: item.label,
      value: item.value,
      color: PIE_COLORS[idx % PIE_COLORS.length],
      percent: total > 0 ? (item.value / total) * 100 : 0
    }));

    return { segments, total };
  }, [stats.completedList, piePeriodMode, pieFilterYear, pieFilterMonth, pieFilterQuarter]);

  // Calendar calculations (Current week)
  const currentMonday = getMonday(new Date(referenceDate));
  const daysOfWeek = Array.from({ length: 7 }, (_, i) => {
    const day = new Date(currentMonday);
    day.setDate(currentMonday.getDate() + i);
    return day;
  });

  const weeklyScheduledCount = useMemo(() => {
    const weekKeys = new Set(daysOfWeek.map(day => formatDateToKey(day)));
    return stats.scheduledPendingList.filter(c =>
      c.CMRScheduledDate && weekKeys.has(getFormattedDateKey(c.CMRScheduledDate))
    ).length;
  }, [stats.scheduledPendingList, referenceDate]);

  const todayKey = formatDateToKey(new Date());

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
    setReferenceDate(new Date());
  };

  return (
    <div className="h-full flex flex-col overflow-y-auto md:overflow-hidden bg-slate-50 pt-2 px-3 sm:px-5 pb-4 space-y-3 sm:space-y-4 animate-in fade-in duration-300">
      {/* Banner */}
      <div className="w-full min-h-[90px] bg-gradient-to-r from-purple-600 to-indigo-600 rounded-3xl px-5 sm:px-6 text-white shadow-sm relative overflow-hidden shrink-0 flex items-center">
        <div className="absolute right-0 top-0 opacity-10 pointer-events-none transform translate-x-10 -translate-y-10">
          <Activity className="w-48 h-48 animate-pulse text-purple-200" />
        </div>
        <div className="relative z-10 max-w-4xl">
          <h1 className="text-base sm:text-lg font-extrabold tracking-tight mb-0.5 leading-none">
            Tổng quan QUẢN LÝ MRI TIM
          </h1>
          <p className="text-purple-100 font-semibold text-[10px] sm:text-[11px] leading-snug">
            Không gian thống kê số liệu và điều phối lịch chụp cộng hưởng từ (MRI) tim. Theo dõi tiến trình từ lúc đăng ký chỉ định đến khi thực hiện thành công.
          </p>
        </div>
      </div>

      {/* Stats Cards Row */}
      <div className="shrink-0">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <motion.div
            whileHover={{ y: -1 }}
            className="bg-white rounded-2xl p-3 border border-purple-100 shadow-sm flex flex-col justify-between relative overflow-hidden group min-h-[85px]"
          >
            <div className="absolute top-1 right-1 opacity-[0.08] transform group-hover:scale-110 group-hover:rotate-6 transition-all duration-300">
              <CheckCircle className="w-8 h-8 text-purple-650" />
            </div>
            <div className="z-10 relative">
              <span className="text-[10px] font-black uppercase text-slate-500 tracking-tight">Đã chụp MRI</span>
              <p className="text-3xl font-black mt-0.5 font-mono text-purple-950 leading-none">{stats.completedCount}</p>
            </div>
          </motion.div>

          <motion.div
            whileHover={{ y: -1 }}
            className="bg-white rounded-2xl p-3 border border-blue-100 shadow-sm flex flex-col justify-between relative overflow-hidden group min-h-[85px]"
          >
            <div className="absolute top-1 right-1 opacity-[0.08] transform group-hover:scale-110 group-hover:rotate-6 transition-all duration-300">
              <Activity className="w-8 h-8 text-blue-500" />
            </div>
            <div className="z-10 relative">
              <span className="text-[10px] font-black uppercase text-slate-500 tracking-tight">Đã xếp lịch (Chờ chụp)</span>
              <p className="text-3xl font-black mt-0.5 font-mono text-blue-950 leading-none">{stats.scheduledPendingCount}</p>
            </div>
          </motion.div>

          <motion.div
            whileHover={{ y: -1 }}
            className="bg-white rounded-2xl p-3 border border-amber-100 shadow-sm flex flex-col justify-between relative overflow-hidden group min-h-[85px]"
          >
            <div className="absolute top-1 right-1 opacity-[0.08] transform group-hover:scale-110 group-hover:rotate-6 transition-all duration-300">
              <CalendarDays className="w-8 h-8 text-amber-500" />
            </div>
            <div className="z-10 relative">
              <span className="text-[10px] font-black uppercase text-slate-500 tracking-tight">Chờ xếp lịch chụp</span>
              <p className="text-3xl font-black mt-0.5 font-mono text-amber-950 leading-none">{stats.unscheduledPendingCount}</p>
            </div>
          </motion.div>

          <motion.div
            whileHover={{ y: -1 }}
            className="bg-white rounded-2xl p-3 border border-rose-100 shadow-sm flex flex-col justify-between relative overflow-hidden group min-h-[85px]"
          >
            <div className="absolute top-1 right-1 opacity-[0.08] transform group-hover:scale-110 group-hover:rotate-6 transition-all duration-300">
              <AlertTriangle className="w-8 h-8 text-rose-500" />
            </div>
            <div className="z-10 relative">
              <span className="text-[10px] font-black uppercase text-slate-500 tracking-tight">Cần gây mê chụp</span>
              <p className="text-3xl font-black mt-0.5 font-mono text-rose-950 leading-none">{stats.anesthesiaCount}</p>
            </div>
          </motion.div>
        </div>
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 md:flex-1 md:min-h-0 min-w-0 pb-1">
        
        {/* Left Column: Histogram + Quick Access */}
        <div className="flex flex-col space-y-4 md:h-full md:min-h-0 w-full">
          {/* Histogram */}
          <div className="bg-white border border-slate-150 rounded-2xl p-3 shadow-sm flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 shrink-0 relative w-full min-h-[180px] z-20">
            <div className="flex flex-col justify-center shrink-0 pr-16 sm:pr-3 sm:border-r border-[#f1f5f9] sm:h-full w-full sm:w-[155px]">
              <span className="text-[10px] font-black uppercase text-purple-655 tracking-tight flex items-center gap-1 shrink-0">
                <span className="leading-tight whitespace-normal break-words">
                  Histogram ca đã chụp MRI
                </span>
              </span>
              <div className="mt-1 flex items-baseline gap-1 bg-slate-50 border border-slate-100 rounded-lg px-2 py-0.5 max-w-max">
                <span className="text-[10px] text-slate-500 font-bold">Tổng:</span>
                <span className="text-xs font-black font-mono text-purple-655">{monthlyData.totalCount}</span>
                <span className="text-[9px] text-slate-400 font-bold">ca</span>
              </div>
            </div>

            {/* Histogram Bars */}
            <div className="flex-1 flex items-end justify-around h-28 sm:h-full px-2 my-0.5">
              {monthlyData.counts.map((d) => {
                const percentage = Math.max((d.value / monthlyData.maxCount) * 100, 4);
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
                        className="w-full bg-gradient-to-t from-purple-400 to-purple-650 rounded-t-md group-hover:from-purple-500 group-hover:to-purple-700 transition-all cursor-pointer"
                      />
                    </div>

                    {/* Label */}
                    <span className="text-[8px] font-black text-slate-400 font-mono mt-1 shrink-0">
                      {String(d.monthKey).padStart(2, '0')}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Year Picker */}
            <div className="absolute top-3 right-3 flex flex-col items-center border border-slate-100 rounded-lg bg-slate-50 p-0.5 shadow-sm transition-all duration-200">
              <button 
                type="button"
                onClick={() => setChartYear(prev => prev + 1)}
                className="text-slate-400 hover:text-purple-655 p-0.5 line-none transition-colors"
                title="Tăng năm"
              >
                <ChevronUp className="w-3.5 h-3.5" />
              </button>
              <span className="text-[9px] font-extrabold font-mono text-purple-655 leading-none my-0.5 px-1 min-w-[24px] text-center">
                {chartYear}
              </span>
              <button 
                type="button"
                onClick={() => setChartYear(prev => prev - 1)}
                className="text-slate-400 hover:text-purple-655 p-0.5 line-none transition-colors"
                title="Giảm năm"
              >
                <ChevronDown className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Quick Access shortcuts */}
          <div className="bg-white border border-slate-150 rounded-2xl p-4 shadow-sm flex flex-col flex-1 overflow-hidden">
            <h3 className="font-extrabold text-slate-800 text-sm flex items-center gap-2 mb-4 shrink-0">
              <Activity className="w-4 h-4 text-purple-600" /> TRUY CẬP NHANH
            </h3>
            <div className="grid grid-cols-2 gap-3 flex-1 min-h-0 overflow-y-auto">
              <button 
                onClick={() => onNavigate('mri-register')}
                className="flex flex-col items-center justify-center p-4 rounded-2xl bg-slate-50 hover:bg-purple-50 border border-slate-100 hover:border-purple-200 transition group text-center h-24 shadow-sm"
              >
                <div className="w-9 h-9 rounded-full bg-white shadow-sm flex items-center justify-center mb-1.5 group-hover:scale-110 transition-transform">
                  <Database className="w-4 h-4 text-slate-650 group-hover:text-purple-600" />
                </div>
                <span className="text-[11px] font-black text-slate-700 tracking-tight group-hover:text-purple-605">Đăng ký MRI</span>
              </button>

              <button 
                onClick={() => onNavigate('mri-scheduler')}
                className="flex flex-col items-center justify-center p-4 rounded-2xl bg-slate-50 hover:bg-purple-50 border border-slate-100 hover:border-purple-200 transition group text-center h-24 shadow-sm"
              >
                <div className="w-9 h-9 rounded-full bg-white shadow-sm flex items-center justify-center mb-1.5 group-hover:scale-110 transition-transform">
                  <SlidersHorizontal className="w-4 h-4 text-slate-650 group-hover:text-purple-600" />
                </div>
                <span className="text-[11px] font-black text-slate-700 tracking-tight group-hover:text-purple-655">Xếp lịch MRI</span>
              </button>

              <button 
                onClick={() => onNavigate('mri-result')}
                className="flex flex-col items-center justify-center p-4 rounded-2xl bg-slate-50 hover:bg-purple-50 border border-slate-100 hover:border-purple-200 transition group text-center h-24 shadow-sm"
              >
                <div className="w-9 h-9 rounded-full bg-white shadow-sm flex items-center justify-center mb-1.5 group-hover:scale-110 transition-transform">
                  <Download className="w-4 h-4 text-slate-650 group-hover:text-purple-600" />
                </div>
                <span className="text-[11px] font-black text-slate-700 tracking-tight group-hover:text-purple-655">Điền kết quả MRI</span>
              </button>

              <button 
                onClick={() => onNavigate('mri-calendar')}
                className="flex flex-col items-center justify-center p-4 rounded-2xl bg-slate-50 hover:bg-purple-50 border border-slate-100 hover:border-purple-200 transition group text-center h-24 shadow-sm"
              >
                <div className="w-9 h-9 rounded-full bg-white shadow-sm flex items-center justify-center mb-1.5 group-hover:scale-110 transition-transform">
                  <CalendarDays className="w-4 h-4 text-slate-650 group-hover:text-purple-600" />
                </div>
                <span className="text-[11px] font-black text-slate-700 tracking-tight group-hover:text-purple-655">Lịch chụp MRI</span>
              </button>
            </div>
          </div>
        </div>

        {/* Right Column: Pie Chart + Calendar */}
        <div className="bg-white border border-slate-150 rounded-2xl p-4 shadow-sm flex flex-col h-full overflow-hidden">
          <div className="flex-1 min-h-0 flex flex-col gap-4">
            
            {/* Pie Chart Box */}
            <div className="order-1 h-[48%] min-h-[220px] border border-slate-150 rounded-2xl bg-slate-50/60 p-3 flex flex-col overflow-hidden">
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2 shrink-0 mb-2">
                <div className="flex items-center gap-1.5">
                  <Database className="w-4 h-4 text-purple-600 shrink-0" />
                  <span className="text-xs font-black text-slate-800 uppercase tracking-tight truncate">
                    Thống kê tỷ lệ bệnh lý
                  </span>
                  <span className="text-[10px] font-black text-purple-650 font-mono bg-purple-100/50 border border-purple-150 px-2 py-0.5 rounded-full shrink-0">
                    {pieData.total} ca đã chụp
                  </span>
                </div>

                <div className="flex flex-wrap bg-white border border-slate-200 rounded-xl p-0.5 shadow-sm gap-0.5">
                  {([
                    ['all', 'Tất cả'],
                    ['month', 'Tháng'],
                    ['quarter', 'Quý'],
                    ['year', 'Năm']
                  ] as Array<[PiePeriodMode, string]>).map(([id, label]) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setPiePeriodMode(id)}
                      className={`px-2 py-0.5 rounded-lg text-[9px] font-black transition cursor-pointer ${
                        piePeriodMode === id
                          ? 'bg-slate-800 text-white shadow-sm'
                          : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-between gap-2 mb-2 shrink-0">
                <div className="flex items-center gap-1.5">
                  {piePeriodMode === 'month' && (
                    <select
                      value={pieFilterMonth}
                      onChange={(e) => setPieFilterMonth(Number(e.target.value))}
                      className="bg-white border border-slate-200 rounded-lg px-2 py-0.5 text-[9px] font-black text-slate-700 focus:outline-none"
                    >
                      {Array.from({ length: 12 }, (_, idx) => idx + 1).map(month => (
                        <option key={month} value={month}>Tháng {month}</option>
                      ))}
                    </select>
                  )}
                  {piePeriodMode === 'quarter' && (
                    <select
                      value={pieFilterQuarter}
                      onChange={(e) => setPieFilterQuarter(Number(e.target.value))}
                      className="bg-white border border-slate-200 rounded-lg px-2 py-0.5 text-[9px] font-black text-slate-700 focus:outline-none"
                    >
                      {[1, 2, 3, 4].map(quarter => (
                        <option key={quarter} value={quarter}>Quý {quarter}</option>
                      ))}
                    </select>
                  )}
                  {piePeriodMode !== 'all' && (
                    <div className="flex items-center bg-white border border-slate-200 rounded-lg overflow-hidden shadow-sm">
                      <button
                        type="button"
                        onClick={() => setPieFilterYear(prev => prev - 1)}
                        className="p-0.5 text-slate-500 hover:text-purple-655 hover:bg-slate-50 cursor-pointer"
                      >
                        <ChevronLeft className="w-3 h-3" />
                      </button>
                      <span className="px-2 text-[9px] font-black font-mono text-purple-655 min-w-[36px] text-center">
                        {pieFilterYear}
                      </span>
                      <button
                        type="button"
                        onClick={() => setPieFilterYear(prev => prev + 1)}
                        className="p-0.5 text-slate-500 hover:text-purple-655 hover:bg-slate-50 cursor-pointer"
                      >
                        <ChevronRight className="w-3 h-3" />
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Pie SVG + legend */}
              <div className="flex-1 min-h-0 grid grid-cols-1 sm:grid-cols-[minmax(140px,200px)_1fr] gap-3 items-center overflow-hidden">
                <div className="relative w-full max-w-[176px] aspect-square mx-auto shrink-0 sm:-translate-y-2" onMouseLeave={() => setHoveredPieSegment(null)}>
                  {(() => {
                    const radius = 38;
                    const circumference = 2 * Math.PI * radius;
                    let cursor = 0;
                    return (
                      <svg viewBox="0 0 100 100" className="absolute inset-0 w-full h-full drop-shadow-sm overflow-visible">
                        {pieData.segments.length === 0 ? (
                          <circle cx="50" cy="50" r={radius} fill="none" stroke="#e2e8f0" strokeWidth="12" />
                        ) : pieData.segments.map(segment => {
                          const dashLength = (segment.percent / 100) * circumference;
                          const dashOffset = -cursor;
                          cursor += dashLength;
                          return (
                            <circle
                              key={segment.label}
                              cx="50"
                              cy="50"
                              r={radius}
                              fill="none"
                              stroke={segment.color}
                              strokeWidth="12"
                              strokeDasharray={`${dashLength} ${circumference - dashLength}`}
                              strokeDashoffset={dashOffset}
                              transform="rotate(-90 50 50)"
                              className="cursor-pointer transition-opacity hover:opacity-80"
                              onMouseEnter={() => setHoveredPieSegment(segment)}
                            >
                              <title>{`${segment.label}: ${segment.value} ca (${segment.percent.toFixed(0)}%)`}</title>
                            </circle>
                          );
                        })}
                      </svg>
                    );
                  })()}
                  {hoveredPieSegment && (
                    <div className="absolute left-1/2 -translate-x-1/2 -top-3 z-20 bg-slate-900 text-white rounded-lg px-2.5 py-1.5 shadow-xl text-center pointer-events-none min-w-[128px]">
                      <div className="text-[9px] font-black uppercase tracking-wide truncate">{hoveredPieSegment.label}</div>
                      <div className="text-[10px] font-mono font-black text-purple-200">
                        {hoveredPieSegment.value} ca ({hoveredPieSegment.percent.toFixed(0)}%)
                      </div>
                    </div>
                  )}
                  <div className="absolute inset-[32px] rounded-full bg-white border border-slate-100 shadow-sm flex flex-col items-center justify-center text-center px-2">
                    <span className="text-[9.5px] font-black uppercase text-slate-400 leading-tight">
                      Mã bệnh lý
                    </span>
                    <span className="text-3xl font-black font-mono text-purple-650 leading-none mt-1">
                      {pieData.total}
                    </span>
                  </div>
                </div>

                <div className="h-full max-h-full min-h-0 self-stretch overflow-y-auto pr-1 space-y-1.5">
                  {pieData.segments.length === 0 ? (
                    <div className="h-full min-h-[100px] flex items-center justify-center text-center">
                      <span className="text-[10px] text-slate-400 font-semibold italic">
                        Chưa có dữ liệu thống kê
                      </span>
                    </div>
                  ) : (
                    pieData.segments.map(segment => (
                      <div key={segment.label} className="bg-white border border-slate-100 rounded-xl px-2.5 py-1.5 shadow-xs">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: segment.color }} />
                            <span className="text-[10.5px] font-black text-slate-700 truncate" title={segment.label}>
                              {segment.label}
                            </span>
                          </div>
                          <div className="flex items-baseline gap-1 shrink-0">
                            <span className="text-[10px] font-black font-mono text-slate-800">{segment.value}</span>
                            <span className="text-[9px] font-black font-mono text-purple-600">
                              {segment.percent.toFixed(0)}%
                            </span>
                          </div>
                        </div>
                        <div className="mt-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full"
                            style={{ width: `${segment.percent}%`, backgroundColor: segment.color }}
                          />
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>

            {/* Weekly Calendar Box */}
            <div className="order-2 h-[52%] min-h-[200px] flex flex-col overflow-hidden">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3 shrink-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <CalendarDays className="w-4 h-4 text-purple-650 shrink-0" />
                  <span className="text-xs font-black text-slate-800 uppercase tracking-tight shrink-0">
                    Lịch chụp MRI dự kiến ({weeklyScheduledCount} ca)
                  </span>
                  <span className="text-[10px] font-black text-purple-650 font-mono bg-purple-100/50 border border-purple-150 px-2 py-0.5 rounded-full shrink-0">
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
                    className="text-[9px] font-black uppercase text-purple-600 bg-purple-50 hover:bg-purple-100 border border-purple-100 px-2 py-0.5 rounded-lg transition cursor-pointer"
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

              {/* Day rows list */}
              <div className="flex-1 min-h-0 overflow-y-auto pr-1 space-y-2">
                {(() => {
                  const validDays = daysOfWeek.filter(day => {
                    const dayKey = formatDateToKey(day);
                    return stats.scheduledPendingList.some(c => c.CMRScheduledDate && getFormattedDateKey(c.CMRScheduledDate) === dayKey);
                  });

                  if (validDays.length === 0) {
                    return (
                      <div className="bg-slate-50 border border-slate-150 rounded-xl p-4 text-center">
                        <span className="text-[10px] text-slate-400 font-medium italic">Không có ca chụp MRI dự kiến nào trong tuần này</span>
                      </div>
                    );
                  }

                  return validDays.map((day) => {
                    const dayKey = formatDateToKey(day);
                    const isToday = dayKey === todayKey;
                    const dayName = getVNDayName(day.getDay());
                    const dayNumStr = getVNMonthDayStr(day);
                    
                    const dayItems = stats.scheduledPendingList.filter(c => {
                      if (!c.CMRScheduledDate) return false;
                      return getFormattedDateKey(c.CMRScheduledDate) === dayKey;
                    });

                    return (
                      <div 
                        key={dayKey}
                        className={`flex flex-col sm:flex-row gap-2 p-2.5 rounded-xl border transition ${
                          isToday 
                            ? 'bg-purple-50/30 border-purple-200 shadow-sm shadow-purple-100/50' 
                            : 'bg-white border-slate-150 hover:border-slate-300'
                        }`}
                      >
                        {/* Day Label */}
                        <div className="flex sm:flex-col items-baseline sm:items-center justify-between sm:justify-center w-full sm:w-[80px] shrink-0 pb-1 sm:pb-0 sm:border-r border-slate-100">
                          <span className={`text-[10px] font-black tracking-tight ${isToday ? 'text-purple-655' : 'text-slate-700'}`}>
                            {dayName}
                          </span>
                          <span className="text-[9px] font-extrabold font-mono text-slate-400 sm:mt-0.5">
                            {dayNumStr}
                          </span>
                          {isToday && (
                            <span className="hidden sm:block text-[8px] font-black bg-purple-600 text-white px-1.5 py-0.5 rounded-full font-mono uppercase mt-1">
                              Today
                            </span>
                          )}
                        </div>

                        {/* Content Area */}
                        <div className="flex-1 min-w-0 flex flex-col gap-1.5 justify-center pl-0 sm:pl-2">
                          <div className="grid grid-cols-1 gap-1.5">
                            {dayItems.map((c, idx) => {
                              const pName = c['Họ và tên'] || c.__patient?.PatientName || 'Bệnh nhi';
                              return (
                                <div 
                                  key={c.CMRKey || idx}
                                  className="flex items-center justify-between gap-1.5 bg-slate-50 hover:bg-slate-100/80 border border-slate-150/70 p-2 rounded-lg transition"
                                >
                                  <span className="text-[11px] font-black text-slate-800 uppercase truncate">
                                    {pName}
                                  </span>
                                  <div className="flex items-center gap-1.5 shrink-0">
                                    {c.Anesthesia === 'Khám gây mê trước' && (
                                      <span className="text-[8px] font-black text-rose-700 bg-rose-50 border border-rose-150 px-1 rounded uppercase">Gây mê</span>
                                    )}
                                    <span className="text-[9px] font-extrabold font-mono text-purple-650 bg-purple-50 border border-purple-150 px-1.5 py-0.2 rounded">
                                      {c.CMRDiagnosisID || 'N/A'}
                                    </span>
                                  </div>
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
