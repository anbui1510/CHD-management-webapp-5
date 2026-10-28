import React, { useState, useMemo, useEffect } from 'react';
import type { AppModule } from '../auth/permissions';
import { motion } from 'motion/react';
import {
  Users,
  Workflow,
  CheckCircle,
  Activity,
  CalendarDays,
  FileText,
  LayoutDashboard,
  Heart,
  ClipboardList,
  Database,
  Download,
  Archive,
  Settings,
  Newspaper,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ChevronDown,
} from 'lucide-react';
import { Patient, Consult, CathLab, findPatientByKey, normalizePatientKey } from '../types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import ChdDailyBriefHomeWidget from './ChdDailyBriefHomeWidget';
import { buildCathlabsByPatientKey, isConsultCathCompleted, isConsultWaitlistExcludedByStatus } from '../utils/cathlabWaitlist';
import { MODAL_TITLE } from '../utils/modalTitles';

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
  canAccessModule: (module: AppModule) => boolean;
  triggerAlert?: (message: string, title?: string) => void;
}

const SHORTCUTS_POOL = [
  { id: 'workspace', label: 'Không gian làm việc', desc: 'Xem tổng quan công việc', iconName: 'LayoutDashboard', color: 'indigo' },
  { id: 'patients', label: 'Hồ sơ bệnh án', desc: 'Tra cứu & Thêm bệnh nhi', iconName: 'Heart', color: 'pink' },
  { id: 'consult-list', label: 'Đăng ký Hội chẩn', desc: 'Đăng ký staff mới', iconName: 'ClipboardList', color: 'amber' },
  { id: 'results-staff', label: 'KQ Hội chẩn', desc: 'Duyệt chỉ định & nhập kết quả', iconName: 'emerald' },
  { id: 'schedule-tt', label: 'Xếp lịch & Dụng cụ', desc: 'Xem tuần, kiểm dụng cụ', iconName: 'CalendarDays', color: 'rose' },
  { id: 'schedule-view', label: 'Lịch thông tim dự kiến', desc: 'Xem lịch cathlab', iconName: 'CalendarDays', color: 'rose' },
  { id: 'cathlab-room', label: 'Phòng Thông tim', desc: 'Lịch can thiệp trực tiếp', iconName: 'Activity', color: 'blue' },
  { id: 'archive', label: 'Lưu trữ', desc: 'Danh sách hồ sơ hoãn/mổ', iconName: 'Archive', color: 'slate' },
  { id: 'mri-register', label: 'Đăng ký MRI', desc: 'Đăng ký chụp MRI tim', iconName: 'Activity', color: 'violet' },
  { id: 'mri-scheduler', label: 'Xếp lịch MRI', desc: 'Phân ca chụp MRI', iconName: 'CalendarDays', color: 'violet' },
  { id: 'mri-result', label: 'Điền KQ MRI', desc: 'Nhập kết quả MRI tim', iconName: 'FileText', color: 'violet' },
  { id: 'mri-calendar', label: 'Lịch chụp MRI', desc: 'Lịch các ca MRI dự kiến', iconName: 'CalendarDays', color: 'violet' },
  { id: 'surgery-room', label: 'Phòng phẫu thuật', desc: 'Nhập kết quả mổ tim', iconName: 'Activity', color: 'rose' },
  { id: 'surgery-scheduler', label: 'Xếp lịch phẫu thuật', desc: 'Phân ca mổ tim', iconName: 'CalendarDays', color: 'rose' },
  { id: 'surgery-schedule-view', label: 'Lịch mổ dự kiến', desc: 'Xem lịch phòng mổ', iconName: 'CalendarDays', color: 'rose' },
  { id: 'google-sheets', label: 'Google Sheets', desc: 'Cơ sở dữ liệu virtual', iconName: 'Database', color: 'violet' },
  { id: 'chd-daily-brief', label: 'CHD Daily Brief', desc: 'Bản tin y văn tim mạch nhi 7h sáng', iconName: 'Newspaper', color: 'blue' },
  { id: 'excel-export', label: 'Bảng Filter & Xuất', desc: 'Xuất biên bản hàng loạt', iconName: 'Download', color: 'cyan' },
  { id: 'staff-mgmt', label: 'Quản lý nhân sự', desc: 'Phân quyền module & tài khoản', iconName: 'LayoutDashboard', color: 'indigo' },
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
    case 'Newspaper': return <Newspaper className={className} />;
    case 'Download': return <Download className={className} />;
    case 'Archive': return <Archive className={className} />;
    default: return <Users className={className} />;
  }
};

const getColorClasses = (_color: string) => {
  return { bg: 'bg-muted hover:bg-accent border-border', text: 'text-foreground' };
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

const getDateTime = (dateValue?: string) => {
  const dateKey = getFormattedDateKey(dateValue);
  if (!dateKey) return 0;
  const time = new Date(dateKey).getTime();
  return Number.isNaN(time) ? 0 : time;
};

const isCompletedConsultResult = (consult: Consult) => {
  const result = String(consult.ConsultResultID || '').trim().toLowerCase();
  return !!result && !['nodata', 'no data', '—', '-'].includes(result);
};

const isDateWithinRange = (dateValue: string | undefined, startDate: string, endDate: string) => {
  const dateKey = getFormattedDateKey(dateValue);
  return !!dateKey && dateKey >= startDate && dateKey <= endDate;
};

const PIE_COLORS = ['#d2145a', '#9f1239', '#fb7185', '#fda4af', '#be185d', '#e11d48', '#881337'];

type PieMetric = 'diagnosis' | 'second_operator' | 'request_by' | 'cath_method';
type PiePeriodMode = 'all' | 'month' | 'quarter' | 'year';

interface PieSegment {
  label: string;
  value: number;
  color: string;
  percent: number;
}

const buildPieSegments = (items: Array<{ label: string; value: number }>, total: number): PieSegment[] => {
  if (total <= 0) return [];
  return items
    .filter(item => item.value > 0)
    .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label))
    .map((item, idx) => ({
      ...item,
      color: PIE_COLORS[idx % PIE_COLORS.length],
      percent: (item.value / total) * 100
    }));
};

const parseCathMethods = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    return value
      .map(item => String(item || '').trim())
      .filter(Boolean);
  }
  return String(value || '')
    .split(/\s*(?:\+|,|;|\n)\s*/g)
    .map(item => item.trim())
    .filter(Boolean);
};

const DEFAULT_SHORTCUT_IDS = ['patients', 'consult-list', 'results-staff', 'cathlab-room'];

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
  cathlabs = [],
  canAccessModule,
  triggerAlert,
}: HomeDashboardProps) {
  
  const [isConfiguring, setIsConfiguring] = useState(false);
  const [chartMetric, setChartMetric] = useState<'cathlabs' | 'staff_consults' | 'cathlabs_yearly'>('cathlabs');
  const [chartYear, setChartYear] = useState<number>(2026);
  const [isConfiguringChartMetric, setIsConfiguringChartMetric] = useState(false);
  const [pieMetric, setPieMetric] = useState<PieMetric>('diagnosis');
  const [hoveredPieSegment, setHoveredPieSegment] = useState<PieSegment | null>(null);
  const [piePeriodMode, setPiePeriodMode] = useState<PiePeriodMode>('all');
  const [pieFilterYear, setPieFilterYear] = useState<number>(() => {
    const year = new Date().getFullYear();
    return year || 2026;
  });
  const [pieFilterMonth, setPieFilterMonth] = useState<number>(() => new Date().getMonth() + 1);
  const [pieFilterQuarter, setPieFilterQuarter] = useState<number>(() => Math.floor(new Date().getMonth() / 3) + 1);

  const allowedShortcuts = useMemo(
    () => SHORTCUTS_POOL.filter(sh => canAccessModule(sh.id as AppModule)),
    [canAccessModule]
  );

  const allowedShortcutIds = useMemo(
    () => allowedShortcuts.map(sh => sh.id),
    [allowedShortcuts]
  );

  const [selectedShortcutIds, setSelectedShortcutIds] = useState<string[]>(() => {
    const saved = localStorage.getItem('home_quick_shortcuts');
    let ids: string[] = DEFAULT_SHORTCUT_IDS;
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) ids = parsed.slice(0, 4);
      } catch (e) {
        console.error(e);
      }
    }
    return ids;
  });

  useEffect(() => {
    setSelectedShortcutIds(prev => {
      const next = prev.filter(id => allowedShortcutIds.includes(id));
      const fallback = DEFAULT_SHORTCUT_IDS.filter(id => allowedShortcutIds.includes(id)).slice(0, 4);
      const resolved = (next.length > 0 ? next : fallback).slice(0, 4);
      localStorage.setItem('home_quick_shortcuts', JSON.stringify(resolved));
      return resolved;
    });
  }, [allowedShortcutIds.join(',')]);

  const handleToggleShortcut = (id: string) => {
    if (selectedShortcutIds.includes(id)) {
      setSelectedShortcutIds(prev => {
        const next = prev.filter(x => x !== id);
        localStorage.setItem('home_quick_shortcuts', JSON.stringify(next));
        return next;
      });
    } else {
      if (selectedShortcutIds.length >= 4) {
        triggerAlert?.(
          'Tối đa hiển thị được 4 view truy cập nhanh! Vui lòng bỏ bớt 1 view trước khi chọn.',
          MODAL_TITLE.warning
        );
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
      const patientKey = normalizePatientKey(c.PatientKey);
      if (!map.has(patientKey)) {
        map.set(patientKey, c.ConsultKey);
      }
    });
    return map;
  }, [consults]);

  const cathlabsByPatientKey = useMemo(() => buildCathlabsByPatientKey(cathlabs || []), [cathlabs]);

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
      if (!c.ConsultDate) return false;

      if (latestConsultsMap.get(normalizePatientKey(c.PatientKey)) !== c.ConsultKey) return false;
      if (isConsultCathCompleted(c, cathlabsByPatientKey.get(normalizePatientKey(c.PatientKey)))) return false;
      if (isConsultWaitlistExcludedByStatus(c.Status)) return false;

      const removed = c.Removed === true || String((c as any).Removed || '').trim().toLowerCase() === 'true' || String((c as any).Removed || '').trim().toLowerCase() === 'có' || String((c as any).Removed || '').trim().toLowerCase() === 'yes';
      if (removed) return false;

      const resID = (c.ConsultResultID || '').trim();
      let matchRes = false;
      if (ELIGIBLE_RESULTS.includes(resID)) {
        matchRes = true;
      } else {
        const normalized = ELIGIBLE_RESULTS.map(e => e.trim().toLowerCase());
        if (normalized.includes(resID.toLowerCase())) matchRes = true;
      }
      if (!matchRes) return false;

      const callSt = String(c.CallStatus || '').trim().toLowerCase();
      if (
        callSt === "đã can thiệp/mổ" || 
        callSt === "loại" || 
        callSt === "đã làm nơi khác" || 
        callSt === "muốn theo dõi nơi khác"
      ) return false;

      const pat = findPatientByKey(patients || [], c.PatientKey);
      if (!pat) return false;
      
      const pOut = String(pat.Outcome || '').toLowerCase().trim();
      if (pOut === "tử vong" || pOut === "nặng xin về") return false;

      return true;
    });
  }, [consults, patients, latestConsultsMap, cathlabsByPatientKey]);

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

  const piePeriodRange = useMemo(() => {
    if (piePeriodMode === 'all') {
      return {
        start: '0000-01-01',
        end: '9999-12-31',
        label: 'Tất cả'
      };
    }
    if (piePeriodMode === 'month') {
      const month = String(pieFilterMonth).padStart(2, '0');
      const lastDay = new Date(pieFilterYear, pieFilterMonth, 0).getDate();
      return {
        start: `${pieFilterYear}-${month}-01`,
        end: `${pieFilterYear}-${month}-${String(lastDay).padStart(2, '0')}`,
        label: `Tháng ${pieFilterMonth}/${pieFilterYear}`
      };
    }
    if (piePeriodMode === 'quarter') {
      const startMonth = (pieFilterQuarter - 1) * 3 + 1;
      const endMonth = startMonth + 2;
      const lastDay = new Date(pieFilterYear, endMonth, 0).getDate();
      return {
        start: `${pieFilterYear}-${String(startMonth).padStart(2, '0')}-01`,
        end: `${pieFilterYear}-${String(endMonth).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`,
        label: `Quý ${pieFilterQuarter}/${pieFilterYear}`
      };
    }
    return {
      start: `${pieFilterYear}-01-01`,
      end: `${pieFilterYear}-12-31`,
      label: `Năm ${pieFilterYear}`
    };
  }, [piePeriodMode, pieFilterYear, pieFilterMonth, pieFilterQuarter]);

  const pieCathlabs = useMemo(() => {
    return (cathlabs || []).filter(cath =>
      isDateWithinRange(cath.CathDate, piePeriodRange.start, piePeriodRange.end)
    );
  }, [cathlabs, piePeriodRange.start, piePeriodRange.end]);

  const pieCompletedConsults = useMemo(() => {
    return (consults || []).filter(c =>
      isCompletedConsultResult(c) &&
      isDateWithinRange(c.ConsultDate, piePeriodRange.start, piePeriodRange.end)
    );
  }, [consults, piePeriodRange.start, piePeriodRange.end]);

  const cathPatientDiagnosisDistribution = useMemo(() => {
    const cathPatientKeys = new Set(
      pieCathlabs
        .map(cath => normalizePatientKey(cath.PatientKey))
        .filter(Boolean)
    );

    // BigQuery-style: COUNT(DISTINCT PatientKey) per CathLab.DiagnosisID on any cath in period.
    const patientsByIcd: Record<string, Set<string>> = {};
    pieCathlabs.forEach(cath => {
      const patientKey = normalizePatientKey(cath.PatientKey);
      const icd = String(cath.DiagnosisID || '').trim();
      if (!patientKey || !icd) return;
      if (!patientsByIcd[icd]) patientsByIcd[icd] = new Set();
      patientsByIcd[icd].add(patientKey);
    });

    const counts = Object.fromEntries(
      Object.entries(patientsByIcd).map(([icd, patients]) => [icd, patients.size])
    );

    return buildPieSegments(
      Object.entries(counts).map(([label, value]) => ({ label, value })),
      cathPatientKeys.size
    );
  }, [pieCathlabs]);

  const secondOperatorDistribution = useMemo(() => {
    const counts: Record<string, number> = {};
    pieCathlabs.forEach(cath => {
      const operator = String(cath._2ndInterventionist || '').trim() || 'Chưa nhập';
      counts[operator] = (counts[operator] || 0) + 1;
    });
    return buildPieSegments(
      Object.entries(counts).map(([label, value]) => ({ label, value })),
      pieCathlabs.length
    );
  }, [pieCathlabs]);

  const cathMethodDistribution = useMemo(() => {
    const counts: Record<string, number> = {};
    let methodEntryTotal = 0;
    pieCathlabs.forEach(cath => {
      const methods = parseCathMethods(cath.CathMethod);
      const uniqueMethods = methods.length > 0 ? [...new Set(methods)] : ['Chưa nhập'];
      uniqueMethods.forEach(method => {
        counts[method] = (counts[method] || 0) + 1;
        methodEntryTotal += 1;
      });
    });
    return buildPieSegments(
      Object.entries(counts).map(([label, value]) => ({ label, value })),
      methodEntryTotal
    );
  }, [pieCathlabs]);

  const requestByDistribution = useMemo(() => {
    const counts: Record<string, number> = {};
    pieCompletedConsults.forEach(c => {
      const requestBy = String(c.RequestBy || '').trim() || 'Chưa nhập';
      counts[requestBy] = (counts[requestBy] || 0) + 1;
    });
    return buildPieSegments(
      Object.entries(counts).map(([label, value]) => ({ label, value })),
      pieCompletedConsults.length
    );
  }, [pieCompletedConsults]);

  const pieConfig = useMemo(() => {
    if (pieMetric === 'second_operator') {
      return {
        title: 'PTV phụ 1',
        subtitle: 'Theo _2ndInterventionist trong CathLab',
        totalLabel: 'ca thông tim',
        total: pieCathlabs.length,
        segments: secondOperatorDistribution
      };
    }
    if (pieMetric === 'cath_method') {
      return {
        title: 'Phương pháp thông tim',
        subtitle: 'Theo CathLab.CathMethod, tính trên lượt thông tim',
        totalLabel: 'lượt thông tim',
        total: pieCathlabs.length,
        segments: cathMethodDistribution
      };
    }
    if (pieMetric === 'request_by') {
      return {
        title: 'BS đăng ký staff',
        subtitle: '',
        totalLabel: 'ca hội chẩn',
        total: pieCompletedConsults.length,
        segments: requestByDistribution
      };
    }
    const cathPatientCount = new Set(pieCathlabs.map(cath => normalizePatientKey(cath.PatientKey)).filter(Boolean)).size;
    return {
      title: 'ICD bệnh nhân đã thông tim',
      subtitle: 'BN từng có mã ICD trên ít nhất 1 ca thông tim (CathLab.DiagnosisID)',
      totalLabel: 'bệnh nhân',
      total: cathPatientCount,
      segments: cathPatientDiagnosisDistribution
    };
  }, [pieMetric, pieCathlabs, pieCompletedConsults, cathPatientDiagnosisDistribution, secondOperatorDistribution, cathMethodDistribution, requestByDistribution]);

  // Date and Week scheduling for Weekly Calendar
  const [referenceDate, setReferenceDate] = useState(() => new Date());

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
    setReferenceDate(new Date());
  };

  const formatDateToKey = (date: Date) => {
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  };

  const todayKey = formatDateToKey(new Date());

  const weeklyScheduledCathCount = useMemo(() => {
    const weekKeys = new Set(daysOfWeek.map(day => formatDateToKey(day)));
    return eligibleWaitlist.filter(c =>
      c.PlannedCathLabDate && weekKeys.has(getFormattedDateKey(c.PlannedCathLabDate))
    ).length;
  }, [eligibleWaitlist, referenceDate]);

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
  const showBriefWidget = canAccessModule('chd-daily-brief');

  return (
    <div className="h-full flex flex-col overflow-y-auto md:overflow-hidden bg-background pt-2 px-3 sm:px-5 pb-4 space-y-3 sm:space-y-4">
      <Card className="shrink-0 gap-2 py-4 shadow-sm">
        <CardHeader className="px-5 sm:px-6">
          <CardTitle className="text-lg">Xin chào, {currentStaffName || 'Bác sĩ'}</CardTitle>
          <CardDescription>
            Hệ thống quản lý bệnh nhân tim bẩm sinh. Theo dõi từ đăng ký hội chẩn, chuẩn bị, xếp lịch, can thiệp đến tái khám.
          </CardDescription>
        </CardHeader>
      </Card>

      <div className="relative shrink-0 z-20">
        <div className="absolute top-0 right-0 -mt-6">
           <Button
             type="button"
             variant="outline"
             size="sm"
             onClick={() => setIsConfiguringStats(!isConfiguringStats)}
             className="group h-7 text-xs"
           >
             <Settings className={`w-3 h-3 ${isConfiguringStats ? '' : 'group-hover:animate-spin'}`} />
             {isConfiguringStats ? (
               <span className="opacity-100 ml-1">Xong</span>
             ) : (
               <span className="max-w-0 opacity-0 overflow-hidden group-hover:max-w-[150px] group-hover:opacity-100 group-hover:ml-1 transition-all duration-300 whitespace-nowrap">
                 Tùy chọn hiển thị
               </span>
             )}
           </Button>
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
                    className="rounded border-input cursor-pointer"
                  />
                  <div className={`scale-50 -my-3 origin-left`}>{stat.icon}</div>
                  {stat.label}
                </label>
              ))}
            </div>
          </div>
        )}

        <div className="flex flex-col lg:flex-row lg:items-stretch gap-3">
          <div className="flex-1 min-w-0 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-4 xl:grid-cols-5 gap-3">
            {visibleStats.map((stat, idx) => (
              <Card key={idx} className="gap-1 py-3 shadow-sm min-h-[85px]">
                <CardContent className="px-3">
                  <p className="text-xs text-muted-foreground">{stat.label}</p>
                  <p className="text-2xl font-semibold mt-1 font-mono text-foreground leading-none">{stat.value}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          {showBriefWidget && (
            <ChdDailyBriefHomeWidget
              onOpen={() => onNavigate('chd-daily-brief')}
              className="w-full lg:w-[min(100%,280px)] lg:shrink-0 lg:max-w-[300px]"
            />
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 md:flex-1 md:min-h-0 min-w-0 pb-1">
        
        {/* LEFT COLUMN: Chart + Quick Access */}
        <div className="flex flex-col space-y-4 md:h-full md:min-h-0 w-full">
          
          {/* BIỂU ĐỒ THỐNG KÊ TIM THEO THÁNG */}
          <div 
            className="bg-card border border-border rounded-xl p-3 shadow-sm flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 shrink-0 relative w-full min-h-[180px] z-20"
          >
            {/* Title & Total info */}
            <div className="flex flex-col justify-center shrink-0 pr-16 sm:pr-3 sm:border-r border-[#f1f5f9] sm:h-full w-full sm:w-[155px]">
              <span className="text-[10px] font-black uppercase text-foreground tracking-tight flex items-center gap-1 shrink-0">
                <span className="leading-tight whitespace-normal break-words">
                  {chartMetric === 'staff_consults'
                    ? 'Histogram ca hội chẩn'
                    : 'Histogram ca thông tim'}
                </span>
              </span>
              <div className="mt-1 flex items-baseline gap-1 bg-slate-50 border border-slate-100 rounded-lg px-2 py-0.5 max-w-max">
                <span className="text-[10px] text-slate-500 font-bold">Tổng:</span>
                <span className="text-xs font-black font-mono text-foreground">{totalCathInChart}</span>
                <span className="text-[9px] text-slate-400 font-bold">ca</span>
              </div>
            </div>

            {/* Render Bars */}
            <div className="flex-1 flex items-end justify-around h-28 sm:h-full px-2 my-0.5">
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
                        className="w-full bg-primary rounded-t-md group-hover:bg-primary/80 transition-colors cursor-pointer"
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
            <div className="absolute top-3 right-3 flex flex-row items-center gap-2 sm:relative sm:top-auto sm:right-auto sm:flex-col sm:items-center sm:justify-between sm:border-l sm:border-[#f1f5f9] sm:pl-2.5 sm:h-full sm:py-0.5 sm:shrink-0 select-none z-30">
              {/* Option 1: Metric Gear/Config Popup */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setIsConfiguringChartMetric(!isConfiguringChartMetric)}
                  className={`p-1 rounded-lg border transition-all ${
                    isConfiguringChartMetric 
                      ? 'bg-muted border-border text-foreground' 
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
                          ? 'bg-accent text-foreground' 
                          : 'text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      <span className={`w-1.5 h-1.5 rounded-full ${chartMetric === 'cathlabs' ? 'bg-primary' : 'bg-transparent border border-slate-400'}`}></span>
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
                          ? 'bg-accent text-foreground' 
                          : 'text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      <span className={`w-1.5 h-1.5 rounded-full ${chartMetric === 'staff_consults' ? 'bg-primary' : 'bg-transparent border border-slate-400'}`}></span>
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
                          ? 'bg-accent text-foreground' 
                          : 'text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      <span className={`w-1.5 h-1.5 rounded-full ${chartMetric === 'cathlabs_yearly' ? 'bg-primary' : 'bg-transparent border border-slate-400'}`}></span>
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
                  className="text-slate-400 hover:text-foreground p-0.5 line-none transition-colors"
                  title="Tăng năm"
                >
                  <ChevronUp className="w-3 h-3" />
                </button>
                <span className="text-[9px] font-extrabold font-mono text-foreground leading-none my-0.5 px-1 min-w-[24px] text-center">
                  {chartYear}
                </span>
                <button 
                  type="button"
                  onClick={() => setChartYear(prev => prev - 1)}
                  className="text-slate-400 hover:text-foreground p-0.5 line-none transition-colors"
                  title="Giảm năm"
                >
                  <ChevronDown className="w-3 h-3" />
                </button>
              </div>
            </div>
          </div>

          {/* TRUY CẬP NHANH SECTION */}
          <div className="bg-card border border-border rounded-xl p-4 shadow-sm flex flex-col flex-1 overflow-hidden">
            <div className="flex-1 flex flex-col min-h-0">
              <div className="flex items-center justify-between mb-4 shrink-0">
                <h3 className="font-semibold text-foreground text-sm flex items-center gap-2">
                  <Activity className="w-4 h-4 text-foreground" /> Truy cập nhanh
                </h3>
                <button
                  onClick={() => setIsConfiguring(!isConfiguring)}
                  className="text-xs text-foreground hover:text-foreground font-extrabold flex items-center gap-1 bg-accent hover:bg-accent px-2.5 py-1 rounded-xl transition border border-border shrink-0"
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
                      <span className="text-[10px] text-foreground font-bold font-mono">Đã chọn {selectedShortcutIds.length}/4</span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {allowedShortcuts.map(sh => {
                        const isSelected = selectedShortcutIds.includes(sh.id);
                        const colDef = getColorClasses(sh.color || 'slate');
                        return (
                          <button
                            key={sh.id}
                            onClick={() => handleToggleShortcut(sh.id)}
                            className={`flex items-center justify-between p-2 rounded-xl border transition-all text-left ${
                              isSelected 
                                ? `bg-accent border-border` 
                                : 'bg-white border-slate-200 hover:bg-slate-50'
                            }`}
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${isSelected ? 'bg-white' : 'bg-slate-100'}`}>
                                {renderIcon(sh.iconName, `w-4 h-4 ${isSelected ? 'text-foreground' : 'text-slate-500'}`)}
                              </div>
                              <div className="min-w-0">
                                <p className="text-[11px] font-bold text-slate-800 leading-tight truncate">{sh.label}</p>
                                <p className="text-[9px] text-slate-400 leading-none mt-0.5 truncate">{sh.desc}</p>
                              </div>
                            </div>
                            <div className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center shrink-0 ${isSelected ? 'border-primary bg-primary text-white' : 'border-slate-300 bg-white'}`}>
                              {isSelected && <span className="text-[8px] font-black">✓</span>}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ) : allowedShortcuts.length === 0 ? (
                  <div className="flex items-center justify-center h-full min-h-[120px] text-center px-4">
                    <p className="text-[11px] font-semibold text-slate-400">
                      Chưa có module nào được phân quyền cho phím tắt truy cập nhanh.
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-3">
                    {selectedShortcutIds.map(sid => {
                      const sh = allowedShortcuts.find(x => x.id === sid);
                      if (!sh) return null;
                      const colDef = getColorClasses(sh.color || 'slate');
                      return (
                        <button 
                          key={sh.id}
                          onClick={() => onNavigate(sh.id)}
                          className="flex flex-col items-center justify-center p-4 rounded-2xl bg-slate-50 hover:bg-accent border border-slate-100 hover:border-border transition group text-center h-24 shadow-sm"
                        >
                          <div className="w-9 h-9 rounded-full bg-white shadow-sm flex items-center justify-center mb-1.5 group-hover:scale-110 transition-transform">
                            {renderIcon(sh.iconName, `w-4 h-4 text-slate-600 group-hover:${colDef.text}`)}
                          </div>
                          <span className="text-[11px] font-black text-slate-700 tracking-tight group-hover:text-foreground">{sh.label}</span>
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
          <div className="flex-1 min-h-0 flex flex-col gap-4">
            {/* WEEKLY CALENDAR SECTION */}
            <div className="order-2 h-[52%] min-h-[200px] flex flex-col overflow-hidden">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3 shrink-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <CalendarDays className="w-4 h-4 text-foreground shrink-0" />
                  <span className="text-xs font-black text-slate-800 uppercase tracking-tight shrink-0">
                    Lịch can thiệp dự kiến ({weeklyScheduledCathCount} ca)
                  </span>
                  <span className="text-[10px] font-black text-foreground font-mono bg-muted border border-border px-2 py-0.5 rounded-full shrink-0">
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
                    className="text-[9px] font-black uppercase text-foreground bg-accent hover:bg-accent border border-border px-2 py-0.5 rounded-lg transition cursor-pointer"
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
                    return eligibleWaitlist.some(c => c.PlannedCathLabDate && getFormattedDateKey(c.PlannedCathLabDate) === dayKey);
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
                    
                    const dayConsults = eligibleWaitlist.filter(c => {
                      if (!c.PlannedCathLabDate) return false;
                      return getFormattedDateKey(c.PlannedCathLabDate) === dayKey;
                    });

                    return (
                      <div 
                        key={dayKey}
                        className={`flex flex-col sm:flex-row gap-2 p-2.5 rounded-xl border transition ${
                          isToday 
                            ? 'bg-accent border-border shadow-sm' 
                            : 'bg-white border-slate-150 hover:border-slate-300'
                        }`}
                      >
                        {/* Day Label */}
                        <div className="flex sm:flex-col items-baseline sm:items-center justify-between sm:justify-center w-full sm:w-[80px] shrink-0 pb-1 sm:pb-0 sm:border-r border-slate-100">
                          <span className={`text-[10px] font-black tracking-tight ${isToday ? 'text-foreground' : 'text-slate-700'}`}>
                            {dayName}
                          </span>
                          <span className="text-[9px] font-extrabold font-mono text-slate-400 sm:mt-0.5">
                            {dayNumStr}
                          </span>
                          {isToday && (
                            <span className="hidden sm:block text-[8px] font-black bg-primary text-white px-1.5 py-0.5 rounded-full font-mono uppercase mt-1">
                              Today
                            </span>
                          )}
                        </div>

                        {/* Content Area */}
                        <div className="flex-1 min-w-0 flex flex-col gap-1.5 justify-center pl-0 sm:pl-2">
                          <div className="grid grid-cols-1 gap-1.5">
                            {dayConsults.map((c) => {
                              const pat = findPatientByKey(patients || [], c.PatientKey);
                              
                              return (
                                <div 
                                  key={c.ConsultKey}
                                  className="flex items-center justify-between gap-1.5 bg-slate-50 hover:bg-slate-100/80 border border-slate-150/70 p-2 rounded-lg transition"
                                >
                                  <span className="text-[11px] font-black text-slate-800 uppercase truncate">
                                    {pat?.PatientName || 'Không rõ tên'}
                                  </span>
                                  <span className="text-[9px] font-extrabold font-mono text-foreground bg-accent border border-border px-1.5 py-0.2 rounded shrink-0">
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

            <div className="order-1 h-[48%] min-h-[220px] border border-slate-150 rounded-2xl bg-slate-50/60 p-3 flex flex-col overflow-hidden">
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2 shrink-0 mb-2">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Database className="w-4 h-4 text-foreground shrink-0" />
                    <span className="text-xs font-black text-slate-800 uppercase tracking-tight truncate">
                      Thống kê tỷ lệ
                    </span>
                    <span className="text-[10px] font-black text-foreground font-mono bg-muted border border-border px-2 py-0.5 rounded-full shrink-0">
                      {pieConfig.total} {pieConfig.totalLabel}
                    </span>
                  </div>
                </div>

                <div className="flex flex-wrap bg-white border border-slate-200 rounded-xl p-0.5 shadow-sm shrink-0 gap-0.5">
                  {([
                    ['diagnosis', 'ICD'],
                    ['second_operator', 'PTV phụ 1'],
                    ['cath_method', 'CathMethod'],
                    ['request_by', 'BS đăng ký']
                  ] as Array<[PieMetric, string]>).map(([id, label]) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setPieMetric(id)}
                      className={`px-2 py-1 rounded-lg text-[9px] font-black transition cursor-pointer ${
                        pieMetric === id
                          ? 'bg-primary text-white shadow-sm'
                          : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-1.5 -mt-1 shrink-0">
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

                <div className="flex flex-wrap items-center gap-1.5 min-w-0">
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
                  <div className="flex items-center bg-white border border-slate-200 rounded-lg overflow-hidden shadow-sm">
                    <button
                      type="button"
                      onClick={() => setPieFilterYear(prev => prev - 1)}
                      className="p-0.5 text-slate-500 hover:text-foreground hover:bg-slate-50 cursor-pointer"
                      title="Năm trước"
                    >
                      <ChevronLeft className="w-3 h-3" />
                    </button>
                    <span className="px-2 text-[9px] font-black font-mono text-foreground min-w-[36px] text-center">
                      {pieFilterYear}
                    </span>
                    <button
                      type="button"
                      onClick={() => setPieFilterYear(prev => prev + 1)}
                      className="p-0.5 text-slate-500 hover:text-foreground hover:bg-slate-50 cursor-pointer"
                      title="Năm sau"
                    >
                      <ChevronRight className="w-3 h-3" />
                    </button>
                  </div>
                  <span className="hidden 2xl:inline-flex text-[9px] font-black text-slate-500 bg-white border border-slate-200 rounded-lg px-2 py-0.5 truncate">
                    {piePeriodRange.label}
                  </span>
                </div>
              </div>

              <div className="flex-1 min-h-0 grid grid-cols-1 sm:grid-cols-[minmax(140px,200px)_1fr] gap-3 items-center overflow-hidden">
                <div className="relative w-full max-w-[176px] aspect-square mx-auto shrink-0 sm:-translate-y-2" onMouseLeave={() => setHoveredPieSegment(null)}>
                  {(() => {
                    const radius = 38;
                    const circumference = 2 * Math.PI * radius;
                    let cursor = 0;
                    return (
                      <svg viewBox="0 0 100 100" className="absolute inset-0 w-full h-full drop-shadow-sm overflow-visible">
                        {pieConfig.segments.length === 0 ? (
                          <circle cx="50" cy="50" r={radius} fill="none" stroke="#e2e8f0" strokeWidth="12" />
                        ) : pieConfig.segments.map(segment => {
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
                              strokeLinecap="butt"
                              strokeDasharray={`${dashLength} ${circumference - dashLength}`}
                              strokeDashoffset={dashOffset}
                              transform="rotate(-90 50 50)"
                              className="cursor-pointer transition-opacity hover:opacity-80"
                              onMouseEnter={() => setHoveredPieSegment(segment)}
                            >
                              <title>{`${segment.label}: ${segment.value} ca (${segment.percent.toFixed(segment.percent >= 10 ? 0 : 1)}%)`}</title>
                            </circle>
                          );
                        })}
                      </svg>
                    );
                  })()}
                  {hoveredPieSegment && (
                    <div className="absolute left-1/2 -translate-x-1/2 -top-3 z-20 bg-slate-900 text-white rounded-lg px-2.5 py-1.5 shadow-xl text-center pointer-events-none min-w-[128px]">
                      <div className="text-[9px] font-black uppercase tracking-wide truncate">{hoveredPieSegment.label}</div>
                      <div className="text-[10px] font-mono font-black text-background">
                        {hoveredPieSegment.value} ca ({hoveredPieSegment.percent.toFixed(hoveredPieSegment.percent >= 10 ? 0 : 1)}%)
                      </div>
                    </div>
                  )}
                  <div className="absolute inset-[32px] rounded-full bg-white border border-slate-100 shadow-sm flex flex-col items-center justify-center text-center px-2">
                    <span className="text-[9.5px] font-black uppercase text-slate-400 leading-tight">
                      {pieConfig.title}
                    </span>
                    <span className="text-3xl font-black font-mono text-foreground leading-none mt-1">
                      {pieConfig.total}
                    </span>
                  </div>
                </div>

                <div className="h-full max-h-full min-h-0 self-stretch overflow-y-scroll custom-scrollbar pr-1.5 space-y-1.5">
                  {pieConfig.segments.length === 0 ? (
                    <div className="h-full min-h-[100px] flex items-center justify-center text-center">
                      <span className="text-[10px] text-slate-400 font-semibold italic">
                        Chưa có dữ liệu để thống kê
                      </span>
                    </div>
                  ) : (
                    pieConfig.segments.map(segment => (
                      <div key={segment.label} className="bg-white border border-slate-100 rounded-xl px-2.5 py-1.5 shadow-sm">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: segment.color }} />
                            <span className="text-[10.5px] font-black text-slate-700 truncate" title={segment.label}>
                              {segment.label}
                            </span>
                          </div>
                          <div className="flex items-baseline gap-1 shrink-0">
                            <span className="text-[10px] font-black font-mono text-slate-800">{segment.value}</span>
                            <span className="text-[9px] font-black font-mono text-foreground">
                              {segment.percent.toFixed(segment.percent >= 10 ? 0 : 1)}%
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
          </div>
        </div>

      </div>
    </div>
  );
}
