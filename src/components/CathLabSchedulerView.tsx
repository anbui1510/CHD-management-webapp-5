import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import html2canvas from 'html2canvas';
import { toBlob as htmlToImageBlob } from 'html-to-image';
import * as XLSX from 'xlsx';
import { Patient, Consult, CathLab, Source, DeviceTemplate, Staff, formatVNTime, removeDiacritics, findPatientByKey, normalizePatientKey, PriorityOrderEnum, PRIORITY_OPTIONS, normalizePriorityOrder } from '../types';
import { getLatestPriorDetailDiagnosis } from '../utils/getLatestPriorDetailDiagnosis';
import { buildCathlabsByPatientKey, isConsultCathCompleted, isConsultWaitlistExcludedByStatus } from '../utils/cathlabWaitlist';
import { formatPatientDobWithAge, getPatientAgeDescription } from '../utils/patientDisplay';
import { VNDateInput } from './VNDateInput';
import { SOURCE_PROVINCE, getSourceDiagnosisOptions, normalizeDiagnosisID } from '../data/source';
import { SearchableEnumSelect } from './SearchableEnumSelect';
import { PlannedDeviceSuggestBox } from './PlannedDeviceSuggestBox';
import { useIsMobile } from '../hooks/useMediaQuery';
import { 
  ClipboardList, 
  Search, 
  X, 
  CheckCircle, 
  AlertTriangle, 
  Calendar, 
  Clipboard, 
  Check,
  ChevronLeft,
  ChevronRight,
  User,
  Sliders,
  PhoneCall,
  Activity,
  Award,
  BookOpen,
  Plus,
  Filter,
  Download,
  Upload,
  CalendarDays,
  ArrowUpDown,
  Heart,
  Undo2,
  ArrowRightLeft,
  ChevronsLeft,
  ChevronsRight
} from 'lucide-react';

interface CathLabSchedulerViewProps {
  patients: Patient[];
  consults: Consult[];
  cathlabs?: CathLab[];
  sources?: Source[];
  deviceTemplates?: DeviceTemplate[];
  staffList: Staff[];
  currentStaff?: Staff | null;
  onRefreshData: () => void;
  onPatchConsult?: (consultKey: string, patch: Partial<Consult>) => void;
  onPatchPatient?: (patientKey: string, patch: Partial<Patient>) => void;
  onAddPatient?: (patient: Patient) => void;
  onAddConsult?: (consult: Consult) => void;
  onViewPatientRecord?: (patient: Patient) => void;
  pureCalendarMode?: boolean;
  onTogglePureMode?: () => void;
}

const CATH_INTERVENTIONIST_DOCTORS = [
  'BS. Phụng',
  'BS. Lợi',
  'BS. Thịnh',
  'BS. Ân',
  'BS. Hiếu',
  'BS. Tài',
  'BS. Hùng',
  'BS. Tĩnh',
];

const getAutoScheduled2nd = (requestBy: string) => {
  if (!requestBy) return '';
  const norm = requestBy.trim();
  const found = CATH_INTERVENTIONIST_DOCTORS.find(doc =>
    norm.toLowerCase() === doc.toLowerCase() ||
    norm.toLowerCase().replace('bs.', '').trim() === doc.toLowerCase().replace('bs.', '').trim() ||
    norm.toLowerCase().includes(doc.toLowerCase().replace('bs.', '').trim())
  );
  return found || '';
};

const getTodayIsoDate = (): string => {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

const formatPatientWithPtvPhu = (patientName: string, ptvPhu: string) => {
  if (!ptvPhu?.trim()) return patientName;
  return `${patientName} - PTV phụ: ${ptvPhu}`;
};

const formatCalendarPatientTooltip = (patientName: string, diagnosisID: string, ptvPhu1: string) => {
  const base = `${patientName || 'Unknown Patient'} (${diagnosisID || 'N/A'})`;
  return ptvPhu1?.trim() ? `${base} - ${ptvPhu1.trim()}` : base;
};

const normalizeRefKey = (value: unknown) => String(value ?? '').trim().toLowerCase();

const parseWeightForInput = (value?: string) =>
  String(value || '').replace(/\s*kg\s*/gi, '').trim();

const parseHeightForInput = (value?: string) =>
  String(value || '').replace(/\s*cm\s*/gi, '').trim();

const formatWeightForSave = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return '';
  return /\bkg\b/i.test(trimmed) ? trimmed : `${trimmed} kg`;
};

const formatHeightForSave = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return '';
  return /\bcm\b/i.test(trimmed) ? trimmed : `${trimmed} cm`;
};

type SchedulingFormSnapshot = {
  consultDate: string;
  requestBy: string;
  patientWeight: string;
  patientHeight: string;
  diagnosisID: string;
  detailDiagnosis: string;
  consultResultID: string;
  detailConsultResult: string;
  plannedDevice: string;
  plannedPrice: string;
  checkDevice: string;
  operationFeedback: string;
  supplyDepFeedback: string;
  callStatus: string;
  callNote: string;
  priorityOrder: string;
  plannedCathLabDate: string;
  selectedMethods: string[];
  postCathDepart: string;
  scheduled1st: string;
  scheduled2nd: string;
  scheduled3rd: string;
};

const snapshotsEqual = (a: SchedulingFormSnapshot, b: SchedulingFormSnapshot) =>
  JSON.stringify(a) === JSON.stringify(b);

const resolvePtvPhu1Display = (
  requestBy: string,
  savedScheduled2nd?: string,
  stateScheduled2nd?: string
) => {
  const autoFromRequest = getAutoScheduled2nd(requestBy);
  if (autoFromRequest) return autoFromRequest;
  if (stateScheduled2nd?.trim()) return stateScheduled2nd.trim();
  if (savedScheduled2nd?.trim()) return savedScheduled2nd.trim();
  return '';
};

const METHOD_OPTIONS = [
  "Chụp động mạch chủ số hóa xóa nền (DSA) (18.05.03.0052)",
  "Đóng các lỗ rò động mạch, tĩnh mạch (02.0092.0054)",
  "Bít lỗ thông liên nhĩ/liên thất/ống động mạch (03.2270.0054)",
  "Siêu âm tim qua đường thực quản (03.4250.0008)",
  "Đặt coli bít ống động mạch (03.2311.0055)",
  "Điều trị rối loạn nhịp tim bằng sóng tần số radio ( 02.0086.0106)",
  "Nong mạch/đặt stent mạch các loại (03.2313.0054)",
  "Đặt stent hẹp eo động mạch chủ (03.2280.0055)",
  "Nong Van Động Mạch Phổi (03.2298.0054)",
  "Nong van Động Mạch Chủ (03.2296.0054)",
  "Nong hẹp eo động mạch chủ (03.2297.0054)",
  "Đặt stent ống động mạch ( 03.2303.0054)",
  "Đặt stent động mạch thận (03.2302.0054)",
  "Phá vách liên nhĩ (03.2275.0054)"
];

const DEPARTMENTS_LIST = [
  'Ngoại trú',
  'Tim Mạch',
  'Ngoại LN-TM',
  'Hồi Sức Sơ Sinh',
  'Hồi Sức Tim',
  'HSTC-CĐ',
  'Hô hấp',
  'Tiêu hóa',
  'UBXL-HHLS',
  'Ngoại Thần Kinh',
  'Nội Thần Kinh'
];

const CALL_STATUS_OPTIONS = [
  "Sai số điện thoại",
  "Chưa liên lạc được",
  "Gia đình chưa đồng ý làm",
  "Đã làm nơi khác",
  "Muốn theo dõi nơi khác",
  "Chờ tài trợ",
  "Đồng ý",
  "Loại"
];

const DEFAULT_AD_HOC_CHECK_DEVICE: 'Đủ' = 'Đủ';
const DEFAULT_AD_HOC_CALL_STATUS = 'Đồng ý';
const DEFAULT_AD_HOC_POST_CATH_DEPART = 'Tim Mạch';
const DEFAULT_AD_HOC_SCHEDULED_1ST = 'BS. Phụng';
const DEFAULT_AD_HOC_FUNDING_REQUEST = 'Không tài trợ';

const CONCLUSION_OPTIONS = [
  "Can thiệp thông tim",
  "Chụp chẩn đoán-Đo kháng lực",
  "Chụp chẩn đoán +/- can thiệp",
  "Tiền Glenn",
  "Tiền Fontan",
  "Điện sinh lý",
  "Mổ tim",
  "Thêm CĐHA; vđ khác - Staff lại",
  "Chụp MRI",
  "Chưa có chỉ định - Theo dõi tiếp",
  "Điều trị nội khoa - Hẹn staff lại",
  "Quá chỉ định",
  "Không có thông tin"
];

const getPriorityBadgeClass = (priority: string) => {
  const normalized = normalizePriorityOrder(priority);
  if (normalized === 'Cấp cứu') return 'bg-rose-100 text-rose-850 border-rose-200';
  if (normalized === 'Làm sớm') return 'bg-amber-100 text-amber-900 border-amber-200';
  return 'bg-indigo-100 text-indigo-850 border-indigo-200';
};

export default function CathLabSchedulerView({
  patients,
  consults,
  cathlabs = [],
  sources = [],
  deviceTemplates = [],
  staffList,
  currentStaff,
  onRefreshData,
  onPatchConsult,
  onPatchPatient,
  onAddPatient,
  onAddConsult,
  onViewPatientRecord,
  pureCalendarMode = false,
  onTogglePureMode
}: CathLabSchedulerViewProps) {
  const diagnosisOptions = useMemo(
    () => getSourceDiagnosisOptions(sources),
    [sources]
  );

  const createDiagnosisSource = async (DiagnosisID: string) => {
    const trimmed = normalizeDiagnosisID(DiagnosisID);
    if (!trimmed) return;

    const response = await fetch('/api/sources', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ DiagnosisID: trimmed })
    });

    if (!response.ok) {
      throw new Error('Không thể thêm DiagnosisID vào Source');
    }

    onRefreshData();
  };
  
  const formatDateTime = (dateStr?: string) => {
    if (!dateStr) return '';
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return dateStr;
      const pad = (num: number) => String(num).padStart(2, '0');
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
    } catch (e) {
      return dateStr;
    }
  };
  
  // Tab states for waitlist
  const [activeTab, setActiveTab] = useState<'unscheduled' | 'scheduled' | 'all'>('unscheduled');
  // Search and Sort query
  const [searchQuery, setSearchQuery] = useState('');
  const [waitlistSortOrder, setWaitlistSortOrder] = useState<'desc' | 'asc'>('desc');

  // Column visibility settings for the waitlist table
  const [visibleColumns, setVisibleColumns] = useState({
    icd: true,
    priority: true,
    requestBy: true,
    ptvPhu1: true,
    plannedDate: true,
    checkDevice: true,
    consultDate: false,
    consultResultId: false,
    callStatus: false,
    missSchedule: false,
  });
  const [showColumnDropdown, setShowColumnDropdown] = useState(false);
  const columnDropdownRef = useRef<HTMLDivElement>(null);

  // Close column visibility dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (columnDropdownRef.current && !columnDropdownRef.current.contains(e.target as Node)) {
        setShowColumnDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Waitlist Pagination
  const [waitlistCurrentPage, setWaitlistCurrentPage] = useState<number>(1);
  const rowsPerWaitlistPage = 50;
  const isMobile = useIsMobile();
  const MOBILE_WAITLIST_BATCH = 50;
  const [mobileWaitlistVisibleCount, setMobileWaitlistVisibleCount] = useState(MOBILE_WAITLIST_BATCH);
  const waitlistScrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setWaitlistCurrentPage(1);
    setMobileWaitlistVisibleCount(MOBILE_WAITLIST_BATCH);
  }, [activeTab, searchQuery, waitlistSortOrder]);
  
  // Selected consult for form editing
  const [selectedConsult, setSelectedConsult] = useState<Consult | null>(null);
  
  // Tab state for mobile layout
  const [mobileTab, setMobileTab] = useState<'waitlist' | 'calendar' | 'editor'>('waitlist');

  // Automatically switch tab on mobile when a patient is selected or deselected
  useEffect(() => {
    if (!selectedConsult) {
      if (mobileTab === 'editor') {
        setMobileTab('waitlist');
      }
    } else {
      setMobileTab('editor');
    }
  }, [selectedConsult]);
  
  // Save notification states
  const [saving, setSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [importingExcel, setImportingExcel] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [importDriveUrl, setImportDriveUrl] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Export Filter Panel State
  const [isFilterExpanded, setIsFilterExpanded] = useState<boolean>(false);
  const [exportStartDate, setExportStartDate] = useState<string>(''); // selected start date for exporting

  const exportEndDateTime = useMemo(() => {
    if (!exportStartDate) return null;
    const d = new Date(exportStartDate);
    d.setDate(d.getDate() + 6);
    return d;
  }, [exportStartDate]);

  const exportEndDateStr = exportEndDateTime ? `${exportEndDateTime.getFullYear()}-${String(exportEndDateTime.getMonth() + 1).padStart(2, '0')}-${String(exportEndDateTime.getDate()).padStart(2, '0')}` : '';

  // Device Filter Panel State
  const [isDeviceFilterExpanded, setIsDeviceFilterExpanded] = useState<boolean>(false);
  const [deviceCheckFilter, setDeviceCheckFilter] = useState<'all' | 'enough' | 'missing'>('all');
  const [deviceDateType, setDeviceDateType] = useState<'all' | 'custom' | 'group'>('custom');
  const [deviceStartDate, setDeviceStartDate] = useState<string>('');
  const [deviceEndDate, setDeviceEndDate] = useState<string>('');
  const [deviceGroupType, setDeviceGroupType] = useState<'month' | 'quarter'>('month');
  const [deviceGroupValue, setDeviceGroupValue] = useState<string>('1');

  const isAnyFilterExpanded = isFilterExpanded || isDeviceFilterExpanded;

  // ... rest of the code is unchanged ...

  // Calendar view states
  const [calendarView, setCalendarView] = useState<'day' | 'week' | 'month'>('month');
  const [currentMonth, setCurrentMonth] = useState(5); // June (0-indexed, so 5 = June)
  const [currentYear, setCurrentYear] = useState(2026);
  const [activeDate, setActiveDate] = useState<Date>(new Date(2026, 5, 6)); // Default focus: June 6th, 2026

  // Editable Form states
  const [plannedDevice, setPlannedDevice] = useState('');
  const [plannedPrice, setPlannedPrice] = useState('');
  const [checkDevice, setCheckDevice] = useState<'Đủ' | 'Thiếu' | ''>('');
  const [operationFeedback, setOperationFeedback] = useState('');
  const [supplyDepFeedback, setSupplyDepFeedback] = useState('');
  const [callStatus, setCallStatus] = useState('');
  const [callNote, setCallNote] = useState('');
  const [priorityOrder, setPriorityOrder] = useState<PriorityOrderEnum>('Chương trình');
  const [schedConsultDate, setSchedConsultDate] = useState('');
  const [schedRequestBy, setSchedRequestBy] = useState('');
  const [schedPatientWeight, setSchedPatientWeight] = useState('');
  const [schedPatientHeight, setSchedPatientHeight] = useState('');
  const [schedDiagnosisID, setSchedDiagnosisID] = useState('');
  const [schedDetailDiagnosis, setSchedDetailDiagnosis] = useState('');
  const [schedConsultResultID, setSchedConsultResultID] = useState('');
  const [schedDetailConsultResult, setSchedDetailConsultResult] = useState('');
  const [plannedCathLabDate, setPlannedCathLabDate] = useState('');
  const [selectedMethods, setSelectedMethods] = useState<string[]>([]);
  const [postCathDepart, setPostCathDepart] = useState('');
  const [scheduled1st, setScheduled1st] = useState('');
  const [scheduled2nd, setScheduled2nd] = useState('');
  const [scheduled3rd, setScheduled3rd] = useState('');

  const [showConfirmRemoveDialog, setShowConfirmRemoveDialog] = useState(false);
  const [prevCallStatus, setPrevCallStatus] = useState('');

  // Ad-hoc form states (Xếp bổ sung)
  const [showAdHocModal, setShowAdHocModal] = useState(false);
  const [adHocPatientID1, setAdHocPatientID1] = useState('');
  const [adHocPatientID2, setAdHocPatientID2] = useState('');
  const [adHocPatientName, setAdHocPatientName] = useState('');
  const [adHocOtherPatientName, setAdHocOtherPatientName] = useState('');
  const [adHocErrors, setAdHocErrors] = useState<string[]>([]);
  const [adHocPatientDOB, setAdHocPatientDOB] = useState('2018-01-01');
  const [adHocPatientSex, setAdHocPatientSex] = useState<'Nam' | 'Nữ'>('Nam');
  const [adHocPatientAddress, setAdHocPatientAddress] = useState('');
  const [adHocPatientPhone1, setAdHocPatientPhone1] = useState('');
  const [adHocPatientPhone2, setAdHocPatientPhone2] = useState('');
  const [adHocOutcome, setAdHocOutcome] = useState<'Tử vong' | 'Nặng xin về' | 'Đã mổ' | 'Đã thông' | ''>('');

  const [adHocConsultType, setAdHocConsultType] = useState<'Staff mổ' | 'Staff thông'>('Staff thông');
  const [actionConfirm, setActionConfirm] = useState<{type: 'save_schedule'|'loai'|'transfer'|'undo_scheduled'|'transfer_row'|'ad_hoc_override', title: string, message: string, consultToUpdate?: Consult} | null>(null);
  const [actionAlert, setActionAlert] = useState<string>('');
  const [formSnapshot, setFormSnapshot] = useState<SchedulingFormSnapshot | null>(null);
  const [exitConfirmOpen, setExitConfirmOpen] = useState(false);
  const [exitConfirmError, setExitConfirmError] = useState('');
  const [pendingExitAction, setPendingExitAction] = useState<(() => void) | null>(null);
  const [adHocPatientWeight, setAdHocPatientWeight] = useState('');
  const [adHocPatientHeight, setAdHocPatientHeight] = useState('');
  const [adHocConsultDate, setAdHocConsultDate] = useState(getTodayIsoDate);
  const [adHocRequestBy, setAdHocRequestBy] = useState('');
  const [adHocDiagnosisID, setAdHocDiagnosisID] = useState('');
  const [adHocDetailDiagnosis, setAdHocDetailDiagnosis] = useState('');
  const [adHocDepartment, setAdHocDepartment] = useState('Tim Mạch');
  const [adHocConsultResultID, setAdHocConsultResultID] = useState<string>('Can thiệp thông tim');
  const [adHocPriorityOrder, setAdHocPriorityOrder] = useState<PriorityOrderEnum>('Chương trình');

  const [adHocCheckDevice, setAdHocCheckDevice] = useState<'Đủ' | 'Thiếu' | ''>(DEFAULT_AD_HOC_CHECK_DEVICE);
  const [adHocPlannedDevice, setAdHocPlannedDevice] = useState('');
  const [adHocPlannedPrice, setAdHocPlannedPrice] = useState('');
  const [adHocSupplyDepFeedback, setAdHocSupplyDepFeedback] = useState('');
  const [adHocOperationFeedback, setAdHocOperationFeedback] = useState('');

  const [adHocPlannedCathLabDate, setAdHocPlannedCathLabDate] = useState('');
  const [adHocCallStatus, setAdHocCallStatus] = useState(DEFAULT_AD_HOC_CALL_STATUS);
  const [adHocCallNote, setAdHocCallNote] = useState('');
  const [adHocScheduled1st, setAdHocScheduled1st] = useState(DEFAULT_AD_HOC_SCHEDULED_1ST);
  const [adHocScheduled2nd, setAdHocScheduled2nd] = useState('');
  const [adHocScheduled3rd, setAdHocScheduled3rd] = useState('');
  const [adHocPostCathDepart, setAdHocPostCathDepart] = useState(DEFAULT_AD_HOC_POST_CATH_DEPART);
  const [adHocPatientMode, setAdHocPatientMode] = useState<'existing' | 'new'>('existing');
  const [adHocSearchQuery, setAdHocSearchQuery] = useState('');
  const [adHocSelectedPatientKey, setAdHocSelectedPatientKey] = useState('');
  const [adHocDetailConsultResult, setAdHocDetailConsultResult] = useState('');
  const [adHocRiskFactor, setAdHocRiskFactor] = useState('3 -SpO2 > 75% ổn định');
  const [adHocFundingRequest, setAdHocFundingRequest] = useState<string>(DEFAULT_AD_HOC_FUNDING_REQUEST);
  const [adHocCheckDeviceDate, setAdHocCheckDeviceDate] = useState<string>('');
  const [adHocCheckDeviceBy, setAdHocCheckDeviceBy] = useState<string>('');
  const [adHocCathMethod, setAdHocCathMethod] = useState<string[]>([]);
  const [adHocPendingConsult, setAdHocPendingConsult] = useState<Consult | null>(null);
  const [adHocValidationMsg, setAdHocValidationMsg] = useState('');

  useEffect(() => {
    if (adHocPatientMode !== 'existing' || !adHocSelectedPatientKey) {
      setAdHocDetailDiagnosis('');
      return;
    }
    setAdHocDetailDiagnosis(
      getLatestPriorDetailDiagnosis(adHocSelectedPatientKey, consults, cathlabs, adHocConsultDate)
    );
  }, [adHocPatientMode, adHocSelectedPatientKey, adHocConsultDate, consults, cathlabs]);

  useEffect(() => {
    if (!successMsg) return;
    const timer = window.setTimeout(() => setSuccessMsg(''), 4000);
    return () => window.clearTimeout(timer);
  }, [successMsg]);

  // Summary copyable modal states
  const [showSummaryModal, setShowSummaryModal] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copiedImage, setCopiedImage] = useState(false);
  const [copiedImageType, setCopiedImageType] = useState<'clipboard' | 'download'>('clipboard');
  const [isCopyingImage, setIsCopyingImage] = useState(false);
  const [showSmsModal, setShowSmsModal] = useState(false);
  const [smsMessage, setSmsMessage] = useState('');
  const [smsCopied, setSmsCopied] = useState(false);

  const formatShortDoctorName = (name: string) => {
    if (!name) return '';
    const parts = name.trim().split(' ');
    if (name.toLowerCase().startsWith('bs.') && parts.length <= 2) return name;
    const lastName = parts[parts.length - 1];
    return `BS. ${lastName}`;
  };

  // Utility to parse Year of date string
  const getYear = (dateStr: string | undefined): number => {
    if (!dateStr) return 0;
    const trimmed = dateStr.trim();
    if (/^\d{4}/.test(trimmed)) {
      return parseInt(trimmed.substring(0, 4), 10);
    }
    try {
      const parts = trimmed.split('-');
      if (parts.length === 3 && parts[2].length === 4) {
        return parseInt(parts[2], 10); // handles "DD-MM-YYYY"
      }
      return new Date(trimmed).getFullYear();
    } catch (e) {}
    return 0;
  };

  // Helper to standardise Date column values to YYYY-MM-DD
  const getFormattedDateKey = (str: string | undefined): string => {
    if (!str) return '';
    const trimmed = str.trim().split('T')[0];
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
    
    // DD-MM-YYYY -> YYYY-MM-DD
    const parts = trimmed.split('-');
    if (parts.length === 3 && parts[2].length === 4) {
      return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
    }
    // DD/MM/YYYY
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

  const getMissScheduleDays = (consultDateStr: string | undefined): number => {
    if (!consultDateStr) return 0;
    const formattedDateKey = getFormattedDateKey(consultDateStr);
    if (!formattedDateKey) return 0;
    
    const parts = formattedDateKey.split('-');
    if (parts.length !== 3) return 0;
    const y = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10) - 1; // 0-indexed month
    const d = parseInt(parts[2], 10);
    
    const consultDate = new Date(y, m, d);
    if (isNaN(consultDate.getTime())) return 0;
    
    // Set time of both to midnight to count only full days
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    consultDate.setHours(0, 0, 0, 0);
    
    const diffTime = today.getTime() - consultDate.getTime();
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    return diffDays > 0 ? diffDays : 0;
  };

  const buildSnapshotFromConsult = (c: Consult): SchedulingFormSnapshot => {
    let methods: string[] = [];
    if (c.CathMethod) {
      if (c.CathMethod.includes('+')) {
        methods = c.CathMethod.split('+').map(m => m.trim()).filter(Boolean);
      } else {
        const tm = c.CathMethod.trim();
        if (tm) methods = [tm];
      }
    }
    const autoPtv2 = getAutoScheduled2nd(c.RequestBy || '');
    return {
      consultDate: c.ConsultDate ? getFormattedDateKey(c.ConsultDate) : '',
      requestBy: c.RequestBy || '',
      patientWeight: parseWeightForInput(c.PatientWeight),
      patientHeight: parseHeightForInput(c.PatientHeight),
      diagnosisID: c.DiagnosisID || '',
      detailDiagnosis: c.DetailDiagnosis || '',
      consultResultID: c.ConsultResultID || '',
      detailConsultResult: c.DetailConsultResult || '',
      plannedDevice: c.PlannedDevice || '',
      plannedPrice: c.PlannedPrice || '',
      checkDevice: c.CheckDevice || '',
      operationFeedback: c.OperationFeedback || '',
      supplyDepFeedback: c.SupplyDepFeedback || '',
      callStatus: c.CallStatus || '',
      callNote: c.CallNote || '',
      priorityOrder: normalizePriorityOrder(c.PriorityOrder),
      plannedCathLabDate: c.PlannedCathLabDate ? getFormattedDateKey(c.PlannedCathLabDate) : '',
      selectedMethods: methods,
      postCathDepart: c.PostCathDepart || '',
      scheduled1st: c.Scheduled1stInterventionist || '',
      scheduled2nd: autoPtv2 || c.Scheduled2ndInterventionist || '',
      scheduled3rd: c.Scheduled3rdInterventionist || '',
    };
  };

  const VN_WEEKDAYS = ['Chủ Nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];

  const parseLocalDateFromKey = (dateStr?: string): Date | null => {
    const key = getFormattedDateKey(dateStr);
    if (!key) return null;
    const [yyyy, mm, dd] = key.split('-').map(Number);
    if (!yyyy || !mm || !dd) return null;
    const dateObj = new Date(yyyy, mm - 1, dd);
    return isNaN(dateObj.getTime()) ? null : dateObj;
  };

  const formatDateWithWeekday = (dateStr?: string): string => {
    const dateObj = parseLocalDateFromKey(dateStr);
    if (!dateObj) return 'Chưa xếp lịch';
    return `${VN_WEEKDAYS[dateObj.getDay()]}, ${formatVNTime(getFormattedDateKey(dateStr))}`;
  };

  const formatAdmissionDate = (dateStr?: string): string => {
    const dateObj = parseLocalDateFromKey(dateStr);
    if (!dateObj) return 'Chưa xếp lịch';
    dateObj.setDate(dateObj.getDate() - 2);
    const key = `${dateObj.getFullYear()}-${String(dateObj.getMonth() + 1).padStart(2, '0')}-${String(dateObj.getDate()).padStart(2, '0')}`;
    return `${VN_WEEKDAYS[dateObj.getDay()]}, ${formatVNTime(key)}`;
  };

  const buildSmsMessage = (patient: Patient, consult: Consult): string => {
    const plannedDate = plannedCathLabDate || consult.PlannedCathLabDate || '';
    return `KHOA TIM MẠCH THÔNG BÁO:
Họ tên: ${patient.PatientName || '—'}
Ngày sinh: ${patient.PatientDOB ? formatVNTime(patient.PatientDOB) : '—'}
Chẩn đoán: ${consult.DiagnosisID || '—'}-${consult.DetailDiagnosis || '—'}
Kết luận: ${consult.ConsultResultID || '—'} - ${consult.DetailConsultResult || '—'}
Lịch can thiệp dự kiến: ${formatDateWithWeekday(plannedDate)}
Ngày nhập viện: ${formatAdmissionDate(plannedDate)}
Đề nghị quý thân nhân đưa bé nhập viện đúng hẹn để công việc chuẩn bị diễn ra thuận lợi
Xin cảm ơn!`;
  };

  const handleOpenSmsModal = (patient: Patient) => {
    if (!selectedConsult) return;
    setSmsMessage(buildSmsMessage(patient, selectedConsult));
    setSmsCopied(false);
    setShowSmsModal(true);
  };

  const handleCopySmsMessage = async () => {
    try {
      await navigator.clipboard.writeText(smsMessage);
      setSmsCopied(true);
      setTimeout(() => setSmsCopied(false), 2000);
    } catch (err) {
      console.error('Error copying SMS message: ', err);
      setErrorMsg('Không thể copy nội dung SMS. Vui lòng chọn nội dung và copy thủ công.');
    }
  };

  // Group consults to resolve the Latest Consultation for each PatientKey (simulates [LatestPrepConsultID] check in AppSheet)
  const latestConsultsMap = useMemo(() => {
    const map = new Map<string, string>(); // PatientKey -> ConsultKey
    
    // Sort so newest dates/timestamps are handled first
    const sorted = [...consults].sort((a, b) => {
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

  const cathlabsByPatientKey = useMemo(() => buildCathlabsByPatientKey(cathlabs), [cathlabs]);

  const isPendingConsultResult = (resultId: unknown) => {
    if (!resultId) return true;
    const s = String(resultId).trim().toLowerCase();
    return s === '' || s === 'nodata' || s === 'no data' || s === '—' || s === '-';
  };

  const getPendingConsultForPatient = (patientKey: string): Consult | undefined => {
    const normalized = normalizePatientKey(patientKey);
    if (!normalized) return undefined;
    const patientConsults = consults
      .filter(c => normalizePatientKey(c.PatientKey) === normalized)
      .sort((a, b) => {
        const aDate = a.ConsultDate || '';
        const bDate = b.ConsultDate || '';
        if (aDate !== bDate) return bDate.localeCompare(aDate);
        return (b.ConsultCreateTime || '').localeCompare(a.ConsultCreateTime || '');
      });
    return patientConsults.find(c => isPendingConsultResult(c.ConsultResultID));
  };

  const resolvePendingConsultForAdHoc = (): Consult | undefined => {
    if (adHocPatientMode === 'existing' && adHocSelectedPatientKey) {
      return getPendingConsultForPatient(adHocSelectedPatientKey);
    }
    if (adHocPatientMode === 'new' && adHocPatientID1.trim()) {
      const dup = patients.find(
        p => String(p.PatientID1 || '').trim().toLowerCase() === adHocPatientID1.trim().toLowerCase()
      );
      if (dup) return getPendingConsultForPatient(dup.PatientKey);
    }
    return undefined;
  };

  // Compute waitlist queue based on the exact AppSheet slice constraints
  const allEligibleWaitlist = useMemo(() => {
    const ELIGIBLE_RESULTS = [
      "Can thiệp thông tim",
      "Chụp chẩn đoán +/- can thiệp",
      "Chụp chẩn đoán-Đo kháng lực",
      "Chụp chẩn đoán/Đo kháng lực",
      "Tiền Glenn",
      "Tiền Fontan",
      "Điện sinh lý"
    ];

    const result = consults.filter(c => {
      if (!c.ConsultDate) return false;

      if (latestConsultsMap.get(normalizePatientKey(c.PatientKey)) !== c.ConsultKey) { return false; }
      if (isConsultCathCompleted(c, cathlabsByPatientKey.get(normalizePatientKey(c.PatientKey)))) { return false; }
      if (isConsultWaitlistExcludedByStatus(c.Status)) { return false; }

      const isRemoved = c.Removed === true || String(c.Removed).toUpperCase() === 'TRUE' || String(c.Removed).toLowerCase() === 'có' || String(c.Removed).toLowerCase() === 'yes';
      if (isRemoved) { return false; }

      const resID = (c.ConsultResultID || '').trim();
      let matchRes = false;
      if (ELIGIBLE_RESULTS.includes(resID)) {
        matchRes = true;
      } else {
        const normalized = ELIGIBLE_RESULTS.map(e => e.trim().toLowerCase());
        if (normalized.includes(resID.toLowerCase())) matchRes = true;
      }
      if (!matchRes) { return false; }

      const callSt = String(c.CallStatus || '').trim().toLowerCase();
      if (
        callSt === "đã can thiệp/mổ" || 
        callSt === "loại" || 
        callSt === "đã làm nơi khác" || 
        callSt === "muốn theo dõi nơi khác"
      ) { return false; }

      const pat = findPatientByKey(patients, c.PatientKey);
      if (!pat) { return false; }
      
      const pOut = String(pat.Outcome || '').toLowerCase().trim();
      if (pOut === "tử vong" || pOut === "nặng xin về") { return false; }

      return true;
    });
    
    return result;
  }, [consults, patients, latestConsultsMap, cathlabsByPatientKey]);

  // Segment Waiting List into tabs: "Chưa xếp lịch" and "Đã xếp lịch"
  // Sắp xếp ngày gần nhất lên trên, ngày xa nhất dưới
  const segmentedWaitlist = useMemo(() => {
    const unscheduledList = allEligibleWaitlist.filter(c => !c.PlannedCathLabDate);
    const scheduledList = allEligibleWaitlist.filter(c => !!c.PlannedCathLabDate);

    // Sort unscheduled by ConsultDate descending (most recently discussed on top)
    const sortedUnscheduled = [...unscheduledList].sort((a, b) => {
      return (b.ConsultDate || '').localeCompare(a.ConsultDate || '');
    });

    // Sort scheduled by PlannedCathLabDate descending (nearest dates up top)
    const sortedScheduled = [...scheduledList].sort((a, b) => {
      return (b.PlannedCathLabDate || '').localeCompare(a.PlannedCathLabDate || '');
    });

    return {
      unscheduled: sortedUnscheduled,
      scheduled: sortedScheduled,
      all: [...sortedUnscheduled, ...sortedScheduled]
    };
  }, [allEligibleWaitlist]);

  const exportFilteredConsults = useMemo(() => {
    if (!exportStartDate || !exportEndDateStr) return [];
    return [...allEligibleWaitlist].filter(c => {
      if (!c.PlannedCathLabDate) return false;
      return c.PlannedCathLabDate >= exportStartDate && c.PlannedCathLabDate <= exportEndDateStr;
    }).sort((a, b) => (a.PlannedCathLabDate || '').localeCompare(b.PlannedCathLabDate || ''));
  }, [allEligibleWaitlist, exportStartDate, exportEndDateStr]);

  const deviceFilteredConsults = useMemo(() => {
    let start = '';
    let end = '';
    if (deviceDateType === 'all') {
      // no date filtering
    } else if (deviceDateType === 'custom') {
      start = deviceStartDate;
      end = deviceEndDate;
    } else {
      if (deviceGroupType === 'month') {
        const m = parseInt(deviceGroupValue, 10);
        start = `${currentYear}-${String(m).padStart(2, '0')}-01`;
        const lastDay = new Date(currentYear, m, 0).getDate();
        end = `${currentYear}-${String(m).padStart(2, '0')}-${lastDay}`;
      } else if (deviceGroupType === 'quarter') {
        const q = parseInt(deviceGroupValue, 10);
        const startMonth = (q - 1) * 3 + 1;
        const endMonth = startMonth + 2;
        start = `${currentYear}-${String(startMonth).padStart(2, '0')}-01`;
        const lastDay = new Date(currentYear, endMonth, 0).getDate();
        end = `${currentYear}-${String(endMonth).padStart(2, '0')}-${lastDay}`;
      }
    }

    return [...allEligibleWaitlist].filter(c => {
      if (deviceCheckFilter === 'enough' && c.CheckDevice !== 'Đủ') return false;
      if (deviceCheckFilter === 'missing' && c.CheckDevice !== 'Thiếu') return false;
      
      if (start && end) {
        if (!c.ConsultDate) return false;
        if (c.ConsultDate < start || c.ConsultDate > end) return false;
      }
      return true;
    }).sort((a, b) => (a.ConsultDate || '').localeCompare(b.ConsultDate || ''));
  }, [allEligibleWaitlist, deviceCheckFilter, deviceDateType, deviceStartDate, deviceEndDate, deviceGroupType, deviceGroupValue, currentYear]);

  const handleExportDeviceExcel = async () => {
    let start = '';
    let end = '';
    let dateStr = '';
    
    if (deviceDateType === 'all') {
      dateStr = 'TẤT CẢ DANH SÁCH DỰ TRÙ DỤNG CỤ THÔNG TIM';
    } else if (deviceDateType === 'custom') {
      if (!deviceStartDate || !deviceEndDate) {
        setErrorMsg("Vui lòng chọn ngày đầu và ngày cuối!");
        return;
      }
      start = deviceStartDate;
      end = deviceEndDate;
      const startFormatted = start.split('-').reverse().join('/');
      const endFormatted = end.split('-').reverse().join('/');
      dateStr = `DANH SÁCH DỰ TRÙ DỤNG CỤ THÔNG TIM TỪ NGÀY ${startFormatted} ĐẾN NGÀY ${endFormatted}`;
    } else {
      if (deviceGroupType === 'month') {
        const m = parseInt(deviceGroupValue, 10);
        start = `${currentYear}-${String(m).padStart(2, '0')}-01`;
        const lastDay = new Date(currentYear, m, 0).getDate();
        end = `${currentYear}-${String(m).padStart(2, '0')}-${lastDay}`;
        dateStr = `DANH SÁCH DỰ TRÙ DỤNG CỤ THÔNG TIM THÁNG ${m} NĂM ${currentYear}`;
      } else {
        const q = parseInt(deviceGroupValue, 10);
        const startMonth = (q - 1) * 3 + 1;
        const endMonth = startMonth + 2;
        start = `${currentYear}-${String(startMonth).padStart(2, '0')}-01`;
        const lastDay = new Date(currentYear, endMonth, 0).getDate();
        end = `${currentYear}-${String(endMonth).padStart(2, '0')}-${lastDay}`;
        dateStr = `DANH SÁCH DỰ TRÙ DỤNG CỤ THÔNG TIM QUÝ ${q} NĂM ${currentYear}`;
      }
    }

    try {
      if (deviceFilteredConsults.length === 0) {
        setErrorMsg("Không có ca bệnh nào thỏa mãn điều kiện!");
        return;
      }

      const vnDays = ['Chủ Nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];

      // EXCELJS EXPORT ENABLED
      const ExcelJS = await import('exceljs');
      const workbook = new ExcelJS.Workbook();

      const worksheet = workbook.addWorksheet('DuTruDungCu');

      worksheet.pageSetup = {
        paperSize: 9, // A4
        orientation: 'landscape',
        fitToPage: true,
        fitToWidth: 1,
        fitToHeight: 0
      };

      const fontTimesNormal = { name: 'Times New Roman', size: 11 };
      const fontTimesBold = { name: 'Times New Roman', size: 11, bold: true };
      
      const thinBorder: any = {
        top: { style: 'thin' },
        left: { style: 'thin' },
        bottom: { style: 'thin' },
        right: { style: 'thin' }
      };

      const centerAlignment: any = {
        vertical: 'middle',
        horizontal: 'center',
        wrapText: true
      };

      // Header rows
      worksheet.addRow(['CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM']);
      worksheet.addRow(['Độc lập - Tự do - Hạnh phúc']);
      worksheet.addRow([]);
      worksheet.addRow([dateStr]);
      
      // Formatting headers
      worksheet.mergeCells('A1:K1');
      worksheet.mergeCells('A2:K2');
      worksheet.mergeCells('A4:K4');
      
      worksheet.getCell('A1').font = { ...fontTimesBold, size: 13 };
      worksheet.getCell('A2').font = { ...fontTimesBold, size: 13 };
      worksheet.getCell('A4').font = { ...fontTimesBold, size: 16 };
      
      worksheet.getCell('A1').alignment = centerAlignment;
      worksheet.getCell('A2').alignment = centerAlignment;
      worksheet.getCell('A4').alignment = centerAlignment;

      worksheet.addRow([]);

      // Headers table
      const headerRow = worksheet.addRow([
        'STT', 'Ngày dự kiến TT', 'Mã NB', 'Họ tên', 'Thông tin BN', 'Chẩn đoán chi tiết',
        'Kế hoạch can thiệp', 'Dụng cụ dự trù', 'Trạng thái dụng cụ', 'Phòng mổ phản hồi', 'Phòng vật tư phản hồi'
      ]);

      headerRow.height = 35;
      headerRow.eachCell((cell) => {
        cell.font = fontTimesBold;
        cell.alignment = centerAlignment;
        cell.border = thinBorder;
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFEFEFEF' }
        };
      });

      // Insert data rows
      deviceFilteredConsults.forEach((c, i) => {
        let cathLabDateDisplay = '';
        let dayOfWeekStr = '';
        if (c.PlannedCathLabDate) {
          const d = new Date(c.PlannedCathLabDate);
          dayOfWeekStr = vnDays[d.getDay()];
          cathLabDateDisplay = `${formatVNTime(c.PlannedCathLabDate)}\n(${dayOfWeekStr})`;
        }
        
        const p = findPatientByKey(patients, c.PatientKey);
        
        const dobFormatted = p?.PatientDOB ? formatVNTime(p.PatientDOB) : '';
        const ageDesc = p?.PatientDOB ? getPatientAgeDescription(p.PatientDOB) : '';

        const weightStr = c.PatientWeight ? String(c.PatientWeight) + (String(c.PatientWeight).includes('kg') ? '' : ' kg') : '';
        const thongTin = p ? `${p.PatientSex || ''}\n${dobFormatted}\n(${ageDesc})\n${weightStr}\n${p.PatientAddress || (p as any).PatientAddress || ''}` : '';
        
        const chanDoan = c.DetailDiagnosis || '';
        const keHoach = c.DetailConsultResult || '';
        const duTru = c.PlannedDevice || '';
        const checkDevice = c.CheckDevice || '';
        const operationFeedback = c.OperationFeedback || '';
        const supplyDepFeedback = c.SupplyDepFeedback || '';

        const rowData = [
          i + 1,
          cathLabDateDisplay,
          p?.PatientID1 || p?.PatientID2 || '',
          p?.PatientName?.toUpperCase() || '',
          thongTin,
          chanDoan,
          keHoach,
          duTru,
          checkDevice,
          operationFeedback,
          supplyDepFeedback
        ];

        const row = worksheet.addRow(rowData);
        
        const thongTinLines = thongTin.split('\n').length;
        const maxChars = Math.max(chanDoan.length, keHoach.length, duTru.length);
        row.height = Math.max(30, thongTinLines * 16, Math.ceil(maxChars / 32) * 15);

        row.eachCell((cell) => {
          cell.font = fontTimesNormal;
          cell.alignment = centerAlignment;
          cell.border = thinBorder;
        });
      });

      // Columns width
      worksheet.columns = [
        { width: 5 },  // STT
        { width: 14 }, // Ngay du kien TT
        { width: 12 }, // Ma NB
        { width: 22 }, // Ho va ten
        { width: 20 }, // Thong tin BN
        { width: 32 }, // Chan doan (expand)
        { width: 26 }, // Ke hoach can thiep
        { width: 32 }, // Dung cu du tru (expand)
        { width: 12 }, // Trang thai dung cu
        { width: 20 }, // Phong mo phan hoi
        { width: 20 }  // Phong vat tu phan hoi
      ];

      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      document.body.appendChild(a);
      a.style.display = 'none';
      a.href = url;
      if (deviceDateType === 'all') {
        a.download = 'DanhSachDuTru_TatCa.xlsx';
      } else {
        a.download = `DanhSachDuTru_${start.replace(/\//g, '')}_${end.replace(/\//g, '')}.xlsx`;
      }
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      window.setTimeout(() => {
        setErrorMsg('Tải file thành công!');
        setTimeout(() => setErrorMsg(''), 3000);
      }, 0);
    } catch (err: any) {
      console.error("Lỗi xuất excel: ", err);
      setErrorMsg("Lỗi xuất excel: " + err.message);
    }
  };

  const processExcelBuffer = async (buffer: ArrayBuffer) => {
    try {
      setImportingExcel(true);
      setErrorMsg('');

      const workbook = XLSX.read(buffer, { type: 'array' });
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      
      const jsonData: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
      
      if (!jsonData || jsonData.length === 0) {
        throw new Error("Không tìm thấy dữ liệu Worksheet");
      }

      const updates: { consultKey: string, payload: any }[] = [];

      for (let i = 6; i < jsonData.length; i++) {
        const row = jsonData[i];
        if (!row || row.length === 0) continue;

        const maNBValue = row[2];
        const maNB = maNBValue ? maNBValue.toString().trim() : '';

        const checkDeviceValue = row[8];
        const checkDeviceCell = checkDeviceValue ? checkDeviceValue.toString().trim() : '';

        const opFeedbackValue = row[9];
        const opFeedbackCell = opFeedbackValue ? opFeedbackValue.toString().trim() : '';

        const supplyFeedbackValue = row[10];
        const supplyFeedbackCell = supplyFeedbackValue ? supplyFeedbackValue.toString().trim() : '';

        if (maNB) {
          const p = patients.find(pat => String(pat.PatientID1) === maNB);
          if (p) {
            const cList = consults.filter(con => con.PatientKey == p.PatientKey && con.ConsultResultID && ['Can thiệp thông tim', 'Mổ tim', 'Tiền Glenn', 'Tiền Fontan'].includes(con.ConsultResultID));
            const c = cList.length > 0 ? cList.sort((a,b) => (b.ConsultDate || '').localeCompare(a.ConsultDate || ''))[0] : consults.find(con => con.PatientKey == p.PatientKey);

            if (c) {
              const payload: any = {};
              if (checkDeviceCell !== '') payload.CheckDevice = checkDeviceCell;
              if (opFeedbackCell !== '') payload.OperationFeedback = opFeedbackCell;
              if (supplyFeedbackCell !== '') payload.SupplyDepFeedback = supplyFeedbackCell;

              if (Object.keys(payload).length > 0) {
                updates.push({ consultKey: c.ConsultKey, payload });
              }
            }
          }
        }
      }

      if (updates.length > 0) {
        const promises = updates.map(u => 
          fetch(`/api/consults/${u.consultKey}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(u.payload)
          })
        );
        await Promise.all(promises);
        onRefreshData();
        setErrorMsg(`Đã cập nhật dụng cụ xong ${updates.length} ca!`);
        setTimeout(() => setErrorMsg(''), 4000);
      } else {
        setErrorMsg("Không tìm thấy ca nào cần cập nhật/hoặc dòng dữ liệu rỗng từ file.");
      }
    } catch (err: any) {
      console.error("Lỗi nhập excel: ", err);
      setErrorMsg("Lỗi nhập excel: " + err.message);
    } finally {
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      setImportingExcel(false);
      setShowImportModal(false);
    }
  };

  const handleImportDeviceExcel = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const buffer = await file.arrayBuffer();
    await processExcelBuffer(buffer);
  };

  const handleImportFromDrive = async () => {
    if (!importDriveUrl.trim()) {
      setErrorMsg("Vui lòng nhập Link Google Sheets!");
      return;
    }
    try {
      setImportingExcel(true);
      setErrorMsg('');
      let spreadsheetId = '';
      const match = importDriveUrl.match(/\/d\/([a-zA-Z0-9-_]+)/);
      if (match && match[1]) {
        spreadsheetId = match[1];
      } else {
        throw new Error("Link không hợp lệ! Vui lòng copy đúng link Google Sheets.");
      }
      
      const exportUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/export?format=xlsx`;
      const response = await fetch(`/api/proxy/drive-export?url=${encodeURIComponent(exportUrl)}`);
      if (!response.ok) {
        throw new Error("Không thể tải file từ Google Drive. Vui lòng đảm bảo File đã được Share 'Bất kỳ ai có liên kết đều có thể xem'.");
      }
      const buffer = await response.arrayBuffer();
      await processExcelBuffer(buffer);
    } catch (err: any) {
      console.error("Lỗi tải từ Drive: ", err);
      setErrorMsg("Lỗi tải từ Drive: " + err.message);
      setImportingExcel(false);
    }
  };

  const handleExportExcel = async () => {
    try {
      if (!exportStartDate || exportFilteredConsults.length === 0) {
        setErrorMsg("Không có ca bệnh nào trong khoảng thời gian này!");
        return;
      }

      const vnDays = ['Chủ Nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];

      const startFormatted = exportStartDate.split('-').reverse().join('/');
      const endFormatted = exportEndDateStr.split('-').reverse().join('/');
      const dateStr = `LỊCH THÔNG TIM TỪ NGÀY ${startFormatted} ĐẾN NGÀY ${endFormatted}`;

      // EXCELJS EXPORT ENABLED
      const ExcelJS = await import('exceljs');
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('LichThongTim');

      worksheet.pageSetup = {
        paperSize: 9, // A4
        orientation: 'landscape',
        fitToPage: true,
        fitToWidth: 1,
        fitToHeight: 0
      };

    const fontTimesNormal = { name: 'Times New Roman', size: 11 };
    const fontTimesBold = { name: 'Times New Roman', size: 11, bold: true };
    const fontTimesTitle = { name: 'Times New Roman', size: 14, bold: true };
    const centerAlignment = { horizontal: 'center' as const, vertical: 'middle' as const, wrapText: true };
    const thinBorder = {
      top: { style: 'thin' as const, color: { argb: 'FF000000' } },
      left: { style: 'thin' as const, color: { argb: 'FF000000' } },
      bottom: { style: 'thin' as const, color: { argb: 'FF000000' } },
      right: { style: 'thin' as const, color: { argb: 'FF000000' } }
    };

    // 1. Organization Information
    worksheet.addRow(["BỆNH VIỆN NHI ĐỒNG THÀNH PHỐ"]);
    worksheet.addRow(["KHOA TIM MẠCH"]);
    worksheet.addRow([]); // Spacer

    const cellA1 = worksheet.getCell('A1');
    cellA1.font = fontTimesBold;
    const cellA2 = worksheet.getCell('A2');
    cellA2.font = fontTimesBold;

    // 2. Title
    worksheet.addRow([]); // Row 4 (spacer)
    const titleRow = worksheet.addRow(["", "", "", "", dateStr]); // Row 5
    // merge cells for title
    worksheet.mergeCells('E5:I5');
    const titleCell = worksheet.getCell('E5');
    titleCell.font = fontTimesTitle;
    titleCell.alignment = { horizontal: 'center', vertical: 'middle' };

    worksheet.addRow([]); // Row 6 (spacer)

    // 3. Headers
    const headers = [
      "STT",
      "Ngày thông tim",
      "Mã NB",
      "Họ và tên",
      "Thông tin",
      "Chẩn đoán",
      "Phương pháp thủ thuật",
      "Dự trù dụng cụ",
      "Khoa nằm sau thông tim",
      "HCL (mL)",
      "HTTĐL (mL)",
      "Kết tủa (mL)",
      "PTV"
    ];
    const headerRow = worksheet.addRow(headers);
    headerRow.eachCell((cell) => {
      cell.font = fontTimesBold;
      cell.alignment = centerAlignment;
      cell.border = thinBorder;
    });

    // 4. Data
    exportFilteredConsults.forEach((c, i) => {
      const p = findPatientByKey(patients, c.PatientKey);
      
      let dayOfWeekStr = '';
      if (c.PlannedCathLabDate) {
        const [yyyy, mm, dd] = c.PlannedCathLabDate.split('-');
        if (yyyy && mm && dd) {
          const dateObj = new Date(parseInt(yyyy), parseInt(mm) - 1, parseInt(dd));
          dayOfWeekStr = vnDays[dateObj.getDay()];
        }
      }

      const cathLabDateDisplay = c.PlannedCathLabDate ? `${formatVNTime(c.PlannedCathLabDate)}\n(${dayOfWeekStr})` : '';

      const dobFormatted = formatVNTime(p?.PatientDOB);
      const ageDesc = p?.PatientDOB ? getPatientAgeDescription(p.PatientDOB) : '';

      const weightStr = c.PatientWeight ? String(c.PatientWeight) + (String(c.PatientWeight).includes('kg') ? '' : ' kg') : '';
      const thongTin = p ? `${p.PatientSex || ''}\n${dobFormatted}\n(${ageDesc})\n${weightStr}\n${p.PatientAddress || (p as any).PatientAddress || ''}` : '';
      
      const ptvList = [c.Scheduled1stInterventionist, c.Scheduled2ndInterventionist, c.Scheduled3rdInterventionist].filter(Boolean).join('\n');
      const chanDoan = c.DetailDiagnosis || '';
      
      const ppThuThuat = c.CathMethod || '';
      const duTru = c.PlannedDevice || '';

      const rowData = [
        i + 1,
        cathLabDateDisplay,
        p?.PatientID1 || p?.PatientID2 || '',
        p?.PatientName?.toUpperCase() || '',
        thongTin,
        chanDoan,
        ppThuThuat,
        duTru,
        c.PostCathDepart || 'Khoa Tim mạch',
        "1", 
        "",
        "",
        ptvList
      ];

      const row = worksheet.addRow(rowData);
      
      // Auto row height calculation
      const thongTinLines = thongTin.split('\n').length;
      const maxChars = Math.max(chanDoan.length, ppThuThuat.length, duTru.length);
      row.height = Math.max(30, thongTinLines * 16, Math.ceil(maxChars / 32) * 15);

      row.eachCell((cell) => {
        cell.font = fontTimesNormal;
        cell.alignment = centerAlignment;
        cell.border = thinBorder;
      });
    });

    // Columns width
    worksheet.columns = [
      { width: 5 },  // STT
      { width: 14 }, // Ngay
      { width: 12 }, // Ma NB
      { width: 22 }, // Ho va ten
      { width: 18 }, // Thong tin
      { width: 30 }, // Chan doan
      { width: 25 }, // Phuong phap
      { width: 20 }, // Du tru
      { width: 18 }, // Khoa
      { width: 8 },  // HCL
      { width: 8 },  // HTTDL
      { width: 8 },  // Ket tua
      { width: 18 }  // PTV
    ];

    // Footers
    const now = new Date('2026-06-07');
    worksheet.addRow([]);
    worksheet.addRow([]);
    
    // Add date row aligned to the right
    const dateFooterRow = worksheet.addRow([]);
    dateFooterRow.getCell(8).value = `TP Hồ Chí Minh, ngày ${now.getDate().toString().padStart(2, '0')} tháng ${String(now.getMonth() + 1).padStart(2, '0')} năm ${now.getFullYear()}`;
    dateFooterRow.getCell(8).font = fontTimesNormal;
    dateFooterRow.getCell(8).alignment = { horizontal: 'center' };
    worksheet.mergeCells(`H${dateFooterRow.number}:K${dateFooterRow.number}`);

    const signatureTitleRow = worksheet.addRow([
      "NGƯỜI LẬP BẢNG", 
      "", 
      "", 
      "TRƯỞNG KHOA TIM MẠCH", 
      "", 
      "", 
      "", 
      "TRƯỞNG KHOA GMHS", 
      "", 
      "KẾ HOẠCH TỔNG HỢP"
    ]);

    // Merge signature titles
    worksheet.mergeCells(`A${signatureTitleRow.number}:C${signatureTitleRow.number}`);
    worksheet.mergeCells(`D${signatureTitleRow.number}:F${signatureTitleRow.number}`);
    worksheet.mergeCells(`H${signatureTitleRow.number}:I${signatureTitleRow.number}`);
    worksheet.mergeCells(`J${signatureTitleRow.number}:M${signatureTitleRow.number}`);

    signatureTitleRow.eachCell(cell => {
      cell.font = fontTimesBold;
      cell.alignment = { horizontal: 'center' };
    });

    worksheet.addRow([]);
    worksheet.addRow([]);
    worksheet.addRow([]);

    const signatureNameRow = worksheet.addRow([
      "TRƯƠNG NGỌC DUNG", 
      "", 
      "", 
      "BS.PHAN TIẾN LỢI"
    ]);
    worksheet.mergeCells(`A${signatureNameRow.number}:C${signatureNameRow.number}`);
    worksheet.mergeCells(`D${signatureNameRow.number}:F${signatureNameRow.number}`);

    signatureNameRow.eachCell(cell => {
      cell.font = fontTimesBold;
      cell.alignment = { horizontal: 'center' };
    });

      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      document.body.appendChild(a);
      a.style.display = 'none';
      a.href = url;
      a.download = `Lịch thông tim_Tuần ${startFormatted.replace(/\//g, '-')}_${endFormatted.replace(/\//g, '-')}.xlsx`;
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      window.setTimeout(() => {
        setErrorMsg('Tải file thành công!');
        setTimeout(() => setErrorMsg(''), 3000);
      }, 0);
    } catch (err: any) {
      console.error("Lỗi xuất excel: ", err);
      // Removed alert() which crashes in iframes without permissions.
      setErrorMsg("Lỗi xuất excel: " + err.message);
    }
  };

  // Apply search and sort filtering on current active list tab
  const displayWaitlist = useMemo(() => {
    const activeList = activeTab === 'unscheduled'
      ? segmentedWaitlist.unscheduled
      : activeTab === 'scheduled'
        ? segmentedWaitlist.scheduled
        : segmentedWaitlist.all;
    let result = activeList;
    
    const q = removeDiacritics(searchQuery).toLowerCase().trim();
    if (q) {
      result = activeList.filter(c => {
        const pat = findPatientByKey(patients, c.PatientKey);
        if (!pat) return false;
        return (
          removeDiacritics(String(pat.PatientName || '')).toLowerCase().includes(q) ||
          removeDiacritics(String(pat.PatientID1 || '')).toLowerCase().includes(q) ||
          (pat.PatientID2 && removeDiacritics(String(pat.PatientID2)).toLowerCase().includes(q))
        );
      });
    }

    return result.sort((a, b) => {
      const da = a.PlannedCathLabDate ? new Date(a.PlannedCathLabDate).getTime() : 0;
      const db = b.PlannedCathLabDate ? new Date(b.PlannedCathLabDate).getTime() : 0;
      return waitlistSortOrder === 'asc' ? da - db : db - da;
    });
  }, [segmentedWaitlist, activeTab, searchQuery, patients, waitlistSortOrder]);

  const totalWaitlistPages = Math.ceil(displayWaitlist.length / rowsPerWaitlistPage) || 1;
  const paginatedWaitlist = useMemo(() => {
    const startIndex = (waitlistCurrentPage - 1) * rowsPerWaitlistPage;
    return displayWaitlist.slice(startIndex, startIndex + rowsPerWaitlistPage);
  }, [displayWaitlist, waitlistCurrentPage]);

  const mobileDisplayedWaitlist = useMemo(() => {
    return displayWaitlist.slice(0, mobileWaitlistVisibleCount);
  }, [displayWaitlist, mobileWaitlistVisibleCount]);

  const handleWaitlistScroll = useCallback(() => {
    if (!isMobile) return;
    const el = waitlistScrollRef.current;
    if (!el || mobileWaitlistVisibleCount >= displayWaitlist.length) return;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 240) {
      setMobileWaitlistVisibleCount(prev =>
        Math.min(prev + MOBILE_WAITLIST_BATCH, displayWaitlist.length)
      );
    }
  }, [isMobile, mobileWaitlistVisibleCount, displayWaitlist.length]);

  // Filter existing patients for selection in ad-hoc modal
  const filteredSearchPatients = useMemo(() => {
    if (!adHocSearchQuery.trim()) return [];
    const query = removeDiacritics(adHocSearchQuery).toLowerCase().trim();
    return patients.filter((pat) => 
      removeDiacritics(String(pat.PatientName || '')).toLowerCase().includes(query) || 
      removeDiacritics(String(pat.PatientID1 || '')).toLowerCase().includes(query) ||
      (pat.PatientID2 && removeDiacritics(String(pat.PatientID2)).toLowerCase().includes(query))
    ).slice(0, 10);
  }, [patients, adHocSearchQuery]);

  const handleSelectPatient = (pat: Patient) => {
    setAdHocSelectedPatientKey(String(pat.PatientKey || ''));
    setAdHocPatientID1(String(pat.PatientID1 || ''));
    setAdHocPatientID2(String(pat.PatientID2 || ''));
    setAdHocPatientName(String(pat.PatientName || ''));
    setAdHocOtherPatientName(String(pat.OtherPatientName || ''));
    setAdHocPatientDOB(String(pat.PatientDOB || ''));
    setAdHocPatientSex(pat.PatientSex);
    setAdHocPatientAddress(String(pat.PatientAddress || (pat as any).PatientAddress || ''));
    setAdHocPatientPhone1(String(pat.PatientPhone1 || ''));
    setAdHocPatientPhone2(String(pat.PatientPhone2 || ''));
    setAdHocOutcome(String(pat.Outcome || ''));
    setAdHocSearchQuery('');
    setAdHocPendingConsult(getPendingConsultForPatient(pat.PatientKey) || null);
  };

  const handleClearSelectedPatient = () => {
    setAdHocSelectedPatientKey('');
    setAdHocPatientID1('');
    setAdHocPatientID2('');
    setAdHocPatientName('');
    setAdHocOtherPatientName('');
    setAdHocPatientDOB('2018-01-01');
    setAdHocPatientSex('Nam');
    setAdHocPatientAddress('');
    setAdHocPatientPhone1('');
    setAdHocPatientPhone2('');
    setAdHocOutcome('');
    setAdHocPendingConsult(null);
  };

  const resetAdHocFormFields = () => {
    setAdHocConsultDate(getTodayIsoDate());
    setAdHocPatientWeight('');
    setAdHocPatientHeight('');
    setAdHocDiagnosisID('');
    setAdHocDetailDiagnosis('');
    setAdHocPlannedDevice('');
    setAdHocPlannedPrice('');
    setAdHocCheckDevice(DEFAULT_AD_HOC_CHECK_DEVICE);
    setAdHocSupplyDepFeedback('');
    setAdHocOperationFeedback('');
    setAdHocPlannedCathLabDate('');
    setAdHocCallStatus(DEFAULT_AD_HOC_CALL_STATUS);
    setAdHocCallNote('');
    setAdHocScheduled1st(DEFAULT_AD_HOC_SCHEDULED_1ST);
    setAdHocScheduled2nd('');
    setAdHocScheduled3rd('');
    setAdHocDetailConsultResult('');
    setAdHocPostCathDepart(DEFAULT_AD_HOC_POST_CATH_DEPART);
    setAdHocFundingRequest(DEFAULT_AD_HOC_FUNDING_REQUEST);
    setAdHocCheckDeviceDate('');
    setAdHocCheckDeviceBy('');
    setAdHocCathMethod([]);
    setAdHocErrors([]);
    setAdHocValidationMsg('');
  };

  const activatePendingConsultForScheduling = async (pendingConsult: Consult) => {
    const overrideNote = `[Kích hoạt xếp lịch bổ sung - ${currentStaff?.StaffName || currentStaff?.StaffKey || 'user'} ${new Date().toISOString()}]`;
    const payload = {
      ConsultResultID: 'Can thiệp thông tim',
      DetailConsultResult: String(pendingConsult.DetailConsultResult || '').trim() || 'Can thiệp thông tim',
      ConsultResultUpdatedBy: currentStaff?.StaffKey || '01378',
      ConsultResultUpdatedTime: new Date().toISOString(),
      ConsultNote: pendingConsult.ConsultNote
        ? `${pendingConsult.ConsultNote}\n${overrideNote}`
        : overrideNote,
    };

    const response = await fetch(`/api/consults/${pendingConsult.ConsultKey}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!response.ok) {
      throw new Error('Không thể kích hoạt lượt hội chẩn');
    }

    const mergedConsult = { ...pendingConsult, ...payload } as Consult;
    setShowAdHocModal(false);
    handleClearSelectedPatient();
    resetAdHocFormFields();
    setAdHocPatientMode('existing');
    setActiveTab('unscheduled');
    onRefreshData();
    applySelectConsult(mergedConsult);
    setSuccessMsg('Đã kích hoạt lượt hội chẩn và mở form Xếp lịch.');
    setTimeout(() => setSuccessMsg(''), 4000);
  };

  // Setup form fields on consult selection
  const buildCurrentFormSnapshot = (): SchedulingFormSnapshot => ({
    consultDate: schedConsultDate,
    requestBy: schedRequestBy,
    patientWeight: schedPatientWeight,
    patientHeight: schedPatientHeight,
    diagnosisID: schedDiagnosisID,
    detailDiagnosis: schedDetailDiagnosis,
    consultResultID: schedConsultResultID,
    detailConsultResult: schedDetailConsultResult,
    plannedDevice,
    plannedPrice,
    checkDevice,
    operationFeedback,
    supplyDepFeedback,
    callStatus,
    callNote,
    priorityOrder,
    plannedCathLabDate,
    selectedMethods: [...selectedMethods],
    postCathDepart,
    scheduled1st,
    scheduled2nd: scheduled2nd || getAutoScheduled2nd(schedRequestBy || selectedConsult?.RequestBy || ''),
    scheduled3rd,
  });

  const hasUnsavedChanges = () => {
    if (!formSnapshot || !selectedConsult) return false;
    return !snapshotsEqual(buildCurrentFormSnapshot(), formSnapshot);
  };

  const getMissingTransferRequiredFields = () => {
    // No longer blocking - CheckDevice, CallStatus, PlannedCathLabDate are optional
    return [];
  };

  const requestCloseScheduling = (onClose: () => void) => {
    if (!hasUnsavedChanges()) {
      onClose();
      return;
    }
    setExitConfirmError('');
    setPendingExitAction(() => onClose);
    setExitConfirmOpen(true);
  };

  const handleCloseSchedulingView = () => {
    requestCloseScheduling(() => {
      setSelectedConsult(null);
      setFormSnapshot(null);
    });
  };

  const handleExitCancel = () => {
    setExitConfirmOpen(false);
    setExitConfirmError('');
    setPendingExitAction(null);
  };

  const handleExitDiscard = () => {
    const action = pendingExitAction;
    setExitConfirmOpen(false);
    setExitConfirmError('');
    setPendingExitAction(null);
    setFormSnapshot(null);
    action?.();
  };

  const applySelectConsult = (c: Consult) => {
    setSelectedConsult(c);
    setSchedConsultDate(c.ConsultDate ? getFormattedDateKey(c.ConsultDate) : '');
    setSchedRequestBy(c.RequestBy || '');
    setSchedPatientWeight(parseWeightForInput(c.PatientWeight));
    setSchedPatientHeight(parseHeightForInput(c.PatientHeight));
    setSchedDiagnosisID(c.DiagnosisID || '');
    setSchedDetailDiagnosis(c.DetailDiagnosis || '');
    setSchedConsultResultID(c.ConsultResultID || '');
    setSchedDetailConsultResult(c.DetailConsultResult || '');
    setPlannedDevice(c.PlannedDevice || '');
    setPlannedPrice(c.PlannedPrice || '');
    setCheckDevice(c.CheckDevice || '');
    setOperationFeedback(c.OperationFeedback || '');
    setSupplyDepFeedback(c.SupplyDepFeedback || '');
    setCallStatus(c.CallStatus || '');
    setCallNote(c.CallNote || '');
    setPriorityOrder(normalizePriorityOrder(c.PriorityOrder));
    
    const formattedDate = c.PlannedCathLabDate ? getFormattedDateKey(c.PlannedCathLabDate) : '';
    setPlannedCathLabDate(formattedDate);
    
    let methods: string[] = [];
    if (c.CathMethod) {
       if (c.CathMethod.includes('+')) {
         methods = c.CathMethod.split('+').map(m => m.trim()).filter(Boolean);
       } else {
         const tm = c.CathMethod.trim();
         if (tm) methods = [tm];
       }
    }
    setSelectedMethods(methods);
    
    setPostCathDepart(c.PostCathDepart || '');
    setScheduled1st(c.Scheduled1stInterventionist || '');
    
    const autoPtv2 = getAutoScheduled2nd(c.RequestBy || '');
    setScheduled2nd(autoPtv2 || c.Scheduled2ndInterventionist || '');
    setScheduled3rd(c.Scheduled3rdInterventionist || '');

    setFormSnapshot(buildSnapshotFromConsult(c));
    setSuccessMsg('');
    setErrorMsg('');
    setShowConfirmRemoveDialog(false);
  };

  const handleSelectConsult = (c: Consult) => {
    if (selectedConsult && selectedConsult.ConsultKey !== c.ConsultKey && hasUnsavedChanges()) {
      requestCloseScheduling(() => applySelectConsult(c));
      return;
    }
    applySelectConsult(c);
  };

  const handleCallStatusSelect = (opt: string) => {
    if (opt === 'Loại' || opt === 'Đã làm nơi khác' || opt === 'Muốn theo dõi nơi khác') {
      setPrevCallStatus(callStatus);
      setCallStatus(opt);
      setShowConfirmRemoveDialog(true);
    } else {
      setCallStatus(opt);
      setShowConfirmRemoveDialog(false);
    }
  };

  const handleCancelRemove = () => {
    setCallStatus(prevCallStatus);
    setShowConfirmRemoveDialog(false);
  };

  const handleConfirmRemove = async () => {
    if (!selectedConsult) return;
    setSaving(true);
    setErrorMsg('');
    setSuccessMsg('');
    try {
      const response = await fetch(`/api/consults/${selectedConsult.ConsultKey}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ CallStatus: callStatus })
      });
      if (!response.ok) {
        throw new Error('Không thể cập nhật trạng thái loại bệnh nhân.');
      }
      setSuccessMsg(`Đã chuyển bệnh nhân sang trạng thái: ${callStatus}!`);
      onRefreshData();
      setSelectedConsult(null);
      setShowConfirmRemoveDialog(false);
    } catch (err: any) {
      setErrorMsg(err.message || 'Lỗi khi loại bệnh nhân');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveAdHoc = async (e: React.FormEvent) => {
    e.preventDefault();

    const errors: string[] = [];

    if (adHocPatientMode === 'existing') {
      if (!adHocSelectedPatientKey) {
        errors.push('PatientKey');
      }
    } else {
      if (!adHocPatientID1) errors.push('PatientID1');
      if (!adHocPatientName) errors.push('PatientName');
      if (!adHocPatientDOB) errors.push('PatientDOB');
      if (!adHocPatientAddress) errors.push('PatientAddress');
    }

    if (!adHocConsultDate) errors.push('ConsultDate');
    if (!adHocPatientWeight) errors.push('PatientWeight');
    if (!adHocRequestBy) errors.push('RequestBy');
    if (!adHocDiagnosisID) errors.push('DiagnosisID');
    if (!adHocDetailDiagnosis) errors.push('DetailDiagnosis');
    if (!adHocDetailConsultResult) errors.push('DetailConsultResult');
    if (errors.length > 0) {
      setAdHocErrors(errors);
      setAdHocValidationMsg(`Vui lòng điền đầy đủ các trường bắt buộc: ${errors.map(field => ({
        PatientKey: 'Bệnh nhi',
        PatientID1: 'Mã BN',
        PatientName: 'Họ tên',
        PatientDOB: 'Ngày sinh',
        PatientAddress: 'Địa chỉ',
        ConsultDate: 'Ngày hội chẩn',
        PatientWeight: 'Cân nặng',
        RequestBy: 'BS đăng ký',
        DiagnosisID: 'ICD chẩn đoán',
        DetailDiagnosis: 'Chẩn đoán chi tiết',
        DetailConsultResult: 'Kết quả chi tiết'
      }[field] || field)).join(', ')}`);
      return;
    }
    setAdHocErrors([]);
    setAdHocValidationMsg('');

    const pendingOverride = resolvePendingConsultForAdHoc();
    if (pendingOverride) {
      setActionConfirm({
        type: 'ad_hoc_override',
        title: 'Tiếp tục xếp lịch',
        message: 'Bệnh nhân này có lượt hội chẩn chờ kết luận. Bạn có muốn tiếp tục xếp lịch?',
        consultToUpdate: pendingOverride
      });
      return;
    }

    setSaving(true);
    setSuccessMsg('');
    setErrorMsg('');

    const patientKey = adHocPatientMode === 'existing' ? adHocSelectedPatientKey : `pat_${Date.now()}`;
    const patientData: Patient = {
      PatientKey: patientKey,
      PatientID1: String(adHocPatientID1 || '').trim(),
      PatientID2: String(adHocPatientID2 || '').trim(),
      PatientName: adHocPatientName,
      OtherPatientName: adHocOtherPatientName,
      PatientDOB: adHocPatientDOB,
      PatientSex: adHocPatientSex,
      PatientAddress: adHocPatientAddress,
      PatientPhone1: adHocPatientPhone1,
      PatientPhone2: adHocPatientPhone2,
      PatientCreateBy: adHocRequestBy || 'system',
      PatientCreateTime: new Date().toISOString(),
      Outcome: adHocOutcome
    };

    const newConsultKey = `con_${Date.now()}`;
    const consultData: Consult = {
      ConsultKey: newConsultKey,
      PatientKey: patientKey,
      ConsultType: adHocConsultType,
      PatientWeight: adHocPatientWeight ? `${adHocPatientWeight} kg` : '',
      PatientHeight: adHocPatientHeight ? `${adHocPatientHeight} cm` : '',
      ConsultDate: adHocConsultDate,
      RequestBy: adHocRequestBy || 'system',
      DiagnosisID: normalizeDiagnosisID(adHocDiagnosisID) || 'CHƯA PHÂN LOẠI',
      DetailDiagnosis: adHocDetailDiagnosis || 'Không có chẩn đoán chi tiết',
      Department: adHocDepartment,
      ConsultCreateBy: adHocRequestBy || 'system',
      ConsultCreateTime: new Date().toISOString(),
      ConsultResultID: adHocConsultResultID as any,
      DetailConsultResult: adHocDetailConsultResult || 'Can thiệp thông tim',
      ConsultNote: 'Xếp bổ sung không qua hội chẩn thông thường',
      PlannedDevice: adHocPlannedDevice,
      PlannedPrice: adHocPlannedPrice,
      CheckDevice: adHocCheckDevice,
      SupplyDepFeedback: adHocSupplyDepFeedback,
      OperationFeedback: adHocOperationFeedback,
      PriorityOrder: adHocPriorityOrder,
      RiskFactor: adHocRiskFactor,
      PlannedCathLabDate: adHocPlannedCathLabDate,
      CallStatus: adHocCallStatus,
      CallNote: adHocCallNote,
      Scheduled1stInterventionist: adHocScheduled1st,
      Scheduled2ndInterventionist: adHocScheduled2nd,
      Scheduled3rdInterventionist: adHocScheduled3rd,
      PostCathDepart: adHocPostCathDepart,
      FundingRequest: adHocFundingRequest,
      CheckDeviceDate: adHocCheckDevice ? new Date().toISOString() : '',
      CheckDeviceBy: adHocCheckDevice ? (currentStaff?.StaffKey || '01378') : '',
      CheckDeviceUpdatedTime: adHocCheckDevice ? new Date().toISOString() : '',
      CheckDeviceUpdatedBy: adHocCheckDevice ? (currentStaff?.StaffKey || '01378') : '',
      CathMethod: adHocCathMethod.join(' + ')
    };

    if (adHocPatientMode === 'new') {
      onAddPatient?.(patientData);
    } else {
      onPatchPatient?.(patientKey, patientData);
    }
    onAddConsult?.(consultData);

    setSuccessMsg('Đã thêm mới và xếp lịch bệnh nhi thành công!');
    setShowAdHocModal(false);

    const persist = async () => {
      if (adHocPatientMode === 'new') {
        const patRes = await fetch('/api/patients', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(patientData)
        });
        if (!patRes.ok) throw new Error(await patRes.text() || 'Không thể thêm mới hành chính bệnh nhi');
      } else {
        const patRes = await fetch(`/api/patients/${adHocSelectedPatientKey}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(patientData)
        });
        if (!patRes.ok) throw new Error(await patRes.text() || 'Không thể cập nhật hành chính bệnh nhi');
      }

      const conRes = await fetch('/api/consults', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(consultData)
      });
      if (!conRes.ok) throw new Error(await conRes.text() || 'Không thể thêm xếp lịch hội chẩn bổ sung');
      onRefreshData();
    };

    persist()
      .catch(err => {
        console.error(err);
        setErrorMsg(err instanceof Error ? err.message : 'Không thể lưu xếp lịch bổ sung');
        onRefreshData();
      })
      .finally(() => setSaving(false));

    // Reset form fields
    setAdHocPatientID1('');
    setAdHocPatientID2('');
    setAdHocPatientName('');
    setAdHocOtherPatientName('');
    setAdHocPatientDOB('2018-01-01');
    setAdHocPatientSex('Nam');
    setAdHocPatientAddress('');
    setAdHocPatientPhone1('');
    setAdHocPatientPhone2('');
    setAdHocOutcome('');
    setAdHocPatientWeight('');
    setAdHocPatientHeight('');
    setAdHocConsultDate(getTodayIsoDate());
    setAdHocDiagnosisID('');
    setAdHocDetailDiagnosis('');
    setAdHocPlannedDevice('');
    setAdHocPlannedPrice('');
    setAdHocCheckDevice(DEFAULT_AD_HOC_CHECK_DEVICE);
    setAdHocSupplyDepFeedback('');
    setAdHocOperationFeedback('');
    setAdHocPlannedCathLabDate('');
    setAdHocCallStatus(DEFAULT_AD_HOC_CALL_STATUS);
    setAdHocCallNote('');
    setAdHocScheduled1st(DEFAULT_AD_HOC_SCHEDULED_1ST);
    setAdHocScheduled2nd('');
    setAdHocScheduled3rd('');
    setAdHocDetailConsultResult('');
    setAdHocSelectedPatientKey('');
    setAdHocSearchQuery('');
    setAdHocPostCathDepart(DEFAULT_AD_HOC_POST_CATH_DEPART);
    setAdHocFundingRequest(DEFAULT_AD_HOC_FUNDING_REQUEST);
    setAdHocCheckDeviceDate('');
    setAdHocCheckDeviceBy('');
    setAdHocCathMethod([]);
    setAdHocValidationMsg('');

    setTimeout(() => {
      setSuccessMsg('');
    }, 3000);
  };

  const getCurrentFormData = (): Partial<Consult> => {
    const finalScheduled2nd = scheduled2nd || getAutoScheduled2nd(schedRequestBy || selectedConsult?.RequestBy || '');
    return {
      ConsultDate: schedConsultDate,
      RequestBy: schedRequestBy,
      PatientWeight: formatWeightForSave(schedPatientWeight),
      PatientHeight: formatHeightForSave(schedPatientHeight),
      DiagnosisID: schedDiagnosisID,
      DetailDiagnosis: schedDetailDiagnosis,
      ConsultResultID: schedConsultResultID as Consult['ConsultResultID'],
      DetailConsultResult: schedDetailConsultResult,
      PlannedDevice: plannedDevice,
      PlannedPrice: plannedPrice,
      CheckDevice: checkDevice,
      OperationFeedback: operationFeedback,
      SupplyDepFeedback: supplyDepFeedback,
      CallStatus: callStatus,
      CallNote: callNote,
      PriorityOrder: priorityOrder,
      PlannedCathLabDate: plannedCathLabDate,
      CathMethod: selectedMethods.join(' + '),
      PostCathDepart: postCathDepart,
      Scheduled1stInterventionist: scheduled1st,
      Scheduled2ndInterventionist: finalScheduled2nd,
      Scheduled3rdInterventionist: scheduled3rd,
      CheckDeviceUpdatedBy: currentStaff?.StaffKey || '01378',
      CheckDeviceUpdatedTime: new Date().toISOString()
    };
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedConsult) return;

    setSuccessMsg('');
    setErrorMsg('');

    const missingFields = [];
    if (!checkDevice) missingFields.push('Kiểm dụng cụ');
    if (!plannedCathLabDate) missingFields.push('Ngày thông dự kiến');
    if (!callStatus) missingFields.push('Trạng thái gọi bệnh');

    let confirmMsg = 'Bạn có muốn lưu thông tin xếp lịch cho bệnh nhân này không?';
    if (missingFields.length > 0) {
      confirmMsg = `Bạn chưa điền đầy đủ thông tin: ${missingFields.join(', ')}. Bạn có muốn tiếp tục lưu không?`;
    }

    setActionConfirm({
      type: 'save_schedule',
      title: 'Xác nhận lưu thông tin',
      message: confirmMsg
    });
  };

  const handleExitSave = async () => {
    if (!selectedConsult) return;
    setSaving(true);
    setExitConfirmError('');
    const ok = await executeSave(getCurrentFormData(), { closeOnSuccess: false });
    setSaving(false);
    if (ok) {
      handleExitDiscard();
    }
  };

  const executeSave = async (
    updatedData: Partial<Consult>,
    options?: { closeOnSuccess?: boolean }
  ): Promise<boolean> => {
    if (!selectedConsult) return false;
    const closeOnSuccess = options?.closeOnSuccess !== false;
    const merged = { ...selectedConsult, ...updatedData };

    onPatchConsult?.(selectedConsult.ConsultKey, updatedData);
    setSelectedConsult(merged);
    setFormSnapshot(buildSnapshotFromConsult(merged));
    setSuccessMsg('Đã lưu thông tin xếp lịch thành công!');

    if (closeOnSuccess) {
      setTimeout(() => {
        setSuccessMsg('');
        if (updatedData.CallStatus === 'Loại') {
          setSelectedConsult(null);
          setFormSnapshot(null);
        }
      }, 3000);
    }

    setSaving(false);

    // Run fetch in the background to be instantaneous
    fetch(`/api/consults/${selectedConsult.ConsultKey}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updatedData)
    })
      .then(async (response) => {
        if (!response.ok) {
          const d = await response.json();
          throw new Error(d.error || 'Failed to update consult');
        }
        onRefreshData();
      })
      .catch((err) => {
        console.error('Error saving consult in background:', err);
        const msg = err.message || 'Error saving data';
        setErrorMsg(`Lỗi khi đồng bộ dữ liệu: ${msg}`);
        onRefreshData();
      });

    return true;
  };

  const handleActionLoai = () => {
    setActionConfirm({
      type: 'loai',
      title: 'Xác nhận loại bệnh nhân',
      message: 'Bệnh nhân sẽ bị đánh dấu Loại, bạn có chắc chắn không?'
    });
  };

  const isTransferEnabled = () => {
    return true;
  };

  const handleActionTransfer = () => {
    setActionConfirm({
      type: 'transfer',
      title: 'Chuyển phòng thông tim',
      message: 'Bạn có muốn chuyển bệnh nhân sang phòng Thông tim không? Ca này vẫn được giữ trong Lịch thông tim dự kiến.'
    });
  };

  const handleUndoScheduled = (c: Consult, p: Patient) => {
    setActionConfirm({
      type: 'undo_scheduled',
      title: 'Xác nhận rút danh sách',
      message: `Bạn có muốn rút bệnh nhi ${p.PatientName} về lại danh sách Chưa xếp lịch? (Sẽ xóa ngày thông tim dự kiến)`,
      consultToUpdate: c
    });
  };

  const isTransferRowEnabled = (c: Consult) => {
    return true;
  };

  const handleRowTransfer = (c: Consult, p: Patient) => {
    if (!isTransferRowEnabled(c)) {
      setActionAlert("Chỉ có thể chuyển phòng TT khi Đã kiểm đủ dụng cụ, Gia đình đồng ý, và có Ngày dự kiến thông tim!");
      return;
    }
    setActionConfirm({
      type: 'transfer_row',
      title: 'Xác nhận chuyển',
      message: `Bạn có muốn chuyển bệnh nhi ${p.PatientName} sang phòng Thông tim không?`,
      consultToUpdate: c
    });
  };

  const handleExecuteActionConfirm = async () => {
    if (!actionConfirm) return;
    const currentAction = actionConfirm;
    setActionConfirm(null);

    if (currentAction.type === 'save_schedule') {
      setSaving(true);
      await executeSave(getCurrentFormData());
      return;
    }

    if (currentAction.type === 'loai') {
      setCallStatus('Loại');
      setSaving(true);
      await executeSave({ ...getCurrentFormData(), CallStatus: 'Loại' });
      return;
    }

    if (currentAction.type === 'transfer') {
      setSaving(true);
      await executeSave({ ...getCurrentFormData(), TransferredToCathLab: true });
      return;
    }

    setSaving(true);
    if (currentAction.type === 'undo_scheduled' && currentAction.consultToUpdate) {
      try {
        const patch = { PlannedCathLabDate: '', TransferredToCathLab: false };
        onPatchConsult?.(currentAction.consultToUpdate.ConsultKey, patch);
        const response = await fetch(`/api/consults/${currentAction.consultToUpdate.ConsultKey}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(patch)
        });
        if (response.ok) {
           onRefreshData();
           if (selectedConsult && selectedConsult.ConsultKey === currentAction.consultToUpdate.ConsultKey) {
              setPlannedCathLabDate('');
           }
           setSuccessMsg('Đã rút ca về danh sách Chưa xếp lịch.');
        } else {
          throw new Error('Không thể rút ca về danh sách Chưa xếp lịch');
        }
      } catch (e) {
        console.error(e);
        setErrorMsg(e instanceof Error ? e.message : 'Không thể rút ca về danh sách Chưa xếp lịch');
        onRefreshData();
      }
    } else if (currentAction.type === 'transfer_row' && currentAction.consultToUpdate) {
      try {
        const patch = { TransferredToCathLab: true };
        onPatchConsult?.(currentAction.consultToUpdate.ConsultKey, patch);
        const response = await fetch(`/api/consults/${currentAction.consultToUpdate.ConsultKey}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(patch)
        });
        if (response.ok) {
           onRefreshData();
           setSuccessMsg('Đã chuyển phòng thông tim. Ca vẫn được giữ trong Lịch thông tim dự kiến.');
        } else {
          throw new Error('Không thể chuyển phòng thông tim');
        }
      } catch (e) {
        console.error(e);
        setErrorMsg(e instanceof Error ? e.message : 'Không thể chuyển phòng thông tim');
        onRefreshData();
      }
    } else if (currentAction.type === 'ad_hoc_override' && currentAction.consultToUpdate) {
      try {
        await activatePendingConsultForScheduling(currentAction.consultToUpdate);
      } catch (err: any) {
        console.error(err);
        setErrorMsg(err.message || 'Không thể kích hoạt lượt hội chẩn');
      }
    }
    setSaving(false);
  };

  const hasAdminField = (v?: string) => Boolean(v && String(v).trim() !== '' && v !== '-');

  const renderPatientAdminInfo = (pat: Patient, variant: 'form' | 'print' = 'form') => {
    const hasId2 = hasAdminField(pat.PatientID2);
    const hasPhone2 = hasAdminField(pat.PatientPhone2);
    const hasPhone1 = hasAdminField(pat.PatientPhone1);
    const hasOtherName = hasAdminField(pat.OtherPatientName);
    const isFullLayout = hasId2 && hasPhone2;
    const address = pat.PatientAddress || '—';

    const labelCls =
      variant === 'form'
        ? 'text-slate-400 font-bold text-[8px] uppercase shrink-0'
        : 'text-slate-400 font-bold text-[9px] uppercase tracking-wider shrink-0';
    const valueCls =
      variant === 'form' ? 'font-bold text-slate-800' : 'font-bold text-slate-800 text-[12.5px]';
    const monoCls =
      variant === 'form'
        ? 'font-extrabold font-mono text-slate-800 text-[11px]'
        : 'font-extrabold font-mono text-slate-800 text-[12.5px]';
    const rowGap = variant === 'form' ? 'gap-x-4' : 'gap-x-5';
    const containerCls = variant === 'form' ? 'space-y-1 text-xs' : 'space-y-2.5 text-[12px]';

    const Field = ({
      label,
      value,
      mono,
    }: {
      label: string;
      value: React.ReactNode;
      mono?: boolean;
    }) => (
      <span className="inline-flex items-baseline gap-x-1.5">
        <span className={labelCls}>{label}</span>
        <span className={mono ? monoCls : valueCls}>{value}</span>
      </span>
    );

    const Row = ({ children }: { children: React.ReactNode }) => (
      <div className={`flex flex-wrap items-baseline ${rowGap} gap-y-0.5`}>{children}</div>
    );

    return (
      <div className={containerCls}>
        {hasOtherName && (
          <Row>
            <Field label="Tên khác:" value={pat.OtherPatientName} />
          </Row>
        )}
        {isFullLayout ? (
          <>
            <Row>
              <Field label="Mã NB:" value={pat.PatientID1 || '—'} mono />
              <Field label="Mã NB khác:" value={pat.PatientID2} mono />
            </Row>
            <Row>
              <Field label="Ngày sinh:" value={formatPatientDobWithAge(pat.PatientDOB, undefined, formatVNTime)} />
              <Field label="Giới:" value={pat.PatientSex || '—'} />
            </Row>
            <Row>
              <Field label="Địa chỉ:" value={address} />
            </Row>
            <Row>
              <Field label="SĐ1:" value={pat.PatientPhone1} mono />
              <Field label="SĐ2:" value={pat.PatientPhone2} mono />
            </Row>
          </>
        ) : (
          <>
            <Row>
              <Field label="Mã NB:" value={pat.PatientID1 || '—'} mono />
              <Field label="Giới:" value={pat.PatientSex || '—'} />
            </Row>
            <Row>
              <Field label="Ngày sinh:" value={formatPatientDobWithAge(pat.PatientDOB, undefined, formatVNTime)} />
            </Row>
            <Row>
              <Field label="Địa chỉ:" value={address} />
              {hasPhone1 && <Field label="SĐ1:" value={pat.PatientPhone1} mono />}
            </Row>
          </>
        )}
      </div>
    );
  };

  const schedInputCls =
    'w-full bg-white border border-indigo-100 rounded-xl px-2.5 py-1.5 font-semibold focus:outline-none focus:ring-1 focus:ring-indigo-200 text-[10.5px] text-slate-700 min-h-[32px]';

  const renderScheduleDatePicker = (value: string, onChange: (val: string) => void) => (
    <div className="relative w-full">
      <input
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
      />
      <div className={`${schedInputCls} font-mono font-bold flex items-center justify-between`}>
        <span>{value ? formatVNTime(value) : 'dd/mm/yyyy'}</span>
        <Calendar className="w-3 h-3 text-slate-400 shrink-0" />
      </div>
    </div>
  );

  const adHocInputCls = 'w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 focus:outline-none focus:bg-white focus:ring-2 focus:ring-indigo-100 text-[13px] text-slate-800 min-h-[34px]';
  const adHocSelectCls = `${adHocInputCls} font-bold`;
  const adHocLabelCls = 'text-slate-500 font-bold text-[10.5px] uppercase shrink-0 leading-tight w-[11rem]';

  const renderAdHocRow = (
    label: string,
    control: React.ReactNode,
    opts?: { span?: 1 | 2 | 3; alignTop?: boolean; labelWidth?: string }
  ) => (
    <div
      className={`flex gap-1.5 ${opts?.alignTop ? 'items-start' : 'items-center'} ${
        opts?.span === 2 ? 'xl:col-span-2' : opts?.span === 3 ? 'xl:col-span-3' : ''
      }`}
    >
      <label
        className={`${adHocLabelCls} ${opts?.alignTop ? 'pt-1' : ''}`}
        style={opts?.labelWidth ? { width: opts.labelWidth } : undefined}
      >
        {label}
      </label>
      <div className="flex-1 min-w-0">{control}</div>
    </div>
  );

  const renderAdHocDatePicker = (value: string, onChange: (val: string) => void) => (
    <div className="relative w-full">
      <input
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
      />
      <div className={`${adHocInputCls} font-mono font-bold flex items-center justify-between`}>
        <span>{value ? formatVNTime(value) : 'dd/mm/yyyy'}</span>
        <Calendar className="w-3 h-3 text-slate-400 shrink-0" />
      </div>
    </div>
  );

  // Calendar rendering helper calculation list (Month View)
  const calendarCells = useMemo(() => {
    const firstDayOfMonth = new Date(currentYear, currentMonth, 1);
    
    //Align start day with Monday start: getDay() 0=Sunday, 1=Monday,..., 6=Saturday
    let startDay = firstDayOfMonth.getDay();
    if (startDay === 0) startDay = 7; // Sunday maps to column 7
    
    // Blank offsets of previous month
    const startOffset = startDay - 1;
    const totalDays = new Date(currentYear, currentMonth + 1, 0).getDate();
    const prevTotalDays = new Date(currentYear, currentMonth, 0).getDate();
    
    const cells: { day: number; dateStr: string; isCurrentMonth: boolean; isToday: boolean }[] = [];

    const prevMonthIndex = currentMonth === 0 ? 11 : currentMonth - 1;
    const prevYear = currentMonth === 0 ? currentYear - 1 : currentYear;
    
    // Filler days of preceding month
    for (let i = startOffset - 1; i >= 0; i--) {
      const d = prevTotalDays - i;
      const mStr = String(prevMonthIndex + 1).padStart(2, '0');
      const dStr = String(d).padStart(2, '0');
      cells.push({
        day: d,
        dateStr: `${prevYear}-${mStr}-${dStr}`,
        isCurrentMonth: false,
        isToday: false,
      });
    }

    // Days of current active month
    for (let d = 1; d <= totalDays; d++) {
      const mStr = String(currentMonth + 1).padStart(2, '0');
      const dStr = String(d).padStart(2, '0');
      const dateStr = `${currentYear}-${mStr}-${dStr}`;
      
      // Determine if cell points to June 6, 2026 (Local Time constraint)
      const isToday = currentYear === 2026 && currentMonth === 5 && d === 6;

      cells.push({
        day: d,
        dateStr,
        isCurrentMonth: true,
        isToday,
      });
    }

    // Days of upcoming month
    const nextMonthIndex = currentMonth === 11 ? 0 : currentMonth + 1;
    const nextYear = currentMonth === 11 ? currentYear + 1 : currentYear;
    let nextDay = 1;
    while (cells.length < 42) {
      const mStr = String(nextMonthIndex + 1).padStart(2, '0');
      const dStr = String(nextDay).padStart(2, '0');
      cells.push({
        day: nextDay,
        dateStr: `${nextYear}-${mStr}-${dStr}`,
        isCurrentMonth: false,
        isToday: false,
      });
      nextDay++;
    }

    return cells;
  }, [currentMonth, currentYear]);

  // Calendar Weekly cells generator
  const calendarWeekCells = useMemo(() => {
    const list = [];
    const day = activeDate.getDay();
    const mondayOffset = day === 0 ? -6 : 1 - day; // Align Monday offsets
    const monday = new Date(activeDate);
    monday.setDate(activeDate.getDate() + mondayOffset);
    
    for (let i = 0; i < 7; i++) {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      const yStr = d.getFullYear();
      const mStr = String(d.getMonth() + 1).padStart(2, '0');
      const dStr = String(d.getDate()).padStart(2, '0');
      list.push({
        day: d.getDate(),
        dateStr: `${yStr}-${mStr}-${dStr}`,
        isToday: d.getFullYear() === 2026 && d.getMonth() === 5 && d.getDate() === 6
      });
    }
    return list;
  }, [activeDate]);

  // Month navigation actions
  const handlePrevMonth = () => {
    if (currentMonth === 0) {
      setCurrentMonth(11);
      setCurrentYear(prev => prev - 1);
    } else {
      setCurrentMonth(prev => prev - 1);
    }
  };

  const handleNextMonth = () => {
    if (currentMonth === 11) {
      setCurrentMonth(0);
      setCurrentYear(prev => prev + 1);
    } else {
      setCurrentMonth(prev => prev + 1);
    }
  };

  const jumpToToday = () => {
    setCurrentMonth(5); // June
    setCurrentYear(2026);
    setActiveDate(new Date(2026, 5, 6));
  };

  return (
    <div className="flex-1 bg-slate-50 min-h-0 flex flex-col font-sans transition-all duration-300">
      
      {/* Mobile Navigation Tabs + filters (single scrollable row) */}
      <div className="lg:hidden shrink-0 px-3 py-2 bg-white border-b border-slate-200 flex gap-2 items-center overflow-x-auto flex-nowrap shadow-xs z-20 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
        {!pureCalendarMode && (
          <button
            type="button"
            onClick={() => {
              setAdHocConsultDate(getTodayIsoDate());
              setAdHocPlannedCathLabDate('');
              setAdHocCheckDevice(DEFAULT_AD_HOC_CHECK_DEVICE);
              setAdHocCallStatus(DEFAULT_AD_HOC_CALL_STATUS);
              setAdHocPostCathDepart(DEFAULT_AD_HOC_POST_CATH_DEPART);
              setAdHocScheduled1st(DEFAULT_AD_HOC_SCHEDULED_1ST);
              setAdHocFundingRequest(DEFAULT_AD_HOC_FUNDING_REQUEST);
              setAdHocErrors([]);
              setAdHocValidationMsg('');
              setShowAdHocModal(true);
            }}
            className="shrink-0 w-8 h-8 rounded-full bg-indigo-600 hover:bg-indigo-700 text-white flex items-center justify-center shadow-md active:scale-95 transition-transform cursor-pointer"
            title="Xếp bổ sung"
          >
            <Plus className="w-4 h-4 text-white" />
          </button>
        )}
        <button
          type="button"
          onClick={() => setMobileTab('waitlist')}
          className={`shrink-0 whitespace-nowrap px-3.5 py-1.5 rounded-full text-[10.5px] font-black uppercase tracking-wider transition-all duration-200 cursor-pointer ${
            mobileTab === 'waitlist'
              ? 'bg-indigo-600 text-white shadow-xs'
              : 'bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-600'
          }`}
        >
          Chờ xếp lịch ({segmentedWaitlist.unscheduled.length + segmentedWaitlist.scheduled.length})
        </button>
        <button
          type="button"
          onClick={() => setMobileTab('calendar')}
          className={`shrink-0 whitespace-nowrap px-3.5 py-1.5 rounded-full text-[10.5px] font-black uppercase tracking-wider transition-all duration-200 cursor-pointer ${
            mobileTab === 'calendar'
              ? 'bg-[#d2145a] text-white shadow-xs'
              : 'bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-600'
          }`}
        >
          Lịch dự kiến
        </button>
        {selectedConsult && (
          <button
            type="button"
            onClick={() => setMobileTab('editor')}
            className={`shrink-0 whitespace-nowrap px-3.5 py-1.5 rounded-full text-[10.5px] font-black uppercase tracking-wider transition-all duration-200 cursor-pointer flex items-center gap-1 ${
              mobileTab === 'editor'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-600'
            }`}
          >
            <span>Xếp lịch</span>
            <span className="text-[9px] bg-emerald-100 text-emerald-800 px-1 py-0.5 rounded font-extrabold uppercase font-mono">
              {findPatientByKey(patients, selectedConsult.PatientKey)?.PatientName.split(' ').slice(-1)[0] || ''}
            </span>
          </button>
        )}
        {!pureCalendarMode && (
          <>
            <button
              type="button"
              onClick={() => {
                setIsFilterExpanded(true);
                setIsDeviceFilterExpanded(false);
              }}
              className="shrink-0 whitespace-nowrap flex items-center gap-1 px-3.5 py-1.5 rounded-full bg-slate-50 border border-slate-200 text-[10.5px] font-black uppercase tracking-wider text-slate-700 active:bg-slate-100 transition shadow-xs cursor-pointer"
            >
              <Filter className="w-3.5 h-3.5 text-indigo-600" />
              <span>Lịch</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setIsDeviceFilterExpanded(true);
                setIsFilterExpanded(false);
              }}
              className="shrink-0 whitespace-nowrap flex items-center gap-1 px-3.5 py-1.5 rounded-full bg-slate-50 border border-slate-200 text-[10.5px] font-black uppercase tracking-wider text-slate-700 active:bg-slate-100 transition shadow-xs cursor-pointer"
            >
              <Filter className="w-3.5 h-3.5 text-emerald-600" />
              <span>Dụng cụ</span>
            </button>
          </>
        )}
      </div>

      <div className="flex-1 overflow-hidden p-3 lg:p-4 flex flex-col lg:flex-row min-h-0 gap-4">
        
        {/* Main Workspace Frame */}
        <div className="flex-1 transition-all min-h-0 flex flex-col overflow-hidden">
          <div className="flex-1 flex flex-col lg:grid lg:grid-cols-12 gap-4 min-h-0 overflow-hidden">
        
        {/* LEFT COLUMN: Waiting Queue Table */}
        <div className={`flex-1 lg:flex-initial flex flex-col bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden min-h-0 ${pureCalendarMode ? 'hidden' : 'lg:col-span-6'} ${mobileTab === 'waitlist' ? 'flex' : 'hidden lg:flex'}`}>
          
          <div className="hidden lg:flex p-4 border-b border-slate-100 bg-slate-50 shrink-0 items-center justify-between gap-2">
            <div>
              <h3 className="font-extrabold text-slate-800 text-[13px] uppercase tracking-wide">
                Danh sách chờ xếp lịch
              </h3>
              <p className="text-[9px] text-[#d2145a] font-bold uppercase mt-0.5">
                Tổng cộng: {allEligibleWaitlist.length} ca hợp lệ trong hệ thống (C:{consults.length}, P:{patients.length}, M:{latestConsultsMap.size})
              </p>
            </div>
            <button
              onClick={() => {
                setAdHocConsultDate(getTodayIsoDate());
                setAdHocPlannedCathLabDate('');
                setAdHocCheckDevice(DEFAULT_AD_HOC_CHECK_DEVICE);
                setAdHocCallStatus(DEFAULT_AD_HOC_CALL_STATUS);
                setAdHocPostCathDepart(DEFAULT_AD_HOC_POST_CATH_DEPART);
                setAdHocScheduled1st(DEFAULT_AD_HOC_SCHEDULED_1ST);
                setAdHocFundingRequest(DEFAULT_AD_HOC_FUNDING_REQUEST);
                setAdHocErrors([]);
                setAdHocValidationMsg('');
                setShowAdHocModal(true);
              }}
              className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-black text-[10.5px] uppercase tracking-wider rounded-xl cursor-pointer transition flex items-center gap-1 shrink-0 shadow-xs"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Xếp bổ sung</span>
            </button>
          </div>

          {/* Subtabs for "Chưa xếp lịch" / "Đã xếp lịch" / "Tất cả" with Count badges */}
          <div className="px-3 lg:px-4 py-2 bg-slate-50/75 border-b border-slate-150 flex gap-2 shrink-0 overflow-x-auto flex-nowrap lg:flex-wrap lg:overflow-visible [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
            <button
              onClick={() => setActiveTab('unscheduled')}
              className={`shrink-0 lg:flex-1 lg:min-w-[120px] py-2 px-2.5 rounded-xl text-[11px] font-bold flex items-center justify-center gap-1.5 transition cursor-pointer whitespace-nowrap ${
                activeTab === 'unscheduled'
                  ? 'bg-[#d2145a] text-white shadow-xs'
                  : 'bg-white hover:bg-slate-100/70 border border-slate-200 text-slate-600'
              }`}
            >
              Chưa xếp lịch
              <span className={`text-[10px] font-extrabold px-1.5 py-0.5 rounded-full ${
                activeTab === 'unscheduled' ? 'bg-pink-100 text-[#d2145a]' : 'bg-slate-100 text-slate-600'
              }`}>
                {segmentedWaitlist.unscheduled.length}
              </span>
            </button>
            <button
              onClick={() => setActiveTab('scheduled')}
              className={`shrink-0 lg:flex-1 lg:min-w-[120px] py-2 px-2.5 rounded-xl text-[11px] font-bold flex items-center justify-center gap-1.5 transition cursor-pointer whitespace-nowrap ${
                activeTab === 'scheduled'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'bg-white hover:bg-slate-100/70 border border-slate-200 text-slate-600'
              }`}
            >
              Đã xếp lịch
              <span className={`text-[10px] font-extrabold px-1.5 py-0.5 rounded-full ${
                activeTab === 'scheduled' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'
              }`}>
                {segmentedWaitlist.scheduled.length}
              </span>
            </button>
            <button
              onClick={() => setActiveTab('all')}
              className={`shrink-0 lg:flex-1 lg:min-w-[120px] py-2 px-2.5 rounded-xl text-[11px] font-bold flex items-center justify-center gap-1.5 transition cursor-pointer whitespace-nowrap ${
                activeTab === 'all'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'bg-white hover:bg-slate-100/70 border border-slate-200 text-slate-600'
              }`}
            >
              Tất cả
              <span className={`text-[10px] font-extrabold px-1.5 py-0.5 rounded-full ${
                activeTab === 'all' ? 'bg-indigo-100 text-indigo-800' : 'bg-slate-100 text-slate-600'
              }`}>
                {segmentedWaitlist.all.length}
              </span>
            </button>
          </div>

          {/* Search bar inside queue listing */}
          <div className="p-3 border-b border-slate-150 flex items-center relative gap-2 shrink-0">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-2.5" />
              <input
                type="text"
                placeholder="Tìm họ tên, ID1 bệnh nhi..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 bg-slate-100 border-0 rounded-2xl text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-[#d2145a]/50 text-slate-800 placeholder-slate-400 font-sans transition"
              />
              {searchQuery && (
                <button 
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-2 text-slate-400 hover:text-slate-600 cursor-pointer"
                >
                  <X className="w-4.5 h-4.5" />
                </button>
              )}
            </div>
            <button
              onClick={() => setWaitlistSortOrder(prev => prev === 'desc' ? 'asc' : 'desc')}
              className="bg-slate-100 text-slate-600 px-3 py-1.5 rounded-2xl flex items-center justify-center hover:bg-slate-200 transition-colors shrink-0 cursor-pointer"
              title="Sắp xếp theo thời gian dự kiến (Tăng/Giảm)"
            >
              <ArrowUpDown className={`w-4 h-4 transition-transform duration-300 object-center ${waitlistSortOrder === 'asc' ? 'rotate-180' : ''}`} />
            </button>
          </div>

          {/* Internal scroll table container (Overflow horizontal and vertical is isolated within card!) */}
          <div
            ref={waitlistScrollRef}
            onScroll={handleWaitlistScroll}
            className="flex-1 min-h-0 overflow-x-auto overflow-y-auto"
          >
            {displayWaitlist.length === 0 ? (
              <div className="p-8 text-center text-slate-400 italic">
                {searchQuery ? 'Không tìm thấy bệnh nhi thích hợp' : 'Không có bệnh nhi nào trong danh sách hiển thị'}
              </div>
            ) : (
              <>
              <div className="lg:hidden divide-y divide-slate-150">
                {mobileDisplayedWaitlist.map((c) => {
                  const pat = findPatientByKey(patients, c.PatientKey);
                  if (!pat) return null;
                  const isSelected = selectedConsult?.ConsultKey === c.ConsultKey;

                  const missedDays = getMissScheduleDays(c.ConsultDate);
                  let warningIcon = null;
                  if (missedDays >= 14) {
                    const isRed = missedDays > 30;
                    const iconColor = isRed ? 'text-rose-600' : 'text-amber-500';
                    warningIcon = (
                      <AlertTriangle 
                        className={`w-4 h-4 shrink-0 ${iconColor}`} 
                        title={`Bệnh nhân đã bị trễ ${missedDays} ngày xếp lịch`}
                      />
                    );
                  }

                  return (
                    <button
                      key={c.ConsultKey}
                      type="button"
                      onClick={() => handleSelectConsult(c)}
                      className={`w-full text-left p-3 transition ${
                        isSelected ? 'bg-indigo-50/90 border-l-4 border-indigo-600' : 'hover:bg-indigo-50/45'
                      }`}
                    >
                      <div className="flex items-center gap-1.5">
                        {warningIcon}
                        <div className="min-w-0 flex-1">
                          <div className="font-extrabold uppercase text-slate-900 leading-snug break-words">
                            {pat.PatientName}
                          </div>
                          <div className="text-[9px] text-slate-400 font-bold font-mono mt-0.5">
                            ID1: {pat.PatientID1}
                          </div>
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 mt-2 text-[10px]">
                        <span className="bg-slate-100 text-slate-800 font-extrabold px-1.5 py-0.5 rounded font-mono">
                          {c.DiagnosisID || '—'}
                        </span>
                        <span className={`font-extrabold text-[8px] uppercase px-2 py-0.5 rounded-full border ${getPriorityBadgeClass(c.PriorityOrder || '')}`}>
                          {normalizePriorityOrder(c.PriorityOrder)}
                        </span>
                        <span className="text-slate-500">
                          {c.CheckDevice === 'Đủ' ? 'DC: Đủ' : c.CheckDevice === 'Thiếu' ? 'DC: Thiếu' : 'Chưa check DC'}
                        </span>
                        {c.PlannedCathLabDate && (
                          <span className="font-mono text-slate-600">{formatVNTime(c.PlannedCathLabDate)}</span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
              <table className="hidden lg:table w-full min-w-[720px] border-separate border-spacing-0 text-left text-xs font-medium text-slate-700">
                <thead className="bg-slate-50/70 text-slate-500 sticky top-0 border-b border-slate-200 uppercase text-[9px] font-extrabold tracking-wider z-10 shadow-xs">
                  <tr>
                    {activeTab === 'scheduled' && (
                       <th className="py-3 px-2 border-b border-slate-200 text-center w-20 sticky left-0 bg-slate-50 z-20 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.15)] border-r border-slate-200">Hành động</th>
                    )}
                    <th 
                      style={{ left: activeTab === 'scheduled' ? '80px' : '0' }}
                      className="py-3 px-3 border-b border-slate-200 min-w-[160px] md:min-w-[200px] sticky bg-slate-50 z-20 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.15)] border-r border-slate-200"
                    >
                      Họ và tên
                    </th>
                    {visibleColumns.icd && <th className="py-3 px-2 border-b border-slate-200">ICD</th>}
                    {visibleColumns.priority && <th className="py-3 px-2 border-b border-slate-200 text-center">Ưu tiên</th>}
                    {visibleColumns.requestBy && <th className="py-3 px-2 border-b border-slate-200">BS Đăng ký</th>}
                    {visibleColumns.ptvPhu1 && <th className="py-3 px-2 border-b border-slate-200">PTV Phụ 1</th>}
                    {visibleColumns.consultDate && <th className="py-3 px-2 border-b border-slate-200">Ngày hội chẩn</th>}
                    {visibleColumns.consultResultId && <th className="py-3 px-2 border-b border-slate-200">Kết luận chính</th>}
                    {visibleColumns.plannedDate && <th className="py-3 px-2 border-b border-slate-200 text-center">Dự kiến ngày thông tim</th>}
                    {visibleColumns.checkDevice && <th className="py-3 px-2 border-b border-slate-200 text-center">Kiểm dụng cụ</th>}
                    {visibleColumns.callStatus && <th className="py-3 px-2 border-b border-slate-200">Trạng thái gọi</th>}
                    {visibleColumns.missSchedule && <th className="py-3 px-2 border-b border-slate-200 text-center">Trễ xếp lịch</th>}
                    <th className="py-3 px-2 border-b border-slate-200 text-center w-12 sticky right-0 bg-slate-50 z-20 shadow-[-2px_0_5px_-2px_rgba(0,0,0,0.15)] border-l border-slate-200">
                      <div className="relative inline-block text-left" ref={columnDropdownRef}>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setShowColumnDropdown(!showColumnDropdown);
                          }}
                          className="flex items-center justify-center p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-650 hover:text-indigo-600 transition cursor-pointer shadow-xs"
                          title="Tùy chọn hiển thị cột"
                        >
                          <Filter className="w-3.5 h-3.5" />
                        </button>
                        
                        {showColumnDropdown && (
                          <div className="absolute right-0 mt-2 w-56 rounded-xl border border-slate-200 bg-white p-3 shadow-xl z-50 text-slate-700 normal-case font-normal text-left">
                            <p className="font-semibold text-xs text-slate-500 mb-2 border-b border-slate-100 pb-1.5">Hiển thị cột</p>
                            <div className="space-y-2">
                              <label className="flex items-center gap-2.5 px-1 py-0.5 hover:bg-slate-50 rounded cursor-pointer transition text-xs font-medium">
                                <input
                                  type="checkbox"
                                  checked={visibleColumns.icd}
                                  onChange={() => setVisibleColumns(prev => ({ ...prev, icd: !prev.icd }))}
                                  className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 w-3.5 h-3.5"
                                />
                                <span>ICD</span>
                              </label>
                              <label className="flex items-center gap-2.5 px-1 py-0.5 hover:bg-slate-50 rounded cursor-pointer transition text-xs font-medium">
                                <input
                                  type="checkbox"
                                  checked={visibleColumns.priority}
                                  onChange={() => setVisibleColumns(prev => ({ ...prev, priority: !prev.priority }))}
                                  className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 w-3.5 h-3.5"
                                />
                                <span>Ưu tiên</span>
                              </label>
                              <label className="flex items-center gap-2.5 px-1 py-0.5 hover:bg-slate-50 rounded cursor-pointer transition text-xs font-medium">
                                <input
                                  type="checkbox"
                                  checked={visibleColumns.requestBy}
                                  onChange={() => setVisibleColumns(prev => ({ ...prev, requestBy: !prev.requestBy }))}
                                  className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 w-3.5 h-3.5"
                                />
                                <span>BS Đăng ký</span>
                              </label>
                              <label className="flex items-center gap-2.5 px-1 py-0.5 hover:bg-slate-50 rounded cursor-pointer transition text-xs font-medium">
                                <input
                                  type="checkbox"
                                  checked={visibleColumns.ptvPhu1}
                                  onChange={() => setVisibleColumns(prev => ({ ...prev, ptvPhu1: !prev.ptvPhu1 }))}
                                  className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 w-3.5 h-3.5"
                                />
                                <span>PTV Phụ 1</span>
                              </label>
                              <label className="flex items-center gap-2.5 px-1 py-0.5 hover:bg-slate-50 rounded cursor-pointer transition text-xs font-medium">
                                <input
                                  type="checkbox"
                                  checked={visibleColumns.consultDate}
                                  onChange={() => setVisibleColumns(prev => ({ ...prev, consultDate: !prev.consultDate }))}
                                  className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 w-3.5 h-3.5"
                                />
                                <span>Ngày hội chẩn</span>
                              </label>
                              <label className="flex items-center gap-2.5 px-1 py-0.5 hover:bg-slate-50 rounded cursor-pointer transition text-xs font-medium">
                                <input
                                  type="checkbox"
                                  checked={visibleColumns.consultResultId}
                                  onChange={() => setVisibleColumns(prev => ({ ...prev, consultResultId: !prev.consultResultId }))}
                                  className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 w-3.5 h-3.5"
                                />
                                <span>Kết luận chính</span>
                              </label>
                              <label className="flex items-center gap-2.5 px-1 py-0.5 hover:bg-slate-50 rounded cursor-pointer transition text-xs font-medium">
                                <input
                                  type="checkbox"
                                  checked={visibleColumns.plannedDate}
                                  onChange={() => setVisibleColumns(prev => ({ ...prev, plannedDate: !prev.plannedDate }))}
                                  className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 w-3.5 h-3.5"
                                />
                                <span>Dự kiến ngày thông tim</span>
                              </label>
                              <label className="flex items-center gap-2.5 px-1 py-0.5 hover:bg-slate-50 rounded cursor-pointer transition text-xs font-medium">
                                <input
                                  type="checkbox"
                                  checked={visibleColumns.checkDevice}
                                  onChange={() => setVisibleColumns(prev => ({ ...prev, checkDevice: !prev.checkDevice }))}
                                  className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 w-3.5 h-3.5"
                                />
                                <span>Kiểm dụng cụ</span>
                              </label>
                              <label className="flex items-center gap-2.5 px-1 py-0.5 hover:bg-slate-50 rounded cursor-pointer transition text-xs font-medium">
                                <input
                                  type="checkbox"
                                  checked={visibleColumns.callStatus}
                                  onChange={() => setVisibleColumns(prev => ({ ...prev, callStatus: !prev.callStatus }))}
                                  className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 w-3.5 h-3.5"
                                />
                                <span>Trạng thái gọi</span>
                              </label>
                              <label className="flex items-center gap-2.5 px-1 py-0.5 hover:bg-slate-50 rounded cursor-pointer transition text-xs font-medium">
                                <input
                                  type="checkbox"
                                  checked={visibleColumns.missSchedule}
                                  onChange={() => setVisibleColumns(prev => ({ ...prev, missSchedule: !prev.missSchedule }))}
                                  className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 w-3.5 h-3.5"
                                />
                                <span>Trễ xếp lịch</span>
                              </label>
                            </div>
                          </div>
                        )}
                      </div>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-150">
                  {paginatedWaitlist.map((c) => {
                    const pat = findPatientByKey(patients, c.PatientKey);
                    if (!pat) return null;
                    const isSelected = selectedConsult?.ConsultKey === c.ConsultKey;
                    
                    // Display value for scheduled 2nd interventionist (auto-fills if empty in storage)
                    const dispScheduled2nd = getAutoScheduled2nd(c.RequestBy || '') || c.Scheduled2ndInterventionist || '';

                    const missedDays = getMissScheduleDays(c.ConsultDate);
                    let warningIcon = null;
                    if (missedDays >= 14) {
                      const isRed = missedDays > 30;
                      const iconColor = isRed ? 'text-rose-600' : 'text-amber-500';
                      warningIcon = (
                        <AlertTriangle 
                          className={`w-4 h-4 shrink-0 ${iconColor}`} 
                          title={`Bệnh nhân đã bị trễ ${missedDays} ngày xếp lịch`}
                        />
                      );
                    }

                    return (
                      <tr 
                        key={c.ConsultKey}
                        onClick={() => handleSelectConsult(c)}
                        className={`hover:bg-indigo-50/45 cursor-pointer transition ${
                          isSelected ? 'bg-indigo-50/90 font-bold border-l-4 border-indigo-600' : ''
                        }`}
                      >
                        {activeTab === 'scheduled' && (
                          <td 
                            className={`py-2 px-2 text-center sticky left-0 z-10 border-r border-slate-150 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.15)] ${isSelected ? 'bg-indigo-50' : 'bg-white'}`}
                            onClick={(e) => { e.stopPropagation(); }}
                          >
                            <div className="flex items-center justify-center gap-1.5">
                              <button onClick={() => handleUndoScheduled(c, pat)} className="bg-rose-50 hover:bg-rose-100 text-rose-600 p-1.5 rounded-lg border border-rose-200 cursor-pointer shadow-xs" title="Rút ca về Chưa xếp lịch">
                                <Undo2 className="w-3.5 h-3.5" />
                              </button>
                              <button 
                                onClick={() => handleRowTransfer(c, pat)} 
                                className="bg-indigo-50 hover:bg-indigo-100 text-indigo-600 border-indigo-200 cursor-pointer p-1.5 rounded-lg border shadow-xs transition-opacity" 
                                title="Chuyển phòng TT"
                              >
                                <ArrowRightLeft className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        )}
                        <td 
                          style={{ left: activeTab === 'scheduled' ? '80px' : '0' }}
                          className={`py-3.5 px-3 min-w-[160px] md:min-w-[200px] sticky z-10 border-r border-slate-150 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.15)] transition-colors ${
                            isSelected ? 'bg-indigo-50' : 'bg-white'
                          }`}
                        >
                          <div className="flex items-center gap-1.5">
                            {warningIcon}
                            <div className="min-w-0 flex-1">
                              <span className="font-extrabold uppercase text-slate-900 block whitespace-normal break-words leading-snug">
                                {pat.PatientName}
                              </span>
                              <span className="text-[9px] text-slate-400 font-bold font-mono">
                                ID1: {pat.PatientID1}
                              </span>
                            </div>
                          </div>
                        </td>
                        {visibleColumns.icd && (
                          <td className="py-3.5 px-2">
                            <span className="bg-slate-100 text-slate-800 font-extrabold px-1.5 py-0.5 rounded text-[9px] font-mono select-all">
                              {c.DiagnosisID || '—'}
                            </span>
                          </td>
                        )}
                        {visibleColumns.priority && (
                          <td className="py-3.5 px-2 text-center">
                            <span className={`font-extrabold text-[8px] uppercase tracking-wider px-2 py-0.5 rounded-full inline-block border ${getPriorityBadgeClass(c.PriorityOrder || '')}`}>
                              {normalizePriorityOrder(c.PriorityOrder)}
                            </span>
                          </td>
                        )}
                        {visibleColumns.requestBy && (
                          <td className="py-3.5 px-2 font-semibold text-slate-600">
                            {c.RequestBy || '—'}
                          </td>
                        )}
                        {visibleColumns.ptvPhu1 && (
                          <td className="py-3.5 px-2 font-extrabold text-indigo-750">
                            {dispScheduled2nd || <span className="text-slate-300 font-normal italic">—</span>}
                          </td>
                        )}
                        {visibleColumns.consultDate && (
                          <td className="py-3.5 px-2 font-semibold text-slate-600">
                            {c.ConsultDate ? formatVNTime(c.ConsultDate) : <span className="text-slate-300">—</span>}
                          </td>
                        )}
                        {visibleColumns.consultResultId && (
                          <td className="py-3.5 px-2 font-semibold text-slate-600">
                            {c.ConsultResultID || <span className="text-slate-300">—</span>}
                          </td>
                        )}
                        {visibleColumns.plannedDate && (
                          <td className="py-3.5 px-2 text-center font-bold font-mono text-slate-600">
                            {c.PlannedCathLabDate ? formatVNTime(c.PlannedCathLabDate) : <span className="text-slate-350">—</span>}
                          </td>
                        )}
                        {visibleColumns.checkDevice && (
                          <td className="py-3.5 px-2 text-center">
                            {c.CheckDevice === 'Đủ' && (
                              <span className="bg-emerald-100 text-emerald-850 border border-emerald-200 font-extrabold text-[8px] uppercase tracking-wider px-2 py-0.5 rounded-full inline-block">
                                ĐỦ
                              </span>
                            )}
                            {c.CheckDevice === 'Thiếu' && (
                              <span className="bg-rose-100 text-rose-850 border border-rose-200 font-extrabold text-[8px] uppercase tracking-wider px-2 py-0.5 rounded-full inline-block">
                                THIẾU
                              </span>
                            )}
                            {!c.CheckDevice && (
                              <span className="text-slate-350 text-[10px] italic">Chưa check</span>
                            )}
                          </td>
                        )}
                        {visibleColumns.callStatus && (
                          <td className="py-3.5 px-2 font-semibold text-slate-600">
                            {c.CallStatus || <span className="text-slate-300">—</span>}
                          </td>
                        )}
                        {visibleColumns.missSchedule && (
                          <td className="py-3.5 px-2 text-center font-bold text-slate-600">
                            {missedDays > 0 ? `${missedDays} ngày` : '0 ngày'}
                          </td>
                        )}
                        <td className={`py-3.5 px-2 text-center sticky right-0 z-10 border-l border-slate-150 shadow-[-2px_0_5px_-2px_rgba(0,0,0,0.15)] ${
                          isSelected ? 'bg-indigo-50' : 'bg-white'
                        }`} />
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              </>
            )}
          </div>
          
          {/* Pagination panel — desktop only; mobile uses infinite scroll */}
          {displayWaitlist.length > 0 && (
            <div className="hidden lg:flex bg-white px-4 py-2 items-center justify-between border-t border-slate-200 shrink-0">
              <div className="text-xs text-slate-500 font-medium tracking-tight">
                Trang <span className="font-bold text-indigo-700">{waitlistCurrentPage}</span> / <span className="font-bold">{totalWaitlistPages}</span> (Hiển thị {rowsPerWaitlistPage})
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setWaitlistCurrentPage(1)}
                  disabled={waitlistCurrentPage === 1}
                  className="p-1 rounded-lg text-slate-500 hover:bg-slate-100 disabled:opacity-30 disabled:hover:bg-transparent transition"
                >
                  <ChevronsLeft className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => setWaitlistCurrentPage(p => Math.max(1, p - 1))}
                  disabled={waitlistCurrentPage === 1}
                  className="p-1 rounded-lg text-slate-500 hover:bg-slate-100 disabled:opacity-30 disabled:hover:bg-transparent transition"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>
                <div className="px-1 text-xs font-bold text-slate-700 select-none">
                  {waitlistCurrentPage}
                </div>
                <button
                  onClick={() => setWaitlistCurrentPage(p => Math.min(totalWaitlistPages, p + 1))}
                  disabled={waitlistCurrentPage === totalWaitlistPages}
                  className="p-1 rounded-lg text-slate-500 hover:bg-slate-100 disabled:opacity-30 disabled:hover:bg-transparent transition"
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => setWaitlistCurrentPage(totalWaitlistPages)}
                  disabled={waitlistCurrentPage === totalWaitlistPages}
                  className="p-1 rounded-lg text-slate-500 hover:bg-slate-100 disabled:opacity-30 disabled:hover:bg-transparent transition"
                >
                  <ChevronsRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}
        </div>

        {/* RIGHT COLUMN: Selection Detailed Form Editor OR Preview List */}
        <div className={`flex-1 lg:flex-initial flex flex-col rounded-3xl shadow-sm overflow-y-auto lg:overflow-hidden min-h-0 ${pureCalendarMode ? 'lg:col-span-12 bg-white border border-[#e2e8f0]' : 'lg:col-span-6 bg-white border border-[#e2e8f0]'} ${(mobileTab === 'calendar' || mobileTab === 'editor') ? 'flex' : 'hidden lg:flex'}`}>
          {!isAnyFilterExpanded ? (
            <>
              {(!selectedConsult || pureCalendarMode || mobileTab !== 'editor') ? (
            
            /* SHOW THE BEAUTIFUL INDEPENDENT CALENDAR WHEN NO PATIENT IS SELECTED (or in pure calendar mode) */
            <div className="flex-1 flex flex-col min-h-0 bg-white">
              
              {/* Calendar Title Bar */}
              <div className="p-2 lg:p-4 border-b border-slate-100 bg-slate-50 flex flex-wrap items-center justify-between gap-2 lg:gap-3 shrink-0">
                <div className="hidden lg:block">
                  <h3 className="font-extrabold text-slate-800 text-[13px] uppercase tracking-wide flex items-center gap-1.5">
                    <Calendar className="w-4 h-4 text-[#d2145a]" />
                    Lịch thông tim dự kiến
                  </h3>
                  <p className="text-[9px] text-[#d2145a] font-bold uppercase mt-0.5">
                    Hệ thống xếp lịch can thiệp phòng CathLab trực tuyến
                  </p>
                </div>
                
                {/* Views and Today navigation */}
                <div className="flex items-center gap-1 flex-wrap w-full lg:w-auto justify-center lg:justify-start">
                  <div className="flex bg-slate-100 p-0.5 rounded-xl border border-slate-200 text-[10px] font-bold text-slate-600">
                    <button 
                      onClick={() => setCalendarView('day')}
                      className={`px-3 py-1 rounded-lg transition cursor-pointer ${calendarView === 'day' ? 'bg-white text-slate-950 font-extrabold shadow-xs' : 'hover:text-slate-900'}`}
                    >
                      Ngày
                    </button>
                    <button 
                      onClick={() => setCalendarView('week')}
                      className={`px-3 py-1 rounded-lg transition cursor-pointer ${calendarView === 'week' ? 'bg-white text-slate-950 font-extrabold shadow-xs' : 'hover:text-slate-900'}`}
                    >
                      Tuần
                    </button>
                    <button 
                      onClick={() => setCalendarView('month')}
                      className={`px-3 py-1 rounded-lg transition cursor-pointer ${calendarView === 'month' ? 'bg-white text-slate-950 font-extrabold shadow-xs' : 'hover:text-slate-900'}`}
                    >
                      Tháng
                    </button>
                  </div>
                  
                  <button 
                    onClick={jumpToToday}
                    className="bg-white border border-slate-200 text-[#d2145a] font-extrabold text-[10px] py-1 px-3 rounded-xl hover:bg-slate-50 cursor-pointer transition"
                  >
                    Hôm nay
                  </button>
                </div>
              </div>

              {/* Month Navigation & controls */}
              {calendarView === 'month' && (
                <div className="p-1.5 lg:p-3 bg-white/80 border-b border-slate-100 flex items-center justify-center gap-6 shrink-0">
                  <button 
                    onClick={handlePrevMonth}
                    className="p-1 px-2.5 bg-slate-50 hover:bg-slate-100 text-slate-700 hover:text-slate-900 rounded-lg transition border border-slate-150 cursor-pointer"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <span className="font-extrabold text-[13px] text-slate-800 uppercase tracking-wider font-sans select-none">
                    Tháng {currentMonth + 1} {currentYear}
                  </span>
                  <button 
                    onClick={handleNextMonth}
                    className="p-1 px-2.5 bg-slate-50 hover:bg-slate-100 text-slate-700 hover:text-slate-900 rounded-lg transition border border-slate-150 cursor-pointer"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              )}

              {/* Main Calendar Render Frame */}
              <div className={`flex-1 p-1.5 lg:p-3 flex flex-col min-h-0 lg:justify-between ${calendarView === 'month' ? 'overflow-y-auto lg:overflow-hidden' : 'overflow-y-auto'}`}>
                
                {/* 1. MONTH VIEW */}
                {calendarView === 'month' && (
                  <div className="flex flex-col bg-white shrink-0 lg:shrink lg:flex-1 lg:min-h-0">
                    {/* Day Headers (Vietnamese abbreviations) */}
                    <div className="grid grid-cols-7 gap-1 text-center font-extrabold text-[#d2145a] text-[10px] uppercase py-2 bg-slate-50/70 border border-slate-200 rounded-t-2xl shrink-0">
                      <div>T2</div>
                      <div>T3</div>
                      <div>T4</div>
                      <div>T5</div>
                      <div>T6</div>
                      <div>T7</div>
                      <div>CN</div>
                    </div>

                    {/* Day Cards/Cells Grid */}
                    <div className="grid grid-cols-7 gap-1 border-l border-r border-b border-slate-200 rounded-b-2xl bg-slate-100/50 p-1 lg:flex-1 lg:overflow-hidden">
                      {calendarCells.map((cell, idx) => {
                        // Filter matching scheduled consults for this date string (YYYY-MM-DD)
                        const matchingConsults = segmentedWaitlist.scheduled.filter(c => {
                          if (!c.PlannedCathLabDate) return false;
                          return getFormattedDateKey(c.PlannedCathLabDate) === cell.dateStr;
                        });

                        return (
                          <div
                            key={`${cell.dateStr}-${idx}`}
                            className={`min-h-[52px] lg:min-h-[70px] xl:min-h-[85px] p-1.5 rounded-xl border border-slate-200 bg-white flex flex-col justify-between transition ${
                              cell.isCurrentMonth ? 'text-slate-800' : 'bg-slate-50/40 text-slate-300 pointer-events-none opacity-45'
                            } ${cell.isToday ? 'bg-[#d2145a]/5 border-[#d2145a]/30' : ''}`}
                          >
                            {/* Day Number inside the cell */}
                            <div className="text-right">
                              {cell.isToday ? (
                                <span className="bg-[#d2145a] text-white font-black text-[10px] w-5 h-5 inline-flex items-center justify-center rounded-full shadow-xs">
                                  {cell.day}
                                </span>
                              ) : (
                                <span className={`font-black font-mono text-[10px] ${cell.isCurrentMonth ? 'text-slate-500' : 'text-slate-350'}`}>
                                  {cell.day}
                                </span>
                              )}
                            </div>

                            {/* Scheduled Patient badging inside day cell */}
                            <div className="flex-1 overflow-y-auto mt-1 flex flex-col gap-1 pr-0.5 custom-scrollbar">
                              {matchingConsults.map(c => {
                                const pat = findPatientByKey(patients, c.PatientKey);
                                const ptvPhu1Display = resolvePtvPhu1Display(
                                  c.RequestBy || '',
                                  c.Scheduled2ndInterventionist
                                );
                                return (
                                  <div
                                    key={c.ConsultKey}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleSelectConsult(c);
                                      if (pureCalendarMode) setShowSummaryModal(true);
                                    }}
                                    className="bg-[#b31448] hover:bg-[#d61d56] text-white text-[8px] font-black leading-tight px-1.5 py-0.5 rounded-lg truncate cursor-pointer transition select-none tracking-wide text-center uppercase"
                                    title={formatCalendarPatientTooltip(pat?.PatientName || 'Unknown Patient', c.DiagnosisID || 'N/A', ptvPhu1Display)}
                                  >
                                    {pat?.PatientName ? pat.PatientName.split(' ').slice(-2).join(' ') : 'INFO'}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* 2. WEEKLY VIEW */}
                {calendarView === 'week' && (
                  <div className="flex-1 flex flex-col bg-white">
                    <div className="grid grid-cols-7 gap-1.5 text-center font-extrabold text-[#d2145a] text-[10px] uppercase py-2 bg-slate-50 border border-slate-200 rounded-t-2xl">
                      <div>T2</div>
                      <div>T3</div>
                      <div>T4</div>
                      <div>T5</div>
                      <div>T6</div>
                      <div>T7</div>
                      <div>CN</div>
                    </div>
                    <div className="grid grid-cols-7 gap-1.5 border-l border-r border-b border-slate-200 rounded-b-2xl bg-slate-50/55 p-2 flex-1">
                      {calendarWeekCells.map((cell, idx) => {
                        const matchingConsults = segmentedWaitlist.scheduled.filter(c => {
                          if (!c.PlannedCathLabDate) return false;
                          return getFormattedDateKey(c.PlannedCathLabDate) === cell.dateStr;
                        });

                        return (
                          <div
                            key={`${cell.dateStr}-${idx}`}
                            className={`min-h-[160px] p-2 rounded-xl bg-white border border-slate-200 flex flex-col transition ${
                              cell.isToday ? 'bg-[#d2145a]/5 ring-1 ring-[#d2145a]/20' : ''
                            }`}
                          >
                            <div className="border-b border-slate-100 pb-1 flex justify-between items-center mb-1">
                              <span className="font-bold text-[9px] text-slate-400 font-mono">{cell.dateStr.substring(5)}</span>
                              {cell.isToday ? (
                                <span className="bg-[#d2145a] text-white font-extrabold text-[9px] px-1.5 py-0.5 rounded-md">TODAY</span>
                              ) : (
                                <span className="font-extrabold font-mono text-[11px] text-slate-800">{cell.day}</span>
                              )}
                            </div>

                            <div className="flex-1 overflow-y-auto flex flex-col gap-1.5">
                              {matchingConsults.map(c => {
                                const pat = findPatientByKey(patients, c.PatientKey);
                                return (
                                  <div
                                    key={c.ConsultKey}
                                    onClick={() => { handleSelectConsult(c); if (pureCalendarMode) setShowSummaryModal(true); }}
                                    className="bg-[#b31448] hover:bg-[#d61d56] text-white text-[8px] font-black leading-tight p-1 rounded-lg cursor-pointer transition tracking-wide text-center uppercase border border-[#80072d]"
                                  >
                                    <p className="truncate font-black">{pat?.PatientName || 'BỆNH NHI'}</p>
                                    <p className="text-[7.5px] text-pink-200 font-mono mt-0.5">ICD: {c.DiagnosisID || '...'}</p>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* 3. DAY VIEW */}
                {calendarView === 'day' && (
                  <div className="flex-1 bg-slate-50 rounded-2xl p-4 border border-slate-200 flex flex-col">
                    <div className="flex items-center justify-between mb-4 pb-2 border-b border-slate-200">
                      <div>
                        <h4 className="text-slate-800 font-extrabold text-xs uppercase">Báo cáo lịch ngày: {getFormattedDateKey(activeDate.toISOString().split('T')[0])}</h4>
                        <p className="text-[9px] text-slate-400">Danh sách kíp can thiệp ngày hôm nay</p>
                      </div>
                      <VNDateInput 
                        value={getFormattedDateKey(activeDate.toISOString().split('T')[0])} 
                        onChange={(val) => {
                          if (val) {
                            const parts = val.split('-');
                            setActiveDate(new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2])));
                          }
                        }}
                        className="bg-white text-xs border border-slate-250 rounded-xl px-2.5 py-1 font-bold text-slate-700 w-[120px] focus:outline-none" 
                      />
                    </div>

                    <div className="flex-1 overflow-y-auto space-y-2">
                      {(() => {
                        const targetKey = getFormattedDateKey(activeDate.toISOString().split('T')[0]);
                        const dayMatches = segmentedWaitlist.scheduled.filter(c => {
                          if (!c.PlannedCathLabDate) return false;
                          return getFormattedDateKey(c.PlannedCathLabDate) === targetKey;
                        });

                        if (dayMatches.length === 0) {
                          return (
                            <div className="p-8 text-center text-slate-400 italic text-xs">
                              Không có ca phẫu thuật/thông tim nào được đăng ký trong ngày này.
                            </div>
                          );
                        }

                        return dayMatches.map(c => {
                          const pat = findPatientByKey(patients, c.PatientKey);
                          return (
                            <div 
                              key={c.ConsultKey}
                              onClick={() => { handleSelectConsult(c); if (pureCalendarMode) setShowSummaryModal(true); }}
                              className="bg-white border border-slate-150 p-3 rounded-2xl flex justify-between items-center hover:bg-slate-100 cursor-pointer transition shadow-xs"
                            >
                              <div>
                                <span className="text-[10px] text-pink-700 font-extrabold uppercase bg-pink-50 border border-pink-100 px-2 py-0.5 rounded">
                                  {c.ConsultResultID}
                                </span>
                                <h4 className="text-[12px] font-extrabold uppercase text-slate-900 mt-1">{pat?.PatientName}</h4>
                                <p className="text-[10px] text-slate-500 font-bold font-mono">ID1: {pat?.PatientID1} • Chẩn đoán: {c.DiagnosisID}</p>
                              </div>
                              <div className="text-right text-[10px] font-bold text-slate-600">
                                <p>BS can thiệp: <span className="text-slate-800 font-extrabold">{c.Scheduled1stInterventionist || '—'}</span></p>
                                <p>Dụng cụ: <span className="font-extrabold text-indigo-700">{c.PlannedDevice || 'Chưa đăng ký'}</span></p>
                              </div>
                            </div>
                          );
                        });
                      })()}
                    </div>
                  </div>
                )}

                {/* Calendar Legend indicators bar */}
                <div className="mt-4 p-3 bg-slate-50 border border-slate-200 rounded-2xl flex items-center justify-between text-[10px] text-slate-500 font-medium shrink-0 lg:mt-4">
                  <div className="flex gap-4">
                    <span className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full bg-[#b31448]"></span>
                      Ca thông tim đã duyệt
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full bg-[#d2145a]"></span>
                      Đỉnh mốc "Hôm nay"
                    </span>
                  </div>
                  <span className="text-[9px] text-[#d2145a] font-extrabold">AI Studio Scheduler v4.0</span>
                </div>

              </div>

            </div>
          ) : (
            <form onSubmit={handleSave} className="flex-1 flex flex-col justify-between h-full min-h-0 bg-white">
              
              {/* STICKY TOP HEADER CONTROL BAR */}
              <div className="hidden lg:flex p-4 border-b border-indigo-100 bg-indigo-50/20 flex-wrap items-center justify-between gap-2 shrink-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    type="button"
                    onClick={handleCloseSchedulingView}
                    className="bg-white hover:bg-slate-100 border border-slate-350 text-slate-700 font-extrabold text-[10.5px] px-3.5 py-1.5 rounded-xl transition flex items-center gap-1 select-none shadow-xs cursor-pointer"
                  >
                    <span>←</span>
                    <span className="hidden lg:inline"> Quay lại Lịch Tháng</span>
                  </button>
                  <span className="hidden lg:inline-block bg-[#d2145a] text-white font-extrabold text-[9px] uppercase tracking-wider px-2 py-0.5 rounded-lg shadow-xs select-none mr-2">
                    Xếp lịch
                  </span>
                </div>
                <span className="hidden lg:inline text-[10px] text-slate-400 font-bold font-mono">
                  Mã: {selectedConsult.ConsultKey}
                </span>
              </div>

              {/* SINGLE UNIFIED SCROLLABLE AREA */}
              <div className="flex-1 overflow-y-auto p-4 space-y-2 max-h-full">
                
                {(() => {
                  const pat = findPatientByKey(patients, selectedConsult.PatientKey);
                  if (!pat) return null;
                  const ptvPhu1Display = resolvePtvPhu1Display(
                    schedRequestBy || selectedConsult.RequestBy || '',
                    selectedConsult.Scheduled2ndInterventionist,
                    scheduled2nd
                  );
                  return (
                    <div className="space-y-2">

                      {/* Patient name highlight — tách khỏi ô hành chính */}
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="bg-[#d2145a] border-2 border-[#d2145a] rounded-2xl px-4 py-3 shadow-sm">
                          <span className="font-black text-white uppercase text-sm sm:text-base tracking-wide block whitespace-normal break-words leading-snug">
                            {pat.PatientName}
                          </span>
                        </div>
                        {ptvPhu1Display?.trim() && (
                          <span className="text-slate-700 uppercase text-sm sm:text-base tracking-wide leading-snug">
                            PTV phụ: {ptvPhu1Display}
                          </span>
                        )}
                      </div>

                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-2 items-start">
                        {/* Cột trái: hành chính, đăng ký HC, kết quả HC */}
                        <div className="space-y-2">
                      
                      {/* Part 1: Administrative Details */}
                      <div className="bg-white border border-slate-150 p-3 rounded-2xl shadow-xs">
                        <span className="hidden lg:block font-extrabold text-slate-800 text-[10px] uppercase tracking-wider border-b border-slate-100 pb-1 mb-1.5">
                          THÔNG TIN HÀNH CHÍNH
                        </span>
                        {renderPatientAdminInfo(pat, 'form')}
                      </div>

                      {/* Kết quả Hội chẩn — gộp đăng ký + kết quả, tất cả chỉnh sửa được */}
                      <div className="bg-indigo-50/60 border border-indigo-120 p-3 rounded-2xl flex flex-col gap-1.5 text-[11px] shadow-xs">
                        <span className="text-indigo-900 font-black uppercase text-[10px] tracking-wider block border-b border-indigo-100 pb-1 mb-0.5">
                          Kết quả Hội chẩn
                        </span>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                          <div>
                            <label className="text-slate-500 font-bold text-[8px] uppercase block mb-0">Ngày staff</label>
                            <VNDateInput value={schedConsultDate} onChange={setSchedConsultDate} className="w-full bg-white border border-slate-200 rounded-xl px-2.5 py-1.5 font-bold focus:outline-none text-xs text-slate-800" />
                          </div>
                          <div>
                            <label className="text-slate-500 font-bold text-[8px] uppercase block mb-0">Người đăng ký</label>
                            <select
                              value={schedRequestBy}
                              onChange={(e) => {
                                const val = e.target.value;
                                setSchedRequestBy(val);
                                setScheduled2nd(getAutoScheduled2nd(val));
                              }}
                              className={`${schedInputCls} font-bold`}
                            >
                              <option value="">— Chọn BS —</option>
                              {staffList.filter(s => !s.FireDate).map(st => (
                                <option key={st.StaffKey} value={formatShortDoctorName(st.StaffName)}>
                                  {formatShortDoctorName(st.StaffName)}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className="text-slate-500 font-bold text-[8px] uppercase block mb-0">Cân nặng (kg)</label>
                            <input
                              type="text"
                              placeholder="12.5"
                              value={schedPatientWeight}
                              onChange={(e) => setSchedPatientWeight(e.target.value)}
                              className={`${schedInputCls} font-mono font-bold`}
                            />
                          </div>
                          <div>
                            <label className="text-slate-500 font-bold text-[8px] uppercase block mb-0">Chiều cao (cm)</label>
                            <input
                              type="text"
                              placeholder="95"
                              value={schedPatientHeight}
                              onChange={(e) => setSchedPatientHeight(e.target.value)}
                              className={`${schedInputCls} font-mono`}
                            />
                          </div>
                        </div>
                        <div className="grid grid-cols-1 gap-1.5 pt-0.5">
                          <div>
                            <label className="text-slate-500 font-bold text-[8px] uppercase block mb-0">Bệnh chính</label>
                            <SearchableEnumSelect
                              options={diagnosisOptions}
                              value={schedDiagnosisID}
                              onChange={(value) => setSchedDiagnosisID(normalizeDiagnosisID(value))}
                              allowCreate
                              createLabel={(value) => `Thêm DiagnosisID "${value}" vào Source`}
                              onCreateOption={createDiagnosisSource}
                              placeholder="— Chọn ICD —"
                              searchPlaceholder="Gõ ICD..."
                            />
                          </div>
                          <div>
                            <label className="text-slate-500 font-bold text-[8px] uppercase block mb-0">Chẩn đoán chi tiết</label>
                            <textarea
                              rows={2.5}
                              value={schedDetailDiagnosis}
                              onChange={(e) => setSchedDetailDiagnosis(e.target.value)}
                              placeholder="Nhập chẩn đoán chi tiết..."
                              className={`${schedInputCls} leading-relaxed resize-y`}
                            />
                          </div>
                          <div>
                            <label className="text-slate-500 font-bold text-[8px] uppercase block mb-0">Kết luận chính</label>
                            <SearchableEnumSelect
                              options={CONCLUSION_OPTIONS}
                              value={schedConsultResultID}
                              onChange={setSchedConsultResultID}
                              placeholder="— Chọn kết luận —"
                              searchPlaceholder="Gõ tìm kết luận..."
                            />
                          </div>
                          <div>
                            <label className="text-slate-500 font-bold text-[8px] uppercase block mb-0">Ưu tiên</label>
                            <div className="flex gap-1.5">
                              {PRIORITY_OPTIONS.map((opt) => {
                                const isSel = priorityOrder === opt;
                                return (
                                  <button
                                    key={opt}
                                    type="button"
                                    onClick={() => setPriorityOrder(opt)}
                                    className={`flex-1 py-1 px-1.5 rounded-xl border text-[10px] font-bold transition text-center cursor-pointer ${
                                      isSel
                                        ? 'bg-indigo-600 border-indigo-600 text-white shadow-xs font-extrabold ring-1 ring-indigo-400'
                                        : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                                    }`}
                                  >
                                    {opt}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                          <div>
                            <label className="text-slate-500 font-bold text-[8px] uppercase block mb-0">Kết quả Hội chẩn chi tiết</label>
                            <textarea
                              rows={2.5}
                              value={schedDetailConsultResult}
                              onChange={(e) => setSchedDetailConsultResult(e.target.value)}
                              placeholder="Nhập kết quả hội chẩn chi tiết..."
                              className={`${schedInputCls} leading-relaxed resize-y`}
                            />
                          </div>
                        </div>
                      </div>

                        </div>

                        {/* Cột phải: chuẩn bị dụng cụ, xếp lịch */}
                        <div className="space-y-2">
                <div className="bg-white border border-slate-200 p-3 rounded-2xl shadow-xs space-y-2">
                  <span className="font-extrabold text-[#d2145a] text-[10.5px] uppercase tracking-wider block border-b border-slate-200 pb-1">
                    CHUẨN BỊ DỤNG CỤ
                  </span>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  
                    {/* Planned Device */}
                    <div className="md:col-span-2">
                      <PlannedDeviceSuggestBox
                        diagnosisID={schedDiagnosisID}
                        value={plannedDevice}
                        onChange={setPlannedDevice}
                        deviceTemplates={deviceTemplates}
                        consults={consults}
                        rows={3}
                      />
                    </div>

                    {/* Planned Price */}
                    <div>
                      <label className="block text-slate-500 font-bold text-[9px] uppercase mb-0.5">Số tiền dự kiến (VNĐ)</label>
                      <input
                        type="text"
                        placeholder="ví dụ: 45,000,000..."
                        value={plannedPrice}
                        onChange={(e) => setPlannedPrice(e.target.value)}
                        className="w-full bg-white border border-slate-200 rounded-xl px-2.5 py-1.5 font-bold focus:outline-none text-xs text-slate-800 font-mono"
                      />
                    </div>

                    {/* Device Stock Check - Enum Cards button style */}
                    <div>
                      <label className="block text-slate-500 font-bold text-[9px] uppercase mb-0.5">Kiểm dụng cụ</label>
                      <div className="flex gap-2 h-[35px]">
                        {(['Đủ', 'Thiếu'] as const).map((opt) => (
                          <button
                            key={opt}
                            type="button"
                            onClick={() => setCheckDevice(opt)}
                            className={`flex-1 rounded-xl border text-[11px] font-bold transition flex items-center justify-center gap-1.5 cursor-pointer h-full ${
                              checkDevice === opt 
                                ? opt === 'Đủ' 
                                  ? 'bg-emerald-50 border-emerald-300 text-emerald-800 shadow-sm ring-1 ring-emerald-400 font-extrabold'
                                  : 'bg-rose-50 border-rose-300 text-rose-800 shadow-sm ring-1 ring-rose-400 font-extrabold'
                                : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                            }`}
                          >
                            {checkDevice === opt && <Check className="w-4 h-4 shrink-0" />}
                            {opt}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Supply Dept feedback */}
                    <div>
                      <label className="block text-slate-500 font-bold text-[9px] uppercase mb-0.5">Phòng vật tư phản hồi</label>
                      <textarea
                        rows={2}
                        placeholder="Ghi chú dụng cụ đặc thù, vật tư phản hồi..."
                        value={supplyDepFeedback}
                        onChange={(e) => setSupplyDepFeedback(e.target.value)}
                        className="w-full bg-white border border-slate-250 rounded-xl px-2.5 py-1 focus:outline-none text-xs text-slate-800 font-semibold resize-y"
                      />
                    </div>

                    {/* Operation Room feedback */}
                    <div>
                      <label className="block text-slate-500 font-bold text-[9px] uppercase mb-0.5">Phòng mổ phản hồi</label>
                      <textarea
                        rows={2}
                        placeholder="Nếu có phản hồi từ phòng mổ, ghi nhận chi tiết tại đây..."
                        value={operationFeedback}
                        onChange={(e) => setOperationFeedback(e.target.value)}
                        className="w-full bg-white border border-slate-200 rounded-xl px-2.5 py-1 focus:outline-none text-xs text-slate-800 font-semibold resize-y"
                      />
                    </div>

                  </div>
                </div>

                {/* Part 5: XẾP LỊCH */}
                {checkDevice !== 'Thiếu' && (
                  <div className="bg-white border border-slate-200 p-3 rounded-2xl shadow-xs space-y-2">
                    <span className="font-extrabold text-[#d2145a] text-[10.5px] uppercase tracking-wider block border-b border-slate-200 pb-1">
                      XẾP LỊCH
                    </span>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      
                      {/* Call Status - Enum buttons group */}
                      <div className="md:col-span-2">
                        <label className="block text-slate-500 font-bold text-[9px] uppercase mb-0.5">Trạng thái gọi bệnh</label>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                          {CALL_STATUS_OPTIONS.map((opt) => {
                            const isSel = callStatus === opt;
                            return (
                              <button
                                key={opt}
                                type="button"
                                onClick={() => handleCallStatusSelect(opt)}
                                className={`py-1 rounded-lg border text-[10px] font-bold transition-all text-center cursor-pointer ${
                                  isSel 
                                    ? 'bg-indigo-600 border-indigo-700 text-white shadow-xs font-extrabold'
                                    : 'bg-slate-50/55 border-slate-200 text-slate-700 hover:bg-slate-50'
                                }`}
                              >
                                {opt}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {/* Call Note */}
                      <div className="md:col-span-2">
                        <label className="block text-slate-500 font-bold text-[9px] uppercase mb-0.5">Lưu ý gọi bệnh</label>
                        <textarea
                          rows={2}
                          placeholder="Thông tin liên lạc hoặc lý do chưa can thiệp..."
                          value={callNote}
                          onChange={(e) => setCallNote(e.target.value)}
                          className="w-full bg-white border border-slate-200 rounded-xl px-2.5 py-1 focus:outline-none text-xs text-slate-800 font-semibold"
                        />
                      </div>

                      {/* Removal Confirmation Dialog Inline */}
                      {showConfirmRemoveDialog && (
                        <div className="md:col-span-2 bg-rose-50 border border-rose-200 p-3.5 rounded-2xl flex flex-col gap-2.5 shadow-sm animate-in fade-in slide-in-from-top-2 duration-200">
                          <p className="text-xs font-bold text-rose-900 leading-normal flex items-start gap-2">
                            <AlertTriangle className="w-4.5 h-4.5 text-[#d2145a] shrink-0 mt-0.5" />
                            <span>Bạn đã chọn <strong>"{callStatus}"</strong>. <br/>BN sẽ loại khỏi view "Xếp lịch" và đưa về View "Lưu trữ". Bạn có chắc chắn không?</span>
                          </p>
                          <div className="flex gap-2 justify-end">
                            <button
                               type="button"
                               onClick={handleCancelRemove}
                               className="bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 px-3.5 py-1 rounded-xl font-bold text-[10.5px] cursor-pointer transition shadow-xs"
                            >
                               Không
                            </button>
                            <button
                               type="button"
                               onClick={handleConfirmRemove}
                               disabled={saving}
                               className="bg-[#d2145a] hover:bg-rose-700 text-white px-4.5 py-1 rounded-xl font-black text-[10.5px] cursor-pointer transition shadow-xs disabled:opacity-50"
                            >
                               {saving ? 'Đang lưu...' : 'Có, Loại bỏ'}
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Show scheduling controls ONLY if callStatus === 'Đồng ý' */}
                      {callStatus === 'Đồng ý' && (
                        <>
                          {/* Planned Cath Date (type="date") */}
                          <div>
                            <label className="block text-slate-500 font-bold text-[9px] uppercase mb-0.5">Ngày thông dự kiến</label>
                            <VNDateInput
                              value={plannedCathLabDate}
                              onChange={setPlannedCathLabDate}
                              className="w-full bg-white border border-slate-200 rounded-xl px-2.5 py-1.5 font-bold focus:outline-none text-xs text-slate-800"
                            />
                          </div>

                          {/* Post Cath Department */}
                          <div>
                            <label className="block text-slate-500 font-bold text-[9px] uppercase mb-0.5">Khoa nằm sau thông tim</label>
                            <select
                              value={postCathDepart}
                              onChange={(e) => setPostCathDepart(e.target.value)}
                              className="w-full bg-white border border-slate-200 rounded-xl px-2.5 py-1.5 font-bold focus:outline-none text-xs text-slate-800"
                            >
                              <option value="">— Hãy chọn khoa —</option>
                              {DEPARTMENTS_LIST.map(dept => (
                                <option key={dept} value={dept}>{dept}</option>
                              ))}
                            </select>
                          </div>

                          {/* Cath Methods */}
                          <div className="md:col-span-2 relative">
                            <label className="block text-slate-500 font-bold text-[9px] uppercase mb-0.5">
                              Phương pháp thủ thuật (có thể chọn nhiều)
                            </label>
                            <SearchableEnumSelect
                              multiple
                              options={METHOD_OPTIONS}
                              values={selectedMethods}
                              onMultiChange={setSelectedMethods}
                              placeholder="— Chọn phương pháp thủ thuật —"
                              searchPlaceholder="Gõ phương pháp để tìm..."
                              direction="up"
                            />
                          </div>

                          {/* Scheduled Interventionists (1, 2, 3) */}
                          <div>
                            <label className="block text-slate-500 font-bold text-[9px] uppercase mb-0.5">PTV chính</label>
                            <select
                              value={scheduled1st}
                              onChange={(e) => setScheduled1st(e.target.value)}
                              className="w-full bg-white border border-slate-200 rounded-xl px-2.5 py-1.5 focus:outline-none text-xs text-slate-850 font-extrabold"
                            >
                              <option value="">— Chọn PTV chính —</option>
                              <option value="BS. Phụng">BS. Phụng</option>
                              <option value="BS. Lợi">BS. Lợi</option>
                              <option value="BS. Thịnh">BS. Thịnh</option>
                            </select>
                          </div>

                          <div>
                            <label className="block text-slate-500 font-bold text-[9px] uppercase mb-0.5">PTV phụ 1</label>
                            <select
                              value={scheduled2nd}
                              onChange={(e) => setScheduled2nd(e.target.value)}
                              className="w-full bg-white border border-slate-200 rounded-xl px-2.5 py-1.5 focus:outline-none text-xs text-indigo-900 font-extrabold"
                            >
                              <option value="">— Chọn PTV phụ 1 —</option>
                              {CATH_INTERVENTIONIST_DOCTORS.map((doc) => (
                                <option key={doc} value={doc}>{doc}</option>
                              ))}
                            </select>
                          </div>

                          <div className="md:col-span-2">
                            <label className="block text-slate-500 font-bold text-[9px] uppercase mb-0.5">PTV phụ 2</label>
                            <select
                              value={scheduled3rd}
                              onChange={(e) => setScheduled3rd(e.target.value)}
                              className="w-full bg-white border border-slate-200 rounded-xl px-2.5 py-1.5 focus:outline-none text-xs text-slate-800 font-bold"
                            >
                              <option value="">— Chọn PTV phụ 2 —</option>
                              <option value="BS. Ân">BS. Ân</option>
                              <option value="BS. Tài">BS. Tài</option>
                              <option value="BS. Hiếu">BS. Hiếu</option>
                              <option value="BS. Hùng">BS. Hùng</option>
                              <option value="BS. Tĩnh">BS. Tĩnh</option>
                              <option value="BS. Thịnh">BS. Thịnh</option>
                            </select>
                          </div>
                        </>
                      )}

                      <div className="md:col-span-2 grid grid-cols-2 gap-1.5 mt-1 pt-1.5 border-t border-slate-100">
                        <div>
                          <label className="block text-slate-400 font-bold text-[9px] mb-0.5 uppercase">Người xếp lịch/check DC</label>
                          <input
                            type="text"
                            disabled
                            value={(() => {
                              const editorId = currentStaff?.StaffKey;
                              return staffList.find(s => s.StaffKey === editorId)?.StaffName || editorId || '01378';
                            })()}
                            className="w-full bg-slate-50 text-slate-400 border border-slate-200 rounded-lg px-2 py-1.5 text-[10px] font-bold"
                          />
                        </div>
                        <div>
                          <label className="block text-slate-400 font-bold text-[9px] mb-0.5 uppercase cursor-default" title="CheckDeviceUpdatedTime">Cập nhật lúc</label>
                          <input
                            type="text"
                            disabled
                            value={formatDateTime(new Date().toISOString())}
                            className="w-full bg-slate-50 text-slate-400 border border-slate-200 rounded-lg px-2 py-1.5 text-[10px] font-mono cursor-default"
                          />
                        </div>
                      </div>

                    </div>
                  </div>
                )}

                        </div>
                      </div>
                    </div>
                  );
                })()}

                {/* Inline Errors & Successes inside details view */}
                {errorMsg && (
                  <div className="bg-rose-50 border border-rose-200 text-rose-800 px-4 py-2.5 rounded-xl flex items-center gap-2 text-xs font-bold shrink-0">
                    <AlertTriangle className="w-4.5 h-4.5 shrink-0" />
                    <span>{errorMsg}</span>
                  </div>
                )}

                {successMsg && (
                  <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 px-4 py-2.5 rounded-xl flex items-center gap-2 text-xs font-bold shrink-0">
                    <CheckCircle className="w-4.5 h-4.5 shrink-0" />
                    <span>{successMsg}</span>
                  </div>
                )}

              </div>

              {/* Mobile Save Footer Bar (Single scrollable row) */}
              <div className="flex lg:hidden items-center gap-1.5 p-2 bg-slate-50 border-t border-slate-200 overflow-x-auto whitespace-nowrap shrink-0 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
                {/* 1. Back button (moved from top) */}
                <button
                  type="button"
                  onClick={handleCloseSchedulingView}
                  className="bg-white hover:bg-slate-100 border border-slate-350 text-slate-700 font-extrabold text-[10.5px] px-3.5 py-1.5 rounded-xl transition flex items-center justify-center shrink-0 shadow-xs cursor-pointer"
                >
                  ←
                </button>

                {/* 2. Hồ sơ */}
                {(() => {
                  const pat = findPatientByKey(patients, selectedConsult.PatientKey);
                  if (!pat) return null;
                  return (
                    <button
                      type="button"
                      onClick={() => {
                        if (onViewPatientRecord) {
                          onViewPatientRecord(pat);
                        }
                      }}
                      className="bg-indigo-50 hover:bg-indigo-100 text-[#d2145a] border border-indigo-200 font-bold text-[10.5px] px-3.5 py-1.5 rounded-xl transition flex items-center gap-1 shrink-0 shadow-xs cursor-pointer"
                    >
                      <Heart className="w-3.5 h-3.5" /> Hồ sơ
                    </button>
                  );
                })()}

                {/* 3. Tóm tắt */}
                <button
                  type="button"
                  onClick={() => setShowSummaryModal(true)}
                  className="bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-250 font-bold text-[10.5px] px-3.5 py-1.5 rounded-xl transition flex items-center gap-1 shrink-0 shadow-xs cursor-pointer"
                >
                  <Clipboard className="w-3.5 h-3.5 text-emerald-700" /> Tóm tắt
                </button>

                {/* 4. SMS */}
                {(() => {
                  const pat = findPatientByKey(patients, selectedConsult.PatientKey);
                  if (!pat) return null;
                  return (
                    <button
                      type="button"
                      onClick={() => handleOpenSmsModal(pat)}
                      className="bg-rose-50 hover:bg-rose-100 text-[#d2145a] border border-rose-200 font-bold text-[10.5px] px-3.5 py-1.5 rounded-xl transition flex items-center gap-1 shrink-0 shadow-xs cursor-pointer"
                    >
                      <PhoneCall className="w-3.5 h-3.5" /> SMS
                    </button>
                  );
                })()}

                {/* 5. Loại */}
                <button
                  type="button"
                  onClick={handleActionLoai}
                  className="bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 font-bold text-[10.5px] px-3.5 py-1.5 rounded-xl transition flex items-center gap-1 shrink-0 shadow-xs cursor-pointer"
                >
                  Loại
                </button>

                {/* 6. Chuyển phòng TT */}
                <button
                  type="button"
                  onClick={handleActionTransfer}
                  className="bg-sky-50 text-sky-800 border border-sky-200 font-bold text-[10.5px] px-3.5 py-1.5 rounded-xl transition flex items-center gap-1 shrink-0 shadow-xs hover:bg-sky-100 cursor-pointer"
                >
                  Chuyển phòng TT
                </button>

                {/* 7. Đóng */}
                <button
                  type="button"
                  onClick={handleCloseSchedulingView}
                  className="bg-white hover:bg-slate-100 border border-slate-200 text-slate-500 font-bold text-[10.5px] px-3.5 py-1.5 rounded-xl transition flex items-center gap-1 shrink-0 shadow-xs cursor-pointer"
                >
                  Đóng
                </button>

                {/* 8. Lưu */}
                <button
                  type="submit"
                  disabled={saving}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold text-[10.5px] px-4 py-1.5 rounded-xl shadow-xs transition flex items-center justify-center gap-1 shrink-0 disabled:opacity-50 cursor-pointer"
                >
                  {saving ? 'Đang lưu...' : 'Lưu'}
                </button>
              </div>

              {/* Desktop Save Footer Bar */}
              <div className="hidden lg:flex p-4 border-t border-slate-105 bg-slate-50 flex-row justify-between gap-3 shrink-0 flex-wrap">
                <div className="flex gap-2 items-center flex-wrap">
                  {/* Xem hồ sơ */}
                  {(() => {
                    const pat = findPatientByKey(patients, selectedConsult.PatientKey);
                    if (!pat) return null;
                    return (
                      <button
                        type="button"
                        onClick={() => {
                          if (onViewPatientRecord) {
                            onViewPatientRecord(pat);
                          }
                        }}
                        className="bg-indigo-50 hover:bg-indigo-100 text-[#d2145a] border border-indigo-200 font-bold text-[10.5px] px-3.5 py-1.5 rounded-xl transition flex items-center gap-1 cursor-pointer shadow-xs"
                        title="Xem hồ sơ bệnh án chi tiết trong danh sách bệnh nhi"
                      >
                        <Heart className="w-3.5 h-3.5" /> Xem hồ sơ
                      </button>
                    );
                  })()}

                  {/* Tóm tắt */}
                  <button
                    type="button"
                    onClick={() => setShowSummaryModal(true)}
                    className="bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-250 font-bold text-[10.5px] px-3.5 py-1.5 rounded-xl transition flex items-center gap-1 cursor-pointer shadow-xs"
                    title="Hiển thị tóm tắt ngắn để chụp màn hình / gửi nhóm"
                  >
                    <Clipboard className="w-3.5 h-3.5 text-emerald-700" /> Tóm tắt
                  </button>

                  {(() => {
                    const pat = findPatientByKey(patients, selectedConsult.PatientKey);
                    if (!pat) return null;
                    return (
                      <button
                        type="button"
                        onClick={() => handleOpenSmsModal(pat)}
                        className="bg-rose-50 hover:bg-rose-100 text-[#d2145a] border border-rose-200 font-bold text-[10.5px] px-3.5 py-1.5 rounded-xl transition flex items-center gap-1 cursor-pointer shadow-xs"
                        title="Tạo nội dung SMS thông báo kết quả hội chẩn và lịch can thiệp để copy gửi thân nhân"
                      >
                        <PhoneCall className="w-3.5 h-3.5" /> Gửi tin nhắn SMS
                      </button>
                    );
                  })()}

                  <div className="h-4 w-px bg-slate-300 mx-1 hidden sm:block"></div>

                  <button
                    type="button"
                    onClick={handleActionLoai}
                    className="bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 font-bold text-[10.5px] px-3.5 py-1.5 rounded-xl transition flex items-center gap-1 cursor-pointer shadow-xs"
                    title="Loại bệnh nhân khỏi danh sách chờ"
                  >
                     Loại
                  </button>

                  <button
                    type="button"
                    onClick={handleActionTransfer}
                    className="bg-sky-50 text-sky-850 border border-sky-200 font-bold text-[10.5px] px-3.5 py-1.5 rounded-xl transition flex items-center gap-1 shadow-xs hover:bg-sky-100 cursor-pointer"
                    title="Chuyển phòng thông tim. Ca vẫn được giữ trong Lịch thông tim dự kiến"
                  >
                     Chuyển phòng TT
                  </button>
                </div>

                <div className="flex flex-row gap-3 w-auto">
                  <button
                    type="button"
                    onClick={handleCloseSchedulingView}
                    className="px-4 py-2.5 text-xs font-bold text-slate-500 hover:text-slate-800 hover:bg-slate-200/50 rounded-2xl cursor-pointer transition min-h-[44px]"
                  >
                    Đóng lại
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold px-6 py-2.5 rounded-2xl shadow-xs text-xs cursor-pointer transition flex items-center justify-center gap-2 disabled:opacity-50 min-h-[44px]"
                  >
                    {saving ? 'Đang lưu...' : 'Lưu kết quả xếp lịch'}
                  </button>
                </div>
              </div>

            </form>
          )}
            </>
          ) : (
            <div className="flex flex-col flex-1 min-h-0 p-4 relative bg-white lg:h-full">
              <h3 className="font-extrabold text-[13px] uppercase tracking-wide text-slate-800 mb-4 flex items-center gap-2 shrink-0">
                <Filter className={`w-5 h-5 ${isDeviceFilterExpanded ? 'text-teal-600' : 'text-emerald-600'}`}/> {isDeviceFilterExpanded ? `DANH SÁCH DỰ TRÙ DỤNG CỤ (${deviceFilteredConsults.length} ca)` : `DANH SÁCH BỆNH NHÂN DỰ KIẾN THÔNG TIM (${exportFilteredConsults.length} ca)`}
              </h3>
              
              <div className="flex-1 min-h-0 overflow-x-auto overflow-y-auto border border-slate-200 rounded-xl custom-scrollbar">
                <table className="w-full text-left border-collapse min-w-[1200px]">
                  <thead className={`${isDeviceFilterExpanded ? 'bg-[#0d9488]' : 'bg-[#b31448]'} text-white text-[10px] uppercase font-black tracking-wider sticky top-0 z-10`}>
                    <tr>
                      <th className={`p-3 border-b ${isDeviceFilterExpanded ? 'border-teal-700' : 'border-rose-800'} w-12 text-center`}>STT</th>
                      <th className={`p-3 border-b ${isDeviceFilterExpanded ? 'border-teal-700' : 'border-rose-800'} w-32`}>Ngày thông tim</th>
                      <th className={`p-3 border-b ${isDeviceFilterExpanded ? 'border-teal-700' : 'border-rose-800'} w-48`}>Mã NB / Họ tên / Ngày sinh</th>
                      <th className={`p-3 border-b ${isDeviceFilterExpanded ? 'border-teal-700' : 'border-rose-800'} w-64`}>Chẩn đoán / ICD</th>
                      <th className={`p-3 border-b ${isDeviceFilterExpanded ? 'border-teal-700' : 'border-rose-800'} min-w-[150px]`}>{isDeviceFilterExpanded ? 'Dụng cụ dự kiến' : 'Kết quả Staff'}</th>
                      {isDeviceFilterExpanded && (
                        <>
                          <th className="p-3 border-b border-teal-700 w-48">Phòng mổ phản hồi</th>
                          <th className="p-3 border-b border-teal-700 w-48">Phòng vật tư phản hồi</th>
                        </>
                      )}
                      <th className={`p-3 border-b ${isDeviceFilterExpanded ? 'border-teal-700' : 'border-rose-800'} w-48`}>PTV (Chính - Phụ 1 - Phụ 2)</th>
                    </tr>
                  </thead>
                  <tbody className="text-[11px] font-bold text-slate-700 divide-y divide-slate-100">
                    {(isDeviceFilterExpanded ? deviceFilteredConsults : exportFilteredConsults).map((c, idx) => {
                      const p = findPatientByKey(patients, c.PatientKey);
                      const ptvList = [c.Scheduled1stInterventionist, c.Scheduled2ndInterventionist, c.Scheduled3rdInterventionist].filter(Boolean).join(' - ');
                      
                      const vnDays = ['Chủ Nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];
                      let dayOfWeekStr = '';
                      if (c.PlannedCathLabDate) {
                        const [yyyy, mm, dd] = c.PlannedCathLabDate.split('-');
                        if (yyyy && mm && dd) {
                          const dateObj = new Date(parseInt(yyyy), parseInt(mm) - 1, parseInt(dd));
                          dayOfWeekStr = vnDays[dateObj.getDay()];
                        }
                      }

                      return (
                        <tr key={c.ConsultKey} className="hover:bg-rose-50/30 transition">
                          <td className="p-3 text-center">{idx + 1}</td>
                          <td className="p-3 font-mono text-emerald-700">
                            <span className="block">{formatVNTime(c.PlannedCathLabDate)}</span>
                            {dayOfWeekStr && <span className="block text-[9px] text-slate-500 font-sans font-bold mt-1">({dayOfWeekStr})</span>}
                          </td>
                          <td className="p-3">
                            <span className="text-[12px] font-extrabold uppercase text-slate-900 block">{p?.PatientName}</span>
                            <span className="text-[9px] text-[#b31448] font-mono block mt-0.5">{p?.PatientDOB ? formatVNTime(p.PatientDOB) : ''}</span>
                          </td>
                          <td className="p-3">
                            <span className="text-[10px] text-pink-700 font-mono font-extrabold bg-pink-100 px-1 py-0.5 rounded mr-1">ICD: {c.DiagnosisID}</span>
                            <span className="block mt-1 whitespace-pre-wrap">{c.DetailDiagnosis}</span>
                          </td>
                          <td className="p-3">
                            {isDeviceFilterExpanded && c.PlannedDevice ? (
                              <>
                                <span className="text-teal-700 font-extrabold block uppercase tracking-wide text-[9px] mb-1"><CheckCircle className="w-3 h-3 inline mr-1 -mt-0.5" /> Dụng cụ dự trù</span>
                                <span className="block text-slate-800 whitespace-pre-wrap">{c.PlannedDevice}</span>
                              </>
                            ) : (
                              <>
                                <span className="text-indigo-700 block">{c.ConsultResultID}</span>
                                {c.DetailConsultResult && <span className="block mt-1 text-slate-500 whitespace-pre-wrap font-normal text-[10px]">{c.DetailConsultResult}</span>}
                              </>
                            )}
                          </td>
                          {isDeviceFilterExpanded && (
                            <>
                              <td className="p-3">
                                <span className="block text-slate-600 font-semibold whitespace-pre-wrap text-[10px]">{c.OperationFeedback || '—'}</span>
                              </td>
                              <td className="p-3">
                                <span className="block text-slate-600 font-semibold whitespace-pre-wrap text-[10px]">{c.SupplyDepFeedback || '—'}</span>
                              </td>
                            </>
                          )}
                          <td className="p-3 whitespace-pre-wrap leading-relaxed">
                            {ptvList || <span className="text-slate-400 italic">Chưa xếp người</span>}
                          </td>
                        </tr>
                      );
                    })}
                    {(isDeviceFilterExpanded ? deviceFilteredConsults : exportFilteredConsults).length === 0 && (
                      <tr>
                        <td colSpan={isDeviceFilterExpanded ? 8 : 6} className="p-8 text-center text-slate-400 italic font-semibold">
                          Không có ca bệnh nào trong khoảng thời gian được chọn. Hãy chọn một khoảng thời gian khác ở bộ lọc bên phải.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

          </div>
        </div>

        {/* Right Collapsible Panels Container */}
        <div className={`shrink-0 flex flex-col gap-4 self-start h-full min-h-0 w-full lg:w-auto ${
          pureCalendarMode ? 'hidden' : ''
        } ${
          isFilterExpanded || isDeviceFilterExpanded
            ? 'fixed inset-0 z-40 p-3 bg-slate-50/95 backdrop-blur-[1px] lg:relative lg:inset-auto lg:z-auto lg:p-0 lg:bg-transparent'
            : 'hidden lg:flex'
        }`}>
          
          {/* Mobile close for filter overlay */}
          {(isFilterExpanded || isDeviceFilterExpanded) && (
            <div className="lg:hidden flex justify-end shrink-0">
              <button
                type="button"
                onClick={() => {
                  setIsFilterExpanded(false);
                  setIsDeviceFilterExpanded(false);
                }}
                className="px-3 py-1.5 rounded-xl bg-white border border-slate-200 text-xs font-bold text-slate-600"
              >
                Đóng bộ lọc
              </button>
            </div>
          )}

          {/* Export Schedule Panel */}
          <div className={`transition-all duration-300 bg-white border border-slate-200 rounded-3xl shadow-sm flex flex-col ${isFilterExpanded ? 'w-full lg:w-[320px] flex-1 min-h-0' : 'hidden lg:flex lg:w-[52px]'}`}>
            {!isFilterExpanded ? (
              <div 
                className="flex flex-col items-center py-5 cursor-pointer hover:bg-slate-50 transition rounded-3xl"
                onClick={() => {
                  setIsFilterExpanded(true);
                  setIsDeviceFilterExpanded(false);
                }}
              >
                <div className="bg-slate-100 p-2.5 rounded-2xl text-slate-500 mb-6 hover:bg-indigo-50 hover:text-indigo-600 transition">
                  <Filter className="w-5 h-5" />
                </div>
                <div className="flex flex-col items-center justify-start">
                  <span className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-400" style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}>
                    BỘ LỌC XUẤT LỊCH
                  </span>
                </div>
              </div>
            ) : (
              <div className="flex flex-col relative h-full min-h-0">
                <div className="p-4 border-b border-slate-100 bg-[#b31448] text-white rounded-t-3xl flex justify-between items-center shrink-0">
                  <h3 className="font-black text-[12px] uppercase tracking-wider flex items-center gap-2">
                    <Filter className="w-4 h-4" /> BỘ LỌC XUẤT LỊCH
                  </h3>
                  <button 
                    onClick={() => setIsFilterExpanded(false)}
                    className="p-1 hover:bg-[#80072d] rounded-lg transition"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="p-5 overflow-y-auto space-y-6 flex-1">
                  <div>
                    <label className="block text-slate-500 font-bold text-[10px] uppercase mb-2 flex items-center gap-1.5">
                      <CalendarDays className="w-4 h-4" /> Chọn ngày đầu tuần
                    </label>
                    <div className="relative">
                      <input
                        type="date"
                        value={exportStartDate}
                        onClick={(e: any) => e.target.showPicker && e.target.showPicker()}
                        onChange={(e) => setExportStartDate(e.target.value)}
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                      />
                      <div className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2.5 font-extrabold text-xs text-slate-800 flex justify-between items-center pointer-events-none shadow-sm">
                        <span className={exportStartDate ? 'text-slate-800' : 'text-slate-400'}>
                          {exportStartDate ? exportStartDate.split('-').reverse().join(' / ') : 'dd / mm / yyyy'}
                        </span>
                        <CalendarDays className="w-4 h-4 text-emerald-600" />
                      </div>
                    </div>
                    {exportEndDateStr && (
                      <p className="mt-2 text-[10.5px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-100 p-2 rounded-lg">
                        Lọc từ ngày: <strong>{exportStartDate.split('-').reverse().join('/')}</strong> <br/>
                        Đến ngày: <strong>{exportEndDateStr.split('-').reverse().join('/')}</strong> (+7 ngày)
                      </p>
                    )}
                  </div>
                </div>

                <div className="p-4 border-t border-slate-100 shrink-0 bg-slate-50 rounded-b-3xl space-y-3">
                  <p className="text-[10px] font-semibold text-slate-500 flex justify-between">
                    <span>Tổng số ca tìm thấy:</span>
                    <span className="font-black text-[#d2145a] text-[12px]">{exportFilteredConsults.length}</span>
                  </p>
                  {errorMsg && (
                    <div className="px-3 py-2 bg-rose-50 border border-rose-200 text-rose-700 text-[10px] rounded flex items-center gap-1">
                      <span>{errorMsg}</span>
                    </div>
                  )}
                  <button
                    onClick={handleExportExcel}
                    className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-black py-3 rounded-xl transition flex justify-center items-center gap-2 transform active:scale-[0.98] cursor-pointer"
                  >
                    <Download className="w-4 h-4" />
                    XUẤT EXCEL (XLSX)
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Device Export Panel */}
          <div className={`transition-all duration-300 bg-white border border-slate-200 rounded-3xl shadow-sm flex flex-col ${isDeviceFilterExpanded ? 'w-full lg:w-[320px] flex-1 min-h-0' : 'hidden lg:flex lg:w-[52px]'}`}>
            {!isDeviceFilterExpanded ? (
               <div className="flex flex-col items-center py-5 cursor-pointer hover:bg-slate-50 transition rounded-3xl" onClick={() => { setIsDeviceFilterExpanded(true); setIsFilterExpanded(false); }}>
                 <div className="bg-slate-100 p-2.5 rounded-2xl text-slate-500 mb-6 hover:bg-[#0d9488] hover:text-white transition">
                   <Filter className="w-5 h-5" />
                 </div>
                 <div className="flex flex-col items-center justify-start">
                   <span className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-400" style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}>
                     BỘ LỌC DUYỆT DỤNG CỤ
                   </span>
                 </div>
               </div>
            ) : (
               <div className="flex flex-col relative h-full min-h-0">
                 <div className="p-4 border-b border-slate-100 bg-[#0d9488] text-white rounded-t-3xl flex justify-between items-center shrink-0">
                    <h3 className="font-black text-[12px] uppercase tracking-wider flex items-center gap-2">
                      <Filter className="w-4 h-4" /> BỘ LỌC DUYỆT DỤNG CỤ
                    </h3>
                    <button 
                      onClick={() => setIsDeviceFilterExpanded(false)}
                      className="p-1 hover:bg-[#0f766e] rounded-lg transition"
                    >
                      <X className="w-4 h-4" />
                    </button>
                 </div>
                 
                 <div className="p-4 overflow-y-auto space-y-3 flex-1 bg-white">
                   <div>
                     <label className="block text-slate-500 font-bold text-[10px] uppercase mb-1.5">Lọc theo ngày hội chẩn</label>
                     <div className="flex bg-slate-100 p-1 rounded-xl mb-2.5">
                       <button 
                         className={`flex-1 py-1 text-[10px] font-bold rounded-lg transition ${deviceDateType === 'all' ? 'bg-white shadow-sm text-slate-800' : 'text-slate-500 hover:text-slate-700'}`}
                         onClick={() => setDeviceDateType('all')}
                       >
                         Tất cả
                       </button>
                       <button 
                         className={`flex-1 py-1 text-[10px] font-bold rounded-lg transition ${deviceDateType === 'custom' ? 'bg-white shadow-sm text-slate-800' : 'text-slate-500 hover:text-slate-700'}`}
                         onClick={() => setDeviceDateType('custom')}
                       >
                         Tùy chọn
                       </button>
                       <button
                         className={`flex-1 py-1 text-[10px] font-bold rounded-lg transition ${deviceDateType === 'group' ? 'bg-white shadow-sm text-slate-800' : 'text-slate-500 hover:text-slate-700'}`}
                         onClick={() => setDeviceDateType('group')}
                       >
                         Theo nhóm
                       </button>
                     </div>
                     
                     {deviceDateType === 'all' ? null : deviceDateType === 'custom' ? (
                       <div className="flex gap-2">
                         <div className="flex-1">
                           <div className="relative w-full">
                             <input 
                               type="date" 
                               value={deviceStartDate} 
                               onClick={(e: any) => e.target.showPicker && e.target.showPicker()} 
                               onChange={e => setDeviceStartDate(e.target.value)} 
                               className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10" 
                             />
                             <div className="w-full bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1 text-[10px] font-bold text-slate-700 flex items-center justify-between min-h-[24px]">
                               <span>{deviceStartDate ? formatVNTime(deviceStartDate) : 'Từ ngày'}</span>
                               <Calendar className="w-3 h-3 text-slate-400 shrink-0" />
                             </div>
                           </div>
                         </div>
                         <div className="flex-1">
                            <div className="relative w-full">
                              <input 
                                type="date" 
                                value={deviceEndDate} 
                                onClick={(e: any) => e.target.showPicker && e.target.showPicker()} 
                                onChange={e => setDeviceEndDate(e.target.value)} 
                                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10" 
                              />
                              <div className="w-full bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1 text-[10px] font-bold text-slate-700 flex items-center justify-between min-h-[24px]">
                                <span>{deviceEndDate ? formatVNTime(deviceEndDate) : 'Đến ngày'}</span>
                                <Calendar className="w-3 h-3 text-slate-400 shrink-0" />
                              </div>
                            </div>
                         </div>
                       </div>
                     ) : (
                       <div className="flex gap-2">
                         <select value={deviceGroupType} onChange={(e: any) => { setDeviceGroupType(e.target.value); setDeviceGroupValue('1'); }} className="w-1/3 bg-slate-50 border border-slate-200 rounded-xl px-2 py-1 text-[10px] font-bold">
                           <option value="month">Tháng</option>
                           <option value="quarter">Quý</option>
                         </select>
                         <select value={deviceGroupValue} onChange={e => setDeviceGroupValue(e.target.value)} className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-2 py-1 text-[10px] font-bold">
                           {deviceGroupType === 'month' ? (
                             [...Array(12)].map((_, i) => <option key={i+1} value={i+1}>Tháng {i+1}</option>)
                           ) : (
                             [...Array(4)].map((_, i) => <option key={i+1} value={i+1}>Quý {i+1}</option>)
                           )}
                         </select>
                       </div>
                     )}
                   </div>

                   <div>
                     <label className="block text-slate-500 font-bold text-[10px] uppercase mb-1.5 flex items-center gap-1.5">
                       Lọc theo trạng thái dụng cụ
                     </label>
                     <select 
                       value={deviceCheckFilter} 
                       onChange={(e: any) => setDeviceCheckFilter(e.target.value)}
                       className="w-full bg-white border border-slate-200 rounded-xl px-2 py-1.5 text-[11px] font-bold text-slate-800"
                     >
                       <option value="all">Tất cả</option>
                       <option value="enough">Đủ</option>
                       <option value="missing">Thiếu</option>
                     </select>
                   </div>
                 </div>

                 {/* Preview */}
                  <div className="p-3 border-t border-slate-100 bg-slate-50 rounded-b-3xl shrink-0">
                    <p className="text-[10px] font-semibold text-slate-500 flex justify-between mb-2">
                      <span>Tổng số ca tìm thấy:</span>
                      <span className="font-black text-[#0d9488] text-[12px]">{deviceFilteredConsults.length}</span>
                    </p>
                    {errorMsg && (
                      <div className="mb-2 px-3 py-1.5 bg-rose-50 border border-rose-200 text-rose-700 text-[10px] rounded flex items-center gap-1">
                        <span>{errorMsg}</span>
                      </div>
                    )}
                    <button
                      onClick={handleExportDeviceExcel}
                      className="w-full bg-[#0d9488] hover:bg-[#0f766e] text-white font-black py-2.5 rounded-xl transition flex justify-center items-center gap-2 transform active:scale-[0.98] cursor-pointer"
                    >
                      <Download className="w-4 h-4" />
                      XUẤT EXCEL DỤNG CỤ
                    </button>
                    <button
                      onClick={() => setShowImportModal(true)}
                      className={`w-full mt-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 font-black py-2.5 rounded-xl transition flex justify-center items-center gap-2 transform active:scale-[0.98] cursor-pointer`}
                    >
                      <Upload className="w-4 h-4" />
                      + NHẬP DỤNG CỤ
                    </button>
                    <input 
                      type="file" 
                      accept=".xlsx" 
                      className="hidden" 
                      ref={fileInputRef}
                      onChange={handleImportDeviceExcel} 
                    />
                  </div>
               </div>
            )}
          </div>
        </div>
      </div>

      {/* EXIT SCHEDULING CONFIRM MODAL */}
      {exitConfirmOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-[75] flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden animate-in zoom-in-95">
            <div className="py-3 px-4 flex items-center gap-2 bg-amber-50 border-b border-amber-100">
              <AlertTriangle className="w-5 h-5 text-amber-600" />
              <h3 className="font-extrabold text-[13px] uppercase tracking-wide text-amber-900">Thay đổi chưa lưu</h3>
            </div>
            <div className="p-5 space-y-3">
              <p className="text-sm font-semibold text-slate-700 leading-relaxed">
                Bạn có thay đổi chưa được lưu. Bạn có muốn lưu kết quả xếp lịch không?
              </p>
              <p className="text-[11px] text-slate-500 font-semibold">
                Có thể lưu bất kỳ trường nào đã nhập. Nút &quot;Chuyển phòng TT&quot; có thể thực hiện bất cứ lúc nào mà không cần đủ Kiểm dụng cụ, Trạng thái gọi bệnh hay Ngày thông dự kiến.
              </p>
              {exitConfirmError && (
                <div className="p-3 bg-red-50 text-red-700 border border-red-200 rounded-xl text-xs font-semibold">
                  {exitConfirmError}
                </div>
              )}
            </div>
            <div className="p-4 border-t border-slate-100 bg-slate-50 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={handleExitCancel}
                className="px-4 py-2 font-bold text-xs bg-white border border-slate-200 rounded-xl text-slate-600 hover:bg-slate-100 transition shadow-sm cursor-pointer"
              >
                Ở lại
              </button>
              <button
                type="button"
                onClick={handleExitDiscard}
                disabled={saving}
                className="px-4 py-2 font-bold text-xs bg-white border border-slate-300 rounded-xl text-slate-700 hover:bg-slate-100 transition shadow-sm cursor-pointer disabled:opacity-50"
              >
                Không lưu
              </button>
              <button
                type="button"
                onClick={handleExitSave}
                disabled={saving}
                className="px-4 py-2 font-bold text-xs text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-sm transition disabled:opacity-50 cursor-pointer"
              >
                {saving ? 'Đang lưu...' : 'Lưu'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ACTION CONFIRM MODAL */}
      {actionConfirm && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-[70] flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm overflow-hidden animate-in zoom-in-95">
            <div className={`py-3 px-4 flex items-center gap-2 ${actionConfirm.type === 'loai' ? 'bg-rose-50 border-b border-rose-100' : actionConfirm.type === 'save_schedule' ? 'bg-emerald-50 border-b border-emerald-100' : actionConfirm.type === 'ad_hoc_override' ? 'bg-indigo-50 border-b border-indigo-100' : 'bg-sky-50 border-b border-sky-100'}`}>
               <AlertTriangle className={`w-5 h-5 ${actionConfirm.type === 'loai' ? 'text-rose-600' : actionConfirm.type === 'save_schedule' ? 'text-emerald-600' : actionConfirm.type === 'ad_hoc_override' ? 'text-indigo-600' : 'text-sky-600'}`} />
               <h3 className={`font-extrabold text-[13px] uppercase tracking-wide ${actionConfirm.type === 'loai' ? 'text-rose-900' : actionConfirm.type === 'save_schedule' ? 'text-emerald-900' : actionConfirm.type === 'ad_hoc_override' ? 'text-indigo-900' : 'text-sky-900'}`}>{actionConfirm.title}</h3>
            </div>
            <div className="p-5">
              <p className="text-sm font-semibold text-slate-700">{actionConfirm.message}</p>
            </div>
            <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-end gap-3">
               <button onClick={() => setActionConfirm(null)} className="px-4 py-2 font-bold text-xs bg-white border border-slate-200 rounded-xl text-slate-600 hover:bg-slate-100 transition shadow-sm cursor-pointer">
                  Hủy bỏ
               </button>
               <button onClick={handleExecuteActionConfirm} disabled={saving} className={`px-4 py-2 font-bold text-xs text-white rounded-xl shadow-sm transition disabled:opacity-50 cursor-pointer ${actionConfirm.type === 'loai' ? 'bg-[#d2145a] hover:bg-rose-700' : actionConfirm.type === 'save_schedule' ? 'bg-emerald-600 hover:bg-emerald-700' : actionConfirm.type === 'ad_hoc_override' ? 'bg-indigo-600 hover:bg-indigo-700' : 'bg-sky-600 hover:bg-sky-700'}`}>
                  {saving ? 'Đang thực hiện...' : actionConfirm.type === 'save_schedule' ? 'Đồng ý lưu' : 'Đồng ý'}
               </button>
            </div>
          </div>
        </div>
      )}

      {successMsg && (
        <div className="fixed top-5 right-5 z-[80] max-w-sm rounded-2xl border border-emerald-200 bg-white shadow-xl px-4 py-3 text-sm font-bold text-emerald-800 flex items-start gap-2 animate-in fade-in slide-in-from-top-2 duration-200">
          <CheckCircle className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* ACTION ALERT MODAL */}
      {actionAlert && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-[70] flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm overflow-hidden animate-in zoom-in-95">
            <div className="py-3 px-4 flex items-center gap-2 bg-amber-50 border-b border-amber-100">
               <AlertTriangle className="w-5 h-5 text-amber-600" />
               <h3 className="font-extrabold text-[13px] uppercase tracking-wide text-amber-900">Lưu ý</h3>
            </div>
            <div className="p-5">
               <p className="text-sm font-semibold text-slate-700">{actionAlert}</p>
            </div>
            <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-end">
               <button onClick={() => setActionAlert('')} className="px-5 py-2 font-bold text-xs bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl shadow-sm transition cursor-pointer">
                  Đã hiểu
               </button>
            </div>
          </div>
        </div>
      )}

      {/* IMPORT MODAL */}
      {showImportModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-[70] flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden animate-in zoom-in-95">
            <div className="py-4 px-5 flex justify-between items-center bg-slate-50 border-b border-slate-100">
               <h3 className="font-black text-sm uppercase tracking-wide text-slate-800 flex items-center gap-2">
                 <Upload className="w-5 h-5 text-indigo-600" /> Nhập Dụng Cụ (Excel)
               </h3>
               <button onClick={() => setShowImportModal(false)} className="text-slate-400 hover:text-slate-600">
                 <X className="w-5 h-5" />
               </button>
            </div>
            
            <div className="p-6 space-y-6">
               {errorMsg && (
                <div className="p-3 bg-red-50 text-red-600 border border-red-200 rounded-lg text-xs font-semibold">
                  {errorMsg}
                </div>
               )}

               {/* Option 1: Browser Upload */}
               <div className="space-y-3">
                 <label className="block text-slate-700 font-bold text-sm">Cách 1: Tải lên từ máy (File .xlsx)</label>
                 <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={importingExcel}
                    className={`w-full bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-3 rounded-xl transition flex justify-center items-center gap-2 border border-slate-200 ${importingExcel ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                 >
                    <Upload className="w-4 h-4" /> Chọn File Từ Trình Duyệt
                 </button>
               </div>
               
               <div className="flex items-center gap-3">
                 <div className="h-px bg-slate-200 flex-1"></div>
                 <span className="text-xs font-bold text-slate-400 uppercase">Hoặc</span>
                 <div className="h-px bg-slate-200 flex-1"></div>
               </div>

               {/* Option 2: Drive URL Upload */}
               <div className="space-y-3">
                 <label className="block text-slate-700 font-bold text-sm">Cách 2: Tải từ Google Drive</label>
                 <p className="text-[11px] text-slate-500 font-medium">Link Google Sheets (Yêu cầu bật: <span className="font-semibold px-1 py-0.5 bg-slate-100 rounded text-slate-600">Bất kỳ ai có liên kết đều có thể xem</span>)</p>
                 <input 
                   type="text"
                   placeholder="https://docs.google.com/spreadsheets/d/..."
                   value={importDriveUrl}
                   onChange={(e) => setImportDriveUrl(e.target.value)}
                   className="w-full bg-white border border-slate-300 rounded-xl px-4 py-3 text-sm font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                 />
                 <button
                    onClick={handleImportFromDrive}
                    disabled={importingExcel || !importDriveUrl.trim()}
                    className={`w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 rounded-xl transition flex justify-center items-center gap-2 ${importingExcel || !importDriveUrl.trim() ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                 >
                    <Download className="w-4 h-4" /> 
                    {importingExcel ? 'Đang Xuất Excel...' : 'Nhập Dữ Liệu Từ Link'}
                 </button>
               </div>
            </div>
          </div>
        </div>
      )}

      {/* TÓM TẮT DIALOG MODAL */}
      {showSummaryModal && selectedConsult && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-[60] flex items-center justify-center p-4 animate-in fade-in duration-200">
          {(() => {
            const pat = findPatientByKey(patients, selectedConsult.PatientKey);
            if (!pat) return null;
            
            const ptvPhu1Display = resolvePtvPhu1Display(
              selectedConsult.RequestBy || '',
              selectedConsult.Scheduled2ndInterventionist,
              scheduled2nd
            );

            const generateTextSummary = (pObj: Patient, cObj: Consult) => {
              const weightDisplay = selectedConsult?.PatientWeight ? `${selectedConsult.PatientWeight} kg` : '—';
              const heightDisplay = selectedConsult?.PatientHeight ? `${selectedConsult.PatientHeight} cm` : '—';
              const ageDesc = getPatientAgeDescription(pObj.PatientDOB) || '—';
              const addressDisplay = pObj.PatientAddress || (pObj as any).PatientAddress || '';
              const phoneList = [pObj.PatientPhone1, pObj.PatientPhone2].filter(Boolean).join(' | ');
              const ptvList = [scheduled1st, scheduled2nd, scheduled3rd].filter(Boolean);
              const ptvString = ptvList.length > 0 ? ptvList.join(' - ') : 'Chưa gán';

              return `📋 *THÔNG TIN TÓM TẮT XẾP LỊCH: ${formatPatientWithPtvPhu(pObj.PatientName.toUpperCase(), ptvPhu1Display).toUpperCase()}* 📋\n` +
                `-----------------------------------\n` +
                `👤 *HÀNH CHÍNH BỆNH NHÂN:*\n` +
                `- Họ và tên bệnh nhân: ${pObj.PatientName.toUpperCase()} (${pObj.PatientSex}, ${ageDesc})\n` +
                (pObj.OtherPatientName && String(pObj.OtherPatientName).trim() !== '' && pObj.OtherPatientName !== '-' ? `- Họ và tên khác: ${pObj.OtherPatientName.toUpperCase()}\n` : '') +
                `- Mã bệnh nhân (ID1): ${pObj.PatientID1}\n` +
                (pObj.PatientID2 && String(pObj.PatientID2).trim() !== '' && pObj.PatientID2 !== '-' ? `- Mã NB khác (ID2): ${pObj.PatientID2}\n` : '') +
                `- Số điện thoại liên hệ: ${phoneList || '—'}\n` +
                `- Địa chỉ thường trú: ${addressDisplay}\n` +
                `- Chỉ số bé: ${weightDisplay} / ${heightDisplay}\n\n` +
                `🩺 *ĐĂNG KÝ HỘI CHẨN & CHẨN ĐOÁN:*\n` +
                `- Ngày staff hội chẩn: ${formatVNTime(cObj.ConsultDate)}\n` +
                `- Người đăng ký hội chẩn: ${cObj.RequestBy || '—'}\n` +
                `- Chẩn đoán chi tiết: ${cObj.DetailDiagnosis || cObj.DiagnosisID || '—'}\n` +
                `- Phương pháp đã duyệt: ${selectedMethods.length > 0 ? selectedMethods.join('; ') : '—'}\n\n` +
                `🛠 *CHUẨN BỊ DỤNG CỤ:*\n` +
                `- Kiểm dụng cụ: ${checkDevice || 'Chưa kiểm'}\n` +
                `- Dụng cụ dự kiến: ${plannedDevice || '—'}\n` +
                `- Số tiền dự kiến: ${plannedPrice ? `${plannedPrice} VNĐ` : '—'}\n` +
                `- Ghi chú từ Phòng Vật tư: ${supplyDepFeedback || 'Không'}\n` +
                `- Ghi chú từ Phòng Mổ: ${operationFeedback || 'Không'}\n\n` +
                `📅 *THÔNG TIN CẬP NHẬT XẾP LỊCH:*\n` +
                `- Lịch thông tim chính thức: ${plannedCathLabDate ? formatVNTime(plannedCathLabDate) : 'Chưa xếp'}\n` +
                `- Trạng thái gọi bệnh nhân: ${callStatus || 'Chưa liên hệ'}\n` +
                `- Mức độ ưu tiên gọi bệnh: ${priorityOrder}\n` +
                `- PTV: ${ptvString}\n` +
                `- Lưu ý/ghi chú gọi bệnh: ${callNote || 'Không'}\n`;
            };

            const handleCopy = () => {
              const text = generateTextSummary(pat, selectedConsult);
              navigator.clipboard.writeText(text);
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            };

            const handleCopyImage = async () => {
              const el = document.getElementById('screenshot-summary-card');
              if (!el) return;
              setIsCopyingImage(true);

              const handleBlobResult = async (blob: Blob, sourceCanvas?: HTMLCanvasElement) => {
                try {
                  if (!navigator.clipboard || !navigator.clipboard.write || typeof ClipboardItem === 'undefined') {
                    throw new Error('Trình duyệt không hỗ trợ sao chép ảnh trực tiếp.');
                  }
                  await navigator.clipboard.write([
                    new ClipboardItem({
                      [blob.type]: blob
                    })
                  ]);
                  setCopiedImageType('clipboard');
                  setCopiedImage(true);
                  setTimeout(() => setCopiedImage(false), 2550);
                  return true;
                } catch (clipboardErr) {
                  console.warn('Clipboard write failed, falling back to download:', clipboardErr);
                  const link = document.createElement('a');
                  link.download = `TomTatXepLich_${pat.PatientID1 || pat.PatientName}.png`;
                  
                  if (sourceCanvas) {
                    link.href = sourceCanvas.toDataURL('image/png');
                  } else {
                    link.href = URL.createObjectURL(blob);
                  }
                  
                  link.click();
                  if (!sourceCanvas) {
                    setTimeout(() => URL.revokeObjectURL(link.href), 100);
                  }

                  setCopiedImageType('download');
                  setCopiedImage(true);
                  setTimeout(() => setCopiedImage(false), 2550);
                  return true;
                }
              };

              try {
                // Try html-to-image first
                try {
                  console.log('Attempting to render using html-to-image...');
                  const blob = await htmlToImageBlob(el, {
                    backgroundColor: '#ffffff',
                    style: {
                      transform: 'scale(1)',
                      transformOrigin: 'top left',
                    },
                    pixelRatio: 2,
                    cacheBust: true,
                  });
                  if (blob) {
                    await handleBlobResult(blob);
                    return;
                  }
                  throw new Error('html-to-image returned empty blob');
                } catch (htmlToImageErr) {
                  console.warn('html-to-image failed, falling back to html2canvas:', htmlToImageErr);
                  
                  // Fallback to html2canvas
                  const html2canvasFn = typeof html2canvas === 'function' ? html2canvas : (html2canvas as any).default;
                  if (typeof html2canvasFn !== 'function') {
                    throw new Error('Thư viện chụp ảnh (html2canvas) chưa được tải đúng cách.');
                  }
                  const canvas = await html2canvasFn(el, {
                    backgroundColor: '#ffffff',
                    scale: 2,
                    logging: false,
                    useCORS: true
                  });
                  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
                  if (blob) {
                    await handleBlobResult(blob, canvas);
                    return;
                  }
                  throw new Error('html2canvas returned empty blob');
                }
              } catch (err: any) {
                console.error('Error copying image: ', err);
                setActionAlert(`Không thể tạo ảnh: ${err.message || String(err)}`);
              } finally {
                setIsCopyingImage(false);
              }
            };

            return (
              <div className="bg-slate-50/95 backdrop-blur-md rounded-3xl max-w-3xl w-full max-h-[95vh] overflow-y-auto shadow-2xl border border-slate-250 flex flex-col font-sans text-xs animate-in zoom-in-95 duration-200">
                {/* Header block of Modal */}
                <div className="p-4 border-b border-slate-200 bg-white flex items-center justify-between text-[#d2145a] shrink-0 rounded-t-3xl">
                  <div className="flex items-center gap-2">
                    <div className="bg-emerald-50 text-emerald-600 rounded-xl p-2">
                      <Clipboard className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="font-extrabold text-xs uppercase tracking-wider leading-tight">
                        Tóm tắt thông tin xếp lịch
                      </h3>
                      <p className="text-[9px] text-slate-400 font-bold uppercase mt-0.5">Dành cho copy / chụp ảnh màn hình gửi nhóm zalo</p>
                    </div>
                  </div>
                  <button 
                    type="button"
                    onClick={() => setShowSummaryModal(false)}
                    className="text-slate-400 hover:text-slate-600 transition cursor-pointer p-1.5 hover:bg-slate-100 rounded-xl outline-none"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                {/* Content printable/screenshot card with solid rigid constraints */}
                <div className="p-4 overflow-y-auto shrink-0">
                  <div id="screenshot-summary-card" className="bg-white border-2 border-slate-800 p-5 rounded-2xl space-y-3.5 text-slate-700 shadow-xs max-w-full shrink-0 select-text">
                    
                    {/* Header of summary */}
                    <div className="flex sm:flex-row flex-col sm:items-center justify-between gap-3 pb-3 border-b-2 border-slate-800">
                      <div className="bg-[#d2145a] text-white font-black text-sm uppercase tracking-wide px-3.5 py-1.5 rounded-xl shrink-0 max-w-full sm:max-w-[75%] break-words shadow-xs leading-snug">
                        {formatPatientWithPtvPhu(pat.PatientName, ptvPhu1Display)}
                      </div>
                      <div className="text-right shrink-0">
                        <div className="flex items-center gap-1.5 justify-start sm:justify-end">
                          <span className="text-[10px] text-slate-400 font-extrabold uppercase shrink-0">Mã NB:</span>
                          <span className="font-extrabold text-slate-850 font-mono text-sm tracking-wider bg-slate-100 px-2.5 py-1 rounded-lg border border-slate-200 shrink-0">{pat.PatientID1}</span>
                        </div>
                      </div>
                    </div>

                    {/* Box 1: THÔNG TIN HÀNH CHÍNH */}
                    <div className="bg-white border border-slate-700 rounded-xl p-3.5 space-y-2">
                      <span className="text-[10px] font-black uppercase text-slate-800 tracking-wider block border-b border-slate-200 pb-1">
                        THÔNG TIN HÀNH CHÍNH
                      </span>
                      {renderPatientAdminInfo(pat, 'print')}
                    </div>

                    {/* Box 2: THÔNG TIN ĐÃ ĐĂNG KÝ HỘI CHẨN */}
                    <div className="bg-white border border-slate-700 rounded-xl p-3.5 space-y-2">
                      <span className="text-[10px] font-black uppercase text-indigo-900 tracking-wider block border-b border-slate-200 pb-1">
                        THÔNG TIN ĐĂNG KÝ HỘI CHẨN
                      </span>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-2 text-[12px] pb-1">
                        <div>
                          <span className="text-slate-400 block font-bold text-[9px] uppercase tracking-wider">Ngày staff:</span>
                          <span className="font-bold text-slate-800 font-mono text-[12.5px]">{formatVNTime(selectedConsult.ConsultDate)}</span>
                        </div>
                        <div>
                          <span className="text-slate-400 block font-bold text-[9px] uppercase tracking-wider">Người đăng ký:</span>
                          <span className="font-extrabold text-slate-800 text-[12.5px]">{selectedConsult.RequestBy || '—'}</span>
                        </div>
                        <div>
                          <span className="text-slate-400 block font-bold text-[9px] uppercase tracking-wider">Cân nặng:</span>
                          <span className="font-extrabold text-slate-800 font-mono text-[12.5px]">{selectedConsult.PatientWeight ? `${selectedConsult.PatientWeight} kg` : '—'}</span>
                        </div>
                        <div>
                          <span className="text-slate-400 block font-bold text-[9px] uppercase tracking-wider">Chiều cao:</span>
                          <span className="font-semibold text-slate-700 font-mono text-[12.5px]">{selectedConsult.PatientHeight ? `${selectedConsult.PatientHeight} cm` : '—'}</span>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1.5 border-t border-slate-100">
                        <div>
                          <span className="text-slate-400 block font-bold text-[9px] uppercase tracking-wider mb-1">Chẩn đoán chi tiết:</span>
                          <div className="border border-slate-200 rounded-xl px-2.5 py-1.5 bg-slate-50 font-bold text-slate-800 text-[11.5px] leading-relaxed shadow-3xs min-h-[38px] flex items-center">
                            {selectedConsult.DetailDiagnosis || selectedConsult.DiagnosisID || '—'}
                          </div>
                        </div>
                        <div>
                          <span className="text-slate-400 block font-bold text-[9px] uppercase tracking-wider mb-1">Phương pháp đã duyệt:</span>
                          <div className="border border-slate-200 rounded-xl px-2.5 py-1.5 bg-indigo-50/30 text-indigo-950 font-bold text-[11.5px] leading-relaxed shadow-3xs min-h-[38px] flex items-center">
                            {selectedMethods.length > 0 ? selectedMethods.join('; ') : 'Chưa định phương pháp'}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Box 3 & 4 Grid: Left column Chuẩn bị dụng cụ / Right column Kết quả xếp lịch - Side by Side to save massive vertical space! */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                      
                      {/* Box 3: CHUẨN BỊ DỤNG CỤ */}
                      <div className="bg-white border border-slate-700 rounded-xl p-3.5 space-y-2.5 flex flex-col justify-between">
                        <div>
                          <span className="text-[10px] font-black uppercase text-rose-600 tracking-wider block border-b border-slate-200 pb-1 mb-1">
                            CHUẨN BỊ DỤNG CỤ VẬT TƯ
                          </span>
                          
                          <div className="space-y-1.5 text-[12.5px]">
                            <div className="flex justify-between items-center bg-slate-50 p-1 px-2 rounded-lg border border-slate-100">
                              <span className="text-slate-400 font-bold text-[9px] uppercase tracking-wider">Kiểm dụng cụ:</span>
                              <span className={`px-2 py-0.5 rounded-md text-[10px] font-black uppercase ${
                                checkDevice === 'Đủ' 
                                  ? 'bg-emerald-100 text-emerald-850 border border-emerald-200' 
                                  : checkDevice === 'Thiếu' 
                                    ? 'bg-rose-100 text-rose-850 border border-rose-200' 
                                    : 'bg-slate-100 text-slate-600 border border-slate-200'
                              }`}>
                                {checkDevice || 'Chưa kiểm'}
                              </span>
                            </div>
                            
                            <div className="flex justify-between items-start gap-2 border-b border-slate-105 pb-1.5 pt-0.5 px-1">
                              <span className="text-slate-400 font-bold text-[9px] uppercase tracking-wider shrink-0">Dụng cụ dự kiến:</span>
                              <span className="font-extrabold text-slate-800 text-[12.5px] text-right break-words max-w-[70%]">{plannedDevice || '—'}</span>
                            </div>

                            <div className="flex justify-between items-center border-b border-slate-105 pb-1.5 pt-0.5 px-1">
                              <span className="text-slate-400 font-bold text-[9px] uppercase tracking-wider">Số tiền dự kiến:</span>
                              <span className="font-black text-rose-650 font-mono text-[12.5px]">{plannedPrice ? `${plannedPrice} VNĐ` : '—'}</span>
                            </div>

                            {(supplyDepFeedback || operationFeedback) && (
                              <div className="bg-amber-50/20 border border-amber-200 p-1.5 rounded-lg text-[10px] text-amber-900 font-semibold leading-normal mt-1 truncate">
                                <span className="block font-black text-[8px] uppercase tracking-wider text-amber-800">Liên khoa phản hồi:</span>
                                {[supplyDepFeedback, operationFeedback].filter(Boolean).join(' | ')}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Box 4: KẾT QUẢ XẾP LỊCH CAN THIỆP */}
                      <div className="bg-white border border-slate-700 rounded-xl p-3.5 space-y-2.5 flex flex-col justify-between">
                        <div>
                          <span className="text-[10px] font-black uppercase text-emerald-600 tracking-wider block border-b border-slate-200 pb-1 mb-1">
                            KẾT QUẢ XẾP LỊCH CAN THIỆP
                          </span>
                          
                          <div className="space-y-1.5 text-[12.5px]">
                            <div className="flex justify-between items-center bg-slate-50 p-1 px-2 rounded-lg border border-slate-100">
                              <span className="text-slate-400 font-bold text-[9px] tracking-wider uppercase">Lịch can thiệp:</span>
                              <span className={`px-2 py-0.5 rounded-md text-[10px] font-black border uppercase ${
                                plannedCathLabDate 
                                  ? 'bg-emerald-100 border-emerald-300 text-emerald-850' 
                                  : 'bg-rose-100 border-rose-300 text-rose-850'
                              }`}>
                                {plannedCathLabDate ? formatVNTime(plannedCathLabDate) : 'Chưa xếp'}
                              </span>
                            </div>

                            <div className="flex justify-between items-center border-b border-slate-105 pb-1.5 pt-0.5 px-1">
                              <span className="text-slate-400 font-bold text-[9px] tracking-wider uppercase">Trạng thái gọi:</span>
                              <span className="font-bold text-slate-800 text-[12.5px]">{callStatus || '—'}</span>
                            </div>

                            <div className="flex justify-between items-start gap-2 border-b border-slate-105 pb-1.5 pt-0.5 px-1">
                              <span className="text-[#d2145a] font-black text-[9px] tracking-wider uppercase shrink-0">PTV:</span>
                              <span className="font-extrabold text-slate-850 uppercase text-[12.5px] text-right break-words max-w-[75%]">
                                {[scheduled1st, scheduled2nd, scheduled3rd].filter(Boolean).join(' - ') || 'Chưa gán'}
                              </span>
                            </div>

                            <div className="flex justify-between items-start gap-2 pt-0.5 px-1">
                              <span className="text-slate-400 font-bold text-[9px] tracking-wider uppercase shrink-0">Lưu ý / Ưu tiên:</span>
                              <span className="font-bold text-slate-800 text-[11.5px] text-right break-words max-w-[70%]" title={callNote ? `${priorityOrder} (${callNote})` : priorityOrder}>
                                {callNote ? `${priorityOrder} (${callNote})` : priorityOrder}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>

                    </div>

                  </div>
                </div>

                {/* Footer block of Modal */}
                <div className="p-4 border-t border-slate-200 bg-white flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0 rounded-b-3xl">
                  <span className="text-[9.5px] text-slate-400 font-semibold italic text-center sm:text-left leading-normal">
                    Mẹo: Bấm Sao chép hình ảnh rồi dùng Ctrl+V dán trực tiếp gửi nhóm Zalo vô cùng nhanh chóng!
                  </span>
                  
                  <div className="flex flex-wrap gap-2 w-full sm:w-auto shrink-0 justify-end">
                    <button
                      type="button"
                      onClick={() => setShowSummaryModal(false)}
                      className="px-4 py-2 border border-slate-200 text-xs font-bold text-slate-500 hover:text-slate-800 hover:bg-slate-50 rounded-xl transition cursor-pointer"
                    >
                      Đóng
                    </button>
                    <button
                      type="button"
                      disabled={isCopyingImage}
                      onClick={handleCopyImage}
                      className={`px-4 py-2 rounded-xl text-xs font-black uppercase text-white shadow-md transition cursor-pointer flex items-center justify-center gap-1.5 outline-none disabled:opacity-50 ${
                        copiedImage ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-slate-800 hover:bg-slate-900'
                      }`}
                    >
                      {isCopyingImage ? (
                        <>
                          <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin shrink-0"></div>
                          <span>Đang tạo ảnh...</span>
                        </>
                      ) : (
                        <>
                          <Check className="w-3.5 h-3.5 shrink-0" />
                          <span>{copiedImage ? (copiedImageType === 'download' ? 'Đã tải ảnh về!' : 'Đã copy ảnh!') : 'Sao chép Hình ảnh'}</span>
                        </>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={handleCopy}
                      className={`px-4 py-2 rounded-xl text-xs font-black uppercase text-white shadow-md transition cursor-pointer flex items-center justify-center gap-1.5 outline-none ${
                        copied ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-[#d2145a] hover:bg-pink-700'
                      }`}
                    >
                      <Check className="w-3.5 h-3.5 shrink-0" />
                      {copied ? 'Đã Copy text!' : 'Sao chép Tin nhắn'}
                    </button>
                  </div>
                </div>

              </div>
            );
          })()}
        </div>
      )}

      {/* SMS MESSAGE MODAL */}
      {showSmsModal && selectedConsult && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-[60] flex items-center justify-center p-4 animate-in fade-in duration-200">
          {(() => {
            const pat = findPatientByKey(patients, selectedConsult.PatientKey);
            if (!pat) return null;
            const hasPhone = Boolean(pat.PatientPhone1 || pat.PatientPhone2);
            return (
              <div className="bg-white rounded-3xl max-w-2xl w-full shadow-2xl border border-slate-250 flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
                <div className="p-4 border-b border-slate-200 bg-rose-50/60 flex items-center justify-between text-[#d2145a] shrink-0">
                  <div className="flex items-center gap-2.5">
                    <div className="bg-white text-[#d2145a] rounded-xl p-2 border border-rose-100 shadow-xs">
                      <PhoneCall className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="font-extrabold text-xs uppercase tracking-wider leading-tight">
                        Gửi tin nhắn SMS
                      </h3>
                      <p className="text-[9.5px] text-slate-500 font-bold mt-0.5">
                        Kiểm tra nội dung, copy rồi gửi thủ công qua SMS hoặc Zalo
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowSmsModal(false)}
                    className="text-slate-400 hover:text-slate-600 transition cursor-pointer p-1.5 hover:bg-white rounded-xl outline-none"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div className="p-5 space-y-4">
                  <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3.5">
                    <span className="block text-[9px] font-black uppercase tracking-wider text-slate-400 mb-2">
                      Số điện thoại thân nhân
                    </span>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                      <div className="bg-white border border-slate-200 rounded-xl px-3 py-2">
                        <span className="block text-[8.5px] font-bold uppercase text-slate-400">SĐT 1</span>
                        <span className="font-extrabold text-slate-850 font-mono">{pat.PatientPhone1 || '—'}</span>
                      </div>
                      <div className="bg-white border border-slate-200 rounded-xl px-3 py-2">
                        <span className="block text-[8.5px] font-bold uppercase text-slate-400">SĐT 2</span>
                        <span className="font-extrabold text-slate-850 font-mono">{pat.PatientPhone2 || '—'}</span>
                      </div>
                    </div>
                    {!hasPhone && (
                      <div className="mt-3 bg-amber-50 border border-amber-200 text-amber-800 px-3 py-2 rounded-xl text-[11px] font-bold">
                        Chưa có số điện thoại liên hệ. Vẫn có thể copy nội dung để gửi qua kênh khác.
                      </div>
                    )}
                  </div>

                  <div>
                    <label className="block text-slate-500 font-black text-[9.5px] uppercase mb-1.5">
                      Nội dung SMS có thể chỉnh sửa
                    </label>
                    <textarea
                      rows={11}
                      value={smsMessage}
                      onChange={(e) => setSmsMessage(e.target.value)}
                      className="w-full bg-white border border-slate-250 rounded-2xl px-3.5 py-3 focus:outline-none focus:ring-2 focus:ring-rose-200 text-xs text-slate-850 font-semibold leading-relaxed resize-y shadow-inner"
                    />
                  </div>
                </div>

                <div className="p-4 border-t border-slate-200 bg-slate-50 flex justify-between gap-3 shrink-0 flex-wrap">
                  <button
                    type="button"
                    onClick={() => setShowSmsModal(false)}
                    className="px-4 py-2 border border-slate-200 text-xs font-bold text-slate-500 hover:text-slate-800 hover:bg-white rounded-xl transition cursor-pointer"
                  >
                    Hủy
                  </button>
                  <button
                    type="button"
                    onClick={handleCopySmsMessage}
                    className={`px-4 py-2 rounded-xl text-xs font-black uppercase text-white shadow-md transition cursor-pointer flex items-center justify-center gap-1.5 outline-none ${
                      smsCopied ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-[#d2145a] hover:bg-pink-700'
                    }`}
                  >
                    <Clipboard className="w-3.5 h-3.5 shrink-0" />
                    {smsCopied ? 'Đã copy nội dung!' : 'Copy nội dung'}
                  </button>
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {/* AD-HOC SCHEDULING MODAL (XẾP BỔ SUNG) */}
      {showAdHocModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-[60] flex items-center justify-center p-3 overflow-hidden animate-in fade-in duration-200">
          <div className="bg-slate-50 rounded-3xl shadow-2xl border border-slate-205 w-full max-w-[min(1800px,99vw)] flex flex-col overflow-hidden animate-in zoom-in-95 duration-250 max-h-[94vh]">
            
            {/* Modal Header */}
            <div className="py-3 px-5 bg-indigo-900 text-white flex justify-between items-center shrink-0">
              <div className="flex items-center gap-3">
                <Plus className="w-5 h-5 text-indigo-300 shrink-0" />
                <h3 className="font-extrabold text-sm uppercase tracking-wider">Đăng ký xếp lịch thông tim bổ sung</h3>
              </div>
              <button 
                onClick={() => {
                  setShowAdHocModal(false);
                  handleClearSelectedPatient();
                }}
                className="p-1.5 hover:bg-indigo-950 rounded-lg text-indigo-300 hover:text-white transition text-sm cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleSaveAdHoc} className="flex-1 flex flex-col min-h-0 overflow-hidden" noValidate>
              
              <div className="p-4 overflow-y-auto flex-1 min-h-0">
                {adHocValidationMsg && (
                  <div className="mb-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-[13px] font-bold text-rose-800 flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                    <span>{adHocValidationMsg}</span>
                  </div>
                )}
                
                <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 items-start">
                  
                  {/* COLUMN 1: ĐĂNG KÝ BỆNH NHÂN */}
                    <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-2.5 shadow-sm">
                      <div className="border-b border-slate-100 pb-2 flex items-center justify-between">
                        <span className="text-xs font-black uppercase text-indigo-800 tracking-wider">
                          1. Đăng ký bệnh nhân
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            setAdHocPatientMode('new');
                            handleClearSelectedPatient();
                            setAdHocPendingConsult(null);
                          }}
                          className="bg-[#d2145a]/10 hover:bg-[#d2145a]/20 text-[#d2145a] font-extrabold px-3 py-1 rounded-lg text-[11px] transition flex items-center gap-1 cursor-pointer"
                        >
                          <Plus className="w-3 h-3" /> Mới
                        </button>
                      </div>

                      {adHocPatientMode === 'existing' && !adHocSelectedPatientKey && (
                        <div className="relative">
                          <input
                            type="text"
                            placeholder="🔍 Tên hoặc mã ID1..."
                            value={adHocSearchQuery}
                            onChange={(e) => setAdHocSearchQuery(e.target.value)}
                            className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1 text-[11px] focus:outline-none placeholder-slate-400 font-semibold"
                          />

                              {/* Search Dropdown Result List */}
                              {adHocSearchQuery.trim() && filteredSearchPatients.length > 0 && (
                                <div className="absolute left-0 right-0 mt-2 max-h-48 overflow-y-auto border border-slate-250 rounded-xl bg-white divide-y divide-slate-100 shadow-sm z-50">
                                  {filteredSearchPatients.slice(0, 15).map((pat) => (
                                    <button
                                      key={pat.PatientKey}
                                      type="button"
                                      onClick={() => handleSelectPatient(pat)}
                                      className="w-full text-left px-3 py-2.5 text-xs transition flex justify-between items-center cursor-pointer hover:bg-pink-50 hover:text-[#d2145a]"
                                    >
                                      <div>
                                        <span className="font-extrabold uppercase">{pat.PatientName}</span>
                                        <span className="text-[10px] text-slate-500 font-mono ml-1">(ID1: {pat.PatientID1})</span>
                                      </div>
                                      <span className="text-[10px] font-mono italic text-slate-400">{formatVNTime(pat.PatientDOB)} | {pat.PatientSex === 'Nữ' ? 'Nữ' : 'Nam'}</span>
                                    </button>
                                  ))}
                                </div>
                              )}
                              {adHocSearchQuery.trim() && filteredSearchPatients.length === 0 && (
                                <div className="absolute left-0 right-0 mt-2 p-3 text-center text-slate-400 italic bg-white border border-slate-200 rounded-xl shadow-lg z-50 text-[11px]">
                                  Không tìm thấy bệnh nhi "{adHocSearchQuery}"
                                </div>
                              )}
                            </div>
                         )}

                         {adHocPatientMode === 'existing' && adHocSelectedPatientKey && (
                            <div className="bg-pink-50/70 border border-pink-100 rounded-lg p-2 text-[11px] text-slate-800 relative">
                              <button
                                onClick={handleClearSelectedPatient}
                                className="absolute top-1.5 right-1.5 text-slate-400 hover:text-slate-600 p-1 rounded-full transition cursor-pointer"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                              <p className="font-black text-[11px] uppercase text-[#d2145a] pr-6 leading-tight">
                                {adHocPatientName} <span className="text-[9px] font-mono normal-case text-slate-500">({adHocPatientSex})</span>
                              </p>
                              <div className="mt-1 space-y-0.5 text-[10px]">
                                <p><span className="text-slate-400 font-bold">ID1:</span> <span className="font-mono font-bold">{adHocPatientID1}</span> {adHocPatientID2 && <><span className="text-slate-400 font-bold ml-1">ID2:</span> <span className="font-mono">{adHocPatientID2}</span></>}</p>
                                <p><span className="text-slate-400 font-bold">NS:</span> <span className="font-mono">{adHocPatientDOB ? adHocPatientDOB.split('-').reverse().join('/') : ''}</span> <span className="text-slate-400 font-bold ml-1">SĐT:</span> <span className="font-mono">{adHocPatientPhone1 || adHocPatientPhone2 || '—'}</span></p>
                                <p className="truncate" title={adHocPatientAddress}><span className="text-slate-400 font-bold">ĐC:</span> {adHocPatientAddress || '—'}</p>
                              </div>
                            </div>
                         )}

                         {adHocPendingConsult && (
                            <div className="p-2 bg-amber-50 border border-amber-200 rounded-lg text-[10px] text-amber-900 leading-snug font-semibold">
                              Bệnh nhân này có lượt hội chẩn chờ kết luận. Bạn có muốn tiếp tục xếp lịch?
                            </div>
                         )}

                         {adHocPatientMode === 'new' && (
                           <div className="space-y-1">
                              <div className="flex justify-between items-center bg-rose-50 px-2 py-1 rounded-lg border border-rose-100">
                                 <span className="text-rose-600 font-bold text-[10px] uppercase">Tạo bệnh nhi mới</span>
                                 <button type="button" className="text-[10px] font-bold text-slate-500 hover:text-slate-700 underline cursor-pointer" onClick={() => setAdHocPatientMode('existing')}>
                                    Quay lại tìm kiếm
                                 </button>
                               </div>
                              <div className="grid grid-cols-1 gap-1">
                                {renderAdHocRow(`Mã BN *${adHocErrors.includes('PatientID1') ? ' !' : ''}`, (
                                  <input type="text" required placeholder="ID1..." value={adHocPatientID1} onChange={(e) => { const val = e.target.value; setAdHocPatientID1(val); const dup = patients.find(p => String(p.PatientID1 || '').trim().toLowerCase() === val.trim().toLowerCase()); setAdHocPendingConsult(dup ? getPendingConsultForPatient(dup.PatientKey) || null : null); }} className={`${adHocInputCls} font-bold`} />
                                ))}
                                {renderAdHocRow(`Họ tên *${adHocErrors.includes('PatientName') ? ' !' : ''}`, (
                                  <input type="text" required placeholder="Họ tên..." value={adHocPatientName} onChange={(e) => setAdHocPatientName(e.target.value)} className={`${adHocInputCls} font-black`} />
                                ))}
                                {renderAdHocRow(`Ngày sinh *${adHocErrors.includes('PatientDOB') ? ' !' : ''}`, (
                                  <VNDateInput required value={adHocPatientDOB} onChange={(val) => setAdHocPatientDOB(val)} className={`${adHocInputCls} font-mono font-bold`} />
                                ))}
                                {renderAdHocRow('Giới tính *', (
                                  <div className="flex gap-1">
                                    {(['Nam', 'Nữ'] as const).map((gender) => (
                                      <button key={gender} type="button" onClick={() => setAdHocPatientSex(gender)} className={`flex-1 py-0.5 rounded-lg border text-[10px] font-bold cursor-pointer ${adHocPatientSex === gender ? 'bg-indigo-50 border-indigo-300 text-indigo-800' : 'bg-slate-50 border-slate-200 text-slate-600'}`}>{gender}</button>
                                    ))}
                                  </div>
                                ))}
                                {renderAdHocRow(`Địa chỉ *${adHocErrors.includes('PatientAddress') ? ' !' : ''}`, (
                                  <SearchableEnumSelect required options={SOURCE_PROVINCE} value={adHocPatientAddress} onChange={setAdHocPatientAddress} placeholder="-- Tỉnh/thành --" searchPlaceholder="Gõ tìm..." />
                                ))}
                                {renderAdHocRow('SĐT 1', (
                                  <input type="text" placeholder="ĐT..." value={adHocPatientPhone1} onChange={(e) => setAdHocPatientPhone1(e.target.value)} className={`${adHocInputCls} font-mono font-bold`} />
                                ))}
                                {renderAdHocRow('SĐT 2', (
                                  <input type="text" placeholder="ĐT phụ..." value={adHocPatientPhone2} onChange={(e) => setAdHocPatientPhone2(e.target.value)} className={`${adHocInputCls} font-mono`} />
                                ))}
                              </div>
                           </div>
                       )}
                    </div>

                  {/* COLUMN 2: THÔNG TIN HỘI CHẨN */}
                    <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-2 shadow-sm">
                      <div className="border-b border-slate-100 pb-2">
                        <span className="text-xs font-black uppercase text-[#d2145a] tracking-wider">
                          2. Thông tin hội chẩn
                        </span>
                      </div>

                      <div className="grid grid-cols-1 gap-2 pt-1">
                        {renderAdHocRow('Kiểu staff *', (
                          <div className="flex gap-1">
                            {(['Staff thông', 'Staff mổ'] as const).map((type) => {
                              const active = adHocConsultType === type;
                              return (
                                <button
                                  key={type}
                                  type="button"
                                  onClick={() => setAdHocConsultType(type)}
                                  className={`flex-1 py-1.5 rounded-lg border text-xs font-bold transition cursor-pointer ${
                                    active ? 'bg-[#d2145a] border-[#d2145a] text-white' : 'bg-slate-50 border-slate-200 text-slate-600'
                                  }`}
                                >
                                  {type}
                                </button>
                              );
                            })}
                          </div>
                        ))}
                        {renderAdHocRow(`Ngày hội chẩn *${adHocErrors.includes('ConsultDate') ? ' !' : ''}`, renderAdHocDatePicker(adHocConsultDate, setAdHocConsultDate))}
                        {renderAdHocRow(`Cân nặng (kg) *${adHocErrors.includes('PatientWeight') ? ' !' : ''}`, (
                          <input type="text" required placeholder="12.5" value={adHocPatientWeight} onChange={(e) => setAdHocPatientWeight(e.target.value)} className={`${adHocInputCls} font-bold`} />
                        ))}
                        {renderAdHocRow('Chiều cao (cm)', (
                          <input type="text" placeholder="95" value={adHocPatientHeight} onChange={(e) => setAdHocPatientHeight(e.target.value)} className={adHocInputCls} />
                        ))}
                        {renderAdHocRow(`BS đăng ký *${adHocErrors.includes('RequestBy') ? ' !' : ''}`, (
                          <select required value={adHocRequestBy} onChange={(e) => { const val = e.target.value; setAdHocRequestBy(val); setAdHocScheduled2nd(getAutoScheduled2nd(val)); }} className={adHocSelectCls}>
                            <option value="">— Chọn BS —</option>
                            {staffList.filter(s => !s.FireDate).map((st) => (
                              <option key={st.StaffKey} value={formatShortDoctorName(st.StaffName)}>{formatShortDoctorName(st.StaffName)}</option>
                            ))}
                          </select>
                        ))}
                        {renderAdHocRow('Khoa nội trú *', (
                          <select value={adHocDepartment} onChange={(e) => setAdHocDepartment(e.target.value)} className={adHocSelectCls}>
                            {DEPARTMENTS_LIST.map((dept) => <option key={dept} value={dept}>{dept}</option>)}
                          </select>
                        ))}
                        {renderAdHocRow(`ICD chẩn đoán *${adHocErrors.includes('DiagnosisID') ? ' !' : ''}`, (
                          <SearchableEnumSelect required options={diagnosisOptions} value={adHocDiagnosisID} onChange={(value) => setAdHocDiagnosisID(normalizeDiagnosisID(value))} allowCreate createLabel={(value) => `Thêm DiagnosisID "${value}" vào Source`} onCreateOption={createDiagnosisSource} placeholder="— Chọn ICD —" searchPlaceholder="Gõ ICD..." />
                        ))}
                        {renderAdHocRow('Ưu tiên *', (
                          <select value={adHocPriorityOrder} onChange={(e) => setAdHocPriorityOrder(e.target.value as any)} className={`${adHocSelectCls} text-[#d2145a]`}>
                            {PRIORITY_OPTIONS.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
                          </select>
                        ))}
                        {renderAdHocRow(`Chẩn đoán chi tiết *${adHocErrors.includes('DetailDiagnosis') ? ' !' : ''}`, (
                          <textarea rows={2} required placeholder="Chẩn đoán chi tiết..." value={adHocDetailDiagnosis} onChange={(e) => setAdHocDetailDiagnosis(e.target.value)} className={`${adHocInputCls} resize-y`} />
                        ), { alignTop: true })}
                        {renderAdHocRow('Kết luận chính *', (
                          <SearchableEnumSelect required options={['Can thiệp thông tim', 'Chụp chẩn đoán +/- can thiệp', 'Chụp chẩn đoán/Đo kháng lực', 'Tiền Glenn', 'Tiền Fontan', 'Điện sinh lý', 'Mổ tim', 'Thêm CĐHA; vđ khác - Staff lại', 'Chưa có chỉ định - Theo dõi tiếp', 'Điều trị nội khoa - Hẹn staff lại', 'Quá chỉ định', 'Không có thông tin']} value={adHocConsultResultID} onChange={setAdHocConsultResultID} direction="up" placeholder="— Chọn kết luận —" searchPlaceholder="Gõ tìm..." />
                        ))}
                        {renderAdHocRow(`Kết quả chi tiết *${adHocErrors.includes('DetailConsultResult') ? ' !' : ''}`, (
                          <textarea rows={2} placeholder="Kết quả chi tiết..." value={adHocDetailConsultResult} onChange={(e) => setAdHocDetailConsultResult(e.target.value)} className={`${adHocInputCls} resize-y`} />
                        ), { alignTop: true })}

                      </div>
                    </div>

                  {/* COLUMN 3: DỤNG CỤ & XẾP LỊCH */}
                    <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-2 shadow-sm">
                      <div className="border-b border-slate-100 pb-2">
                        <span className="text-xs font-black uppercase text-indigo-800 tracking-wider">
                          3. Dụng cụ & xếp lịch
                        </span>
                      </div>

                      <div className="grid grid-cols-1 gap-2">
                        {renderAdHocRow('Dụng cụ dự kiến', (
                          <PlannedDeviceSuggestBox
                            diagnosisID={adHocDiagnosisID}
                            value={adHocPlannedDevice}
                            onChange={setAdHocPlannedDevice}
                            deviceTemplates={deviceTemplates}
                            consults={consults}
                            label=""
                            rows={2}
                            placeholder="Amplatzer ADOII..."
                            textareaClassName={`${adHocInputCls} font-bold resize-y`}
                          />
                        ), { alignTop: true })}
                        {renderAdHocRow('Dự trù kinh phí', (
                          <input type="text" placeholder="45,000,000" value={adHocPlannedPrice} onChange={(e) => setAdHocPlannedPrice(e.target.value)} className={`${adHocInputCls} font-mono font-bold`} />
                        ))}
                        {renderAdHocRow('Kiểm tra dụng cụ', (
                          <select value={adHocCheckDevice} onChange={(e) => setAdHocCheckDevice(e.target.value as any)} className={adHocSelectCls}>
                            <option value="">— Chưa kiểm —</option>
                            <option value="Đủ">Đủ</option>
                            <option value="Thiếu">Thiếu</option>
                          </select>
                        ))}
                        {renderAdHocRow('Phòng mổ phản hồi', (
                          <textarea rows={1} placeholder="Phòng mổ phản hồi..." value={adHocOperationFeedback} onChange={(e) => setAdHocOperationFeedback(e.target.value)} className={`${adHocInputCls} resize-y`} />
                        ), { alignTop: true })}
                        {renderAdHocRow('Phòng vật tư phản hồi', (
                          <textarea rows={1} placeholder="Phòng vật tư phản hồi..." value={adHocSupplyDepFeedback} onChange={(e) => setAdHocSupplyDepFeedback(e.target.value)} className={`${adHocInputCls} resize-y`} />
                        ), { alignTop: true })}
                        {renderAdHocRow('Trạng thái gọi bệnh', (
                          <select value={adHocCallStatus} onChange={(e) => setAdHocCallStatus(e.target.value)} className={`${adHocSelectCls} text-[#d2145a]`}>
                            <option value="">— Chưa gọi —</option>
                            {CALL_STATUS_OPTIONS.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
                          </select>
                        ))}
                        {renderAdHocRow('Ghi chú gọi bệnh', (
                          <textarea rows={1} placeholder="Ghi chú gọi bệnh..." value={adHocCallNote} onChange={(e) => setAdHocCallNote(e.target.value)} className={`${adHocInputCls} resize-y`} />
                        ), { alignTop: true })}
                        {renderAdHocRow('Ngày thông tim dự kiến', <VNDateInput value={adHocPlannedCathLabDate} onChange={setAdHocPlannedCathLabDate} className={`${adHocInputCls} font-mono font-bold`} />)}
                        {renderAdHocRow('Hỗ trợ tài chính', (
                          <select value={adHocFundingRequest} onChange={(e) => setAdHocFundingRequest(e.target.value)} className={adHocSelectCls}>
                            <option value="">— Chưa chọn —</option>
                            <option value="Không tài trợ">Không tài trợ</option>
                            <option value="Chờ duyệt">Chờ duyệt</option>
                            <option value="Đã duyệt">Đã duyệt</option>
                          </select>
                        ))}
                        {renderAdHocRow('Phương pháp can thiệp', (
                          <SearchableEnumSelect multiple options={METHOD_OPTIONS} values={adHocCathMethod} onMultiChange={setAdHocCathMethod} placeholder="Chọn phương pháp..." searchPlaceholder="Gõ tìm..." direction="up" />
                        ))}
                        {renderAdHocRow('Khoa sau thủ thuật', (
                          <select value={adHocPostCathDepart} onChange={(e) => setAdHocPostCathDepart(e.target.value)} className={adHocSelectCls}>
                            {DEPARTMENTS_LIST.map((dept) => <option key={dept} value={dept}>{dept}</option>)}
                          </select>
                        ))}
                        {renderAdHocRow('PTV chính', (
                          <select value={adHocScheduled1st} onChange={(e) => setAdHocScheduled1st(e.target.value)} className={adHocSelectCls}>
                            <option value="">— Chọn PTV —</option>
                            <option value="BS. Phụng">BS. Phụng</option>
                            <option value="BS. Lợi">BS. Lợi</option>
                            <option value="BS. Thịnh">BS. Thịnh</option>
                          </select>
                        ))}
                        {renderAdHocRow('PTV phụ 1', (
                          <select value={adHocScheduled2nd} onChange={(e) => setAdHocScheduled2nd(e.target.value)} className={`${adHocSelectCls} text-indigo-950`}>
                            <option value="">— Chọn PTV phụ 1 —</option>
                            {CATH_INTERVENTIONIST_DOCTORS.map((doc) => <option key={doc} value={doc}>{doc}</option>)}
                          </select>
                        ))}
                        {renderAdHocRow('PTV phụ 2', (
                          <select value={adHocScheduled3rd} onChange={(e) => setAdHocScheduled3rd(e.target.value)} className={adHocSelectCls}>
                            <option value="">— Chọn PTV phụ 2 —</option>
                            <option value="BS. Ân">BS. Ân</option>
                            <option value="BS. Tài">BS. Tài</option>
                            <option value="BS. Hiếu">BS. Hiếu</option>
                            <option value="BS. Hùng">BS. Hùng</option>
                            <option value="BS. Tĩnh">BS. Tĩnh</option>
                            <option value="BS. Thịnh">BS. Thịnh</option>
                          </select>
                        ))}
                        {renderAdHocRow('Người xếp lịch', (
                          <input type="text" disabled value={staffList.find(s => s.StaffKey === currentStaff?.StaffKey)?.StaffName || currentStaff?.StaffKey || '01378'} className={`${adHocInputCls} text-slate-400`} />
                        ))}
                        {renderAdHocRow('Cập nhật lúc', (
                          <input type="text" disabled value={formatDateTime(new Date().toISOString())} className={`${adHocInputCls} font-mono text-slate-400`} />
                        ))}
                      </div>
                    </div>

                </div>

              </div>

              {/* Form Save Footer Bar for Ad-hoc Scheduling */}
              <div className="py-1.5 px-3 border-t border-slate-200 bg-slate-50 flex justify-end gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    setShowAdHocModal(false);
                    handleClearSelectedPatient();
                  }}
                  className="px-4 py-2 text-xs font-bold text-slate-500 hover:text-slate-800 hover:bg-slate-200/50 rounded-xl cursor-pointer transition uppercase"
                >
                  Huỷ bỏ
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white font-black px-6 py-2 rounded-xl shadow-md text-xs cursor-pointer transition flex items-center gap-2 disabled:opacity-50 uppercase tracking-wide"
                >
                  {saving
                    ? (adHocPendingConsult ? 'Đang thực hiện...' : 'Đang lưu trữ...')
                    : (adHocPendingConsult ? 'Tiếp tục xếp lịch' : 'Lưu kết quả xếp lịch')}
                </button>
              </div>

            </form>

          </div>
        </div>
      )}

    </div>
  );
}
