import React, { useCallback, useMemo, useState } from 'react';
import { CathLab, Patient, Consult, Staff, Source, formatVNTime, findPatientByKey, removeDiacritics } from '../types';
import { VNDateInput } from './VNDateInput';
import { SearchableEnumSelect } from './SearchableEnumSelect';
import HisCathImportPanel from './HisCathImportPanel';
import { SearchTextInput } from './SearchTextInput';
import { 
  FileText, 
  Filter, 
  Download, 
  Calendar, 
  Search, 
  X, 
  Activity, 
  CheckCircle2, 
  XCircle, 
  AlertCircle,
  Users,
  Upload
} from 'lucide-react';
import { MODAL_TITLE } from '../utils/modalTitles';
import { useModuleSubheader } from '../hooks/useModuleSubheader';

interface CathLabReportViewProps {
  patients: Patient[];
  consults: Consult[];
  cathlabs: CathLab[];
  sources?: Source[];
  staffList?: Staff[];
  onRefreshData?: (force?: boolean) => void;
  onPatchConsult?: (consultKey: string, patch: Partial<Consult>) => void;
  onPatchCathlab?: (cathKey: string, patch: Partial<CathLab>) => void;
  onAddCathlab?: (cath: CathLab) => void;
  onAddPatient?: (patient: Patient) => void;
  onViewPatientRecord?: (patient: Patient) => void;
  triggerAlert?: (message: string, title?: string) => void;
}

// Safe helper to convert any object/value to string safely for rendering
const safeString = (val: any): string => {
  if (val === undefined || val === null) return '';
  if (typeof val === 'object') {
    if (val instanceof Date) return val.toLocaleDateString('vi-VN');
    try {
      return JSON.stringify(val);
    } catch (e) {
      return '[Object]';
    }
  }
  return String(val);
};

// Safe helper to parse CathMethod from any format (string, csv, or array)
const parseCathMethods = (methodStr: any): string[] => {
  if (!methodStr) return [];
  if (Array.isArray(methodStr)) return methodStr.filter(Boolean).map(safeString);
  const s = String(methodStr).trim();
  if (!s) return [];
  if (s.includes('+')) {
    return s.split('+').map(m => m.trim()).filter(Boolean);
  }
  if (s.includes(',')) {
    return s.split(',').map(m => m.trim()).filter(Boolean);
  }
  return [s];
};

function CathLabReportViewInner({
  patients,
  consults = [],
  cathlabs = [],
  sources = [],
  staffList = [],
  onRefreshData,
  onPatchConsult,
  onPatchCathlab,
  onAddCathlab,
  onAddPatient,
  onViewPatientRecord,
  triggerAlert
}: CathLabReportViewProps) {
  const [activeTab, setActiveTab] = useState<'report' | 'his-import'>('report');

  let loggedInStaffId = localStorage.getItem('CurrentStaffKey') || '';
  if (loggedInStaffId.trim().startsWith('{')) {
    try {
      const parsed = JSON.parse(loggedInStaffId);
      loggedInStaffId = parsed.StaffKey || '';
    } catch {
      // ignore
    }
  }
  // Ensure we are working with arrays safely
  const safeCathlabs = useMemo(() => Array.isArray(cathlabs) ? cathlabs : [], [cathlabs]);
  const safePatients = useMemo(() => Array.isArray(patients) ? patients : [], [patients]);

  // Filter States
  const [timeMode, setTimeMode] = useState<'preset' | 'range'>('preset');
  const [yearFilter, setYearFilter] = useState<string>('all');
  const [monthFilter, setMonthFilter] = useState<string>('all');
  const [quarterFilter, setQuarterFilter] = useState<string>('all');
  const [fromDate, setFromDate] = useState<string>('');
  const [toDate, setToDate] = useState<string>('');
  
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [diagnosisFilters, setDiagnosisFilters] = useState<string[]>([]);
  const [methodFilters, setMethodFilters] = useState<string[]>([]);
  const [primaryIntervFilters, setPrimaryIntervFilters] = useState<string[]>([]);
  const [assistant1Filters, setAssistant1Filters] = useState<string[]>([]);
  const [assistant2Filters, setAssistant2Filters] = useState<string[]>([]);
  const [assistant3Filters, setAssistant3Filters] = useState<string[]>([]);

  // Pagination
  const [currentPage, setCurrentPage] = useState<number>(1);
  const ITEMS_PER_PAGE = 50;

  // Extract unique filter options dynamically from data
  const filterOptions = useMemo(() => {
    const years = new Set<string>();
    const diagnoses = new Set<string>();
    const methods = new Set<string>();
    const primaryIntervs = new Set<string>();
    const assist1s = new Set<string>();
    const assist2s = new Set<string>();
    const assist3s = new Set<string>();

    safeCathlabs.forEach(c => {
      if (c.CathDate) {
        try {
          const yr = String(c.CathDate).split('-')[0] || String(c.CathDate).split('/')[2];
          if (yr && yr.length === 4) years.add(yr);
        } catch(e) {}
      }
      if (c.DiagnosisID) diagnoses.add(safeString(c.DiagnosisID));
      if (c.PostDiagnosisID) diagnoses.add(safeString(c.PostDiagnosisID));
      
      const parsedMethods = parseCathMethods(c.CathMethod);
      parsedMethods.forEach(m => {
        if (m) methods.add(m);
      });

      if (c._1stInterventionist) primaryIntervs.add(safeString(c._1stInterventionist));
      if (c._2ndInterventionist) assist1s.add(safeString(c._2ndInterventionist));
      if (c._3rdInterventionist) assist2s.add(safeString(c._3rdInterventionist));
      if (c._4thInterventionist) assist3s.add(safeString(c._4thInterventionist));
    });

    return {
      years: Array.from(years).sort((a, b) => b.localeCompare(a)),
      diagnoses: Array.from(diagnoses).sort(),
      methods: Array.from(methods).sort(),
      primaryIntervs: Array.from(primaryIntervs).sort(),
      assist1s: Array.from(assist1s).sort(),
      assist2s: Array.from(assist2s).sort(),
      assist3s: Array.from(assist3s).sort()
    };
  }, [safeCathlabs]);

  // Helper to parse quarters
  const getQuarter = (month: number): number => {
    return Math.ceil(month / 3);
  };

  // Filter Logic
  const filteredCathLabs = useMemo(() => {
    return safeCathlabs.filter(c => {
      // 1. Time Filtering
      if (c.CathDate) {
        const dateObj = new Date(c.CathDate);
        if (!isNaN(dateObj.getTime())) {
          if (timeMode === 'range') {
            if (fromDate) {
              const fromTime = new Date(fromDate).getTime();
              if (dateObj.getTime() < fromTime) return false;
            }
            if (toDate) {
              const toTime = new Date(toDate).getTime();
              const inclusiveToTime = toTime + 24 * 60 * 60 * 1000;
              if (dateObj.getTime() > inclusiveToTime) return false;
            }
          } else {
            const yearStr = String(dateObj.getFullYear());
            const monthStr = String(dateObj.getMonth() + 1);
            const quarterStr = String(getQuarter(dateObj.getMonth() + 1));

            if (yearFilter !== 'all' && yearStr !== yearFilter) return false;
            if (monthFilter !== 'all' && monthStr !== monthFilter) return false;
            if (quarterFilter !== 'all' && quarterStr !== quarterFilter) return false;
          }
        }
      } else {
        if (timeMode === 'range' && (fromDate || toDate)) return false;
        if (timeMode === 'preset' && (yearFilter !== 'all' || monthFilter !== 'all' || quarterFilter !== 'all')) return false;
      }

      // 2. Diagnosis ID Filtering
      if (diagnosisFilters.length > 0) {
        const d1 = c.DiagnosisID ? safeString(c.DiagnosisID).trim().toLowerCase() : '';
        const d2 = c.PostDiagnosisID ? safeString(c.PostDiagnosisID).trim().toLowerCase() : '';
        const targets = diagnosisFilters.map(item => item.trim().toLowerCase());
        if (!targets.some(target => d1 === target || d2 === target)) return false;
      }

      // 3. Cath Method Filtering
      if (methodFilters.length > 0) {
        const parsed = parseCathMethods(c.CathMethod);
        if (!methodFilters.some(method => parsed.includes(method))) return false;
      }

      // 4. Interventionists Filtering
      if (primaryIntervFilters.length > 0 && !primaryIntervFilters.includes(safeString(c._1stInterventionist))) return false;
      if (assistant1Filters.length > 0 && !assistant1Filters.includes(safeString(c._2ndInterventionist))) return false;
      if (assistant2Filters.length > 0 && !assistant2Filters.includes(safeString(c._3rdInterventionist))) return false;
      if (assistant3Filters.length > 0 && !assistant3Filters.includes(safeString(c._4thInterventionist))) return false;

      // 5. Search Query (Patient Name / ID)
      if (searchQuery.trim() !== '') {
        const pat = findPatientByKey(safePatients, c.PatientKey);
        const q = removeDiacritics(searchQuery).toLowerCase().trim();
        const nameMatch = pat?.PatientName ? removeDiacritics(safeString(pat.PatientName)).toLowerCase().includes(q) : false;
        const idMatch = pat?.PatientID1 ? removeDiacritics(safeString(pat.PatientID1)).toLowerCase().includes(q) : false;
        const diagMatch = c.DiagnosisID ? removeDiacritics(safeString(c.DiagnosisID)).toLowerCase().includes(q) : false;
        const postDiagMatch = c.PostDiagnosisID ? removeDiacritics(safeString(c.PostDiagnosisID)).toLowerCase().includes(q) : false;
        return nameMatch || idMatch || diagMatch || postDiagMatch;
      }

      return true;
    });
  }, [
    safeCathlabs, safePatients, timeMode, yearFilter, monthFilter, quarterFilter, 
    fromDate, toDate, diagnosisFilters, methodFilters, primaryIntervFilters, 
    assistant1Filters, assistant2Filters, assistant3Filters, searchQuery
  ]);

  // Stats Calculation
  const stats = useMemo(() => {
    let success = 0;
    let failed = 0;
    let postponed = 0;

    filteredCathLabs.forEach(c => {
      const res = safeString(c.CathResultID);
      if (res === 'Thành công') success++;
      else if (res === 'Không thành công') failed++;
      else if (res === 'Hoãn') postponed++;
    });

    const total = filteredCathLabs.length;
    const successRate = total > 0 ? Math.round((success / total) * 100) : 0;

    return { total, success, failed, postponed, successRate };
  }, [filteredCathLabs]);

  // Paginated Results
  const totalPages = Math.max(1, Math.ceil(filteredCathLabs.length / ITEMS_PER_PAGE));
  const paginatedCathLabs = useMemo(() => {
    return filteredCathLabs.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);
  }, [filteredCathLabs, currentPage]);

  // Export to CSV
  const handleExportCSV = () => {
    try {
      const headers = [
        'STT', 'Mã Bệnh Nhân (ID1)', 'Họ Tên', 'Ngày sinh', 'Giới tính', 
        'Ngày Thông Tim', 'ICD Chỉ định', 'ICD Sau TT', 'Kết Quả', 
        'Phương Pháp Can Thiệp', 'PTV Chính', 'PTV Phụ 1', 'PTV Phụ 2', 'PTV Phụ 3', 'Kế Hoạch Tiếp Theo', 'Ghi Chú'
      ];

      const csvRows = [headers.join(',')];

      filteredCathLabs.forEach((c, index) => {
        const pat = findPatientByKey(safePatients, c.PatientKey);
        const row = [
          index + 1,
          `"${safeString(pat?.PatientID1)}"`,
          `"${safeString(pat?.PatientName)}"`,
          `"${pat?.PatientDOB ? formatVNTime(pat.PatientDOB) : ''}"`,
          `"${safeString(pat?.PatientSex)}"`,
          `"${c.CathDate ? formatVNTime(c.CathDate) : ''}"`,
          `"${safeString(c.DiagnosisID)}"`,
          `"${safeString(c.PostDiagnosisID)}"`,
          `"${safeString(c.CathResultID)}"`,
          `"${parseCathMethods(c.CathMethod).join('; ')}"`,
          `"${safeString(c._1stInterventionist)}"`,
          `"${safeString(c._2ndInterventionist)}"`,
          `"${safeString(c._3rdInterventionist)}"`,
          `"${safeString(c._4thInterventionist)}"`,
          `"${safeString(c.CathPlan)}"`,
          `"${safeString(c.CathNote).replace(/"/g, '""')}"`
        ];
        csvRows.push(row.join(','));
      });

      const csvString = '\uFEFF' + csvRows.join('\n'); // Adding BOM for UTF-8 Excel compatibility
      const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.setAttribute('href', url);
      link.setAttribute('download', `Bao_cao_thong_tim_${new Date().toISOString().split('T')[0]}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (e) {
      triggerAlert?.(`Lỗi xuất báo cáo CSV: ${e}`, MODAL_TITLE.notify);
    }
  };

  const handleResetFilters = () => {
    setYearFilter('all');
    setMonthFilter('all');
    setQuarterFilter('all');
    setFromDate('');
    setToDate('');
    setDiagnosisFilters([]);
    setMethodFilters([]);
    setPrimaryIntervFilters([]);
    setAssistant1Filters([]);
    setAssistant2Filters([]);
    setAssistant3Filters([]);
    setSearchQuery('');
    setCurrentPage(1);
  };

  const handleSubheaderSearch = useCallback((value: string) => {
    setSearchQuery(value);
    setCurrentPage(1);
  }, []);

  const subheaderActions = useMemo(
    () =>
      activeTab === 'report' ? (
        <button
          type="button"
          onClick={handleExportCSV}
          className="bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold px-3 py-1.5 rounded-xl text-[11px] flex items-center justify-center gap-1.5 shadow-sm transition uppercase tracking-wider cursor-pointer"
        >
          <Download className="w-3.5 h-3.5 text-white" /> Xuất Excel
        </button>
      ) : null,
    [handleExportCSV, activeTab]
  );

  useModuleSubheader('cathlab-report', {
    icon: <FileText className="w-4 h-4" />,
    searchValue: searchQuery,
    onSearchChange: handleSubheaderSearch,
    actions: subheaderActions,
  });

  return (
    <div className="flex-1 h-full flex flex-col gap-4 animate-in fade-in duration-200 font-sans min-h-0 p-4 lg:p-6 bg-slate-50 overflow-hidden">
      
      {/* Title Header — mobile only */}
      <div className="shrink-0 md:hidden flex flex-col gap-3 bg-white p-5 border border-slate-200 rounded-3xl shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-pink-50 flex items-center justify-center text-[#d2145a] shadow-sm">
            <FileText className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-lg font-black text-neutral-900 tracking-tight uppercase">Báo cáo & Thống kê thông tim</h2>
            <p className="text-xs text-slate-500 font-medium">Truy xuất, thống kê số liệu và import ca từ HIS</p>
          </div>
        </div>
      </div>

      <div className="shrink-0 flex items-center gap-2">
        <button
          type="button"
          onClick={() => setActiveTab('report')}
          className={`font-extrabold text-[11px] sm:text-[13px] px-4 py-2 rounded-2xl transition flex items-center gap-2 ${activeTab === 'report' ? 'bg-[#d2145a] text-white shadow-md' : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'}`}
        >
          <FileText className="w-4 h-4 shrink-0" />
          Báo cáo & Thống kê
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('his-import')}
          className={`font-extrabold text-[11px] sm:text-[13px] px-4 py-2 rounded-2xl transition flex items-center gap-2 ${activeTab === 'his-import' ? 'bg-rose-600 text-white shadow-md' : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'}`}
        >
          <Upload className="w-4 h-4 shrink-0" />
          Import HIS
        </button>
      </div>

      {activeTab === 'his-import' ? (
        <HisCathImportPanel
          patients={safePatients}
          consults={consults}
          cathlabs={safeCathlabs}
          staffList={staffList}
          loggedInStaffId={loggedInStaffId}
          onRefreshData={onRefreshData || (() => {})}
          onPatchConsult={onPatchConsult}
          onPatchCathlab={onPatchCathlab}
          onAddCathlab={onAddCathlab}
          onAddPatient={onAddPatient}
          triggerAlert={triggerAlert}
        />
      ) : (
      <div className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-4">

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 shrink-0">
        <div className="bg-white border border-slate-200 p-5 rounded-3xl shadow-sm flex items-center justify-between">
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-400">Tổng số ca thông tim</span>
            <h3 className="text-2xl font-black text-slate-900 mt-1 font-mono">{stats.total}</h3>
          </div>
          <div className="w-10 h-10 rounded-xl bg-slate-50 text-slate-600 flex items-center justify-center">
            <Activity className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white border border-slate-200 p-5 rounded-3xl shadow-sm flex items-center justify-between">
          <div>
            <span className="text-[10px] uppercase font-bold text-emerald-500">Can thiệp Thành công</span>
            <h3 className="text-2xl font-black text-emerald-600 mt-1 font-mono">{stats.success} <span className="text-xs font-semibold text-slate-400">({stats.successRate}%)</span></h3>
          </div>
          <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
            <CheckCircle2 className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white border border-slate-200 p-5 rounded-3xl shadow-sm flex items-center justify-between">
          <div>
            <span className="text-[10px] uppercase font-bold text-rose-500 font-bold">Không thành công</span>
            <h3 className="text-2xl font-black text-rose-600 mt-1 font-mono">{stats.failed}</h3>
          </div>
          <div className="w-10 h-10 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center">
            <XCircle className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white border border-slate-200 p-5 rounded-3xl shadow-sm flex items-center justify-between">
          <div>
            <span className="text-[10px] uppercase font-bold text-amber-500 font-bold">Hoãn thủ thuật</span>
            <h3 className="text-2xl font-black text-amber-600 mt-1 font-mono">{stats.postponed}</h3>
          </div>
          <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
            <AlertCircle className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Filters Box */}
      <div className="bg-white border border-slate-200 rounded-3xl p-5 shadow-sm space-y-4 shrink-0">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-[#d2145a]" />
            <h4 className="font-extrabold text-xs text-neutral-900 uppercase">Bộ lọc báo cáo chuyên sâu</h4>
          </div>
          <button
            type="button"
            onClick={handleResetFilters}
            className="text-[#d2145a] hover:underline text-xs font-bold transition cursor-pointer"
          >
            Xóa tất cả bộ lọc
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-12 gap-4 text-xs font-semibold text-slate-700">
          {/* Column 1: Time Filters */}
          <div className="md:col-span-5 space-y-3 border-r border-slate-100 pr-4">
            <div className="flex items-center justify-between">
              <span className="text-[10px] uppercase font-bold text-slate-400 flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5" /> Lọc thời gian (CathDate)
              </span>
              <div className="flex bg-slate-100 rounded-lg p-0.5 text-[10px]">
                <button
                  type="button"
                  onClick={() => setTimeMode('preset')}
                  className={`px-2 py-0.5 rounded-md font-extrabold cursor-pointer ${timeMode === 'preset' ? 'bg-white shadow-xs text-[#d2145a]' : 'text-slate-500'}`}
                >
                  Mặc định
                </button>
                <button
                  type="button"
                  onClick={() => setTimeMode('range')}
                  className={`px-2 py-0.5 rounded-md font-extrabold cursor-pointer ${timeMode === 'range' ? 'bg-white shadow-xs text-[#d2145a]' : 'text-slate-500'}`}
                >
                  Khoảng ngày
                </button>
              </div>
            </div>

            {timeMode === 'preset' ? (
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block text-[10px] text-slate-400 mb-1">Năm</label>
                  <select
                    value={yearFilter}
                    onChange={(e) => { setYearFilter(e.target.value); setCurrentPage(1); }}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-pink-400 font-bold"
                  >
                    <option value="all">Tất cả năm</option>
                    {filterOptions.years.map(yr => (
                      <option key={yr} value={yr}>{yr}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] text-slate-400 mb-1">Quý</label>
                  <select
                    value={quarterFilter}
                    onChange={(e) => { setQuarterFilter(e.target.value); setCurrentPage(1); }}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-pink-400 font-bold"
                  >
                    <option value="all">Tất cả quý</option>
                    <option value="1">Quý 1 (T1-T3)</option>
                    <option value="2">Quý 2 (T4-T6)</option>
                    <option value="3">Quý 3 (T7-T9)</option>
                    <option value="4">Quý 4 (T10-T12)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] text-slate-400 mb-1">Tháng</label>
                  <select
                    value={monthFilter}
                    onChange={(e) => { setMonthFilter(e.target.value); setCurrentPage(1); }}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-pink-400 font-bold"
                  >
                    <option value="all">Tất cả tháng</option>
                    {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
                      <option key={m} value={m}>Tháng {m}</option>
                    ))}
                  </select>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[10px] text-slate-400 mb-1">Từ ngày</label>
                  <VNDateInput
                    value={fromDate}
                    onChange={(val) => { setFromDate(val); setCurrentPage(1); }}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1 font-bold font-sans focus:outline-none focus:ring-1 focus:ring-pink-400"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-slate-400 mb-1">Đến ngày</label>
                  <VNDateInput
                    value={toDate}
                    onChange={(val) => { setToDate(val); setCurrentPage(1); }}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1 font-bold font-sans focus:outline-none focus:ring-1 focus:ring-pink-400"
                  />
                </div>
              </div>
            )}

            {/* General Text Search — mobile; desktop dùng subheader */}
            <div className="relative md:hidden">
              <span className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
                <Search className="h-4 w-4 text-slate-400" />
              </span>
              <SearchTextInput
                type="text"
                value={searchQuery}
                onChange={(value) => { setSearchQuery(value); setCurrentPage(1); }}
                placeholder="Tìm tên bệnh nhi, mã NB, mã ICD..."
                className="w-full pl-9 pr-8 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-pink-400"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => { setSearchQuery(''); setCurrentPage(1); }}
                  className="absolute inset-y-0 right-0 flex items-center pr-2.5 text-slate-400 hover:text-slate-600"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>

          {/* Column 2: Clinical Filters */}
          <div className="md:col-span-3 space-y-3 border-r border-slate-100 pr-4">
            <span className="text-[10px] uppercase font-bold text-slate-400 flex items-center gap-1">
              <Activity className="w-3.5 h-3.5" /> Lọc ICD & Phương pháp
            </span>

            <div>
              <label className="block text-[10px] text-slate-400 mb-1">Bệnh chính (DiagnosisID)</label>
              <SearchableEnumSelect
                options={filterOptions.diagnoses}
                values={diagnosisFilters}
                onMultiChange={(values) => { setDiagnosisFilters(values); setCurrentPage(1); }}
                multiple
                placeholder="Tất cả bệnh chính"
                searchPlaceholder="Tìm mã ICD..."
                className="text-xs"
              />
            </div>

            <div>
              <label className="block text-[10px] text-slate-400 mb-1">Phương pháp can thiệp</label>
              <SearchableEnumSelect
                options={filterOptions.methods}
                values={methodFilters}
                onMultiChange={(values) => { setMethodFilters(values); setCurrentPage(1); }}
                multiple
                placeholder="Tất cả phương pháp"
                searchPlaceholder="Tìm phương pháp..."
                className="text-xs"
              />
            </div>
          </div>

          {/* Column 3: Operator Filters */}
          <div className="md:col-span-4 space-y-3">
            <span className="text-[10px] uppercase font-bold text-slate-400 flex items-center gap-1">
              <Users className="w-3.5 h-3.5" /> Lọc Kíp can thiệp
            </span>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[10px] text-slate-400 mb-1">PTV Chính</label>
                <SearchableEnumSelect
                  options={filterOptions.primaryIntervs}
                  values={primaryIntervFilters}
                  onMultiChange={(values) => { setPrimaryIntervFilters(values); setCurrentPage(1); }}
                  multiple
                  placeholder="Tất cả"
                  searchPlaceholder="Tìm PTV..."
                  className="text-xs"
                />
              </div>

              <div>
                <label className="block text-[10px] text-slate-400 mb-1">PTV Phụ 1</label>
                <SearchableEnumSelect
                  options={filterOptions.assist1s}
                  values={assistant1Filters}
                  onMultiChange={(values) => { setAssistant1Filters(values); setCurrentPage(1); }}
                  multiple
                  placeholder="Tất cả"
                  searchPlaceholder="Tìm PTV..."
                  className="text-xs"
                />
              </div>

              <div>
                <label className="block text-[10px] text-slate-400 mb-1">PTV Phụ 2</label>
                <SearchableEnumSelect
                  options={filterOptions.assist2s}
                  values={assistant2Filters}
                  onMultiChange={(values) => { setAssistant2Filters(values); setCurrentPage(1); }}
                  multiple
                  placeholder="Tất cả"
                  searchPlaceholder="Tìm PTV..."
                  className="text-xs"
                />
              </div>

              <div>
                <label className="block text-[10px] text-slate-400 mb-1">PTV Phụ 3</label>
                <SearchableEnumSelect
                  options={filterOptions.assist3s}
                  values={assistant3Filters}
                  onMultiChange={(values) => { setAssistant3Filters(values); setCurrentPage(1); }}
                  multiple
                  placeholder="Tất cả"
                  searchPlaceholder="Tìm PTV..."
                  className="text-xs"
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Table List */}
      <div className="flex-1 min-h-0 bg-white border border-slate-200 rounded-3xl shadow-sm flex flex-col overflow-hidden">
        <div className="flex-1 overflow-x-auto overflow-y-auto custom-scrollbar">
          <table className="w-full text-left text-xs border-collapse min-w-[1200px]">
            <thead className="sticky top-0 z-10">
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 text-[10px] uppercase font-black tracking-wider font-mono">
                <th className="py-3 px-4 text-center w-12 bg-slate-50">STT</th>
                <th className="py-3 px-4 sticky left-0 z-20 bg-slate-50 min-w-[200px] shadow-[2px_0_4px_-2px_rgba(15,23,42,0.08)]">Họ và tên bệnh nhi</th>
                <th className="py-3 px-4">Ngày thông tim</th>
                <th className="py-3 px-4">ICD Chỉ định / Sau TT</th>
                <th className="py-3 px-4">Phương pháp can thiệp</th>
                <th className="py-3 px-4">Kíp can thiệp</th>
                <th className="py-3 px-4">Kết luận</th>
                <th className="py-3 px-4">Kế hoạch tiếp theo</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-semibold text-slate-700">
              {paginatedCathLabs.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center py-16 italic text-slate-400 bg-slate-50/20">
                    Không tìm thấy ca thông tim nào khớp với bộ lọc.
                  </td>
                </tr>
              ) : (
                paginatedCathLabs.map((c, index) => {
                  const pat = findPatientByKey(safePatients, c.PatientKey);
                  const parsedMethods = parseCathMethods(c.CathMethod);
                  return (
                    <tr
                      key={c.CathKey}
                      onClick={() => pat && onViewPatientRecord?.(pat)}
                      className="hover:bg-pink-50/30 cursor-pointer transition duration-150 group"
                    >
                      <td className="py-3.5 px-4 text-center text-slate-400 font-mono">
                        {(currentPage - 1) * ITEMS_PER_PAGE + index + 1}
                      </td>
                      <td className="py-3.5 px-4 sticky left-0 z-[5] bg-white group-hover:bg-pink-50/30 min-w-[200px] shadow-[2px_0_4px_-2px_rgba(15,23,42,0.08)]">
                        <p className="font-black text-neutral-900 leading-tight uppercase group-hover:text-[#d2145a]">{pat?.PatientName ? safeString(pat.PatientName) : '—'}</p>
                        <p className="text-[10px] text-slate-400 font-mono mt-0.5">
                          MNB: {pat?.PatientID1 ? safeString(pat.PatientID1) : '—'} | DOB: {pat?.PatientDOB ? formatVNTime(pat.PatientDOB) : '—'}
                        </p>
                      </td>
                      <td className="py-3.5 px-4 font-mono text-slate-600">
                        {c.CathDate ? formatVNTime(c.CathDate) : '—'}
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="flex flex-col gap-1 items-start">
                          <span className="text-[10px] font-bold text-slate-650 bg-slate-100 border border-slate-200 px-1 rounded" title="Chẩn đoán lúc chỉ định">
                            {safeString(c.DiagnosisID) || '—'}
                          </span>
                          <span className="text-[10px] font-black text-red-650 bg-red-50 border border-red-200 px-1 rounded" title="Chẩn đoán sau can thiệp">
                            {safeString(c.PostDiagnosisID) || '—'}
                          </span>
                        </div>
                      </td>
                      <td className="py-3.5 px-4 text-slate-650 text-[11px] max-w-[240px] truncate" title={parsedMethods.join(', ')}>
                        {parsedMethods.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {parsedMethods.map((m, idx) => (
                              <span key={idx} className="bg-indigo-50 border border-indigo-100 text-indigo-850 px-1.5 py-0.5 rounded text-[10px]">
                                {m}
                              </span>
                            ))}
                          </div>
                        ) : '—'}
                      </td>
                      <td className="py-3.5 px-4 text-slate-600">
                        <div className="text-[11px] leading-relaxed">
                          <p><span className="text-slate-400">Chính:</span> <span className="font-bold text-slate-800">{safeString(c._1stInterventionist) || '—'}</span></p>
                          {(c._2ndInterventionist || c._3rdInterventionist || c._4thInterventionist) && (
                            <p className="text-[10px] text-slate-400 truncate max-w-[200px]">
                              Phụ: {[c._2ndInterventionist, c._3rdInterventionist, c._4thInterventionist].filter(Boolean).map(safeString).join(', ')}
                            </p>
                          )}
                        </div>
                      </td>
                      <td className="py-3.5 px-4">
                        {safeString(c.CathResultID) === 'Thành công' ? (
                          <span className="text-[10px] font-black text-green-800 bg-green-50 border border-green-200 px-1.5 py-0.5 rounded flex items-center gap-1 w-max">
                            <CheckCircle2 className="w-3.5 h-3.5" /> Thành công
                          </span>
                        ) : safeString(c.CathResultID) === 'Không thành công' ? (
                          <span className="text-[10px] font-black text-rose-800 bg-rose-50 border border-rose-200 px-1.5 py-0.5 rounded flex items-center gap-1 w-max">
                            <XCircle className="w-3.5 h-3.5" /> Không thành công
                          </span>
                        ) : (
                          <span className="text-[10px] font-black text-amber-800 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded flex items-center gap-1 w-max">
                            <AlertCircle className="w-3.5 h-3.5" /> Hoãn
                          </span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-slate-655 max-w-[200px] truncate" title={safeString(c.CathPlan)}>
                        {safeString(c.CathPlan) || '—'}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Footer */}
        {totalPages > 1 && (
          <div className="shrink-0 bg-slate-50 border-t border-slate-200 px-5 py-4 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
            <div className="text-[10px] text-slate-505 font-semibold font-mono uppercase text-slate-500">
              Trang {currentPage}/{totalPages} (Hiển thị {(currentPage - 1) * ITEMS_PER_PAGE + 1} đến {Math.min(currentPage * ITEMS_PER_PAGE, filteredCathLabs.length)})
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                onClick={() => setCurrentPage(1)}
                disabled={currentPage === 1}
                className="px-2.5 py-1.5 rounded-lg text-[9px] uppercase font-bold bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
              >
                Đầu
              </button>
              <button
                type="button"
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="px-2.5 py-1.5 rounded-lg text-[9px] uppercase font-bold bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
              >
                Trước
              </button>
              
              <span className="text-xs font-semibold text-slate-700 px-2 font-mono">
                {currentPage} / {totalPages}
              </span>
              
              <button
                type="button"
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="px-2.5 py-1.5 rounded-lg text-[9px] uppercase font-bold bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
              >
                Sau
              </button>
              <button
                type="button"
                onClick={() => setCurrentPage(totalPages)}
                disabled={currentPage === totalPages}
                className="px-2.5 py-1.5 rounded-lg text-[9px] uppercase font-bold bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
              >
                Cuối
              </button>
            </div>
          </div>
        )}
      </div>
      </div>
      )}

    </div>
  );
}

export default function CathLabReportView(props: CathLabReportViewProps) {
  try {
    return <CathLabReportViewInner {...props} />;
  } catch (err: any) {
    return (
      <div className="p-6 bg-red-50 border border-red-200 rounded-3xl text-red-700 font-sans m-4">
        <h3 className="font-extrabold text-base uppercase mb-2">Đã xảy ra lỗi khi tải Báo cáo</h3>
        <p className="text-sm font-semibold mb-4">{err?.message || String(err)}</p>
        <pre className="text-[10px] bg-red-100/50 p-4 rounded-xl overflow-auto max-h-[300px] font-mono leading-relaxed">
          {err?.stack}
        </pre>
      </div>
    );
  }
}
