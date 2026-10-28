/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useMemo, useCallback, useDeferredValue, useTransition } from 'react';
import { 
  Staff, 
  Patient, 
  Consult, 
  OutcomeType, 
  ConsultTypeEnum, 
  DepartmentEnum, 
  ConsultResultEnum, 
  PriorityOrderEnum, 
  PRIORITY_OPTIONS,
  normalizePriorityOrder,
  RiskFactorEnum,
  CathLab,
  Operation,
  CMR,
  Transplant,
  Source,
  DeviceTemplate,
  RolePreset,
  Notification as WorkflowNotification,
  DoctorPerformanceMark,
  formatVNTime,
  removeDiacritics,
  findPatientByKey,
  normalizePatientKey,
  restoreWeightFromDate
} from './types';
import * as XLSX from 'xlsx';
import VirtualSheets from './components/VirtualSheets';
import A4Report from './components/A4Report';
import HomeDashboard from './components/HomeDashboard';
import PatientDetailsDrawer from './components/PatientDetailsDrawer';
import StaffResultsView from './components/StaffResultsView';
import AuxiliaryModals from './components/AuxiliaryModals';
import CathLabSchedulerView from './components/CathLabSchedulerView';
import CathLabRoomView from './components/CathLabRoomView';
import CathLabReportView from './components/CathLabReportView';
import ArchiveView from './components/ArchiveView';
import WorkspaceDashboard from './components/WorkspaceDashboard';
import MRISchedulerView from './components/MRISchedulerView';
import MRIRegisterView from './components/MRIRegisterView';
import MRIResultView from './components/MRIResultView';
import MRICalendarView from './components/MRICalendarView';
import MRIOverviewView from './components/MRIOverviewView';
import TransplantManagementView from './components/TransplantManagementView';
import SurgeryRoomView from './components/SurgeryRoomView';
import DevelopingFeatureView from './components/DevelopingFeatureView';
import ChdDailyBriefView from './components/ChdDailyBriefView';
import StaffManagementView from './components/StaffManagementView';
import StaffAccountMenu from './components/StaffAccountMenu';
import BellNotificationMenu from './components/BellNotificationMenu';
import StaffProfileView from './components/StaffProfileView';
import { useRefreshMedicalData, type MedicalDataLoadState } from './hooks/useRefreshMedicalData';
import { useSheetsSyncStatus } from './hooks/useSheetsSyncStatus';
import { formatSheetsSyncStatusLabel } from './utils/sheetsSyncFeedback';
import { buildSyncContext, withSyncContext } from './utils/sheetsSyncMutation';
import { SheetsSyncFeedbackProvider } from './context/SheetsSyncFeedbackContext';
import { ViewSubheaderProvider } from './context/ViewSubheaderContext';
import { SubheaderRenderer } from './components/layout/DesktopViewSubheader';
import AppInlineSubheader from './components/layout/AppInlineSubheader';
import { SearchTextInput } from './components/SearchTextInput';
import { MAIN_HEADER_TITLE } from './constants/appHeader';
import { SheetsSyncBridge } from './components/SheetsSyncBridge';
import { AuthRequiredError, getMedicalDataFetchTimeout, peekCachedMedicalDataBundle, peekInMemoryMedicalDataBundle, applyMedicalDataBundle } from './api/medicalDataRefresh';
import { clearLocalCache, hydrateSyncConfigFromServer, migrateLocalSyncConfigToServer } from './api/appsScriptFetch';
import {
  APP_BUILD_ID,
  CHD_APP_BUILD_ID_KEY,
  CHD_DEPLOY_LOGOUT_MSG_KEY,
  CHD_VERSION_LABEL,
  activateWaitingServiceWorker,
  fetchRemoteAppBuildId,
  isAppBuildIdMismatch,
  markDeployReload,
  shouldBlockDeployReload,
} from './appVersion';
import { useForegroundPushAlerts } from './hooks/useForegroundPushAlerts';
import {
  createLatestDiagnosisResolver,
} from './utils/latestDiagnosis';
import { getPatientAgeDescriptionParen } from './utils/patientDisplay';
import {
  compareByPatientSearchScore,
  matchesListSearchQuery,
  matchesPatientIdentitySearch,
  normalizeListSearchQuery,
} from './utils/listSearch';
import { SearchableEnumSelect } from './components/SearchableEnumSelect';
import { VNDateInput } from './components/VNDateInput';
import { MobileAutoExpandTextarea } from './components/MobileAutoExpandTextarea';
import { SOURCE_PROVINCE, getSourceDiagnosisOptions, getSourceProvinceOptions } from './data/source';
import { AppModule, canAccessModule, canManageStaff, setRuntimeRolePresets } from './auth/permissions';
import MobileBottomNav from './components/layout/MobileBottomNav';
import MobileMoreMenu from './components/layout/MobileMoreMenu';
import {
  ActiveMenuId,
  SIDEBAR_MENU_ITEMS,
  getMobileMoreMenuItems,
  getNavIcon,
  MOBILE_BOTTOM_TAB_ITEMS,
} from './config/navigation';
import { useIsMobile } from './hooks/useMediaQuery';
import { useWebPush } from './hooks/useWebPush';
import PwaInstallPrompt from './components/PwaInstallPrompt';
import PushNotificationPrompt from './components/PushNotificationPrompt';
import { clearViewQueryParam, parseViewFromLocation, shouldShowIosInstallHint } from './push/webPushClient';
import {
  loadMobileQuickTabs,
  pinMobileQuickTab,
  saveMobileQuickTabs,
  DEFAULT_MOBILE_QUICK_SLOTS,
  MOBILE_QUICK_SLOT_COUNT,
} from './utils/mobileQuickTabs';
import { Button } from './components/ui/button';
import { Badge } from './components/ui/badge';
import { Input } from './components/ui/input';
import { Card } from './components/ui/card';
import { TableHead, TableHeader, TableRow } from './components/ui/table';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from './components/ui/sidebar';
import { PatientAdminEditButton } from './components/PatientAdminEditButton';
import { SortColumnIcon } from './components/SortColumnIcon';
import { MODAL_TITLE } from './utils/modalTitles';
import { PATIENT_VALIDATION_MSG, getFormattedDateKey, compareFormattedDates, dateSortNumber } from './utils/patientFormValidation';

import { 
  Users, 
  FileText, 
  UserCheck, 
  LogOut, 
  Plus, 
  Search, 
  AlertTriangle, 
  Database, 
  CheckCircle, 
  Download, 
  Printer, 
  Filter, 
  Heart, 
  Calendar, 
  TrendingUp, 
  ClipboardCheck, 
  ClipboardList,
  Cpu, 
  Clock, 
  Workflow, 
  RefreshCw,
  Loader2,
  Unlink,
  Home,
  PanelLeft,
  ChevronRight,
  ChevronLeft,
  Info,
  CalendarDays,
  X,
  Stethoscope,
  ArrowRightLeft,
  Undo2,
  Archive,
  LayoutDashboard,
  UserCog,
  Activity,
  Trash2
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

const DEFAULT_DEPARTMENTS = [
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

const formatDateTime = (dateStr?: string) => {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    const pad = (num: number) => String(num).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  } catch (_) {
    return dateStr;
  }
};

const getShortStaffName = (fullName: string, staffList: { StaffName: string }[] = []): string => {
  if (!fullName) return '';
  let cleaned = fullName.replace(/\s*\(.*?\)\s*/g, '').trim();
  cleaned = cleaned.replace(/^(BS\.|BS)\s+/i, '').trim();
  const parts = cleaned.split(/\s+/);
  if (parts.length === 0) return '';
  
  const firstName = parts[parts.length - 1];
  
  if (parts.length === 1) {
    return `BS. ${firstName}`;
  }
  
  const middleName = parts[parts.length - 2];
  
  const hasFirstNameDuplicate = staffList.length > 0 && staffList.some(s => {
    let sClean = s.StaffName.replace(/\s*\(.*?\)\s*/g, '').trim();
    sClean = sClean.replace(/^(BS\.|BS)\s+/i, '').trim();
    const sParts = sClean.split(/\s+/);
    if (sParts.length <= 1) return false;
    const sFirstName = sParts[sParts.length - 1];
    return s.StaffName !== fullName && sFirstName.toLowerCase() === firstName.toLowerCase();
  });
  
  if (hasFirstNameDuplicate && middleName) {
    const middleInitial = middleName.charAt(0).toUpperCase();
    return `BS. ${middleInitial}. ${firstName}`;
  }
  
  return `BS. ${firstName}`;
};

export default function App() {
  // Session State
  const [currentStaff, setCurrentStaff] = useState<Staff | null>(null);
  const [authToken, setAuthToken] = useState<string>(() => localStorage.getItem('CHD_AUTH_TOKEN') || '');
  const [staffList, setStaffList] = useState<Staff[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [consults, setConsults] = useState<Consult[]>([]);
  const [cathlabs, setCathlabs] = useState<CathLab[]>([]);
  const [operations, setOperations] = useState<Operation[]>([]);
  const [cmrs, setCmrs] = useState<CMR[]>([]);
  const [transplants, setTransplants] = useState<Transplant[]>([]);
  const [sources, setSources] = useState<Source[]>([]);
  const [deviceTemplates, setDeviceTemplates] = useState<DeviceTemplate[]>([]);
  const [rolePresetRecords, setRolePresetRecords] = useState<RolePreset[]>([]);
  const [notifications, setNotifications] = useState<WorkflowNotification[]>([]);
  const [doctorPerformanceMarks, setDoctorPerformanceMarks] = useState<DoctorPerformanceMark[]>([]);

  const diagnosisOptions = useMemo(() => getSourceDiagnosisOptions(sources), [sources]);
  const provinceOptions = useMemo(() => getSourceProvinceOptions(sources), [sources]);

  const cathConsultKeySet = useMemo(
    () => new Set(cathlabs.map(cath => String(cath.ConsultKey || '').trim().toLowerCase()).filter(Boolean)),
    [cathlabs]
  );

  const isPendingStaffConsult = useCallback((consult: Consult) => {
    const resVal = String(consult.ConsultResultID || '').trim().toLowerCase();
    const pendingResult = !consult.ConsultResultID || resVal === '' || resVal === 'nodata' || resVal === 'no data' || resVal === '—' || resVal === '-';
    if (!pendingResult) return false;
    const consultKey = String(consult.ConsultKey || '').trim().toLowerCase();
    return !consultKey || !cathConsultKeySet.has(consultKey);
  }, [cathConsultKeySet]);

  const pendingStaffConsultCount = useMemo(
    () => consults.filter(isPendingStaffConsult).length,
    [consults, isPendingStaffConsult]
  );

  const completedStaffConsultCount = useMemo(
    () => consults.length - pendingStaffConsultCount,
    [consults.length, pendingStaffConsultCount]
  );

  // Fast Patients Cache map to optimize O(N*M) lookups down to O(M)
  const patientsMap = useMemo(() => {
    const map = new Map<string, Patient>();
    if (!Array.isArray(patients)) return map;
    patients.forEach(p => {
      if (p) {
        if (p.PatientKey) {
          const pk = normalizePatientKey(p.PatientKey);
          map.set(pk, p);
        }
        if (p.PatientID1) {
          const pid = String(p.PatientID1).trim().toLowerCase();
          map.set(pid, p);
        }
      }
    });
    return map;
  }, [patients]);

  const getPatientByKey = (key: any): Patient | undefined => {
    if (!key) return undefined;
    const keyStr = normalizePatientKey(key);
    
    // Prioritize direct match by PatientKey to prevent collisions with PatientID1 mapping
    const directMatch = patients.find(p => p && normalizePatientKey(p.PatientKey) === keyStr);
    if (directMatch) return directMatch;
    
    return patientsMap.get(keyStr);
  };

  // Refs for synchronized double scrollbar in consult log list
  const MOBILE_PATIENTS_BATCH = 50;
  const MOBILE_CONSULTS_BATCH = 50;
  const topScrollRef = useRef<HTMLDivElement>(null);
  const bottomScrollRef = useRef<HTMLDivElement>(null);
  const patientTableScrollRef = useRef<HTMLDivElement>(null);
  const [tableScrollWidth, setTableScrollWidth] = useState(850);

  const handleTopScroll = () => {
    if (topScrollRef.current && bottomScrollRef.current) {
      bottomScrollRef.current.scrollLeft = topScrollRef.current.scrollLeft;
    }
  };

  const handleBottomScroll = () => {
    if (topScrollRef.current && bottomScrollRef.current) {
      topScrollRef.current.scrollLeft = bottomScrollRef.current.scrollLeft;
    }
  };

  // Navigation State - Defaults to Home Bento Grid !
  const [activeMenu, setActiveMenu] = useState<'home' | 'workspace' | 'profile' | 'patients' | 'consult-form' | 'consult-list' | 'results-staff' | 'schedule-tt' | 'schedule-view' | 'cathlab-room' | 'cathlab-report' | 'heart-transplant' | 'mri-overview' | 'mri-scheduler' | 'mri-register' | 'mri-result' | 'mri-calendar' | 'surgery-room' | 'surgery-scheduler' | 'surgery-schedule-view' | 'archive' | 'excel-export' | 'google-sheets' | 'chd-daily-brief' | 'staff-mgmt'>('home');
  const [profileReturnMenu, setProfileReturnMenu] = useState<typeof activeMenu>('home');
  const [isStaffAccountMenuOpen, setIsStaffAccountMenuOpen] = useState(false);
  const [isNotificationMenuOpen, setIsNotificationMenuOpen] = useState(false);
  const [staffManagementInitialTab, setStaffManagementInitialTab] = useState<'edit' | 'matrix' | 'marks' | 'settings' | 'guide'>('edit');
  const [archiveInitialTab, setArchiveInitialTab] = useState<'transferred' | 'archive'>('archive');

  // Collapsible Sidebar State
  const [isSidebarExpanded, setIsSidebarExpanded] = useState<boolean>(false);
  const [isMobileMoreMenuOpen, setIsMobileMoreMenuOpen] = useState(false);
  const [mobileQuickTabIds, setMobileQuickTabIds] = useState<ActiveMenuId[]>(DEFAULT_MOBILE_QUICK_SLOTS);
  const isMobile = useIsMobile();
  const webPush = useWebPush(currentStaff?.StaffKey);

  // Collapsible Filter Panel State
  const [isFilterExpanded, setIsFilterExpanded] = useState<boolean>(false);

  // Login Form State
  const [loginStaffKey, setLoginStaffKey] = useState<string>('');
  const [loginPassword, setLoginPassword] = useState<string>('');
  const [loginError, setLoginError] = useState<string>('');
  const [loginPending, setLoginPending] = useState(false);
  const [sheetsSetupNeeded, setSheetsSetupNeeded] = useState(false);
  const [sheetsSetupUrl, setSheetsSetupUrl] = useState('');
  const [sheetsSetupSecret, setSheetsSetupSecret] = useState('');
  const [loginLoadError, setLoginLoadError] = useState<string>('');
  const [medicalDataLoadState, setMedicalDataLoadState] = useState<MedicalDataLoadState>({
    phase: 'idle',
    startedAt: null
  });
  useForegroundPushAlerts(
    notifications,
    currentStaff?.StaffKey,
    webPush.subscribed,
    medicalDataLoadState.phase === 'ready'
  );
  const [medicalLoadElapsedSec, setMedicalLoadElapsedSec] = useState(0);

  // Search Filter State (Patient List & Globals)
  const [patientSearch, setPatientSearch] = useState<string>('');
  const [consultListSearch, setConsultListSearch] = useState<string>('');
  const [patientCurrentPage, setPatientCurrentPage] = useState<number>(1);
  const [mobilePatientVisibleCount, setMobilePatientVisibleCount] = useState(MOBILE_PATIENTS_BATCH);
  const [mobileConsultVisibleCount, setMobileConsultVisibleCount] = useState(MOBILE_CONSULTS_BATCH);
  const [, startConsultListSearchTransition] = useTransition();
  const [consultCurrentPage, setConsultCurrentPage] = useState<number>(1);
  const [searchPatientQuery, setSearchPatientQuery] = useState<string>('');

  // Active modal report state
  const [selectedConsultForPDF, setSelectedConsultForPDF] = useState<Consult | null>(null);
  const [selectedPatientForPDF, setSelectedPatientForPDF] = useState<Patient | null>(null);

  // Active Drawer States
  const [selectedPatientForDetail, setSelectedPatientForDetail] = useState<Patient | null>(null);
  const [showAddConsultQuick, setShowAddConsultQuick] = useState<boolean>(false);

  // Auxiliary Modal Triggers
  const [activeRules, setActiveRules] = useState<'department' | 'meetings' | 'workflow' | null>(null);
  const [activeScheduler, setActiveScheduler] = useState<'mri' | 'cathlab' | 'recheck' | 'tools' | 'transplant' | null>(null);

  // New Patient Form State
  const [showAddPatient, setShowAddPatient] = useState<boolean>(false);
  const [editingPatientKey, setEditingPatientKey] = useState<string | null>(null);
  const [newPatientData, setNewPatientData] = useState({
    PatientID1: '',
    PatientID2: '',
    PatientName: '',
    OtherPatientName: '',
    PatientDOB: '',
    PatientSex: 'Nam' as 'Nam' | 'Nữ',
    PatientAddress: 'TP Hà Nội',
    PatientPhone1: '',
    PatientPhone2: '',
    Outcome: '' as OutcomeType
  });

  // New Consult Form State
  const [newConsultData, setNewConsultData] = useState({
    PatientKey: '',
    ConsultType: 'Staff mổ' as ConsultTypeEnum,
    PatientWeight: '',
    PatientHeight: '',
    ConsultDate: new Date().toISOString().split('T')[0],
    RequestBy: '',
    DiagnosisID: '',
    DetailDiagnosis: '',
    Department: 'Tim Mạch' as string,
    PriorityOrder: 'Chương trình' as PriorityOrderEnum,
    RiskFactor: '' as string,
    CheckDevice: '' as 'Đủ' | 'Thiếu' | '',
    ConsultNote: '',
    PlannedDevice: '',
    PlannedPrice: ''
  });

  const getLatestPriorDetailDiagnosis = (patientKey: any, beforeDate?: string) => {
    const normalizedKey = normalizePatientKey(patientKey);
    if (!normalizedKey) return '';
    const beforeKey = beforeDate ? getFormattedDateKey(beforeDate) : '';

    return [...consults]
      .filter(c => normalizePatientKey(c.PatientKey) === normalizedKey && String(c.DetailDiagnosis || '').trim())
      .filter(c => {
        if (!beforeKey || !c.ConsultDate) return true;
        const consultKey = getFormattedDateKey(c.ConsultDate);
        return !!consultKey && consultKey <= beforeKey;
      })
      .sort((a, b) => {
        const cmp = compareFormattedDates(b.ConsultDate, a.ConsultDate);
        if (cmp !== 0) return cmp;
        return String(b.ConsultCreateTime || '').localeCompare(String(a.ConsultCreateTime || ''));
      })[0]?.DetailDiagnosis || '';
  };

  useEffect(() => {
    if (!newConsultData.PatientKey) return;
    const previousDiagnosis = getLatestPriorDetailDiagnosis(newConsultData.PatientKey, newConsultData.ConsultDate);
    setNewConsultData(prev => ({
      ...prev,
      DetailDiagnosis: previousDiagnosis
    }));
  }, [newConsultData.PatientKey]);
  
  // Pending Consult UX alert checker
  const [pendingConsultsCount, setPendingConsultsCount] = useState<number>(0);
  const [showAddConsult, setShowAddConsult] = useState<boolean>(false);
  const [formSuccessMessage, setFormSuccessMessage] = useState<string>('');
  const [formSuccessWarning, setFormSuccessWarning] = useState(false);


  // Consult Outcome Results Form State — handled inside StaffResultsView (split panel)

  const medicalDataSetters = useMemo(
    () => ({
      setPatients,
      setConsults,
      setStaffList,
      setCathlabs,
      setOperations,
      setCmrs,
      setTransplants,
      setSources,
      setDeviceTemplates,
      setRolePresetRecords,
      setRuntimeRolePresets,
      setNotifications,
      setDoctorPerformanceMarks
    }),
    []
  );

  const { refreshMedicalData, syncMedicalDataInBackground, loadMedicalDataAfterAuth, wasRecentlyForceSynced, releaseForceSyncLock, markForceSyncTimedOut } = useRefreshMedicalData(
    medicalDataSetters,
    setMedicalDataLoadState
  );
  const { status: sheetsSyncStatus, refreshStatus: refreshSheetsSyncStatus, reportPullResult } = useSheetsSyncStatus(!!currentStaff?.StaffKey);
  const sheetsSyncBadge = formatSheetsSyncStatusLabel(sheetsSyncStatus);

  const patchConsult = useCallback((consultKey: string, patch: Partial<Consult>) => {
    setConsults(prev => prev.map(c => (c.ConsultKey === consultKey ? { ...c, ...patch } : c)));
  }, []);

  const patchPatient = useCallback((patientKey: string, patch: Partial<Patient>) => {
    setPatients(prev =>
      prev.map(p =>
        normalizePatientKey(p.PatientKey) === normalizePatientKey(patientKey) ? { ...p, ...patch } : p
      )
    );
  }, []);

  const addPatient = useCallback((patient: Patient) => {
    setPatients(prev => [...prev, patient]);
  }, []);

  const addConsult = useCallback((consult: Consult) => {
    setConsults(prev => [...prev, consult]);
  }, []);

  const removeConsult = useCallback((consultKey: string) => {
    const normalized = consultKey.trim().toLowerCase();
    setConsults(prev => prev.filter(c => String(c.ConsultKey || '').trim().toLowerCase() !== normalized));
  }, []);

  const removeConsults = useCallback((consultKeys: string[]) => {
    const normalized = new Set(consultKeys.map(k => k.trim().toLowerCase()).filter(Boolean));
    if (normalized.size === 0) return;
    setConsults(prev => prev.filter(c => !normalized.has(String(c.ConsultKey || '').trim().toLowerCase())));
  }, []);

  const patchCmr = useCallback((cmrKey: string, patch: Partial<CMR>) => {
    const normalized = cmrKey.trim().toLowerCase();
    setCmrs(prev =>
      prev.map(c => {
        const key = String(c.CMRKey || c.CMRkey || '').trim().toLowerCase();
        return key === normalized ? { ...c, ...patch } : c;
      })
    );
  }, []);

  const addCmr = useCallback((cmr: CMR) => {
    setCmrs(prev => [...prev, cmr]);
  }, []);

  const patchTransplant = useCallback((transKey: string, patch: Partial<Transplant>) => {
    const normalized = transKey.trim().toLowerCase();
    setTransplants(prev =>
      prev.map(t => {
        const key = String(t.TransKey || '').trim().toLowerCase();
        return key === normalized ? { ...t, ...patch } : t;
      })
    );
  }, []);

  const addTransplant = useCallback((record: Transplant) => {
    setTransplants(prev => [...prev, record]);
  }, []);

  const deleteTransplant = useCallback((transKey: string) => {
    const normalized = transKey.trim().toLowerCase();
    setTransplants(prev => prev.filter(t => String(t.TransKey || '').trim().toLowerCase() !== normalized));
  }, []);

  const patchCathlab = useCallback((cathKey: string, patch: Partial<CathLab>) => {
    setCathlabs(prev => prev.map(c => (c.CathKey === cathKey ? { ...c, ...patch } : c)));
  }, []);

  const addCathlab = useCallback((cath: CathLab) => {
    setCathlabs(prev => [...prev, cath]);
  }, []);

  const patchStaffMember = useCallback((staffKey: string, patch: Partial<Staff>) => {
    setStaffList(prev => prev.map(s => (s.StaffKey === staffKey ? { ...s, ...patch } : s)));
  }, []);

  // State for editing registration (Sửa Đăng ký staff)
  const [editingRegConsultKey, setEditingRegConsultKey] = useState<string | null>(null);
  const [editConsultData, setEditConsultData] = useState({
    ConsultType: 'Staff mổ' as ConsultTypeEnum,
    PatientWeight: '',
    PatientHeight: '',
    ConsultDate: '',
    RequestBy: '',
    DiagnosisID: '',
    DetailDiagnosis: '',
    Department: 'Tim Mạch' as string,
    RiskFactor: '' as string
  });

  // Custom Department helper states for dynamic additions
  const [showAddDeptInput, setShowAddDeptInput] = useState(false);
  const [customDeptVal, setCustomDeptVal] = useState('');
  const [showEditAddDeptInput, setShowEditAddDeptInput] = useState(false);
  const [customEditDeptVal, setCustomEditDeptVal] = useState('');

  // Custom Doctor helper states for dynamic additions
  const [showAddDocInput, setShowAddDocInput] = useState(false);
  const [customDocVal, setCustomDocVal] = useState('');
  const [showEditAddDocInput, setShowEditAddDocInput] = useState(false);
  const [customEditDocVal, setCustomEditDocVal] = useState('');

  // Sort State for Waiting Consults
  const [consultSortField, setConsultSortField] = useState<'name' | 'date'>('date');
  const [consultSortOrder, setConsultSortOrder] = useState<'asc' | 'desc'>('desc');

  // Filter & Export Screen States
  const [filterDate, setFilterDate] = useState<string>('');
  const [filterType, setFilterType] = useState<string>('Tất cả');
  const [exportLoading, setExportLoading] = useState<boolean>(false);
  const filteredConsultsListRef = useRef<Consult[]>([]);
  const [botMessage, setBotMessage] = useState<string>('');

  // Bot Trigger PDF simulation State
  const [pdfBotRunning, setPdfBotRunning] = useState<string | null>(null);

  const [consultListConfirmDeleteKey, setConsultListConfirmDeleteKey] = useState<string | null>(null);
  const [consultListDeletingKey, setConsultListDeletingKey] = useState<string | null>(null);

  // Custom alerts and confirms to replace browser native window.alert/confirm (which fails inside sandboxed iframe previews)
  const [customAlert, setCustomAlert] = useState<{ message: string; title?: string } | null>(null);
  const [customConfirm, setCustomConfirm] = useState<{
    message: string;
    title?: string;
    onConfirm: () => void;
    onCancel?: () => void;
  } | null>(null);
  const confirmPendingRef = useRef(false);
  const sheetsSyncReportRef = useRef<(data: unknown, options?: { baseMessage?: string }) => void>(() => {});

  const triggerAlert = (message: string, title?: string) => {
    setCustomAlert({ message, title: title || MODAL_TITLE.notify });
  };

  const showSuccessBanner = (message: string, durationMs = 4000) => {
    setFormSuccessWarning(false);
    setFormSuccessMessage(message);
    setTimeout(() => setFormSuccessMessage(''), durationMs);
  };

  const handleSheetsSuccessBanner = useCallback((message: string, isWarning = false) => {
    setFormSuccessWarning(isWarning);
    setFormSuccessMessage(message);
    void refreshSheetsSyncStatus();
    setTimeout(() => {
      setFormSuccessMessage('');
      setFormSuccessWarning(false);
    }, isWarning ? 8000 : 6000);
  }, [refreshSheetsSyncStatus]);

  const showSaveFeedback = (baseMessage: string, responseData: unknown) => {
    sheetsSyncReportRef.current(responseData, { baseMessage });
  };

  const triggerConfirm = (message: string, onConfirm: () => void, title?: string, onCancel?: () => void) => {
    setCustomConfirm({ message, title: title || MODAL_TITLE.confirm, onConfirm, onCancel });
  };

  const fetchCathlabs = () => {
    fetch('/api/cathlabs')
      .then(res => res.json())
      .then(data => setCathlabs(data));
  };

  const fetchOperations = () => {
    fetch('/api/operations')
      .then(res => res.json())
      .then(data => setOperations(data));
  };

  const fetchCmrs = () => {
    fetch('/api/cmrs')
      .then(res => res.json())
      .then(data => setCmrs(data));
  };

  const fetchSources = () => {
    fetch('/api/sources')
      .then(res => res.json())
      .then(data => setSources(data));
  };

  const createDiagnosisSource = async (DiagnosisID: string) => {
    const trimmed = DiagnosisID.trim();
    if (!trimmed) return;

    const response = await fetch('/api/sources', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ DiagnosisID: trimmed })
    });

    if (!response.ok) {
      throw new Error('Không thể thêm DiagnosisID vào Source');
    }

    refreshConsultData();
  };

  const registrationDoctorOptions = useMemo(() => {
    const fromStaff = staffList.map(s => getShortStaffName(s.StaffName, staffList));
    const extra = Array.from(new Set(consults.map(c => String(c.RequestBy || ''))))
      .filter(d => d && !fromStaff.some(x => x.toLowerCase() === d.toLowerCase()));
    return [...fromStaff, ...extra];
  }, [staffList, consults]);

  const registrationDepartmentOptions = useMemo(() => {
    const extra = Array.from(new Set(consults.map(c => String(c.Department || ''))))
      .filter(d => d && !DEFAULT_DEPARTMENTS.includes(d));
    return [...DEFAULT_DEPARTMENTS, ...extra];
  }, [consults]);

  const refreshClinicalData = useCallback((force = false) => {
    void refreshMedicalData('clinical', force);
  }, [refreshMedicalData]);

  const refreshConsultData = useCallback((force = false) => {
    void refreshMedicalData('consult', force);
  }, [refreshMedicalData]);

  const refreshStaffData = useCallback((force = false) => {
    void refreshMedicalData('staff', force);
  }, [refreshMedicalData]);

  const refreshMriData = useCallback((force = false) => {
    void refreshMedicalData('mri', force);
  }, [refreshMedicalData]);

  const isMedicalDataSyncing =
    medicalDataLoadState.phase === 'loading' || medicalDataLoadState.phase === 'syncing';

  const refreshFullData = useCallback((force = false) => {
    if (force) {
      void syncMedicalDataInBackground('full', {
        onSyncStatus: (status) => {
          reportPullResult(status);
          void refreshSheetsSyncStatus();
        }
      })?.finally(() => {
        reportPullResult();
        void refreshSheetsSyncStatus();
      });
      return;
    }
    void refreshMedicalData('full', false, { silent: true });
  }, [refreshMedicalData, syncMedicalDataInBackground, refreshSheetsSyncStatus, reportPullResult]);

  const markNotificationRead = useCallback((notificationKey: string) => {
    setNotifications(prev =>
      prev.map(item =>
        item.NotificationKey === notificationKey
          ? { ...item, IsRead: true, ReadTime: item.ReadTime || new Date().toISOString() }
          : item
      )
    );
    fetch(`/api/notifications/${encodeURIComponent(notificationKey)}/read`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' }
    }).catch(err => {
      console.error('Failed to mark notification as read:', err);
      void refreshMedicalData('full', true, { silent: true });
    });
  }, [refreshMedicalData]);

  const handleLogoutRef = useRef<(() => void) | null>(null);
  const scheduleTtMobileLeaveGuardRef = useRef<((next: () => void) => void) | null>(null);

  const handleAuthDataFailure = useCallback((err: unknown) => {
    if (err instanceof AuthRequiredError) {
      handleLogoutRef.current?.();
      setLoginLoadError(err.message);
      return;
    }
    const msg = err instanceof Error ? err.message : String(err);
    setLoginLoadError(msg || 'Không tải được dữ liệu từ Google Sheets.');
  }, []);

  useEffect(() => {
    if (medicalDataLoadState.phase !== 'loading' && medicalDataLoadState.phase !== 'syncing') {
      setMedicalLoadElapsedSec(0);
      return;
    }
    const startedAt = medicalDataLoadState.startedAt ?? Date.now();
    const tick = () => setMedicalLoadElapsedSec(Math.max(0, Math.floor((Date.now() - startedAt) / 1000)));
    tick();
    const interval = setInterval(tick, 1000);
    const safetyMs = getMedicalDataFetchTimeout(true) + 15000;
    const safetyTimer = setTimeout(() => {
      void (async () => {
        let settled = false;
        let releaseAfterReady = false;
        setMedicalDataLoadState(prev => {
          if (prev.phase !== 'loading' && prev.phase !== 'syncing') {
            settled = true;
            return prev;
          }
          if (prev.backgroundSync && (patients.length > 0 || consults.length > 0)) {
            settled = true;
            releaseAfterReady = true;
            return { phase: 'ready', startedAt: null, backgroundSync: false };
          }
          return prev;
        });
        if (releaseAfterReady) releaseForceSyncLock();
        if (settled) return;

        const inMemory = peekInMemoryMedicalDataBundle();
        let bundle = inMemory;
        if (!bundle || (bundle.patients.length === 0 && bundle.consults.length === 0)) {
          bundle = await peekCachedMedicalDataBundle();
        }
        if (bundle && (bundle.patients.length > 0 || bundle.consults.length > 0)) {
          applyMedicalDataBundle(bundle, 'full', medicalDataSetters);
          releaseForceSyncLock();
          setMedicalDataLoadState({
            phase: 'ready',
            startedAt: null,
            backgroundSync: false
          });
          void syncMedicalDataInBackground('full', { silent: true })?.catch(() => undefined);
          return;
        }

        markForceSyncTimedOut(
          'Đồng bộ quá lâu — dữ liệu có thể chưa cập nhật. Bấm Đồng bộ lại để thử lại.'
        );
      })();
    }, safetyMs);
    return () => {
      clearInterval(interval);
      clearTimeout(safetyTimer);
    };
  }, [
    medicalDataLoadState.phase,
    medicalDataLoadState.startedAt,
    medicalDataLoadState.backgroundSync,
    patients.length,
    consults.length,
    medicalDataSetters,
    syncMedicalDataInBackground,
    releaseForceSyncLock,
    markForceSyncTimedOut
  ]);

  const loadPublicStaffForLogin = useCallback(() => {
    setLoginLoadError('');
    void refreshMedicalData('staff', false).catch(err => {
      const msg = err instanceof Error ? err.message : String(err);
      setLoginLoadError(
        msg.includes('Failed to fetch')
          ? 'Không kết nối được Google Sheets. Kiểm tra Apps Script URL và mạng.'
          : msg || 'Không tải được danh sách nhân viên từ Google Sheets.'
      );
    });
  }, [refreshMedicalData]);

  const applyAppUpdate = useCallback(async () => {
    if (shouldBlockDeployReload()) return;
    markDeployReload();
    sessionStorage.setItem(
      CHD_DEPLOY_LOGOUT_MSG_KEY,
      'Hệ thống vừa cập nhật phiên bản mới. Trang sẽ tải lại — bạn vẫn giữ phiên đăng nhập.'
    );
    await activateWaitingServiceWorker();
    localStorage.setItem(CHD_APP_BUILD_ID_KEY, APP_BUILD_ID);
    window.location.reload();
  }, []);

  useEffect(() => {
    const deployMsg = sessionStorage.getItem(CHD_DEPLOY_LOGOUT_MSG_KEY);
    if (deployMsg) {
      sessionStorage.removeItem(CHD_DEPLOY_LOGOUT_MSG_KEY);
      setLoginLoadError(deployMsg);
    }

    const storedBuildId = localStorage.getItem(CHD_APP_BUILD_ID_KEY);
    if (isAppBuildIdMismatch(storedBuildId)) {
      localStorage.setItem(CHD_APP_BUILD_ID_KEY, APP_BUILD_ID);
    }

    // Recover logged-in session via server token or cookie
    const storedToken = localStorage.getItem('CHD_AUTH_TOKEN') || (['localhost', '127.0.0.1', '0.0.0.0'].includes(window.location.hostname) ? 'cookie-session' : '');
    if (storedToken) {
      fetch('/api/auth/me', {
        headers: { 'Authorization': `Bearer ${storedToken}` }
      })
        .then(res => {
          if (!res.ok) throw new Error('Token expired');
          return res.json();
        })
        .then(async (staffData: Staff) => {
          localStorage.setItem(CHD_APP_BUILD_ID_KEY, APP_BUILD_ID);
          setAuthToken(storedToken);
          setCurrentStaff(staffData);
          try {
            await loadMedicalDataAfterAuth('full', {
              onSyncStatus: (status) => reportPullResult(status)
            });
            reportPullResult();
            void refreshSheetsSyncStatus();
          } catch (err) {
            handleAuthDataFailure(err);
          } finally {
            void hydrateSyncConfigFromServer()
              .then(() => migrateLocalSyncConfigToServer())
              .catch(err => console.warn('Sync config hydrate failed after session restore:', err));
          }
        })
        .catch(() => {
          localStorage.removeItem('CHD_AUTH_TOKEN');
          localStorage.removeItem('CHD_AUTH_STAFF_KEY');
          localStorage.removeItem(CHD_APP_BUILD_ID_KEY);
          setAuthToken('');
          setCurrentStaff(null);
          loadPublicStaffForLogin();
        });
    } else {
      loadPublicStaffForLogin();
    }
  }, [handleAuthDataFailure, loadMedicalDataAfterAuth, loadPublicStaffForLogin, reportPullResult, refreshSheetsSyncStatus]);

  // Detect new Cloudflare deploy while app is open → reload once for new bundle
  useEffect(() => {
    let cancelled = false;

    const checkVersion = async () => {
      const remoteBuildId = await fetchRemoteAppBuildId();
      if (cancelled || !remoteBuildId || remoteBuildId === APP_BUILD_ID) return;
      if (shouldBlockDeployReload()) return;
      void applyAppUpdate();
    };

    const onVisible = () => {
      if (document.hidden) return;
      void checkVersion();
    };

    void checkVersion();
    const interval = setInterval(() => { void checkVersion(); }, 5 * 60 * 1000);
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    return () => {
      cancelled = true;
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
    };
  }, [applyAppUpdate]);

  // Refresh data when user returns to the app (helps after deploy / background)
  useEffect(() => {
    if (!currentStaff?.StaffKey) return;
    const onVisible = () => {
      if (document.hidden) return;
      void refreshMedicalData('full', false, { silent: true }).catch(() => undefined);
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [currentStaff?.StaffKey, refreshMedicalData]);

  // Background Clinical Data Polling (Refresh every 60 seconds when logged in)
  useEffect(() => {
    if (!currentStaff?.StaffKey) return;

    const interval = setInterval(() => {
      if (document.hidden) return;
      void refreshMedicalData('full', false, { silent: true }).catch(err => {
        console.warn('Background auto data sync failed:', err);
      });
    }, 60 * 1000);

    return () => clearInterval(interval);
  }, [currentStaff?.StaffKey, refreshMedicalData]);

  useEffect(() => {
    if (!currentStaff?.StaffKey) return;
    const onBridgeDataUpdated = () => {
      // Avoid a third force-pull right after auth/manual sync; just apply bridge memory cache.
      if (wasRecentlyForceSynced()) {
        const cached = peekInMemoryMedicalDataBundle();
        if (cached) {
          applyMedicalDataBundle(cached, 'full', medicalDataSetters);
        }
        return;
      }
      const cached = peekInMemoryMedicalDataBundle();
      if (cached) {
        applyMedicalDataBundle(cached, 'full', medicalDataSetters);
        return;
      }
      void refreshMedicalData('full', false, { silent: true }).catch(err => {
        console.warn('Bridge cache refresh apply failed:', err);
      });
    };
    window.addEventListener('chd-bridge-data-updated', onBridgeDataUpdated);
    return () => window.removeEventListener('chd-bridge-data-updated', onBridgeDataUpdated);
  }, [currentStaff?.StaffKey, refreshMedicalData, wasRecentlyForceSynced, medicalDataSetters]);

  useEffect(() => {
    if (!currentStaff?.StaffKey || staffList.length === 0) return;
    const updated = staffList.find(staff => staff.StaffKey === currentStaff.StaffKey);
    if (updated && JSON.stringify(updated) !== JSON.stringify(currentStaff)) {
      setCurrentStaff(updated);
      localStorage.setItem('CurrentStaffKey', updated.StaffKey);
    }
  }, [staffList, currentStaff?.StaffKey]);

  useEffect(() => {
    if (currentStaff || staffList.length === 0) return;
    setLoginLoadError('');
  }, [staffList, currentStaff]);

  useEffect(() => {
    if (!currentStaff) return;
    if (activeMenu === 'profile') return;
    if (!canAccessModule(currentStaff, activeMenu as AppModule)) {
      setActiveMenu('workspace');
    }
  }, [currentStaff, activeMenu]);

  useEffect(() => {
    if (!currentStaff) return;
    const view = parseViewFromLocation();
    if (!view) return;
    const viewMap: Partial<Record<string, typeof activeMenu>> = {
      home: 'home',
      workspace: 'workspace',
      'schedule-tt': 'schedule-tt',
      patients: 'patients',
      'cathlab-room': 'cathlab-room',
    };
    const target = viewMap[view];
    if (target && canAccessModule(currentStaff, target as AppModule)) {
      setActiveMenu(target);
    }
    clearViewQueryParam();
  }, [currentStaff]);

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    const onServiceWorkerMessage = (event: MessageEvent) => {
      if (event.data?.type !== 'CHD_OPEN_URL' || !event.data.url) return;
      const nextUrl = new URL(String(event.data.url), window.location.origin);
      window.history.replaceState({}, '', `${nextUrl.pathname}${nextUrl.search}`);
      const view = nextUrl.searchParams.get('view');
      if (!view || !currentStaff) return;
      const viewMap: Partial<Record<string, typeof activeMenu>> = {
        home: 'home',
        workspace: 'workspace',
        'schedule-tt': 'schedule-tt',
        patients: 'patients',
        'cathlab-room': 'cathlab-room',
      };
      const target = viewMap[view];
      if (target && canAccessModule(currentStaff, target as AppModule)) {
        setActiveMenu(target);
      }
      clearViewQueryParam();
    };
    navigator.serviceWorker.addEventListener('message', onServiceWorkerMessage);
    return () => navigator.serviceWorker.removeEventListener('message', onServiceWorkerMessage);
  }, [currentStaff, activeMenu]);

  useEffect(() => {
    if (bottomScrollRef.current && activeMenu === 'consult-list') {
      const updateWidth = () => {
        if (bottomScrollRef.current) {
          setTableScrollWidth(bottomScrollRef.current.scrollWidth);
        }
      };
      
      updateWidth();
      const timer = setTimeout(updateWidth, 150);
      
      const observer = new ResizeObserver(() => {
        updateWidth();
      });
      observer.observe(bottomScrollRef.current);
      return () => {
        observer.disconnect();
        clearTimeout(timer);
      };
    }
  }, [consults, activeMenu]);

  const fetchStaff = () => {
    fetch('/api/staff')
      .then(res => res.json())
      .then(data => {
        setStaffList(data);
        if (data.length > 0) {
          setLoginStaffKey(data[0].StaffKey);
        }
      });
  };

  const fetchRolePresets = () => {
    fetch('/api/role-presets')
      .then(res => res.json())
      .then((data: RolePreset[]) => {
        setRolePresetRecords(data);
        setRuntimeRolePresets(data);
      })
      .catch(err => console.error('Failed to load role presets:', err));
  };

  const fetchPatients = () => {
    fetch('/api/patients')
      .then(res => res.json())
      .then(data => setPatients(data));
  };

  const fetchConsults = () => {
    fetch('/api/consults')
      .then(res => res.json())
      .then(data => setConsults(data));
  };

  // Login handler — server-side authentication
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');
    if (loginPending) return;

    if (!loginStaffKey) {
      setLoginError('Vui l\u00f2ng ch\u1ecdn nh\u00e2n vi\u00ean \u0111\u1ec3 \u0111\u0103ng nh\u1eadp!');
      return;
    }
    if (!loginPassword) {
      setLoginError('Vui l\u00f2ng nh\u1eadp m\u1eadt kh\u1ea9u!');
      return;
    }

    setLoginPending(true);
    try {
      if (sheetsSetupNeeded) {
        const scriptUrl = sheetsSetupUrl.trim();
        const scriptSecret = sheetsSetupSecret.trim();
        if (!scriptUrl.startsWith('https://script.google.com/macros/s/') || !scriptSecret) {
          setLoginError('Nhập Web App URL (https://script.google.com/macros/s/...) và khóa API, rồi đăng nhập lại.');
          return;
        }
        const saveRes = await fetch('/api/sync-config', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ scriptUrl, scriptSecret })
        });
        const saveData = await saveRes.json().catch(() => ({} as { error?: string }));
        if (!saveRes.ok) {
          setLoginError(saveData.error || 'Không lưu được cấu hình Google Sheets.');
          return;
        }
        setSheetsSetupSecret('');
        setSheetsSetupNeeded(false);
      }

      const res = await fetch('/api/auth/login', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ StaffKey: loginStaffKey, Password: loginPassword })
      });
      const data = await res.json();
      if (!res.ok) {
        const message = data.error || 'M\u1eadt kh\u1ea9u kh\u00f4ng \u0111\u00fang. Vui l\u00f2ng th\u1eed l\u1ea1i!';
        if (message === 'Máy chủ chưa cấu hình Google Sheets.') setSheetsSetupNeeded(true);
        setLoginError(message);
        return;
      }
      const { token, staff: staffData } = data as { token: string; staff: Staff };
      // Store ONLY the token — no password, no sensitive data in localStorage
      localStorage.setItem('CHD_AUTH_TOKEN', token);
      localStorage.setItem(CHD_APP_BUILD_ID_KEY, APP_BUILD_ID);
      // Remove legacy storage key if present
      localStorage.removeItem('CurrentStaffKey');
      sessionStorage.removeItem('CHD_INACTIVITY_LOGOUT_MSG');
      setCustomAlert(null);
      setLoginError('');
      setAuthToken(token);
      setCurrentStaff(staffData);
      setNewConsultData(prev => ({ ...prev, RequestBy: staffData.StaffName }));

      void (async () => {
        try {
          await loadMedicalDataAfterAuth('full', {
            onSyncStatus: (status) => reportPullResult(status)
          });
          reportPullResult();
          void refreshSheetsSyncStatus();
        } catch (err) {
          if (err instanceof AuthRequiredError) {
            handleAuthDataFailure(err);
            return;
          }
          reportPullResult();
          void refreshSheetsSyncStatus();
          const msg = err instanceof Error ? err.message : String(err);
          setLoginError(msg || 'Không tải được dữ liệu từ Google Sheets.');
        } finally {
          void hydrateSyncConfigFromServer()
            .then(() => migrateLocalSyncConfigToServer())
            .catch(err => console.warn('Sync config hydrate failed after login:', err));
        }
      })();
    } catch (err) {
      setLoginError('L\u1ed7i k\u1ebft n\u1ed1i. Vui l\u00f2ng ki\u1ec3m tra m\u1ea1ng v\u00e0 th\u1eed l\u1ea1i.');
    } finally {
      setLoginPending(false);
    }

  };

  // Logout handler
  const handleLogout = useCallback(() => {
    const token = localStorage.getItem('CHD_AUTH_TOKEN');
    if (token) {
      // Revoke token on server (fire-and-forget)
      fetch('/api/auth/logout', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      }).catch(() => {});
    }
    localStorage.removeItem('CHD_AUTH_TOKEN');
    localStorage.removeItem('CHD_AUTH_STAFF_KEY');
    localStorage.removeItem(CHD_APP_BUILD_ID_KEY);
    // Also clean up legacy keys
    localStorage.removeItem('CurrentStaffKey');
    if (currentStaff?.StaffKey) {
      localStorage.removeItem(`LastActivity_${currentStaff.StaffKey}`);
    }
    setAuthToken('');
    setCurrentStaff(null);
    setLoginPassword('');
    setLoginStaffKey('');
    setCustomAlert(null);

    // Reset React states of medical data to prevent data leakage
    setPatients([]);
    setConsults([]);
    setCathlabs([]);
    setOperations([]);
    setCmrs([]);
    setTransplants([]);
    setNotifications([]);
    setDoctorPerformanceMarks([]);

    // Keep the on-device copy so the next login opens immediately and syncs behind it.
    void clearLocalCache().catch(err => console.warn('Failed to clear memory cache on logout:', err));
  }, [currentStaff]);

  handleLogoutRef.current = handleLogout;

  // Restore inactivity-logout message on login screen (survives page refresh).
  useEffect(() => {
    if (currentStaff) return;
    const msg = sessionStorage.getItem('CHD_INACTIVITY_LOGOUT_MSG');
    if (msg) {
      setLoginError(msg);
    }
  }, [currentStaff]);

  // Auto logout / session timeout logic
  useEffect(() => {
    if (!currentStaff?.StaffKey) return;

    const staffKey = currentStaff.StaffKey;
    
    const getTimeoutMs = () => {
      const setting = localStorage.getItem(`SessionTimeout_${staffKey}`) || '30';
      if (setting === '1') return 60 * 1000;
      if (setting === '30') return 30 * 60 * 1000;
      if (setting === '60') return 60 * 60 * 1000;
      return 0; // 0 means unlimit
    };

    let timeoutMs = getTimeoutMs();

    const handleStorageChange = () => {
      timeoutMs = getTimeoutMs();
    };
    window.addEventListener('storage', handleStorageChange);

    const updateActivity = () => {
      localStorage.setItem(`LastActivity_${staffKey}`, Date.now().toString());
    };

    if (!localStorage.getItem(`LastActivity_${staffKey}`)) {
      updateActivity();
    }

    const activityEvents = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart'];
    let lastWrite = 0;
    const handleUserActivity = () => {
      const now = Date.now();
      if (now - lastWrite > 2000) { // Throttle writes
        updateActivity();
        lastWrite = now;
      }
    };

    activityEvents.forEach(evt => {
      window.addEventListener(evt, handleUserActivity);
    });

    const interval = setInterval(() => {
      if (timeoutMs <= 0) return;
      const lastActivityStr = localStorage.getItem(`LastActivity_${staffKey}`);
      if (lastActivityStr) {
        const lastActivity = parseInt(lastActivityStr, 10);
        if (!isNaN(lastActivity)) {
          const elapsed = Date.now() - lastActivity;
          if (elapsed >= timeoutMs) {
            const inactivityMsg = 'Phiên đăng nhập của bạn đã hết hạn do không hoạt động.';
            sessionStorage.setItem('CHD_INACTIVITY_LOGOUT_MSG', inactivityMsg);
            setCustomAlert(null);
            setLoginError(inactivityMsg);
            handleLogout();
          }
        }
      }
    }, 5000);

    return () => {
      window.removeEventListener('storage', handleStorageChange);
      activityEvents.forEach(evt => {
        window.removeEventListener(evt, handleUserActivity);
      });
      clearInterval(interval);
    };
  }, [currentStaff, handleLogout, triggerAlert]);

  const navigateMenu = (menuTarget: typeof activeMenu | string) => {
    const isMarks = menuTarget === 'staff-mgmt:marks';
    const isSettings = menuTarget === 'staff-mgmt:settings';
    const isGuide = menuTarget === 'staff-mgmt:guide';
    const menu = (isMarks || isSettings || isGuide) ? 'staff-mgmt' : menuTarget as typeof activeMenu;

    const performNavigation = () => {
      if (isMarks) {
        setStaffManagementInitialTab('marks');
      } else if (isSettings) {
        setStaffManagementInitialTab('settings');
      } else if (isGuide) {
        setStaffManagementInitialTab('guide');
      } else if (menu === 'staff-mgmt') {
        setStaffManagementInitialTab('edit');
      }
      if (menu === 'profile') {
        setProfileReturnMenu(activeMenu === 'profile' ? 'home' : activeMenu);
        setActiveMenu('profile');
        setIsStaffAccountMenuOpen(false);
        setIsMobileMoreMenuOpen(false);
        return;
      }
      const requiredModule: AppModule = isMarks
        ? 'staff-marks'
        : isSettings
          ? 'staff-settings'
          : isGuide
            ? 'staff-guide'
            : (menu as AppModule);
      if (!canAccessModule(currentStaff, requiredModule)) {
        triggerAlert('Bạn không có quyền truy cập module này.', MODAL_TITLE.warning);
        setActiveMenu('workspace');
        return;
      }
      setActiveMenu(menu);
      setIsMobileMoreMenuOpen(false);
    };

    if (
      isMobile &&
      activeMenu === 'schedule-tt' &&
      menu !== 'schedule-tt' &&
      scheduleTtMobileLeaveGuardRef.current
    ) {
      scheduleTtMobileLeaveGuardRef.current(performNavigation);
      return;
    }

    performNavigation();
  };

  const normalizeMobileQuickTabs = (staff: Staff, loaded: ActiveMenuId[]): ActiveMenuId[] => {
    const allowed = loaded.filter(id => canAccessModule(staff, id as AppModule));
    const pool = [...allowed];
    for (const def of DEFAULT_MOBILE_QUICK_SLOTS) {
      if (pool.length >= MOBILE_QUICK_SLOT_COUNT) break;
      if (!pool.includes(def) && canAccessModule(staff, def as AppModule)) pool.push(def);
    }
    return pool.slice(0, MOBILE_QUICK_SLOT_COUNT);
  };

  useEffect(() => {
    if (!currentStaff?.StaffKey) return;
    setMobileQuickTabIds(normalizeMobileQuickTabs(currentStaff, loadMobileQuickTabs(currentStaff.StaffKey)));
  }, [currentStaff?.StaffKey]);

  const handleMobileMoreNavigate = (menuId: ActiveMenuId) => {
    if (!currentStaff?.StaffKey) {
      navigateMenu(menuId);
      return;
    }
    setMobileQuickTabIds(prev => {
      const next = pinMobileQuickTab(prev, menuId);
      if (JSON.stringify(next) !== JSON.stringify(prev)) {
        saveMobileQuickTabs(currentStaff.StaffKey, next);
      }
      return next;
    });
    navigateMenu(menuId);
  };

  const openStaffProfile = () => {
    setProfileReturnMenu(activeMenu === 'profile' ? 'home' : activeMenu);
    setActiveMenu('profile');
  };

  // Auto detect pending consults count
  const handlePatientSelectChange = (patientKey: string) => {
    setNewConsultData(prev => ({ ...prev, PatientKey: patientKey }));
    if (!patientKey) {
      setPendingConsultsCount(0);
      return;
    }
    const matchingPending = consults.filter(c => c.PatientKey === patientKey && isPendingStaffConsult(c));
    setPendingConsultsCount(matchingPending.length);
  };

  // Set up a new patient insertion or update
  const handleAddPatientSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPatientData.PatientID1 || !newPatientData.PatientName) {
      triggerAlert('Vui lòng điền tối thiểu Mã bệnh nhân và Họ tên!', MODAL_TITLE.missingInfo);
      return;
    }

    const cleanID1 = newPatientData.PatientID1.trim().toLowerCase();
    const cleanID2 = newPatientData.PatientID2 ? newPatientData.PatientID2.trim().toLowerCase() : '';
    const cleanName = newPatientData.PatientName.trim().toLowerCase();
    
    // 1. Strict Warning — Patient ID duplicate check
    const duplicateIdPatient = patients.find(p => 
      String(p.PatientKey) !== String(editingPatientKey || '') && (
        String(p.PatientID1 || '').trim().toLowerCase() === cleanID1 ||
        (cleanID2 && p.PatientID2 && String(p.PatientID2).trim().toLowerCase() === cleanID2)
      )
    );

    if (duplicateIdPatient) {
      triggerAlert(PATIENT_VALIDATION_MSG.duplicateIdSuggestUpdate(duplicateIdPatient.PatientName), MODAL_TITLE.warning);
      return;
    }

    // 2. Relative Warning — duplicate Name + DOB check
    const duplicateInfoPatient = patients.find(p =>
      String(p.PatientKey) !== String(editingPatientKey || '') &&
      String(p.PatientName || '').trim().toLowerCase() === cleanName &&
      p.PatientDOB === newPatientData.PatientDOB
    );

    const proceedSave = () => {
      const patientKey = editingPatientKey || `pat_${Date.now()}`;
      const payload: Patient = {
        PatientKey: patientKey,
        PatientID1: String(newPatientData.PatientID1 || '').trim(),
        PatientID2: String(newPatientData.PatientID2 || '').trim(),
        PatientName: newPatientData.PatientName,
        OtherPatientName: newPatientData.OtherPatientName || '',
        PatientDOB: newPatientData.PatientDOB || '2020-01-01',
        PatientSex: newPatientData.PatientSex,
        PatientAddress: newPatientData.PatientAddress,
        PatientPhone1: newPatientData.PatientPhone1,
        PatientPhone2: newPatientData.PatientPhone2,
        PatientCreateBy: currentStaff?.StaffKey || '01378',
        PatientCreateTime: new Date().toISOString(),
        Outcome: newPatientData.Outcome
      };

      const isEdit = !!editingPatientKey;
      if (isEdit) {
        patchPatient(patientKey, payload);
      } else {
        addPatient(payload);
      }

      setShowAddPatient(false);
      setEditingPatientKey(null);
      setNewPatientData({
        PatientID1: '',
        PatientID2: '',
        PatientName: '',
        OtherPatientName: '',
        PatientDOB: '',
        PatientSex: 'Nam',
        PatientAddress: 'Hà Nội',
        PatientPhone1: '',
        PatientPhone2: '',
        Outcome: ''
      });
      setFormSuccessMessage('');
      setFormSuccessWarning(false);
      const url = isEdit ? `/api/patients/${patientKey}` : '/api/patients';
      const method = isEdit ? 'PUT' : 'POST';

      fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(withSyncContext(payload, buildSyncContext('patients', {
          patientName: payload.PatientName,
          patientKey: patientKey,
          patientID: payload.PatientID1
        })))
      })
        .then(res => {
          if (!res.ok) throw new Error('Không thể lưu hồ sơ bệnh nhi');
          return res.json();
        })
        .then(data => {
          showSaveFeedback(
            isEdit ? 'Cập nhật hồ sơ hành chính thành công' : 'Thêm bệnh nhi CHD mới thành công',
            data
          );
          return refreshConsultData();
        })
        .catch(err => {
          console.error(err);
          triggerAlert(err instanceof Error ? err.message : 'Không thể lưu hồ sơ bệnh nhi', MODAL_TITLE.saveError);
          refreshConsultData();
        });
    };

    if (duplicateInfoPatient) {
      triggerConfirm(
        `Bệnh nhân trùng họ tên và ngày sinh với bệnh nhi đã có trong hệ thống (Mã: ${duplicateInfoPatient.PatientID1}). Bạn có muốn tiếp tục tạo mới? Nên kiểm tra lại thông tin.`,
        () => {
          triggerConfirm(
            editingPatientKey 
              ? "Bạn có chắc chắn muốn LƯU những thay đổi hành chính này không?" 
              : "Bạn có chắc chắn muốn TẠO MỚI hồ sơ bệnh nhi này không?",
            proceedSave,
            MODAL_TITLE.confirm
          );
        },
        MODAL_TITLE.warning
      );
    } else {
      triggerConfirm(
        editingPatientKey 
          ? "Bạn có chắc chắn muốn LƯU những thay đổi hành chính này không?" 
          : "Bạn có chắc chắn muốn TẠO MỚI hồ sơ bệnh nhi này không?",
        proceedSave,
        MODAL_TITLE.confirm
      );
    }
  };

  // Reusable: open the "SỬA HỒ SƠ HÀNH CHÍNH" modal for a given patient (shared by MRI views/drawer)
  const handleEditPatientAdmin = (pat: Patient) => {
    setSelectedPatientForDetail(null);
    setEditingPatientKey(pat.PatientKey);
    setNewPatientData({
      PatientID1: pat.PatientID1,
      PatientID2: pat.PatientID2 || '',
      PatientName: pat.PatientName,
      OtherPatientName: pat.OtherPatientName || '',
      PatientDOB: pat.PatientDOB,
      PatientSex: pat.PatientSex,
      PatientAddress: pat.PatientAddress,
      PatientPhone1: pat.PatientPhone1,
      PatientPhone2: pat.PatientPhone2 || '',
      Outcome: pat.Outcome
    });
    setShowAddPatient(true);
  };

  // Consult reservation Form Submit
  const handleAddConsultSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newConsultData.PatientKey) {
      triggerAlert('Vui lòng chọn 1 bệnh nhân để đăng ký hội chẩn!', MODAL_TITLE.missingInfo);
      return;
    }

    const proceedSave = () => {
      const payload: Consult = {
        ConsultKey: `con_${Date.now()}`,
        PatientKey: newConsultData.PatientKey,
        ConsultType: newConsultData.ConsultType,
        PatientWeight: newConsultData.PatientWeight,
        PatientHeight: newConsultData.PatientHeight,
        ConsultDate: newConsultData.ConsultDate,
        RequestBy: newConsultData.RequestBy || currentStaff?.StaffName || 'BS Đăng Ký',
        DiagnosisID: newConsultData.DiagnosisID,
        DetailDiagnosis: newConsultData.DetailDiagnosis,
        Department: newConsultData.Department,
        ConsultCreateBy: currentStaff?.StaffKey || '01378',
        ConsultCreateTime: new Date().toISOString(),
        ConsultResultID: '', // Pending result ID
        DetailConsultResult: '',
        ConsultNote: newConsultData.ConsultNote,
        PlannedDevice: newConsultData.PlannedDevice,
        PlannedPrice: newConsultData.PlannedPrice,
        PriorityOrder: newConsultData.PriorityOrder,
        RiskFactor: newConsultData.RiskFactor,
        CheckDevice: newConsultData.CheckDevice,
        PDFTrigger: false
      };

      addConsult(payload);
      setNewConsultData(prev => ({
        ...prev,
        PatientKey: '',
        PatientWeight: '',
        PatientHeight: '',
        DetailDiagnosis: '',
        ConsultNote: '',
        PlannedDevice: '',
        PlannedPrice: '',
        Department: 'Tim Mạch'
      }));
      setShowAddDeptInput(false);
      setCustomDeptVal('');
      setShowAddDocInput(false);
      setCustomDocVal('');
      setPendingConsultsCount(0);
      setShowAddConsult(false);
      setActiveMenu('consult-list');

      fetch('/api/consults', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(withSyncContext(payload, buildSyncContext('consult-form', {
          patientName: patients.find(p => p.PatientKey === payload.PatientKey)?.PatientName,
          patientKey: payload.PatientKey
        })))
      })
        .then(res => {
          if (!res.ok) throw new Error('Không thể đăng ký hội chẩn');
          return res.json();
        })
        .then(data => {
          showSaveFeedback('Đã gửi thông tin đăng ký hội chẩn thành công', data);
          return refreshConsultData();
        })
        .catch(err => {
          console.error(err);
          triggerAlert(err instanceof Error ? err.message : 'Không thể đăng ký hội chẩn', MODAL_TITLE.saveError);
          refreshConsultData();
        });
    };

    triggerConfirm("Bạn có chắc chắn muốn Lưu đăng ký này không?", proceedSave, MODAL_TITLE.confirm);
  };

  // Prepare registration edit
  const makeRegisterEdit = (c: Consult) => {
    setEditingRegConsultKey(c.ConsultKey);
    setEditConsultData({
      ConsultType: c.ConsultType || 'Staff mổ',
      PatientWeight: restoreWeightFromDate(c.PatientWeight) || '',
      PatientHeight: restoreWeightFromDate(c.PatientHeight) || '',
      ConsultDate: c.ConsultDate || '',
      RequestBy: c.RequestBy || '',
      DiagnosisID: c.DiagnosisID || '',
      DetailDiagnosis: c.DetailDiagnosis || '',
      Department: c.Department || 'Tim Mạch',
      RiskFactor: c.RiskFactor || ''
    });
    setShowEditAddDeptInput(false);
    setCustomEditDeptVal('');
    setShowEditAddDocInput(false);
    setCustomEditDocVal('');
  };

  const submitConsultRegistrationUpdate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingRegConsultKey) return;

    const consultKey = editingRegConsultKey;
    patchConsult(consultKey, editConsultData);
    setEditingRegConsultKey(null);

    fetch(`/api/consults/${consultKey}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(withSyncContext(editConsultData, buildSyncContext('consult-list', {
        patientName: consults.find(c => c.ConsultKey === consultKey)?.PatientKey
          ? patients.find(p => p.PatientKey === consults.find(c => c.ConsultKey === consultKey)?.PatientKey)?.PatientName
          : undefined,
        patientKey: consults.find(c => c.ConsultKey === consultKey)?.PatientKey
      })))
    })
      .then(res => {
        if (!res.ok) throw new Error('Không thể cập nhật đăng ký staff');
        return res.json();
      })
      .then(data => {
        showSaveFeedback('Đã cập nhật thông tin đăng ký staff', data);
        return refreshConsultData();
      })
      .catch(err => {
        console.error(err);
        triggerAlert(err instanceof Error ? err.message : 'Không thể cập nhật đăng ký staff', MODAL_TITLE.saveError);
        refreshConsultData();
      });
  };

  const parseConsultDeleteErrorMessage = (raw: string, status: number): string => {
    const trimmed = String(raw || '').trim();
    if (!trimmed) return `HTTP ${status}`;
    try {
      const parsed = JSON.parse(trimmed) as { error?: string; message?: string };
      return parsed.error || parsed.message || trimmed;
    } catch {
      return trimmed;
    }
  };

  const executeDeleteConsultFromList = useCallback(async (consultKey: string) => {
    const key = consultKey.trim();
    if (!key) return;

    setConsultListConfirmDeleteKey(null);
    setConsultListDeletingKey(key);

    const consult = consults.find(c => c.ConsultKey === key);
    const patient = consult ? findPatientByKey(patients, consult.PatientKey) : undefined;
    const authToken = typeof localStorage !== 'undefined' ? localStorage.getItem('CHD_AUTH_TOKEN') || '' : '';

    try {
      const res = await fetch(`/api/consults/${encodeURIComponent(key)}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
        },
        body: JSON.stringify(withSyncContext({}, buildSyncContext('consult-list', {
          patientName: patient?.PatientName,
          patientKey: consult?.PatientKey,
        }))),
      });
      if (!res.ok) {
        const errText = await res.text();
        throw new Error(parseConsultDeleteErrorMessage(errText, res.status));
      }
      await res.json().catch(() => ({}));
      removeConsult(key);
      if (editingRegConsultKey === key) {
        setEditingRegConsultKey(null);
      }
      showSuccessBanner('Đã xóa lượt hội chẩn thành công.');
    } catch (err) {
      console.error(err);
      triggerAlert(
        err instanceof Error ? err.message : 'Không thể xoá lượt hội chẩn',
        MODAL_TITLE.warning
      );
      void refreshConsultData(true);
    } finally {
      setConsultListDeletingKey(null);
    }
  }, [consults, editingRegConsultKey, patients, refreshConsultData, removeConsult, triggerAlert]);

  // Emulate AppSheet Google Cloud Bot A4 PDF Generation Task
  const triggerPDFBotBuild = (consultKey: string) => {
    setPdfBotRunning(consultKey);
    
    fetch(`/api/consults/${consultKey}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ PDFTrigger: true })
    })
    .then(res => res.json())
    .then(() => {
      refreshConsultData();
      setTimeout(() => {
        fetch(`/api/consults/${consultKey}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            PDFTrigger: false,
            FilePDFBBHC: `/BBHC_${consultKey}_A4.pdf`
          })
        })
        .then(res => res.json())
        .then(() => {
          refreshConsultData();
          setPdfBotRunning(null);
        });
      }, 1500);
    });
  };

  // Excel (.xlsx) Real Export matching requested layout using ExcelJS for premium styling
  const handleExcelExportSimulator = () => {
    setExportLoading(true);
    setBotMessage('Bot "ExportConsultList" đang kiểm tra điều kiện [TriggerExport] = TRUE...');

    let checkDateStr = filterDate ? formatVNTime(filterDate) : 'Toàn bộ ngày';

    setTimeout(() => {
      setBotMessage('Lọc dữ liệu từ slice "DanhSachHoiChanLoc" theo Ngày & Loại hội chẩn...');
      setTimeout(async () => {
        try {
          const filtered = filteredConsultsListRef.current;
          if (filtered.length === 0) {
            triggerAlert('Không tìm thấy bản ghi nào khớp bộ lọc để xuất!', MODAL_TITLE.warning);
            setExportLoading(false);
            setBotMessage('');
            return;
          }

          // Import ExcelJS dynamically to keep initial bundle size light
          const ExcelJS = await import('exceljs');
          
          const workbook = new ExcelJS.Workbook();
          const worksheet = workbook.addWorksheet('DanhSachHoiChan');
          
          worksheet.pageSetup = {

            paperSize: 9, // A4
            orientation: 'landscape',
            fitToPage: true,
            fitToWidth: 1,
            fitToHeight: 0
          };

          // Custom Styles definitions
          const fontTimesNormal = { name: 'Times New Roman', size: 11 };
          const fontTimesBold = { name: 'Times New Roman', size: 11, bold: true };
          const fontTimesTitle = { name: 'Times New Roman', size: 16, bold: true };
          const fontTimesOrg = { name: 'Times New Roman', size: 11, bold: true };
          
          const centerAlignment = { horizontal: 'center' as const, vertical: 'middle' as const, wrapText: true };

          const thinBorder = {
            top: { style: 'thin' as const, color: { argb: 'FF808080' } },
            left: { style: 'thin' as const, color: { argb: 'FF808080' } },
            bottom: { style: 'thin' as const, color: { argb: 'FF808080' } },
            right: { style: 'thin' as const, color: { argb: 'FF808080' } }
          };

          // 1. Organization Information
          worksheet.addRow(["BỆNH VIỆN NHI ĐỒNG THÀNH PHỐ"]);
          worksheet.addRow(["KHOA TIM MẠCH"]);
          worksheet.addRow([]); // Spacer

          // 2. Title & Subtitle Info (Rows 4, 5, 6)
          worksheet.addRow(["DANH SÁCH HỘI CHẨN NỘI - NGOẠI KHOA TIM MẠCH"]);
          worksheet.addRow([`Ngày hội chẩn: ${checkDateStr}`]);
          worksheet.addRow([`Kiểu staff: ${filterType}`]);
          worksheet.addRow([]); // Spacer

          // Style Organization text blocks
          const cellA1 = worksheet.getCell('A1');
          cellA1.font = fontTimesOrg;
          const cellA2 = worksheet.getCell('A2');
          cellA2.font = fontTimesOrg;

          // Merge and style Header Title parts
          worksheet.mergeCells('A4:J4');
          const a4 = worksheet.getCell('A4');
          a4.font = fontTimesTitle;
          a4.alignment = centerAlignment;

          worksheet.mergeCells('A5:J5');
          const a5 = worksheet.getCell('A5');
          a5.font = fontTimesBold;
          a5.alignment = centerAlignment;

          worksheet.mergeCells('A6:J6');
          const a6 = worksheet.getCell('A6');
          a6.font = fontTimesBold;
          a6.alignment = centerAlignment;

          // 3. Table Header Structure (Row 8)
          const headers = ["STT", "Mã NB", "Họ và tên", "Thông tin", "Cân nặng", "Đăng ký", "Chẩn đoán", "Kết quả hội chẩn", "Dự trù dụng cụ", "Lưu ý"];
          const headerRow = worksheet.addRow(headers);
          headerRow.height = 28;

          // Style the complete table header columns
          headerRow.eachCell((cell) => {
            cell.font = fontTimesBold;
            cell.alignment = centerAlignment;
            cell.border = thinBorder;
            cell.fill = {
              type: 'pattern',
              pattern: 'solid',
              fgColor: { argb: 'FFEFEFEF' } // Clean soft neutral gray background
            };
          });

          // 4. Populate table body database records
          filtered.forEach((item, idx) => {
            const pat = getPatientByKey(item.PatientKey);
            const stt = idx + 1;
            const maNB = pat ? pat.PatientID1 : 'N/A';
            const hoTen = pat ? pat.PatientName : 'UNKNOWN';

            let infoText = '';
            if (pat) {
              const sex = pat.PatientSex || '';
              const dobText = formatVNTime(pat.PatientDOB) || '';
              const ageDesc = getPatientAgeDescriptionParen(pat.PatientDOB) || '';
              const phone1 = pat.PatientPhone1 || '';
              const phone2 = pat.PatientPhone2 || '';
              const address = pat.PatientAddress || (pat as any).PatientAddress || '';

              const lines = [];
              if (sex) lines.push(sex);
              if (dobText) lines.push(dobText);
              if (ageDesc) lines.push(ageDesc);
              if (phone1) lines.push(phone1);
              if (phone2) lines.push(phone2);
              if (address) lines.push(address);

              infoText = lines.filter(Boolean).join('\n');
            }

            const weightClean = item.PatientWeight ? restoreWeightFromDate(item.PatientWeight).replace(/kg/gi, '').trim() : '';
            const weightDisplay = weightClean ? `${weightClean} (kg)` : '';
            const heightClean = item.PatientHeight ? restoreWeightFromDate(item.PatientHeight).replace(/cm/gi, '').trim() : '';
            const heightDisplay = heightClean ? `${heightClean} (cm)` : '';

            const weightHeightLines = [];
            if (weightDisplay) weightHeightLines.push(weightDisplay);
            if (heightDisplay) weightHeightLines.push(heightDisplay);
            const weightHeightDisplay = weightHeightLines.join('\n');

            const dangKy = String(item.RequestBy || '');
            const chanDoan = String(item.DetailDiagnosis || item.DiagnosisID || '');
            const ketQua = String(item.ConsultResultID || '');
            const dungCu = String(item.PlannedDevice || '');
            const luuY = String(item.ConsultNote || '');

            const dataRow = worksheet.addRow([
              stt,
              maNB,
              hoTen,
              infoText,
              weightHeightDisplay,
              dangKy,
              chanDoan,
              ketQua,
              dungCu,
              luuY
            ]);

            // Formulate auto row height based on text content lines
            const infoLinesCount = infoText.split('\n').length;
            const weightLinesCount = weightHeightDisplay.split('\n').length;
            const maxTextLines = Math.max(infoLinesCount, weightLinesCount);
            const maxCharsInCell = Math.max(
              String(chanDoan).length,
              String(ketQua).length,
              String(dungCu).length,
              String(luuY).length
            );
            dataRow.height = Math.max(30, maxTextLines * 16, Math.ceil(maxCharsInCell / 32) * 15);

            // Style data row cells - Times New Roman, thin borders, centered alignment matching requested design
            dataRow.eachCell((cell) => {
              cell.font = fontTimesNormal;
              cell.border = thinBorder;
              // User specified: "Tất cả đều canh giữa ô (kể cả ô đã merge)" -> center-center alignment for all cells!
              cell.alignment = centerAlignment;
            });
          });

          // Adjust exact column widths to fit A4 paper beautifully
          worksheet.columns = [
            { width: 5 },   // STT
            { width: 12 },  // Mã NB
            { width: 20 },  // Họ và tên
            { width: 18 },  // Thông tin (Multi-line info centered with Wrap Text format)
            { width: 12 },  // Cân nặng
            { width: 11 },  // Đăng ký
            { width: 48 },  // Chẩn đoán
            { width: 28 },  // Kết quả hội chẩn
            { width: 24 },  // Dự trù dụng cụ
            { width: 24 }   // Lưu ý
          ];

          // Trigger stream buffer directly to native download
          const buffer = await workbook.xlsx.writeBuffer();
          const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
          const url = window.URL.createObjectURL(blob);
          const anchor = document.createElement('a');
          anchor.href = url;
          const cleanType = filterType === 'Tất cả' ? 'Giao_ban_Hoi_chan' : filterType.replace(/\s+/g, '_');
          const cleanDate = filterDate ? `Ngay_${filterDate.replace(/\//g, '-')}` : 'Toan_bo_ngay';
          anchor.download = `Danh_sach_${cleanType}_-_${cleanDate}.xlsx`;
          anchor.click();
          window.URL.revokeObjectURL(url);
          

          setBotMessage('Bot đã chạy Task 1 thành công: Tạo file Excel (.xlsx) danh sách hội chẩn tương thích 100% cực kỳ chuyên nghiệp!');
          setTimeout(() => {
            setExportLoading(false);
            setBotMessage('');
          }, 2000);

        } catch (error) {
          console.error("Export error:", error);
          triggerAlert('Có lỗi xảy ra khi tạo file Excel! Vui lòng kiểm tra lại.', MODAL_TITLE.notify);
          setExportLoading(false);
          setBotMessage('');
        }
      }, 1000);
    }, 1000);
  };



  // Restore Database Handlers
  const handleResetDatabase = () => {
    triggerConfirm(
      'Bạn có thực sự muốn hoàn tác toàn bộ dữ liệu trực tuyến về trạng thái mặc định ban đầu không?',
      () => {
        fetch('/api/reset', { method: 'POST' })
          .then(res => res.json())
          .then(() => {
            refreshConsultData();
            refreshFullData();
            triggerAlert('Khôi phục cơ sở dữ liệu về mặc định thành công!', MODAL_TITLE.notify);
          });
      },
      MODAL_TITLE.confirm
    );
  };

  const deferredPatientSearch = useDeferredValue(patientSearch);
  const deferredConsultListSearch = useDeferredValue(consultListSearch);

  const patientByPatientKey = useMemo(() => {
    const map = new Map<string, Patient>();
    for (const p of patients) {
      const pk = normalizePatientKey(p.PatientKey);
      if (pk) map.set(pk, p);
    }
    return map;
  }, [patients]);

  const patientSearchIndex = useMemo(() => {
    return patients.map((p) => ({
      patient: p,
      nameKey: removeDiacritics(String(p.PatientName || '')).toLowerCase(),
      id1Key: String(p.PatientID1 || '').toLowerCase(),
      id2Key: String(p.PatientID2 || '').toLowerCase(),
      addrKey: removeDiacritics(String(p.PatientAddress || '')).toLowerCase(),
    }));
  }, [patients]);

  const filteredPatients = useMemo(() => {
    const q = deferredPatientSearch || '';
    if (!normalizeListSearchQuery(q)) return patients;
    return patientSearchIndex
      .filter((row) =>
        matchesPatientIdentitySearch(q, {
          PatientName: row.patient.PatientName,
          PatientID1: row.patient.PatientID1,
          PatientID2: row.patient.PatientID2,
        }) ||
        matchesListSearchQuery(q, [row.patient.PatientAddress])
      )
      .sort((a, b) =>
        compareByPatientSearchScore(
          q,
          a.patient.PatientName || '',
          b.patient.PatientName || '',
          [a.patient.PatientID1, a.patient.PatientID2].filter(Boolean) as string[],
          [b.patient.PatientID1, b.patient.PatientID2].filter(Boolean) as string[]
        )
      )
      .map((row) => row.patient);
  }, [patients, patientSearchIndex, deferredPatientSearch]);

  const getLatestDiagnosisForPatient = useMemo(
    () => createLatestDiagnosisResolver(consults, cathlabs, operations),
    [consults, cathlabs, operations]
  );

  useEffect(() => {
    setMobilePatientVisibleCount(MOBILE_PATIENTS_BATCH);
  }, [patientSearch, activeMenu]);

  const handlePatientTableScroll = useCallback(() => {
    if (!isMobile) return;
    const el = patientTableScrollRef.current;
    if (!el || mobilePatientVisibleCount >= filteredPatients.length) return;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 240) {
      setMobilePatientVisibleCount(prev =>
        Math.min(prev + MOBILE_PATIENTS_BATCH, filteredPatients.length)
      );
    }
  }, [isMobile, mobilePatientVisibleCount, filteredPatients.length]);

  const PATIENTS_PER_PAGE = 50;
  const totalPatientPages = Math.ceil(filteredPatients.length / PATIENTS_PER_PAGE) || 1;
  const displayedPatients = useMemo(() => {
    if (isMobile) return filteredPatients.slice(0, mobilePatientVisibleCount);
    return filteredPatients.slice(
      (patientCurrentPage - 1) * PATIENTS_PER_PAGE,
      patientCurrentPage * PATIENTS_PER_PAGE
    );
  }, [filteredPatients, isMobile, patientCurrentPage, mobilePatientVisibleCount]);

  const CONSULTS_PER_PAGE = 100;
  const filteredConsultsList = useMemo(() => {
    const q = deferredConsultListSearch;
    const qNorm = normalizeListSearchQuery(q);

    const list = consults.filter(c => {
      const typeMatch = filterType === 'Tất cả' || c.ConsultType === filterType;
      const dateMatch = !filterDate || c.ConsultDate === filterDate;
      if (!typeMatch || !dateMatch || !isPendingStaffConsult(c)) return false;

      const pat = patientByPatientKey.get(normalizePatientKey(c.PatientKey));
      if (!pat) return false;

      if (!qNorm) return true;
      return (
        matchesPatientIdentitySearch(q, {
          PatientName: pat.PatientName,
          PatientID1: pat.PatientID1,
          PatientID2: pat.PatientID2,
        }) ||
        matchesListSearchQuery(q, [c.DiagnosisID, c.DetailDiagnosis])
      );
    });

    list.sort((a, b) => {
      if (consultSortField === 'name') {
        const patA = patientByPatientKey.get(normalizePatientKey(a.PatientKey));
        const patB = patientByPatientKey.get(normalizePatientKey(b.PatientKey));
        const nameA = removeDiacritics(String(patA?.PatientName || '')).toLowerCase();
        const nameB = removeDiacritics(String(patB?.PatientName || '')).toLowerCase();
        const cmp = nameA.localeCompare(nameB, 'vi');
        return consultSortOrder === 'asc' ? cmp : -cmp;
      }

      const cmp = dateSortNumber(a.ConsultDate) - dateSortNumber(b.ConsultDate);
      if (cmp !== 0) return consultSortOrder === 'asc' ? cmp : -cmp;
      return String(a.ConsultKey || '').localeCompare(String(b.ConsultKey || ''));
    });

    if (qNorm) {
      list.sort((a, b) => {
        const patA = patientByPatientKey.get(normalizePatientKey(a.PatientKey));
        const patB = patientByPatientKey.get(normalizePatientKey(b.PatientKey));
        return compareByPatientSearchScore(
          q,
          patA?.PatientName || '',
          patB?.PatientName || '',
          [patA?.PatientID1, patA?.PatientID2].filter(Boolean) as string[],
          [patB?.PatientID1, patB?.PatientID2].filter(Boolean) as string[]
        );
      });
    }

    return list;
  }, [
    consults,
    patientByPatientKey,
    filterType,
    filterDate,
    deferredConsultListSearch,
    consultSortField,
    consultSortOrder,
    isPendingStaffConsult,
  ]);
  filteredConsultsListRef.current = filteredConsultsList;
  const totalConsultPages = Math.ceil(filteredConsultsList.length / CONSULTS_PER_PAGE) || 1;
  const displayedConsults = useMemo(() => {
    if (isMobile) return filteredConsultsList.slice(0, mobileConsultVisibleCount);
    return filteredConsultsList.slice(
      (consultCurrentPage - 1) * CONSULTS_PER_PAGE,
      consultCurrentPage * CONSULTS_PER_PAGE
    );
  }, [filteredConsultsList, isMobile, consultCurrentPage, mobileConsultVisibleCount]);

  useEffect(() => {
    setMobileConsultVisibleCount(MOBILE_CONSULTS_BATCH);
  }, [consultListSearch, activeMenu, filterType, filterDate]);

  const handleConsultListTableScroll = useCallback(() => {
    handleBottomScroll();
    if (!isMobile || activeMenu !== 'consult-list') return;
    const el = bottomScrollRef.current;
    if (!el || mobileConsultVisibleCount >= filteredConsultsList.length) return;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 240) {
      setMobileConsultVisibleCount(prev =>
        Math.min(prev + MOBILE_CONSULTS_BATCH, filteredConsultsList.length)
      );
    }
  }, [activeMenu, filteredConsultsList.length, isMobile, mobileConsultVisibleCount]);

  const applyConsultListSearch = useCallback((value: string) => {
    startConsultListSearchTransition(() => {
      setConsultListSearch(value);
      setConsultCurrentPage(1);
      setMobileConsultVisibleCount(MOBILE_CONSULTS_BATCH);
    });
  }, [startConsultListSearchTransition]);

  const primarySideMenus = useMemo(
    () => SIDEBAR_MENU_ITEMS.filter(menu => canAccessModule(currentStaff, menu.id as AppModule)),
    [currentStaff]
  );

  const mobileBottomTabIds = useMemo(
    () => mobileQuickTabIds.filter(id => canAccessModule(currentStaff, id as AppModule)),
    [currentStaff, mobileQuickTabIds]
  );

  const mobileMoreMenuItems = useMemo(
    () => getMobileMoreMenuItems().filter(item => canAccessModule(currentStaff, item.id as AppModule)),
    [currentStaff]
  );

  const openAddPatientForm = useCallback(() => {
    setEditingPatientKey(null);
    setNewPatientData({
      PatientID1: '',
      PatientID2: '',
      PatientName: '',
      OtherPatientName: '',
      PatientDOB: '',
      PatientSex: 'Nam',
      PatientAddress: 'Hà Nội',
      PatientPhone1: '',
      PatientPhone2: '',
      Outcome: ''
    });
    setShowAddPatient(true);
  }, []);

  const openAddConsultForm = useCallback(() => {
    setNewConsultData({
      PatientKey: '',
      ConsultType: 'Staff mổ',
      PatientWeight: '',
      PatientHeight: '',
      ConsultDate: new Date().toISOString().split('T')[0],
      RequestBy: '',
      DiagnosisID: '',
      DetailDiagnosis: '',
      Department: 'Tim Mạch',
      PriorityOrder: 'Chương trình',
      RiskFactor: '3 - Không HF, HF độ I-II / có chỉ định mổ',
      CheckDevice: '',
      ConsultNote: '',
      PlannedDevice: '',
      PlannedPrice: ''
    });
    setPendingConsultsCount(0);
    setShowAddConsult(true);
  }, []);

  const handlePatientSubheaderSearch = useCallback((value: string) => {
    setPatientSearch(value);
    setPatientCurrentPage(1);
    setMobilePatientVisibleCount(MOBILE_PATIENTS_BATCH);
  }, []);

  const handleConsultSubheaderSearch = applyConsultListSearch;

  // Return Login screen if not authenticated
  if (!currentStaff) {
    return (
      <div className={`min-h-screen bg-muted flex flex-col items-center p-4 font-sans ${isMobile ? 'justify-start pt-[max(1.5rem,env(safe-area-inset-top))]' : 'justify-center'}`}>
        <div className="w-full max-w-sm bg-card text-card-foreground border border-border rounded-xl p-6 md:p-8 shadow-sm">
          <div className="text-center mb-6">
            <div className="inline-flex items-center justify-center size-12 rounded-lg bg-primary text-primary-foreground mb-3">
              <Heart className="w-5 h-5" />
            </div>
            <h1 className="text-xl font-semibold tracking-tight text-foreground">CHD Management 5.0</h1>
            <p className="text-sm text-muted-foreground mt-1.5 leading-relaxed">
              Hệ thống quản lý tim bẩm sinh
              <br />
              Khoa Tim mạch — Bệnh viện Nhi Đồng Thành phố
            </p>
            <p className="text-xs text-muted-foreground font-mono mt-2">
              Phiên bản {CHD_VERSION_LABEL}
            </p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4" autoComplete="off">
            {((loginLoadError && staffList.length === 0) || loginError) && (
              <div className="space-y-2">
                <div className="bg-destructive/10 border border-destructive/30 text-destructive rounded-lg p-3 text-sm leading-relaxed flex gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{(loginLoadError && staffList.length === 0) ? loginLoadError : loginError}</span>
                </div>
                {loginLoadError && staffList.length === 0 && (
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full"
                    onClick={() => {
                      localStorage.removeItem('chd_apps_script_url');
                      fetch('/api/sync-config', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ scriptUrl: '' })
                      })
                        .then(() => {
                          window.location.reload();
                        })
                        .catch(() => {
                          window.location.reload();
                        });
                    }}
                  >
                    <Unlink className="w-3.5 h-3.5" />
                    Sử dụng Database Offline (Hủy liên kết Sheets)
                  </Button>
                )}
              </div>
            )}

            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-foreground">
                Tên nhân viên
              </label>
              <select
                value={loginStaffKey}
                onChange={(e) => {
                  setLoginStaffKey(e.target.value);
                  setLoginPassword('');
                }}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]"
              >
                <option value="" disabled>-- Chọn nhân viên --</option>
                {staffList.map((s) => (
                  <option key={s.StaffKey} value={s.StaffKey}>
                    {s.Name || s.StaffName} ({s.Role})
                  </option>
                ))}
              </select>
            </div>

            {sheetsSetupNeeded && (
              <div className="space-y-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-950">
                <p className="text-sm leading-relaxed">
                  Máy chủ chưa lưu kết nối Google Sheets. Dán Web App URL và khóa API, rồi bấm Đăng nhập.
                </p>
                <div className="space-y-1.5">
                  <label className="block text-sm font-medium">
                    Web App URL
                  </label>
                  <Input
                    type="url"
                    value={sheetsSetupUrl}
                    onChange={(e) => setSheetsSetupUrl(e.target.value)}
                    autoComplete="off"
                    placeholder="https://script.google.com/macros/s/.../exec"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="block text-sm font-medium">
                    Khóa API
                  </label>
                  <Input
                    type="password"
                    value={sheetsSetupSecret}
                    onChange={(e) => setSheetsSetupSecret(e.target.value)}
                    autoComplete="new-password"
                    placeholder="Khóa API trong Apps Script"
                  />
                </div>
              </div>
            )}

            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-foreground">
                Mật khẩu
              </label>
              <Input
                type="password"
                required
                disabled={!loginStaffKey}
                autoComplete="new-password"
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                placeholder={loginStaffKey ? "Nhập Password nhân viên" : "Vui lòng chọn nhân viên trước"}
              />
            </div>

            <Button type="submit" disabled={loginPending} className="w-full">
              <UserCheck className="w-4 h-4" /> {loginPending ? 'Đang đăng nhập...' : 'Đăng nhập'}
            </Button>
          </form>
        </div>
      </div>
    );
  }

  const handleHeaderMenuToggle = () => {
    if (isMobile) {
      setIsMobileMoreMenuOpen(prev => !prev);
      return;
    }
    setIsSidebarExpanded(prev => !prev);
  };

  return (
    <SheetsSyncFeedbackProvider
      onSuccessBanner={handleSheetsSuccessBanner}
      onRefreshNotifications={() => {
        void refreshMedicalData('full', true, { silent: true });
      }}
      onRefreshSheetsStatus={refreshSheetsSyncStatus}
    >
    <ViewSubheaderProvider>
    <div className="app-shell flex flex-row bg-background text-foreground font-sans overflow-hidden">
      <Sidebar collapsed={!isSidebarExpanded}>
        <SidebarHeader>
          <div className={`flex items-center gap-2 px-2 py-1.5 ${isSidebarExpanded ? '' : 'justify-center px-0'}`}>
            <button
              type="button"
              onClick={() => setIsSidebarExpanded(prev => !prev)}
              title={isSidebarExpanded ? 'Thu gọn sidebar' : 'Mở rộng sidebar'}
              aria-label={isSidebarExpanded ? 'Thu gọn sidebar' : 'Mở rộng sidebar'}
              className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors cursor-pointer"
            >
              <Heart className="size-4" />
            </button>
            {isSidebarExpanded && (
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold leading-none">CHD</p>
                <p className="truncate text-xs text-muted-foreground mt-1">{currentStaff.StaffName}</p>
              </div>
            )}
          </div>
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel>Điều hướng</SidebarGroupLabel>
            <SidebarMenu>
              {primarySideMenus.map((menu) => (
                <SidebarMenuItem key={menu.id}>
                  <SidebarMenuButton
                    isActive={activeMenu === menu.id}
                    title={menu.label}
                    onClick={() => navigateMenu(menu.id as typeof activeMenu)}
                  >
                    {getNavIcon(menu.id as ActiveMenuId)}
                    <span className="truncate group-data-[collapsed=true]/sidebar:hidden">{menu.label}</span>
                    {menu.id === 'results-staff' && pendingStaffConsultCount > 0 && (
                      isSidebarExpanded ? (
                        <Badge variant="secondary" className="ml-auto group-data-[collapsed=true]/sidebar:hidden">
                          {pendingStaffConsultCount}
                        </Badge>
                      ) : (
                        <span className="absolute top-1 right-1 size-2 rounded-full bg-primary" />
                      )
                    )}
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroup>
        </SidebarContent>
        <SidebarFooter>
          {isSidebarExpanded && (
            <Button variant="outline" size="sm" className="w-full" onClick={handleResetDatabase}>
              Kiểm Reset Database
            </Button>
          )}
          {isSidebarExpanded && (
            <p className="px-2 text-center text-[10px] font-mono text-muted-foreground break-all" title={CHD_VERSION_LABEL}>
              {CHD_VERSION_LABEL}
            </p>
          )}
        </SidebarFooter>
      </Sidebar>
      <SidebarInset>
      <header className="bg-background text-foreground shrink-0 border-b border-border pt-[env(safe-area-inset-top)]">
        <div className="max-w-none px-3 md:px-4 py-2 flex items-center justify-between min-h-[52px] gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="md:hidden"
              onClick={handleHeaderMenuToggle}
              title="Mở menu module"
            >
              <PanelLeft className="size-4" />
            </Button>
            <h1 className="text-sm font-semibold tracking-tight truncate text-foreground">
              {MAIN_HEADER_TITLE}
            </h1>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => refreshFullData(true)}
              disabled={isMedicalDataSyncing}
              title={isMedicalDataSyncing ? 'Đang đồng bộ...' : 'Đồng bộ lại dữ liệu từ Google Sheets'}
            >
              <RefreshCw className={`size-3.5 ${isMedicalDataSyncing ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">Đồng bộ</span>
            </Button>

            <Badge
              variant={sheetsSyncBadge.tone === 'error' ? 'destructive' : 'secondary'}
              className="max-w-[7.5rem] sm:max-w-none truncate"
              title={sheetsSyncBadge.title}
            >
              {sheetsSyncBadge.label}
            </Badge>

            <span className="hidden md:inline-flex items-center rounded-md border border-border bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
              V5.0
            </span>

            {/* Workflow notifications */}
            <BellNotificationMenu
              staff={currentStaff}
              notifications={notifications}
              patients={patients}
              consults={consults}
              isOpen={isNotificationMenuOpen}
              onToggle={() => {
                setIsNotificationMenuOpen(prev => !prev);
                setIsStaffAccountMenuOpen(false);
              }}
              onClose={() => setIsNotificationMenuOpen(false)}
              onMarkRead={markNotificationRead}
            />

            {/* Staff account menu */}
            <StaffAccountMenu
              staff={currentStaff}
              isOpen={isStaffAccountMenuOpen}
              onToggle={() => {
                setIsStaffAccountMenuOpen(prev => !prev);
                setIsNotificationMenuOpen(false);
              }}
              onClose={() => setIsStaffAccountMenuOpen(false)}
              onViewProfile={openStaffProfile}
            />

            {/* Logout Button */}
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={handleLogout}
              title="Đăng xuất"
            >
              <LogOut className="size-4" />
            </Button>
          </div>

        </div>
      </header>

      <SubheaderRenderer />
      <AppInlineSubheader
        activeMenu={activeMenu}
        patientSearch={patientSearch}
        onPatientSearchChange={handlePatientSubheaderSearch}
        onAddPatient={openAddPatientForm}
        consultListSearch={consultListSearch}
        onConsultListSearchChange={handleConsultSubheaderSearch}
        onAddConsult={openAddConsultForm}
        profileName={currentStaff?.StaffName}
      />

      {/* Hero success/error notifications */}
      {formSuccessMessage && (
        <div className={`border-b px-4 py-2 text-center text-sm ${formSuccessWarning ? 'border-amber-200 bg-amber-50 text-amber-950' : 'border-emerald-200 bg-emerald-50 text-emerald-950'}`}>
          {formSuccessMessage}
        </div>
      )}

      {(medicalDataLoadState.phase === 'loading' || medicalDataLoadState.phase === 'syncing') && (
        <div className="border-b border-border bg-muted text-foreground text-center py-2 px-3 text-sm flex items-center justify-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin shrink-0" />
          <span>
            {medicalDataLoadState.backgroundSync
              ? (medicalLoadElapsedSec > 0
                ? `Đang đồng bộ ngầm Google Sheets... ${medicalLoadElapsedSec}s`
                : 'Đang đồng bộ ngầm Google Sheets...')
              : medicalDataLoadState.phase === 'loading'
                ? (medicalLoadElapsedSec > 0
                  ? `Đang tải dữ liệu vào app... ${medicalLoadElapsedSec}s`
                  : 'Đang tải dữ liệu vào app...')
                : (medicalLoadElapsedSec > 0
                  ? `Đang đồng bộ Google Sheets... ${medicalLoadElapsedSec}s`
                  : 'Đang đồng bộ Google Sheets...')}
          </span>
        </div>
      )}

      {medicalDataLoadState.phase === 'error' && medicalDataLoadState.message && (
        <div className="relative z-30 border-b border-destructive/30 bg-destructive/10 text-destructive text-center py-2 px-3 text-sm flex flex-col sm:flex-row items-center justify-center gap-2 flex-wrap">
          <div className="flex items-start sm:items-center justify-center gap-2 min-w-0">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 sm:mt-0" />
            <span className="min-w-0 leading-snug">{medicalDataLoadState.message}</span>
          </div>
          <Button
            type="button"
            size="sm"
            onClick={() => refreshFullData(true)}
            className="relative z-30 shrink-0"
          >
            Đồng bộ lại
          </Button>
        </div>
      )}

      {medicalDataLoadState.phase === 'ready' && medicalDataLoadState.message && (
        <div className="relative z-30 border-b border-amber-200 bg-amber-50 text-amber-950 text-center py-2 px-3 text-sm flex flex-col sm:flex-row items-center justify-center gap-2 flex-wrap">
          <div className="flex items-start sm:items-center justify-center gap-2 min-w-0">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 sm:mt-0" />
            <span className="min-w-0 leading-snug">{medicalDataLoadState.message}</span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button
              type="button"
              size="sm"
              onClick={() => refreshFullData(true)}
              className="relative z-30"
            >
              Đồng bộ lại
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setMedicalDataLoadState(prev => ({ ...prev, message: undefined }))}
              className="relative z-30"
            >
              Đóng
            </Button>
          </div>
        </div>
      )}

      {/* Dual Panel Workspace Block */}
      <div className="app-main-workspace max-w-none px-2 sm:px-3 md:px-4 xl:px-6 mx-auto py-1 md:py-2 xl:py-4 flex-1 w-full flex flex-row gap-2 md:gap-3 xl:gap-4 overflow-hidden min-h-0 pb-[var(--mobile-bottom-nav-offset)] md:pb-2 xl:pb-4">
        
        {/* Primary View content frame */}
        <main className={`flex-1 min-w-0 h-full flex flex-col min-h-0 ${activeMenu === 'home' || activeMenu === 'profile' || activeMenu === 'cathlab-room' || activeMenu === 'cathlab-report' || activeMenu === 'heart-transplant' || activeMenu === 'surgery-room' || activeMenu === 'patients' || activeMenu === 'schedule-tt' || activeMenu === 'schedule-view' || activeMenu === 'archive' || activeMenu === 'mri-overview' || activeMenu === 'mri-scheduler' || activeMenu === 'mri-register' || activeMenu === 'mri-result' || activeMenu === 'mri-calendar' || activeMenu === 'surgery-scheduler' || activeMenu === 'surgery-schedule-view' || activeMenu === 'google-sheets' || activeMenu === 'chd-daily-brief' || activeMenu === 'results-staff' || activeMenu === 'consult-list' || activeMenu === 'staff-mgmt' ? (activeMenu === 'home' ? 'overflow-y-auto md:overflow-hidden' : 'overflow-hidden') : 'overflow-y-auto'}`}>
          
          {/* HOME PANEL */}
          {activeMenu === 'home' && (
            <HomeDashboard 
              onNavigate={(menu) => navigateMenu(menu as typeof activeMenu)}
              patientCount={patients.length}
              pendingConsultCount={pendingStaffConsultCount}
              completedConsultCount={completedStaffConsultCount}
              onOpenScheduler={(type) => setActiveScheduler(type)}
              onOpenRules={(type) => setActiveRules(type)}
              currentStaffName={currentStaff?.StaffName}
              patients={patients}
              consults={consults}
              cathlabs={cathlabs}
              canAccessModule={(module) => canAccessModule(currentStaff, module)}
              triggerAlert={triggerAlert}
            />
          )}

          {activeMenu === 'profile' && currentStaff && (
            <div className="flex-1 min-h-0 h-full overflow-hidden p-4 sm:p-6">
              <StaffProfileView
                staff={currentStaff}
                staffList={staffList}
                patients={patients}
                consults={consults}
                cathlabs={cathlabs}
                operations={operations}
                doctorPerformanceMarks={doctorPerformanceMarks}
                onClose={() => setActiveMenu(profileReturnMenu)}
                onStaffUpdated={(updated) => {
                  setCurrentStaff(updated);
                  localStorage.setItem('CurrentStaffKey', updated.StaffKey);
                  refreshStaffData();
                }}
                triggerAlert={triggerAlert}
                webPush={{
                  supported: webPush.supported,
                  configured: webPush.configured,
                  subscribed: webPush.subscribed,
                  permission: webPush.permission,
                  loading: webPush.loading,
                  error: webPush.error,
                  warning: webPush.warning,
                  enablePush: webPush.enablePush,
                  disablePush: webPush.disablePush,
                  testPush: webPush.testPush,
                  resetDismiss: webPush.resetDismiss,
                }}
              />
            </div>
          )}

          {/* WORKSPACE DASHBOARD */}
          {activeMenu === 'workspace' && (
            <WorkspaceDashboard 
              onNavigate={(menu) => {
                if (menu === 'archive') {
                  setArchiveInitialTab('archive');
                }
                navigateMenu(menu as typeof activeMenu);
              }}
              patientCount={patients.length}
              pendingConsultCount={pendingStaffConsultCount}
              pendingMriCount={cmrs.filter(c => !c.CMRScheduledDate).length + consults.filter(c => String(c.ConsultResultID || '').trim().toLowerCase() === 'chụp mri').length}
              canAccessModule={(module) => canAccessModule(currentStaff, module)}
            />
          )}

          {/* PATIENT MANAGER PANEL */}
          {activeMenu === 'patients' && (
            <div className="flex-1 min-h-0 h-full flex flex-col bg-background p-2 sm:p-4 gap-2 sm:gap-3 overflow-hidden">
              
              <div className="mobile-view-shell flex flex-col shrink-0 md:hidden">
                <h2 className="text-sm font-semibold text-foreground tracking-tight flex items-center gap-1.5">
                  <Heart className="w-4 h-4" /> Hồ sơ bệnh án
                </h2>
                
                <div className="flex items-center gap-1.5">
                  <div className="mobile-view-search-wrap relative flex-1 min-w-0 flex items-center bg-background border border-input">
                    <Search className="w-4 h-4 text-muted-foreground absolute left-2.5 top-1/2 -translate-y-1/2" />
                    <SearchTextInput
                      type="text"
                      placeholder="Tìm tên, mã NB, chẩn đoán..."
                      value={patientSearch}
                      onChange={(value) => {
                        setPatientSearch(value);
                        setPatientCurrentPage(1);
                        setMobilePatientVisibleCount(MOBILE_PATIENTS_BATCH);
                      }}
                      className="mobile-view-search-input w-full pl-8 pr-8 bg-transparent border-0 text-sm focus:outline-none focus:ring-0 font-sans"
                    />
                    {patientSearch && (
                      <button 
                        onClick={() => {
                          setPatientSearch('');
                          setPatientCurrentPage(1);
                          setMobilePatientVisibleCount(MOBILE_PATIENTS_BATCH);
                        }}
                        className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600 cursor-pointer"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>

                  <Button
                    type="button"
                    size="icon"
                    onClick={openAddPatientForm}
                    title="Thêm bệnh nhi mới"
                    aria-label="Thêm bệnh nhi mới"
                  >
                    <Plus className="w-4 h-4" />
                  </Button>
                </div>
              </div>

              <Card className="flex-1 min-h-0 gap-0 py-0 rounded-xl shadow-sm overflow-hidden">
                
                <div
                  ref={patientTableScrollRef}
                  onScroll={handlePatientTableScroll}
                  className="flex-1 overflow-x-auto overflow-y-auto custom-scrollbar"
                >
                  <table className="w-full text-left text-sm border-collapse min-w-[720px]">
                    <TableHeader className="sticky top-0 z-10 bg-muted/40">
                      <TableRow className="hover:bg-transparent">
                        <TableHead className="sticky left-0 z-20 bg-muted min-w-[140px]">Họ và tên bé</TableHead>
                        <TableHead>Ngày sinh</TableHead>
                        <TableHead>Giới tính</TableHead>
                        <TableHead>Địa chỉ</TableHead>
                        <TableHead>Chẩn đoán gần nhất</TableHead>
                        <TableHead className="text-right">Chi tiết</TableHead>
                      </TableRow>
                    </TableHeader>
                    <tbody className="divide-y divide-slate-100 font-semibold text-slate-700">
                      {filteredPatients.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="text-center py-10 italic text-slate-400">
                            Không tìm thấy hồ sơ bệnh nhi nào khớp với truy vấn tìm kiếm.
                          </td>
                        </tr>
                      ) : (
                        <>
                        {displayedPatients.map((pat) => {
                          const latestDiagnosis = getLatestDiagnosisForPatient(pat.PatientKey);
                          return (
                            <tr 
                              key={pat.PatientKey} 
                              onClick={() => setSelectedPatientForDetail(pat)}
                              className="hover:bg-muted/50 cursor-pointer transition duration-150 group border-b"
                            >
                              <td className="py-3 px-4 sticky left-0 z-[5] bg-card group-hover:bg-muted shadow-[2px_0_4px_-2px_rgba(15,23,42,0.08)] min-w-[140px]">
                                <p className="font-medium text-foreground leading-tight">{pat.PatientName}</p>
                                <p className="text-[10px] text-slate-400 mt-0.5 font-mono">Mã HS: {pat.PatientID1}</p>
                              </td>
                              <td className="py-3 px-4 font-normal text-slate-600">{formatVNTime(pat.PatientDOB)}</td>
                              <td className="py-3 px-4">
                                <span className={`px-2 py-0.5 rounded text-[10px] border ${pat.PatientSex === 'Nam' ? 'bg-blue-50 text-blue-800 border-blue-200' : 'bg-pink-50 text-pink-800 border-pink-200'}`}>
                                  {pat.PatientSex}
                                </span>
                              </td>
                              <td className="py-3 px-4 text-slate-600 font-medium truncate max-w-[150px]">{pat.PatientAddress || (pat as any).PatientAddress || ''}</td>
                              <td className="py-3 px-4">
                                {latestDiagnosis ? (
                                  <div className="flex flex-col">
                                    <span className="text-red-700 bg-red-50 border border-red-100 font-extrabold px-1.5 py-0.5 rounded text-[10px] font-mono w-max">
                                      {latestDiagnosis.code || '—'}
                                    </span>
                                    {latestDiagnosis.detail ? (
                                      <span className="text-[10px] text-slate-400 font-bold italic truncate max-w-[140px] mt-0.5">
                                        {latestDiagnosis.detail}
                                      </span>
                                    ) : (
                                      <span className="text-[10px] text-slate-400 font-bold italic truncate max-w-[140px] mt-0.5">
                                        Không có mô tả chi tiết
                                      </span>
                                    )}
                                  </div>
                                ) : (
                                  <span className="text-[10px] text-slate-400 font-bold italic">Chưa có chẩn đoán</span>
                                )}
                              </td>
                              <td className="py-3 px-4 text-right">
                                <button 
                                  className="text-muted-foreground group-hover:text-foreground transition translate-x-0 group-hover:translate-x-1 duration-200"
                                >
                                  <ChevronRight className="w-4 h-4 ml-auto" />
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                        {isMobile && filteredPatients.length > displayedPatients.length && (
                          <tr>
                            <td colSpan={6} className="py-3 text-center text-[10px] text-slate-400 font-semibold bg-slate-50/80">
                              {displayedPatients.length} / {filteredPatients.length} bệnh nhi · Cuộn để tải thêm
                            </td>
                          </tr>
                        )}
                        </>
                      )}
                    </tbody>
                  </table>
                </div>

                <div className="hidden md:flex bg-muted/40 border-t border-border px-4 py-3 flex-col sm:flex-row items-center justify-between gap-3 shrink-0">
                  <div className="text-xs text-muted-foreground">
                    Tổng số: {filteredPatients.length} / {patients.length} bệnh nhi tim bẩm sinh CHD 
                    {filteredPatients.length > 0 && (
                      <span className="text-foreground ml-1">
                        (Trang {patientCurrentPage} / {totalPatientPages} - Hiển thị {(patientCurrentPage - 1) * PATIENTS_PER_PAGE + 1} đến {Math.min(patientCurrentPage * PATIENTS_PER_PAGE, filteredPatients.length)})
                      </span>
                    )}
                  </div>
                  
                  {totalPatientPages > 1 && (
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => setPatientCurrentPage(1)}
                        disabled={patientCurrentPage === 1}
                        className="h-8 rounded-md border border-input bg-background px-2 text-xs font-medium text-foreground hover:bg-accent disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                      >
                        Đầu
                      </button>
                      <button
                        onClick={() => setPatientCurrentPage(p => Math.max(1, p - 1))}
                        disabled={patientCurrentPage === 1}
                        className="h-8 rounded-md border border-input bg-background px-2 text-xs font-medium text-foreground hover:bg-accent disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                      >
                        Trước
                      </button>
                      
                      <span className="text-xs font-semibold text-slate-700 px-2 font-mono">
                        {patientCurrentPage} / {totalPatientPages}
                      </span>
                      
                      <button
                        onClick={() => setPatientCurrentPage(p => Math.min(totalPatientPages, p + 1))}
                        disabled={patientCurrentPage === totalPatientPages}
                        className="h-8 rounded-md border border-input bg-background px-2 text-xs font-medium text-foreground hover:bg-accent disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                      >
                        Sau
                      </button>
                      <button
                        onClick={() => setPatientCurrentPage(totalPatientPages)}
                        disabled={patientCurrentPage === totalPatientPages}
                        className="h-8 rounded-md border border-input bg-background px-2 text-xs font-medium text-foreground hover:bg-accent disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                      >
                        Cuối
                      </button>
                    </div>
                  )}
                </div>

              </Card>

            </div>
          )}

          {/* NEW CONSULT REGISTRATION OVERLAY DIALOG MODAL */}
          <AnimatePresence>
            {showAddConsult && (
              <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-3 md:p-4 pb-[var(--mobile-bottom-nav-offset)] md:pb-4">
                <div className="bg-white rounded-xl max-w-xl w-full max-h-[min(88dvh,calc(100dvh-var(--mobile-bottom-nav-offset)-0.5rem))] md:max-h-[92vh] shadow-2xl border border-slate-150 flex flex-col overflow-hidden text-xs text-slate-700 font-semibold leading-relaxed animate-in zoom-in-95 duration-150">
                  
                  <div className="flex items-center justify-between border-b border-slate-150 px-6 py-3.5 text-primary shrink-0">
                    <h3 className="font-extrabold text-sm uppercase flex items-center gap-1.5 font-sans">
                      <ClipboardList className="w-5 h-5 animate-pulse" /> Đăng ký staff
                    </h3>
                    <button 
                      type="button"
                      onClick={() => {
                        triggerConfirm("Bạn có chắc chắn muốn Hủy đăng ký không?", () => {
                          setShowAddConsult(false);
                        }, MODAL_TITLE.confirm);
                      }}
                      className="text-slate-400 hover:text-slate-600 transition cursor-pointer"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>

                  <form onSubmit={handleAddConsultSubmit} className="flex-1 flex flex-col overflow-hidden min-h-0 font-semibold text-slate-700">
                    
                    {/* Scrollable Form body */}
                    <div className="flex-1 overflow-y-auto overscroll-contain px-6 py-4 space-y-3.5 scrollbar-thin min-h-0">
                    
                    {/* Searchable Patient Selection Block */}
                    <div className="bg-slate-50 border border-slate-150 p-4 rounded-2xl space-y-3">
                      <div className="flex items-center justify-between">
                        <label className="block text-primary font-extrabold uppercase text-[10px]">
                          Chọn Bệnh nhi cần đăng ký *
                        </label>
                        <button
                          type="button"
                          onClick={() => {
                            setEditingPatientKey(null);
                            setNewPatientData({
                              PatientID1: '',
                              PatientID2: '',
                              PatientName: '',
                              OtherPatientName: '',
                              PatientDOB: '',
                              PatientSex: 'Nam',
                              PatientAddress: 'Hà Nội',
                              PatientPhone1: '',
                              PatientPhone2: '',
                              Outcome: ''
                            });
                            setShowAddPatient(true);
                          }}
                          className="bg-primary/10 hover:bg-primary/20 text-primary font-extrabold px-3 py-1 rounded-lg text-[10px] transition flex items-center gap-1 cursor-pointer"
                        >
                          <Plus className="w-3 h-3" /> Mới
                        </button>
                      </div>

                      {/* Search Input - Only show when no patient is selected */}
                      {!newConsultData.PatientKey && (
                        <div className="relative">
                          <input
                            type="text"
                            placeholder="🔍 Nhập tên hoặc mã ID1 của bệnh nhi..."
                            value={searchPatientQuery}
                            onChange={(e) => setSearchPatientQuery(e.target.value)}
                            className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs focus:outline-none placeholder-slate-400 font-semibold"
                          />
                        </div>
                      )}

                      {/* Filtered list dropdown simulator - Only show when search query is typed and no patient is selected yet */}
                      {!newConsultData.PatientKey && searchPatientQuery.trim().length > 0 && (
                        <div className="max-h-48 overflow-y-auto border border-slate-200 rounded-xl bg-white divide-y divide-slate-100 shadow-sm">
                          {(() => {
                            const trimmedQuery = removeDiacritics(searchPatientQuery).toLowerCase().trim();
                            const matched = patients.filter(p => {
                              const nameOk = p.PatientName ? removeDiacritics(String(p.PatientName)).toLowerCase().includes(trimmedQuery) : false;
                              const idOk = p.PatientID1 ? removeDiacritics(String(p.PatientID1)).toLowerCase().includes(trimmedQuery) : false;
                              return nameOk || idOk;
                            });

                            if (matched.length === 0) {
                              return <div className="p-3 text-center text-slate-400 italic">Không tìm thấy bệnh nhi "{searchPatientQuery}"</div>;
                            }

                            // Slice to 15 items maximum to run lightning fast and lag-free!
                            return matched.slice(0, 15).map(p => (
                              <button
                                key={p.PatientKey}
                                type="button"
                                onClick={() => {
                                  handlePatientSelectChange(p.PatientKey);
                                  setSearchPatientQuery(''); // Clear search input
                                }}
                                className="w-full text-left px-3 py-2.5 text-xs transition flex justify-between items-center cursor-pointer hover:bg-pink-50 hover:text-primary"
                              >
                                <div>
                                  <span className="font-extrabold uppercase">{p.PatientName}</span>
                                  <span className="text-[10px] text-slate-500 font-mono ml-1">(ID1: {p.PatientID1})</span>
                                </div>
                                <span className="text-[10px] font-mono italic text-slate-400">{formatVNTime(p.PatientDOB)} | {p.PatientSex === 'Nữ' ? 'Nữ' : 'Nam'}</span>
                              </button>
                            ));
                          })()}
                        </div>
                      )}

                      {/* Selected Patient details complex card */}
                      {newConsultData.PatientKey && (() => {
                        const selectedPat = getPatientByKey(newConsultData.PatientKey);
                        if (!selectedPat) return null;
                        return (
                          <div className="bg-pink-50/70 border border-pink-100 rounded-2xl p-4 text-xs text-slate-800 relative shadow-sm">
                            <div className="flex items-start justify-between">
                              <div className="space-y-2">
                                <h4 className="font-black text-sm uppercase text-primary flex items-center gap-2">
                                  <span>👤 {selectedPat.PatientName}</span>
                                  <span className="bg-white border border-pink-200 text-primary text-[10px] px-2 py-0.5 rounded-full font-mono normal-case">{selectedPat.PatientSex}</span>
                                </h4>
                                
                                <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 mt-2.5">
                                  <div>
                                    <span className="font-extrabold text-slate-400 uppercase text-[9px] block">Mã ID1:</span>
                                    <span className="font-mono text-[11px] font-bold text-slate-800">{selectedPat.PatientID1}</span>
                                  </div>
                                  <div>
                                    <span className="font-extrabold text-slate-400 uppercase text-[9px] block">Mã ID2:</span>
                                    <span className="font-mono text-[11px] font-bold text-slate-800">{selectedPat.PatientID2 || '—'}</span>
                                  </div>
                                  <div>
                                    <span className="font-extrabold text-slate-400 uppercase text-[9px] block">Ngày sinh:</span>
                                    <span className="font-bold text-slate-800">{formatVNTime(selectedPat.PatientDOB)}</span>
                                  </div>
                                  <div>
                                    <span className="font-extrabold text-slate-400 uppercase text-[9px] block">SĐT liên hệ:</span>
                                    <span className="font-bold text-slate-800 font-mono">{selectedPat.PatientPhone1 || selectedPat.PatientPhone2 || '��'}</span>
                                  </div>
                                  <div className="col-span-2">
                                    <span className="font-extrabold text-slate-400 uppercase text-[9px] block">Địa chỉ thường trú:</span>
                                    <span className="font-bold text-slate-800">{selectedPat.PatientAddress || (selectedPat as any).PatientAddress || 'Không rõ địa chỉ'}</span>
                                  </div>
                                </div>
                              </div>
                              <button
                                type="button"
                                onClick={() => {
                                  handlePatientSelectChange('');
                                  setSearchPatientQuery('');
                                }}
                                className="bg-white hover:bg-pink-100 hover:text-primary transition text-slate-400 font-bold w-6 h-6 rounded-full flex items-center justify-center border border-pink-100 cursor-pointer shadow-sm ml-2"
                                title="Bỏ chọn & Tìm bệnh nhân khác"
                              >
                                ✕
                              </button>
                            </div>
                          </div>
                        );
                      })()}

                      {/* Red/Amber Warning if already has pending consults in system */}
                      {newConsultData.PatientKey && consults.some(c => c.PatientKey === newConsultData.PatientKey && isPendingStaffConsult(c)) && (
                        <div className="bg-rose-50 border border-rose-200 text-rose-700 rounded-xl p-3 text-[11px] flex gap-2">
                          <AlertTriangle className="w-5 h-5 shrink-0 text-rose-600 mt-0.5" />
                          <div>
                            <p className="font-extrabold">Bệnh nhân đã có 01 lượt đăng ký. Đang chờ hội chẩn. Mời thoát ra để đổi ngày hội chẩn</p>
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-slate-500 font-bold uppercase text-[10px] mb-1">Kiểu staff *</label>
                        <div className="grid grid-cols-2 gap-2">
                          {(['Staff thông', 'Staff mổ'] as ConsultTypeEnum[]).map(type => (
                            <button
                              key={type}
                              type="button"
                              onClick={() => setNewConsultData(prev => ({ ...prev, ConsultType: type }))}
                              className={`rounded-xl px-3 py-2 font-extrabold border transition ${
                                newConsultData.ConsultType === type
                                  ? 'bg-primary text-white border-primary shadow-sm'
                                  : 'bg-white text-slate-600 border-slate-200 hover:border-primary/40'
                              }`}
                            >
                              {type}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div>
                        <label className="block text-slate-500 font-bold uppercase text-[10px] mb-1">Ngày staff *</label>
                        <VNDateInput
                          required
                          value={newConsultData.ConsultDate}
                          onChange={(val) => setNewConsultData(prev => ({ ...prev, ConsultDate: val }))}
                          className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 font-bold font-sans focus:outline-none"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-3 max-md:grid-cols-12 gap-3">
                      <div className="max-md:col-span-2">
                        <label className="block text-slate-500 font-bold uppercase text-[10px] mb-1">Cân nặng (kg) *</label>
                        <input
                          type="text"
                          required
                          placeholder="vd: 12"
                          value={newConsultData.PatientWeight}
                          onChange={(e) => setNewConsultData(prev => ({ ...prev, PatientWeight: e.target.value }))}
                          className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 font-bold focus:outline-none"
                        />
                      </div>

                      <div className="max-md:col-span-2">
                        <label className="block text-slate-500 font-bold uppercase text-[10px] mb-1">Chiều cao (cm)</label>
                        <input
                          type="text"
                          placeholder="vd: 85"
                          value={newConsultData.PatientHeight}
                          onChange={(e) => setNewConsultData(prev => ({ ...prev, PatientHeight: e.target.value }))}
                          className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 font-semibold focus:outline-none"
                        />
                      </div>

                      <div className="max-md:col-span-8 min-w-0">
                        <label className="block text-slate-500 font-bold uppercase text-[10px] mb-1">Người đăng ký *</label>
                        <SearchableEnumSelect
                          required
                          options={registrationDoctorOptions}
                          value={newConsultData.RequestBy || ''}
                          onChange={(val) => setNewConsultData(prev => ({ ...prev, RequestBy: val }))}
                          allowCreate
                          createLabel={(val) => `Thêm BS "${val}"`}
                          placeholder="-- Chọn BS --"
                          searchPlaceholder="Gõ tên BS..."
                          className="min-w-0"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-slate-500 font-bold uppercase text-[10px] mb-1">Khoa nội trú</label>
                      <SearchableEnumSelect
                        options={registrationDepartmentOptions}
                        value={newConsultData.Department || ''}
                        onChange={(val) => setNewConsultData(prev => ({ ...prev, Department: val as any }))}
                        allowCreate
                        createLabel={(val) => `Thêm khoa "${val}"`}
                        placeholder="-- Không bắt buộc --"
                        searchPlaceholder="Gõ tên khoa..."
                      />
                    </div>

                    <div>
                      <label className="block text-slate-500 font-bold uppercase text-[10px] mb-1">Chẩn đoán chi tiết *</label>
                      <MobileAutoExpandTextarea
                        minRows={2}
                        required
                        placeholder="Điền kết luận siêu âm tim hoặc chẩn đoán chi tiết trong hồ sơ"
                        value={newConsultData.DetailDiagnosis}
                        onChange={(e) => setNewConsultData(prev => ({ ...prev, DetailDiagnosis: e.target.value }))}
                        className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 font-semibold placeholder-slate-400 focus:outline-none text-xs"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-3 mt-3">
                      <div>
                        <label className="block text-slate-400 font-bold uppercase text-[10px] mb-1">Người tạo Đăng ký</label>
                        <input
                          type="text"
                          disabled
                          value={(() => {
                            const creatorId = currentStaff?.StaffKey;
                            return staffList.find(s => s.StaffKey === creatorId)?.StaffName || creatorId || '01378';
                          })()}
                          className="w-full bg-slate-100 text-slate-400 border border-slate-200 rounded-xl px-3 py-2 font-bold font-sans text-[11px]"
                        />
                      </div>
                      <div>
                        <label className="block text-slate-400 font-bold uppercase text-[10px] mb-1 font-sans">Đăng ký lúc</label>
                        <input
                          type="text"
                          disabled
                          value={formatDateTime(new Date().toISOString())}
                          className="w-full bg-slate-100 text-slate-400 border border-slate-200 rounded-xl px-3 py-2 font-mono text-[11px]"
                        />
                      </div>
                    </div>

                  </div>

                  {/* Fixed Footer with Actions */}
                  <div className="border-t border-slate-150 px-4 md:px-6 py-3.5 bg-slate-50 flex gap-3 shrink-0 rounded-b-3xl w-full pb-[max(0.75rem,env(safe-area-inset-bottom))] md:pb-3.5">
                    <button
                      type="button"
                      onClick={() => {
                        triggerConfirm("Bạn có chắc chắn muốn Hủy đăng ký không?", () => {
                          setShowAddConsult(false);
                        }, MODAL_TITLE.confirm);
                      }}
                      className="flex-1 bg-white hover:bg-slate-100 text-slate-700 font-extrabold uppercase py-2 rounded-xl transition border border-slate-200 shadow-sm cursor-pointer text-xs"
                    >
                      Hủy
                    </button>
                    <button
                      type="submit"
                      className="flex-1 bg-primary hover:bg-pink-700 text-white font-extrabold uppercase py-2 rounded-xl transition shadow-md cursor-pointer text-xs"
                    >
                      Lưu đăng ký
                    </button>
                  </div>

                </form>

                </div>
              </div>
            )}
          </AnimatePresence>

          {/* ACTIVE CONSULTATION LIST (Hội chẩn split screen, Screenshot 5) */}
          {activeMenu === 'consult-list' && (
            <div className="flex-1 min-h-0 h-full flex flex-col lg:flex-row gap-3 w-full bg-background p-2 sm:p-4 overflow-hidden">
              
              <Card className="flex-1 min-h-0 gap-0 py-0 rounded-xl shadow-sm min-w-0 overflow-hidden flex flex-col">
                
                <div className="mobile-view-shell shrink-0 flex flex-col border-b border-border px-3 py-2 md:hidden">
                  <div>
                    <h3 className="font-semibold text-foreground flex items-center gap-1.5 text-sm">
                      <ClipboardCheck className="w-4 h-4" />
                      Đăng ký hội chẩn
                    </h3>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <div className="mobile-view-search-wrap relative flex-1 min-w-0 flex items-center bg-background border border-input">
                      <Search className="w-4 h-4 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                      <SearchTextInput
                        type="text"
                        placeholder="Tìm tên, ID1 bệnh nhi..."
                        debounceMs={280}
                        value={consultListSearch}
                        onChange={applyConsultListSearch}
                        className="mobile-view-search-input w-full pl-8 pr-8 bg-transparent border-0 text-sm focus:outline-none focus:ring-0 font-sans"
                      />
                      {consultListSearch && (
                        <button 
                          onClick={() => {
                            applyConsultListSearch('');
                          }}
                          className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600 cursor-pointer"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      onClick={() => setIsFilterExpanded(true)}
                      className="lg:hidden shrink-0"
                      title="Bộ lọc & xuất báo cáo"
                      aria-label="Bộ lọc"
                    >
                      <Filter className="w-4 h-4" />
                    </Button>
                    <Button
                      type="button"
                      size="icon"
                      onClick={openAddConsultForm}
                      title="Đăng kí staff"
                      aria-label="Đăng kí staff"
                    >
                      <Plus className="w-4 h-4" />
                    </Button>
                  </div>
                </div>

                <div 
                  ref={topScrollRef} 
                  onScroll={handleTopScroll}
                  className="hidden sm:block shrink-0 overflow-x-auto overflow-y-hidden select-none mb-1 scrollbar-thin" 
                  style={{ height: '8px' }}
                >
                  <div style={{ width: `${tableScrollWidth}px`, height: '1px' }}></div>
                </div>

                <div 
                  ref={bottomScrollRef} 
                  onScroll={handleConsultListTableScroll}
                  className="flex-1 min-h-0 overflow-x-auto overflow-y-auto custom-scrollbar"
                >
                  <table className="w-full text-left text-sm border-collapse min-w-[360px] md:min-w-[850px]">
                    <TableHeader className="sticky top-0 z-10 bg-muted/40">
                      <TableRow className="hover:bg-transparent">
                        <TableHead
                          className="sticky left-0 z-20 bg-muted min-w-[140px] shadow-[2px_0_4px_-2px_rgba(15,23,42,0.08)] md:static md:z-auto md:min-w-0 md:shadow-none cursor-pointer hover:text-foreground select-none"
                          onClick={() => {
                            setConsultSortField('name');
                            setConsultSortOrder(prev => (consultSortField === 'name' ? (prev === 'asc' ? 'desc' : 'asc') : 'asc'));
                          }}
                          title="Click để sắp xếp tên A-Z / Z-A"
                        >
                          <div className="flex items-center gap-1">
                            <span>Bệnh nhi</span>
                            <SortColumnIcon active={consultSortField === 'name'} order={consultSortOrder} />
                          </div>
                        </TableHead>
                        <TableHead className="hidden md:table-cell">Kiểu staff</TableHead>
                        <TableHead className="hidden md:table-cell">Chẩn đoán</TableHead>
                        <TableHead
                          className="cursor-pointer hover:text-foreground select-none"
                          onClick={() => {
                            setConsultSortField('date');
                            setConsultSortOrder(prev => (consultSortField === 'date' ? (prev === 'asc' ? 'desc' : 'asc') : 'desc'));
                          }}
                          title="Click để sắp xếp theo ngày staff"
                        >
                          <div className="flex items-center gap-1">
                            <span>Ngày staff</span>
                            <SortColumnIcon active={consultSortField === 'date'} order={consultSortOrder} />
                          </div>
                        </TableHead>
                        <TableHead>BS đăng ký</TableHead>
                        <TableHead className="md:hidden text-center w-10">Xóa</TableHead>
                        <TableHead className="hidden md:table-cell text-right">Biên bản PDF / Kịch bản</TableHead>
                      </TableRow>
                    </TableHeader>
                    <tbody className="divide-y divide-slate-100 font-semibold text-slate-700">
                      {filteredConsultsList.length === 0 ? (
                        <tr>
                          <td colSpan={isMobile ? 4 : 6} className="text-center py-8 italic text-slate-400">
                            Hộp thư rỗng. Không tìm thấy đợt hội chẩn nào khớp với bộ lọc dữ liệu.
                          </td>
                        </tr>
                      ) : (
                        displayedConsults.map((item) => {
                          const pat = getPatientByKey(item.PatientKey);
                          if (!pat) return null;

                          return (
                            <tr 
                              key={item.ConsultKey} 
                              onClick={() => makeRegisterEdit(item)}
                              className="hover:bg-muted/50 cursor-pointer transition duration-150 group border-b"
                            >
                              <td className="py-3 px-3 sticky left-0 z-[5] bg-card group-hover:bg-muted min-w-[140px] shadow-[2px_0_4px_-2px_rgba(15,23,42,0.08)] md:static md:z-auto md:min-w-0 md:shadow-none">
                                <p className="font-medium text-foreground leading-tight">{pat.PatientName}</p>
                                <p className="text-[10px] text-slate-500 font-mono">MNB: {pat.PatientID1}</p>
                              </td>
                              <td className="hidden md:table-cell py-3 px-3 text-xs text-muted-foreground">{item.ConsultType}</td>
                              <td className="hidden md:table-cell py-3 px-3">
                                <div className="flex flex-col">
                                  <span className="text-red-700 bg-red-50 border border-red-200 font-bold px-1.5 py-0.5 rounded text-[10px] font-mono w-max">{item.DiagnosisID}</span>
                                  {item.DetailDiagnosis && (
                                    <span className="text-[10px] text-slate-400 font-medium truncate max-w-[150px] mt-0.5" title={item.DetailDiagnosis}>{item.DetailDiagnosis}</span>
                                  )}
                                </div>
                              </td>
                              <td className="py-3 px-3 font-mono font-bold text-slate-600 text-[11px]">
                                {formatVNTime(item.ConsultDate)}
                              </td>
                              <td className="py-3 px-3 font-semibold text-slate-700 text-xs">
                                {item.RequestBy || '—'}
                              </td>
                              <td className="md:hidden py-2 px-2 text-center align-middle" onClick={(e) => e.stopPropagation()}>
                                <button
                                  type="button"
                                  disabled={consultListDeletingKey === item.ConsultKey}
                                  onClick={() => setConsultListConfirmDeleteKey(item.ConsultKey)}
                                  className="inline-flex items-center justify-center w-9 h-9 rounded-full border border-red-100 bg-red-50 text-red-600 hover:bg-red-100 disabled:opacity-40 cursor-pointer transition"
                                  title="Xoá đăng ký hội chẩn"
                                  aria-label="Xoá đăng ký hội chẩn"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </td>
                              <td className="hidden md:table-cell py-3 px-3 text-right" onClick={(e) => e.stopPropagation()}>
                                <div className="flex items-center justify-end gap-2">
                                  {item.ConsultResultID && !item.FilePDFBBHC && (
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        triggerPDFBotBuild(item.ConsultKey);
                                      }}
                                      disabled={pdfBotRunning === item.ConsultKey}
                                      className="bg-slate-800 hover:bg-slate-700 text-white font-extrabold px-2 py-1 rounded text-[10px] transition disabled:opacity-50 cursor-pointer"
                                    >
                                      {pdfBotRunning === item.ConsultKey ? 'Bot compiling...' : 'Tạo Biên bản'}
                                    </button>
                                  )}

                                  {item.FilePDFBBHC && (
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setSelectedConsultForPDF(item);
                                        setSelectedPatientForPDF(pat);
                                      }}
                                      className="bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 font-extrabold px-2 py-1 rounded text-[10px] flex items-center gap-0.5 shadow-sm cursor-pointer"
                                    >
                                      <Printer className="w-3 h-3" /> Xem Biên Bản
                                    </button>
                                  )}

                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      makeRegisterEdit(item);
                                    }}
                                    className="bg-secondary hover:bg-primary hover:text-primary-foreground border border-border font-medium px-1.5 py-1 rounded-md text-[10px] transition cursor-pointer"
                                    title="Sửa"
                                  >
                                    ✏️
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>

                {consultListConfirmDeleteKey && (() => {
                  const consultToDelete = consults.find(c => c.ConsultKey === consultListConfirmDeleteKey);
                  const pat = consultToDelete ? getPatientByKey(consultToDelete.PatientKey) : null;
                  const keyToDelete = consultListConfirmDeleteKey;
                  return (
                    <div className="md:hidden fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
                      <div className="bg-white rounded-xl max-w-sm w-full shadow-2xl border border-slate-200 p-6 animate-in zoom-in-95 duration-150 text-slate-700 text-xs">
                        <div className="flex items-center gap-3 text-red-650 mb-3.5">
                          <div className="bg-red-50 p-2 rounded-full border border-red-150">
                            <AlertTriangle className="w-6 h-6 text-red-600" />
                          </div>
                          <div>
                            <h4 className="font-extrabold text-sm uppercase font-sans tracking-wide text-red-600">
                              Xác nhận xoá
                            </h4>
                            <p className="text-[10px] text-slate-500 font-semibold normal-case">Hành động này không thể hoàn tác</p>
                          </div>
                        </div>
                        <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3.5 mb-4 space-y-1.5">
                          {pat && (
                            <p className="font-bold text-slate-800">
                              Bệnh nhi: <span className="font-semibold text-foreground">{pat.PatientName}</span>
                            </p>
                          )}
                          {consultToDelete && (
                            <>
                              <p className="font-semibold text-slate-650">
                                Mã bệnh nhân: <span className="font-bold font-mono text-slate-800">{pat?.PatientID1 || '—'}</span>
                              </p>
                              <p className="font-semibold text-slate-650">
                                Loại hội chẩn: <span className="font-bold text-slate-800">{consultToDelete.ConsultType}</span>
                              </p>
                              <p className="font-semibold text-slate-650">
                                Ngày hội chẩn: <span className="font-bold font-mono text-slate-800">{formatVNTime(consultToDelete.ConsultDate)}</span>
                              </p>
                            </>
                          )}
                        </div>
                        <p className="text-slate-600 leading-relaxed mb-5 font-medium">
                          Bạn có chắc chắn muốn xoá lượt hội chẩn này khỏi hệ thống không?
                        </p>
                        <div className="flex justify-end gap-3 font-extrabold uppercase">
                          <button
                            type="button"
                            onClick={() => setConsultListConfirmDeleteKey(null)}
                            className="bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 px-4 py-2 rounded-xl transition cursor-pointer"
                          >
                            Hủy bỏ
                          </button>
                          <button
                            type="button"
                            onClick={() => void executeDeleteConsultFromList(keyToDelete)}
                            className="bg-red-600 hover:bg-red-700 text-white px-5 py-2 rounded-xl transition shadow-md hover:shadow-lg cursor-pointer"
                          >
                            Xoá ca
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })()}

                {consultListDeletingKey && (
                  <div className="md:hidden fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-[60] flex items-center justify-center p-4">
                    <div className="bg-white rounded-xl max-w-sm w-full shadow-2xl border border-slate-200 p-6 text-center space-y-3 animate-in zoom-in-95 duration-150">
                      <div className="mx-auto w-10 h-10 border-2 border-sky-600 border-t-transparent rounded-full animate-spin" />
                      <h4 className="font-extrabold text-sm uppercase text-slate-800">Đang xóa...</h4>
                      <p className="text-[11px] text-slate-500 font-medium">Vui lòng chờ trong giây lát</p>
                    </div>
                  </div>
                )}

                {/* Pagination footer — desktop only */}
                <div className="hidden lg:flex shrink-0 bg-muted/40 border-t border-border px-4 py-3 flex-col sm:flex-row items-center justify-between gap-3">
                  <div className="text-xs text-muted-foreground">
                    Tổng số: {filteredConsultsList.length} / {consults.length} đợt hội chẩn
                    {filteredConsultsList.length > 0 && (
                      <span className="text-foreground ml-1">
                        (Trang {consultCurrentPage}/{totalConsultPages} - Hiển thị {(consultCurrentPage - 1) * CONSULTS_PER_PAGE + 1} đến {Math.min(consultCurrentPage * CONSULTS_PER_PAGE, filteredConsultsList.length)})
                      </span>
                    )}
                  </div>
                  
                  {totalConsultPages > 1 && (
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => setConsultCurrentPage(1)}
                        disabled={consultCurrentPage === 1}
                        className="h-8 rounded-md border border-input bg-background px-2 text-xs font-medium text-foreground hover:bg-accent disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                      >
                        Đầu
                      </button>
                      <button
                        onClick={() => setConsultCurrentPage(p => Math.max(1, p - 1))}
                        disabled={consultCurrentPage === 1}
                        className="h-8 rounded-md border border-input bg-background px-2 text-xs font-medium text-foreground hover:bg-accent disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                      >
                        Trước
                      </button>
                      
                      <span className="text-xs font-semibold text-slate-700 px-2 font-mono">
                        {consultCurrentPage} / {totalConsultPages}
                      </span>
                      
                      <button
                        onClick={() => setConsultCurrentPage(p => Math.min(totalConsultPages, p + 1))}
                        disabled={consultCurrentPage === totalConsultPages}
                        className="h-8 rounded-md border border-input bg-background px-2 text-xs font-medium text-foreground hover:bg-accent disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                      >
                        Sau
                      </button>
                      <button
                        onClick={() => setConsultCurrentPage(totalConsultPages)}
                        disabled={consultCurrentPage === totalConsultPages}
                        className="h-8 rounded-md border border-input bg-background px-2 text-xs font-medium text-foreground hover:bg-accent disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                      >
                        Cuối
                      </button>
                    </div>
                  )}
                </div>

              </Card>

              {/* Mobile filter sheet */}
              {isFilterExpanded && (
                <div className="lg:hidden fixed inset-0 z-50">
                  <button
                    type="button"
                    className="absolute inset-0 bg-slate-900/50"
                    aria-label="Đóng bộ lọc"
                    onClick={() => setIsFilterExpanded(false)}
                  />
                  <div className="absolute inset-x-0 bottom-0 max-h-[min(70dvh,480px)] bg-background rounded-t-xl shadow-lg border border-border p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] overflow-y-auto">
                    <div className="flex items-center justify-between border-b border-border pb-2 mb-4">
                      <div className="flex items-center gap-1.5">
                        <Filter className="w-4 h-4 text-foreground" />
                        <h4 className="font-semibold text-sm text-foreground">Bộ lọc &amp; Xuất báo cáo</h4>
                      </div>
                      <button type="button" onClick={() => setIsFilterExpanded(false)} className="p-1 text-muted-foreground hover:text-foreground">
                        <X className="w-5 h-5" />
                      </button>
                    </div>
                    <div className="space-y-4 text-xs font-semibold text-slate-700">
                      <div>
                        <label className="block text-slate-400 font-bold uppercase text-[9px] mb-1">Chọn Ngày staff</label>
                        <VNDateInput
                          value={filterDate}
                          onChange={(val) => {
                            setFilterDate(val);
                            setConsultCurrentPage(1);
                          }}
                          className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-bold font-sans focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-slate-400 font-bold uppercase text-[9px] mb-1">Kiểu staff</label>
                        <select
                          value={filterType}
                          onChange={(e) => {
                            setFilterType(e.target.value);
                            setConsultCurrentPage(1);
                          }}
                          className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-bold"
                        >
                          <option value="Tất cả">Tất cả</option>
                          <option value="Staff thông">Staff thông</option>
                          <option value="Staff mổ">Staff mổ</option>
                        </select>
                      </div>
                      <div className="grid grid-cols-2 gap-2 pt-2">
                        <button
                          onClick={() => {
                            setFilterDate('');
                            setFilterType('Tất cả');
                            setConsultCurrentPage(1);
                          }}
                          className="bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold py-2 rounded-xl border border-slate-200 text-[11px] cursor-pointer"
                        >
                          Xóa bộ lọc
                        </button>
                        <button
                          onClick={handleExcelExportSimulator}
                          disabled={exportLoading}
                          className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2 rounded-xl border border-emerald-500 text-[11px] flex items-center justify-center gap-1 cursor-pointer disabled:opacity-50"
                        >
                          <Download className="w-3.5 h-3.5" /> In danh sách
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Desktop filter sidebar */}
              {!isFilterExpanded ? (
                <div 
                  onClick={() => setIsFilterExpanded(true)}
                  className="hidden lg:flex bg-card hover:bg-accent border border-border rounded-xl p-3 flex-col items-center justify-start pt-8 gap-2 cursor-pointer shadow-sm w-14 shrink-0 group transition-all duration-200"
                  title="Mở rộng bộ lọc"
                >
                  <Filter className="w-5 h-5 text-foreground group-hover:scale-110 transition-transform" />
                  <ChevronLeft className="w-4 h-4 text-slate-400" />
                  <span className="text-[10px] uppercase font-extrabold tracking-wider text-slate-500 [writing-mode:vertical-lr] rotate-180">
                    Mở bộ lọc &amp; xuất báo cáo
                  </span>
                </div>
              ) : (
                <div className="hidden lg:flex bg-card border border-border rounded-xl p-4 flex-col shadow-sm text-sm text-foreground w-[280px] shrink-0 h-full min-h-0">
                  <div className="flex items-center justify-between border-b border-border pb-2 mb-4 shrink-0">
                    <div className="flex items-center gap-1.5">
                      <Filter className="w-4 h-4 text-foreground" />
                      <h4 className="font-semibold text-sm text-foreground">Bộ lọc &amp; Xuất báo cáo</h4>
                    </div>
                    <button
                      onClick={() => setIsFilterExpanded(false)}
                      className="p-1 text-muted-foreground hover:text-foreground hover:bg-accent rounded-md transition"
                      title="Thu gọn bộ lọc"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="flex-1 min-h-0 overflow-y-auto space-y-4 pr-1 custom-scrollbar">
                    <div className="space-y-3 font-medium">
                    <div>
                      <label className="block text-slate-400 font-bold uppercase text-[9px] mb-1">Chọn Ngày staff</label>
                      <VNDateInput
                        value={filterDate}
                        onChange={(val) => {
                          setFilterDate(val);
                          setConsultCurrentPage(1);
                        }}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-bold font-sans focus:outline-none"
                      />
                    </div>

                    <div>
                      <label className="block text-slate-400 font-bold uppercase text-[9px] mb-1">Kiểu staff</label>
                      <select
                        value={filterType}
                        onChange={(e) => {
                          setFilterType(e.target.value);
                          setConsultCurrentPage(1);
                        }}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-bold"
                      >
                        <option value="Tất cả">Tất cả</option>
                        <option value="Staff thông">Staff thông</option>
                        <option value="Staff mổ">Staff mổ</option>
                      </select>
                    </div>

                    <div className="pt-2 border-t border-slate-100 grid grid-cols-2 gap-2">
                      <button
                        onClick={() => {
                          setFilterDate('');
                          setFilterType('Tất cả');
                          setConsultCurrentPage(1);
                        }}
                        className="bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold py-2 rounded-xl border border-slate-200 text-[11px] cursor-pointer"
                      >
                        Xóa bộ lọc
                      </button>
                      <button
                        onClick={handleExcelExportSimulator}
                        disabled={exportLoading}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2 rounded-xl border border-emerald-500 text-[11px] flex items-center justify-center gap-1 cursor-pointer disabled:opacity-50"
                      >
                        <Download className="w-3.5 h-3.5" /> In danh sách
                      </button>
                    </div>
                    </div>
                  </div>
                </div>
              )}

            </div>
          )}

          {/* NHẬP KẾT QUẢ STAFF split Columns (Screenshots 7 & 8) */}
          {activeMenu === 'results-staff' && (
            <StaffResultsView 
              patients={patients}
              consults={consults}
              cathlabs={cathlabs}
              sources={sources}
              deviceTemplates={deviceTemplates}
              staffList={staffList}
              currentStaff={currentStaff}
              onRefreshData={refreshConsultData}
              onAddPatient={addPatient}
              onPatchPatient={patchPatient}
              onAddConsult={addConsult}
              onRemoveConsult={removeConsult}
              onRemoveConsults={removeConsults}
              onPatchConsult={patchConsult}
              onEditPatientAdmin={handleEditPatientAdmin}
              createDiagnosisSource={createDiagnosisSource}
              triggerAlert={triggerAlert}
              onSaveSuccess={showSuccessBanner}
              onViewPatientRecord={(pat) => {
                setActiveMenu('patients');
                setSelectedPatientForDetail(pat);
              }}
            />
          )}

          {/* PHÒNG THÔNG TIM PANEL */}
          {activeMenu === 'cathlab-room' && (
            <CathLabRoomView 
              patients={patients}
              consults={consults}
              cathlabs={cathlabs}
              sources={sources}
              staffList={staffList}
              onRefreshData={refreshClinicalData}
              triggerAlert={triggerAlert}
              triggerConfirm={triggerConfirm}
              onPatchConsult={patchConsult}
              onPatchCathlab={patchCathlab}
              onAddCathlab={addCathlab}
              onAddConsult={addConsult}
              onAddPatient={addPatient}
              onViewPatientRecord={(pat) => {
                setActiveMenu('patients');
                setSelectedPatientForDetail(pat);
              }}
              onSaveSuccess={showSuccessBanner}
            />
          )}

          {activeMenu === 'cathlab-report' && (
            <CathLabReportView
              patients={patients}
              consults={consults}
              cathlabs={cathlabs}
              sources={sources}
              staffList={staffList}
              onRefreshData={refreshClinicalData}
              onPatchConsult={patchConsult}
              onPatchCathlab={patchCathlab}
              onAddCathlab={addCathlab}
              onAddPatient={addPatient}
              triggerAlert={triggerAlert}
              onViewPatientRecord={(pat) => {
                setActiveMenu('patients');
                setSelectedPatientForDetail(pat);
              }}
            />
          )}

          {activeMenu === 'surgery-room' && (
            <SurgeryRoomView
              patients={patients}
              operations={operations}
              onViewPatientRecord={(pat) => {
                setActiveMenu('patients');
                setSelectedPatientForDetail(pat);
              }}
            />
          )}

          {activeMenu === 'surgery-scheduler' && (
            <DevelopingFeatureView title="Xếp lịch phẫu thuật" />
          )}

          {activeMenu === 'surgery-schedule-view' && (
            <DevelopingFeatureView title="Lịch phẫu thuật dự kiến" />
          )}

          {/* ARCHIVE PANEL (includes transferred cathlab tab) */}
          {activeMenu === 'archive' && (
             <div key={archiveInitialTab} className="flex-1 flex flex-col min-h-0 overflow-hidden">
             <ArchiveView 
               consults={consults}
               patients={patients}
               initialTab={archiveInitialTab}
               onRefreshData={refreshConsultData}
               onPatchConsult={patchConsult}
               triggerConfirm={triggerConfirm}
             />
             </div>
          )}

          {/* XẾP LỊCH THÔNG TIM PANEL (FULL - có danh sách chờ, bộ lọc) */}
          {activeMenu === 'schedule-tt' && (
            <CathLabSchedulerView 
              patients={patients}
              consults={consults}
              cathlabs={cathlabs}
              sources={sources}
              deviceTemplates={deviceTemplates}
              staffList={staffList}
              currentStaff={currentStaff}
              pureCalendarMode={false}
              mobileLeaveGuardRef={scheduleTtMobileLeaveGuardRef}
              onRefreshData={refreshClinicalData}
              onPatchConsult={patchConsult}
              onPatchPatient={patchPatient}
              onAddPatient={addPatient}
              onAddConsult={addConsult}
              onViewPatientRecord={(pat) => {
                const openPatientRecord = () => {
                  setActiveMenu('patients');
                  setSelectedPatientForDetail(pat);
                };
                if (isMobile && scheduleTtMobileLeaveGuardRef.current) {
                  scheduleTtMobileLeaveGuardRef.current(openPatientRecord);
                  return;
                }
                openPatientRecord();
              }}
            />
          )}

          {/* LỊCH THÔNG TIM DỰ KIẾN (VIEW-ONLY - chỉ xem lịch) */}
          {activeMenu === 'schedule-view' && (
            <CathLabSchedulerView 
              patients={patients}
              consults={consults}
              cathlabs={cathlabs}
              sources={sources}
              deviceTemplates={deviceTemplates}
              staffList={staffList}
              currentStaff={currentStaff}
              pureCalendarMode={true}
              onRefreshData={refreshClinicalData}
              onPatchConsult={patchConsult}
              onPatchPatient={patchPatient}
              onAddPatient={addPatient}
              onAddConsult={addConsult}
              onViewPatientRecord={(pat) => {
                setActiveMenu('patients');
                setSelectedPatientForDetail(pat);
              }}
            />
          )}

          {/* TỔNG QUAN MRI PANEL */}
          {activeMenu === 'mri-overview' && (
            <MRIOverviewView
              patients={patients}
              consults={consults}
              cmrs={cmrs}
              sources={sources}
              staffList={staffList}
              currentStaffName={currentStaff?.StaffName}
              onNavigate={setActiveMenu}
            />
          )}

          {/* XẾP LỊCH MRI PANEL */}
          {activeMenu === 'mri-scheduler' && (
            <MRISchedulerView
              patients={patients}
              consults={consults}
              cmrs={cmrs}
              sources={sources}
              staffList={staffList}
              currentStaff={currentStaff}
              onRefreshData={refreshMriData}
              onPatchCmr={patchCmr}
              onAddCmr={addCmr}
              onAddPatient={addPatient}
            />
          )}

          {/* ĐĂNG KÝ MRI TIM PANEL */}
          {activeMenu === 'mri-register' && (
            <MRIRegisterView
              patients={patients}
              consults={consults}
              cmrs={cmrs}
              sources={sources}
              staffList={staffList}
              currentStaff={currentStaff}
              onRefreshData={refreshMriData}
              onPatchCmr={patchCmr}
              onAddCmr={addCmr}
              onAddPatient={addPatient}
              onEditPatientAdmin={handleEditPatientAdmin}
              triggerAlert={triggerAlert}
            />
          )}

          {/* ĐIỀN KẾT QUẢ MRI TIM PANEL */}
          {activeMenu === 'mri-result' && (
            <MRIResultView
              patients={patients}
              consults={consults}
              cmrs={cmrs}
              staffList={staffList}
              currentStaff={currentStaff}
              onRefreshData={refreshMriData}
              onPatchCmr={patchCmr}
              onEditPatientAdmin={handleEditPatientAdmin}
              triggerAlert={triggerAlert}
            />
          )}

          {/* LỊCH CHỤP MRI TIM PANEL */}
          {activeMenu === 'mri-calendar' && (
            <MRICalendarView
              patients={patients}
              consults={consults}
              cmrs={cmrs}
            />
          )}

          {activeMenu === 'heart-transplant' && (
            <TransplantManagementView
              patients={patients}
              transplants={transplants}
              sources={sources}
              staffList={staffList}
              currentStaff={currentStaff}
              onRefreshData={() => refreshMedicalData('transplant', true)}
              onAddTransplant={addTransplant}
              onPatchTransplant={patchTransplant}
              onDeleteTransplant={deleteTransplant}
              onAddPatient={addPatient}
              onEditPatientAdmin={patient => setSelectedPatientForDetail(patient)}
              triggerAlert={triggerAlert}
            />
          )}

          {/* EXCEL EXPORT PANEL */}
          {activeMenu === 'excel-export' && (
            <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm max-w-xl mx-auto space-y-6 text-xs animate-in fade-in duration-200">
              
              <div className="text-center">
                <div className="bg-emerald-50 text-emerald-600 inline-flex p-3 rounded-2xl mb-2">
                  <Download className="w-6 h-6" />
                </div>
                <h2 className="text-base font-extrabold text-primary uppercase">Báo cáo &amp; Kết xuất Dữ liệu Hội chẩn</h2>
                <p className="text-slate-400 mt-0.5">Lập Bảng Excel lưu trữ, liên hệ gia đình NB hoặc nộp lưu trữ khoa mạch.</p>
              </div>

              <div className="bg-slate-50 border border-slate-150 rounded-2xl p-4 space-y-3">
                <span className="font-extrabold text-primary block uppercase text-[10px] tracking-wider">Cơ cấu bộ lọc Slice</span>
                <div className="grid grid-cols-2 gap-3 font-medium">
                  <div>
                    <span className="text-slate-400">Kiểu staff chọn:</span>
                    <p className="font-bold text-slate-800 bg-white border border-slate-200 p-2 rounded-xl mt-1">{filterType}</p>
                  </div>
                  <div>
                    <span className="text-slate-400">Ngày staff chọn:</span>
                    <p className="font-semibold text-slate-800 bg-white border border-slate-200 p-2 rounded-xl mt-1">{filterDate || 'Tất cả các ngày'}</p>
                  </div>
                </div>
              </div>

              {botMessage && (
                <div className="bg-slate-900 border border-slate-800 text-teal-400 font-mono rounded-xl p-3 text-[10px] space-y-1 select-text">
                  <p className="font-black text-white flex items-center gap-1.5 uppercase text-[9px]">
                    <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
                    Apps Script Console Logs
                  </p>
                  <p className="leading-relaxed">{botMessage}</p>
                </div>
              )}

              <button
                onClick={handleExcelExportSimulator}
                disabled={exportLoading}
                className="w-full bg-emerald-700 hover:bg-emerald-600 text-white font-extrabold uppercase py-3 rounded-2xl transition shadow-md flex items-center justify-center gap-1.5 disabled:opacity-50"
              >
                <Database className="w-4 h-4 text-emerald-300" />
                {exportLoading ? 'Đang chạy export...' : 'Xuất danh sách Excel (.CSV)'}
              </button>

            </div>
          )}

          {/* STAFF MANAGEMENT */}
          {activeMenu === 'staff-mgmt' && (
            <StaffManagementView
              staffList={staffList}
              currentStaff={currentStaff}
              rolePresetRecords={rolePresetRecords}
              doctorPerformanceMarks={doctorPerformanceMarks}
              sources={sources}
              initialTab={staffManagementInitialTab}
              onRefreshData={refreshStaffData}
              onRefreshRolePresets={refreshFullData}
              onPatchStaff={patchStaffMember}
              triggerAlert={triggerAlert}
              triggerConfirm={triggerConfirm}
            />
          )}

          {/* CHD DAILY BRIEF */}
          {activeMenu === 'chd-daily-brief' && (
            <ChdDailyBriefView />
          )}

          {/* VIRTUAL GOOGLE SHEETS */}
          {activeMenu === 'google-sheets' && (
            <VirtualSheets 
              patients={patients}
              consults={consults}
              staff={staffList}
              cathlabs={cathlabs}
              operations={operations}
              cmrs={cmrs}
              sources={sources}
              deviceTemplates={deviceTemplates}
              onRefreshData={refreshFullData}
              triggerAlert={triggerAlert}
              triggerConfirm={triggerConfirm}
            />
          )}

        </main>
      </div>

      {/* Dynamic Slide-over Patient Detail Sheet (Screenshot 4) */}
      <AnimatePresence>
        {selectedPatientForDetail && (
          <PatientDetailsDrawer 
            patient={selectedPatientForDetail}
            consults={consults}
            cathlabs={cathlabs}
            cmrs={cmrs}
            operations={operations}
            onClose={() => setSelectedPatientForDetail(null)}
            onEditPatientAdmin={handleEditPatientAdmin}
            onSelectPDF={(c, p) => {
              setSelectedConsultForPDF(c);
              setSelectedPatientForPDF(p);
            }}
            onRegisterNewConsult={(pat) => {
              setSelectedPatientForDetail(null);
              setNewConsultData(prev => ({
                ...prev,
                PatientKey: pat.PatientKey
              }));
              setPendingConsultsCount(consults.filter(c => c.PatientKey === pat.PatientKey && isPendingStaffConsult(c)).length);
              setActiveMenu('consult-form');
            }}
          />
        )}
      </AnimatePresence>

      {/* Centered Registration Edit Modal Dialog (Sửa Đăng ký staff) */}
      <AnimatePresence>
        {editingRegConsultKey && (
          <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-3 md:p-4 pb-[var(--mobile-bottom-nav-offset)] md:pb-4 animate-in fade-in duration-200">
            <div className="absolute inset-0" onClick={() => setEditingRegConsultKey(null)}></div>
            <div className="relative bg-white w-full max-w-4xl rounded-xl shadow-2xl flex flex-col z-50 max-h-[min(88dvh,calc(100dvh-var(--mobile-bottom-nav-offset)-0.5rem))] md:max-h-[92vh] animate-in zoom-in-95 duration-200 overflow-hidden">
              
              <div className="bg-primary text-white px-6 py-4 flex items-center justify-between shadow-sm shrink-0">
                <h3 className="font-extrabold text-sm uppercase tracking-wider flex items-center gap-1.5 font-sans">
                  <Stethoscope className="w-5 h-5 text-white animate-pulse" /> Sửa Đăng ký staff
                </h3>
                <button 
                  onClick={() => setEditingRegConsultKey(null)}
                  className="text-white hover:bg-white/10 p-1.5 rounded-full transition-colors font-bold cursor-pointer"
                >
                  ✕
                </button>
              </div>

              {/* Form Frame */}
              <form onSubmit={submitConsultRegistrationUpdate} className="flex flex-col flex-1 min-h-0 overflow-hidden text-xs text-slate-700 leading-relaxed font-semibold">
                
                {(() => {
                  const edc = consults.find(c => c.ConsultKey === editingRegConsultKey);
                  const edp = edc ? getPatientByKey(edc.PatientKey) : null;
                  if (!edp || !edc) return null;

                  return (
                    <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
                      
                      <div className="flex-1 overflow-y-auto overscroll-contain min-h-0">
                      {/* Grid Body */}
                      <div className="grid grid-cols-1 md:grid-cols-12 gap-5 p-4 md:p-6">
                        
                        {/* Left Column: Administrative block */}
                        <div className="md:col-span-5 bg-slate-50 border border-slate-200 rounded-2xl p-2.5 md:p-3 space-y-1 shadow-sm self-start">
                          <div className="flex items-center justify-between gap-2 -mt-0.5 mb-0">
                            <span className="text-xs uppercase tracking-wide font-mono font-black text-rose-500 leading-tight">THÔNG TIN HÀNH CHÍNH</span>
                            
                            {/* Sửa hành chính button */}
                            <PatientAdminEditButton
                              onClick={() => {
                                setEditingPatientKey(edp.PatientKey);
                                setNewPatientData({
                                  PatientID1: edp.PatientID1,
                                  PatientID2: edp.PatientID2 || '',
                                  PatientName: edp.PatientName,
                                  OtherPatientName: edp.OtherPatientName || '',
                                  PatientDOB: edp.PatientDOB,
                                  PatientSex: edp.PatientSex,
                                  PatientAddress: edp.PatientAddress || (edp as any).PatientAddress || '',
                                  PatientPhone1: edp.PatientPhone1 || '',
                                  PatientPhone2: edp.PatientPhone2 || '',
                                  Outcome: edp.Outcome || ''
                                });
                                setShowAddPatient(true);
                              }}
                            />
                          </div>

                          {(() => {
                            const patientPhone2 = String(edp.PatientPhone2 || '').trim();
                            return (
                          <div className="flex flex-col gap-1 md:grid md:grid-cols-2 md:gap-x-3 md:gap-y-1.5 text-sm text-slate-500 font-bold leading-snug">
                            <div className="flex items-baseline gap-2 min-w-0 md:block md:col-span-2">
                              <span className="text-slate-400 font-medium text-xs uppercase shrink-0 md:block">Họ và tên:</span>
                              <span className="text-neutral-950 font-black uppercase text-base truncate">{edp.PatientName}</span>
                            </div>
                            <div className="grid grid-cols-2 gap-x-3 min-w-0 md:contents">
                              <div className="flex items-baseline gap-2 min-w-0 md:block">
                                <span className="text-slate-400 font-medium text-xs uppercase shrink-0 md:block">Ngày sinh:</span>
                                <span className="text-slate-800 font-bold font-mono text-sm">{formatVNTime(edp.PatientDOB)}</span>
                              </div>
                              <div className="flex items-baseline gap-2 min-w-0 md:block">
                                <span className="text-slate-400 font-medium text-xs uppercase shrink-0 md:block">Giới tính:</span>
                                <span className="text-slate-800 font-bold text-sm">{edp.PatientSex}</span>
                              </div>
                            </div>
                            <div className="flex items-baseline gap-2 min-w-0 md:block md:col-span-2">
                              <span className="text-slate-400 font-medium text-xs uppercase shrink-0 md:block">Mã người bệnh:</span>
                              <span className="text-slate-850 font-extrabold font-mono text-xs bg-slate-200/50 border border-slate-300 rounded px-1.5 py-0.5 md:mt-0.5 md:block md:w-max">{edp.PatientID1} {edp.PatientID2 ? `| ${edp.PatientID2}` : ''}</span>
                            </div>
                            <div className="flex items-baseline gap-2 min-w-0 md:block md:col-span-2">
                              <span className="text-slate-400 font-medium text-xs uppercase shrink-0 md:block">Địa chỉ:</span>
                              <span className="text-slate-700 font-semibold text-sm truncate">{edp.PatientAddress || (edp as any).PatientAddress || '—'}</span>
                            </div>
                            {patientPhone2 ? (
                              <div className="grid grid-cols-2 gap-x-3 min-w-0 md:col-span-2">
                                <div className="flex items-baseline gap-2 min-w-0 md:block">
                                  <span className="text-slate-400 font-medium text-xs uppercase shrink-0 md:block">Số ĐT 1:</span>
                                  <span className="text-slate-850 font-mono font-bold text-sm">{edp.PatientPhone1 || '—'}</span>
                                </div>
                                <div className="flex items-baseline gap-2 min-w-0 md:block">
                                  <span className="text-slate-400 font-medium text-xs uppercase shrink-0 md:block">Số ĐT 2:</span>
                                  <span className="text-slate-850 font-mono font-bold text-sm">{patientPhone2}</span>
                                </div>
                              </div>
                            ) : (
                              <div className="flex items-baseline gap-2 min-w-0 md:block md:col-span-2">
                                <span className="text-slate-400 font-medium text-xs uppercase shrink-0 md:block">Số ĐT 1:</span>
                                <span className="text-slate-850 font-mono font-bold text-sm">{edp.PatientPhone1 || '—'}</span>
                              </div>
                            )}
                          </div>
                            );
                          })()}
                        </div>

                        {/* Right Column: Interactive form fields */}
                        <div className="md:col-span-7 space-y-4">
                          
                          {/* Chẩn đoán Chi tiết (DetailDiagnosis) */}
                          <div>
                            <label className="block text-slate-500 font-black uppercase text-[10px] mb-1">Chẩn đoán Chi tiết *</label>
                            <MobileAutoExpandTextarea
                              minRows={2}
                              required
                              placeholder="Nhập chẩn đoán chi tiết..."
                              value={editConsultData.DetailDiagnosis}
                              onChange={(e) => setEditConsultData(prev => ({ ...prev, DetailDiagnosis: e.target.value }))}
                              className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 font-medium focus:ring-1 focus:ring-pink-500 focus:outline-none"
                            />
                          </div>

                          {/* Weight and Height Inputs */}
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <label className="block text-slate-500 font-bold uppercase text-[10px] mb-1">Cân nặng (kg) *</label>
                              <input
                                type="text"
                                required
                                placeholder="vd: 12"
                                value={editConsultData.PatientWeight}
                                onChange={(e) => setEditConsultData(prev => ({ ...prev, PatientWeight: e.target.value }))}
                                className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 font-bold focus:ring-1 focus:ring-pink-500 focus:outline-none"
                              />
                            </div>

                            <div>
                              <label className="block text-slate-500 font-bold uppercase text-[10px] mb-1">Chiều cao (cm)</label>
                              <input
                                type="text"
                                placeholder="vd: 85"
                                value={editConsultData.PatientHeight}
                                onChange={(e) => setEditConsultData(prev => ({ ...prev, PatientHeight: e.target.value }))}
                                className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 font-semibold focus:ring-1 focus:ring-pink-500 focus:outline-none"
                              />
                            </div>
                          </div>

                          {/* Date and Type Selection */}
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <label className="block text-slate-500 font-bold uppercase text-[10px] mb-1">Kiểu staff *</label>
                              <div className="grid grid-cols-2 gap-2">
                                {(['Staff thông', 'Staff mổ'] as ConsultTypeEnum[]).map(type => (
                                  <button
                                    key={type}
                                    type="button"
                                    onClick={() => setEditConsultData(prev => ({ ...prev, ConsultType: type }))}
                                    className={`rounded-xl px-3 py-2 font-extrabold border transition ${
                                      editConsultData.ConsultType === type
                                        ? 'bg-primary text-white border-primary shadow-sm'
                                        : 'bg-white text-slate-600 border-slate-200 hover:border-primary/40'
                                    }`}
                                  >
                                    {type}
                                  </button>
                                ))}
                              </div>
                            </div>

                            <div>
                              <label className="block text-slate-500 font-bold uppercase text-[10px] mb-1">Ngày staff *</label>
                              <VNDateInput
                                required
                                value={editConsultData.ConsultDate}
                                onChange={(val) => setEditConsultData(prev => ({ ...prev, ConsultDate: val }))}
                                className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 font-bold font-sans focus:ring-1 focus:ring-pink-500 focus:outline-none"
                              />
                            </div>
                          </div>

                          {/* RequestBy and Department Section */}
                          <div className="grid grid-cols-2 gap-3">
                            
                            {/* RequestBy — searchable (mobile bottom sheet) */}
                            <div className="min-w-0">
                              <label className="block text-slate-500 font-bold uppercase text-[10px] mb-1">Người đăng ký *</label>
                              <SearchableEnumSelect
                                required
                                options={registrationDoctorOptions}
                                value={editConsultData.RequestBy || ''}
                                onChange={(val) => {
                                  setShowEditAddDocInput(false);
                                  setCustomEditDocVal('');
                                  setEditConsultData(prev => ({ ...prev, RequestBy: val }));
                                }}
                                allowCreate
                                createLabel={(val) => `Thêm BS "${val}"`}
                                placeholder="-- Chọn BS --"
                                searchPlaceholder="Gõ tên BS..."
                                className="min-w-0"
                              />
                            </div>

                            {/* Department */}
                            <div>
                              <label className="block text-slate-500 font-bold uppercase text-[10px] mb-1">Khoa nội trú</label>
                              <select
                                value={showEditAddDeptInput ? 'ADD_NEW' : (editConsultData.Department || '')}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  if (val === 'ADD_NEW') {
                                    setShowEditAddDeptInput(true);
                                    setEditConsultData(prev => ({ ...prev, Department: '' }));
                                  } else {
                                    setShowEditAddDeptInput(false);
                                    setEditConsultData(prev => ({ ...prev, Department: val as any }));
                                  }
                                }}
                                className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 focus:outline-none text-primary font-bold"
                              >
                                <option value="">-- Không bắt buộc --</option>
                                {DEFAULT_DEPARTMENTS.map(d => (
                                  <option key={d} value={d}>{d}</option>
                                ))}
                                {Array.from(new Set(consults.map(c => String(c.Department || '')))).filter((d: string) => d && !DEFAULT_DEPARTMENTS.includes(d)).map((d: string) => (
                                  <option key={d} value={d}>{d}</option>
                                ))}
                                <option value="ADD_NEW" className="text-rose-500 font-bold">+ Thêm khoa mới...</option>
                              </select>

                              {showEditAddDeptInput && (
                                <div className="mt-1.5 flex gap-1 animate-in fade-in slide-in-from-top-1 duration-200">
                                  <input
                                    type="text"
                                    placeholder="Nhập tên khoa mới..."
                                    value={customEditDeptVal}
                                    onChange={(e) => {
                                      setCustomEditDeptVal(e.target.value);
                                      setEditConsultData(prev => ({ ...prev, Department: e.target.value }));
                                    }}
                                    className="flex-1 bg-white border border-rose-300 rounded-xl px-3 py-1.5 text-xs font-semibold focus:outline-none"
                                  />
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setShowEditAddDeptInput(false);
                                      setCustomEditDeptVal('');
                                      setEditConsultData(prev => ({ ...prev, Department: '' }));
                                    }}
                                    className="text-slate-400 hover:text-slate-600 px-2 text-xs font-bold"
                                    title="Quay lại"
                                  >
                                    Quay lại
                                  </button>
                                </div>
                              )}
                            </div>

                          </div>

                        </div>

                      </div>
                      </div>

                      {/* Sticky Fixed Footer */}
                      <div className="border-t border-slate-150 p-4 bg-slate-50 flex gap-3 justify-end shrink-0 w-full pb-[max(0.75rem,env(safe-area-inset-bottom))] md:pb-4">
                        <button
                          type="button"
                          onClick={() => setEditingRegConsultKey(null)}
                          className="px-6 py-2.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-extrabold uppercase rounded-xl transition cursor-pointer text-xs"
                        >
                          Hủy bỏ
                        </button>
                        <button
                          type="submit"
                          className="px-10 py-2.5 bg-primary hover:bg-primary/90 text-white font-extrabold uppercase rounded-xl shadow-md transition cursor-pointer text-xs"
                        >
                          ✓ Lưu Đăng ký staff
                        </button>
                      </div>

                    </div>
                  );
                })()}

              </form>
            </div>
          </div>
        )}
      </AnimatePresence>

      {/* New Patient Registration Overlay Modal Dialog */}
      <AnimatePresence>
        {showAddPatient && (
          <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
            <div className="bg-white rounded-xl max-w-lg w-full max-h-[90vh] overflow-y-auto shadow-2xl border border-slate-150 p-4 sm:p-6 space-y-5 text-xs text-slate-700 font-semibold leading-relaxed font-sans">
              
              <div className="flex items-center justify-between border-b border-slate-150 pb-2.5 text-primary">
                <h3 className="font-extrabold text-sm uppercase flex items-center gap-1.5 font-sans">
                  <Heart className="w-5 h-5 animate-pulse" /> {editingPatientKey ? "SỬA HỒ SƠ HÀNH CHÍNH" : "Đăng ký hồ sơ mới"}
                </h3>
                <button 
                  type="button"
                  onClick={() => {
                    triggerConfirm("Bạn có chắc chắn muốn Hủy thao tác này không?", () => {
                      setShowAddPatient(false);
                      setEditingPatientKey(null);
                    }, MODAL_TITLE.confirm);
                  }}
                  className="text-slate-400 hover:text-slate-600 transition cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleAddPatientSubmit} className="space-y-4 font-medium text-slate-700">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-primary font-extrabold uppercase text-[10px] mb-1">Mã người bệnh *</label>
                    <input
                      type="text"
                      required
                      placeholder="vd: BN014902"
                      value={newPatientData.PatientID1}
                      onChange={(e) => setNewPatientData(prev => ({ ...prev, PatientID1: e.target.value }))}
                      className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 font-mono font-bold focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-500 font-bold uppercase text-[10px] mb-1">Mã người bệnh khác</label>
                    <input
                      type="text"
                      placeholder=""
                      value={newPatientData.PatientID2}
                      onChange={(e) => setNewPatientData(prev => ({ ...prev, PatientID2: e.target.value }))}
                      className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 font-mono focus:outline-none"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-500 font-bold uppercase text-[10px] mb-1">Họ và tên bé *</label>
                    <input
                      type="text"
                      required
                      placeholder="vd: TRẦN VĂN AN"
                      value={newPatientData.PatientName}
                      onChange={(e) => setNewPatientData(prev => ({ ...prev, PatientName: e.target.value.toUpperCase() }))}
                      className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 font-extrabold text-slate-900 uppercase"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-400 font-bold uppercase text-[10px] mb-1">Tên lúc khai sinh</label>
                    <input
                      type="text"
                      placeholder="Tên CB"
                      value={newPatientData.OtherPatientName}
                      onChange={(e) => setNewPatientData(prev => ({ ...prev, OtherPatientName: e.target.value }))}
                      className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-500 font-bold uppercase text-[10px] mb-1">Ngày sinh *</label>
                    <VNDateInput
                      required
                      value={newPatientData.PatientDOB}
                      onChange={(val) => setNewPatientData(prev => ({ ...prev, PatientDOB: val }))}
                      className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 font-bold font-sans focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-500 font-bold uppercase text-[10px] mb-1">Giới tính</label>
                    <select
                      value={newPatientData.PatientSex}
                      onChange={(e) => setNewPatientData(prev => ({ ...prev, PatientSex: e.target.value as any }))}
                      className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 font-bold focus:outline-none"
                    >
                      <option value="Nam">Nam</option>
                      <option value="Nữ">Nữ</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-500 font-bold uppercase text-[10px] mb-1">Số điện thoại 1</label>
                    <input
                      type="tel"
                      placeholder="vd: 0912345678"
                      value={newPatientData.PatientPhone1}
                      onChange={(e) => setNewPatientData(prev => ({ ...prev, PatientPhone1: e.target.value }))}
                      className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 font-bold font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-400 font-bold uppercase text-[10px] mb-1">Số điện thoại 2</label>
                    <input
                      type="tel"
                      placeholder="SĐT người nhà"
                      value={newPatientData.PatientPhone2}
                      onChange={(e) => setNewPatientData(prev => ({ ...prev, PatientPhone2: e.target.value }))}
                      className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 font-mono"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-slate-500 font-bold uppercase text-[10px] mb-1">Địa chỉ *</label>
                  <SearchableEnumSelect
                    required
                    options={provinceOptions}
                    value={newPatientData.PatientAddress}
                    onChange={(value) => setNewPatientData(prev => ({ ...prev, PatientAddress: value }))}
                    placeholder="-- Chọn tỉnh/thành --"
                    searchPlaceholder="Gõ tỉnh/thành để tìm..."
                  />
                </div>

                {/* Patient Creator Admin Details (Grayed Out ReadOnly Column inputs) */}
                <div className="grid grid-cols-2 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-400 font-bold uppercase text-[10px] mb-1">Người cập nhật</label>
                    <input
                      type="text"
                      disabled
                      value={(() => {
                        const creatorId = editingPatientKey ? getPatientByKey(editingPatientKey)?.PatientCreateBy : currentStaff?.StaffKey;
                        return staffList.find(s => s.StaffKey === creatorId)?.StaffName || creatorId || '01378';
                      })()}
                      className="w-full bg-slate-100 text-slate-400 border border-slate-200 rounded-xl px-3 py-2 font-bold font-sans"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-400 font-bold uppercase text-[10px] mb-1 font-sans">Thời gian cập nhật</label>
                    <input
                      type="text"
                      disabled
                      value={editingPatientKey ? formatDateTime(getPatientByKey(editingPatientKey)?.PatientCreateTime) : formatDateTime(new Date().toISOString())}
                      className="w-full bg-slate-100 text-slate-400 border border-slate-200 rounded-xl px-3 py-2 font-mono text-[11px]"
                    />
                  </div>
                </div>

                {/* Hidden Outcome Final selection */}
                <div className="hidden">
                  <label className="block text-slate-500 font-bold uppercase text-[10px] mb-1">Phương án chốt - Outcome cuối</label>
                  <input 
                    type="hidden" 
                    value={newPatientData.Outcome || ''} 
                  />
                </div>

                <div className="grid grid-cols-2 gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      triggerConfirm("Bạn có chắc chắn muốn Hủy thao tác này không?", () => {
                        setShowAddPatient(false);
                        setEditingPatientKey(null);
                      }, MODAL_TITLE.confirm);
                    }}
                    className="w-full bg-slate-100 hover:bg-slate-200 text-slate-700 font-extrabold uppercase py-3 rounded-2xl transition border border-slate-200 shadow-sm cursor-pointer"
                  >
                    Hủy
                  </button>
                  <button
                    type="submit"
                    className="w-full bg-primary hover:bg-pink-700 text-white font-extrabold uppercase py-3 rounded-2xl transition shadow-md cursor-pointer"
                  >
                    Lưu
                  </button>
                </div>
              </form>

            </div>
          </div>
        )}
      </AnimatePresence>

      {/* Auxiliary Modals (Rules, Guidelines, Schedulers list) */}
      <AuxiliaryModals 
        rulesType={activeRules}
        schedulerType={activeScheduler}
        onCloseRules={() => setActiveRules(null)}
        onCloseScheduler={() => setActiveScheduler(null)}
        patients={patients}
        consults={consults}
      />

      {/* Printable Clinical A4 Document Viewer/PDF Simulator */}
      {selectedConsultForPDF && selectedPatientForPDF && !(isMobile && activeMenu === 'consult-list') && (
        <A4Report 
          consult={selectedConsultForPDF}
          patient={selectedPatientForPDF}
          onClose={() => {
            setSelectedConsultForPDF(null);
            setSelectedPatientForPDF(null);
          }}
        />
      )}

      {/* Custom Alert Overlay Modal */}
      <AnimatePresence>
        {customAlert && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-xl max-w-sm w-full p-6 shadow-2xl border border-slate-150 text-center space-y-4 font-sans"
            >
              <div className="mx-auto bg-amber-50 text-amber-600 rounded-full w-12 h-12 flex items-center justify-center">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <h3 className="text-sm font-black text-slate-800 uppercase tracking-tight">
                {customAlert.title || MODAL_TITLE.notify}
              </h3>
              <p className="text-xs text-slate-505 font-semibold leading-relaxed">
                {customAlert.message}
              </p>
              <button
                type="button"
                onClick={() => setCustomAlert(null)}
                className="w-full bg-primary hover:bg-pink-700 text-white font-extrabold uppercase py-2.5 rounded-2xl transition shadow-md cursor-pointer text-xs"
              >
                Đồng ý
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Custom Confirm Overlay Modal */}
      <AnimatePresence>
        {customConfirm && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-xl max-w-md w-full p-6 shadow-2xl border border-slate-150 space-y-4 font-sans"
            >
              <div className="flex items-center gap-3 border-b border-slate-100 pb-2.5">
                <div className="bg-pink-50 text-primary rounded-full w-10 h-10 flex items-center justify-center shrink-0">
                  <ClipboardCheck className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-xs font-black text-slate-800 uppercase tracking-tight">
                    {customConfirm.title || MODAL_TITLE.confirm}
                  </h3>
                  <p className="text-[10px] text-slate-400 mt-0.5 font-bold uppercase font-mono">Hệ thống quản lý CHD</p>
                </div>
              </div>
              
              <p className="text-xs text-slate-600 font-semibold leading-relaxed">
                {customConfirm.message}
              </p>

              <div className="grid grid-cols-2 gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    if (customConfirm.onCancel) customConfirm.onCancel();
                    setCustomConfirm(null);
                  }}
                  className="w-full bg-slate-100 hover:bg-slate-200 text-slate-700 font-extrabold uppercase py-2.5 rounded-2xl transition border border-slate-200 shadow-sm cursor-pointer text-xs"
                >
                  Hủy bỏ
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (confirmPendingRef.current) return;
                    confirmPendingRef.current = true;
                    setCustomConfirm(null);
                    setTimeout(() => {
                      try {
                        customConfirm.onConfirm();
                      } finally {
                        confirmPendingRef.current = false;
                      }
                    }, 50);
                  }}
                  className="w-full bg-primary hover:bg-pink-700 text-white font-extrabold uppercase py-2.5 rounded-2xl transition shadow-md cursor-pointer text-xs"
                >
                  Xác nhận
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Footer bar */}
      <footer className="hidden md:block bg-muted border-t border-border text-muted-foreground text-[10px] py-1.5 shrink-0 text-center font-medium font-sans">
        <span>© 2026 CHD Management v5.0 | Trung tâm tim mạch - Bệnh viện Nhi Đồng Thành Phố</span>
      </footer>

      <MobileBottomNav
        activeMenu={activeMenu as ActiveMenuId}
        onNavigate={(menuId) => navigateMenu(menuId)}
        onOpenMore={() => setIsMobileMoreMenuOpen(true)}
        pendingStaffCount={pendingStaffConsultCount}
        quickTabIds={mobileBottomTabIds}
      />

      {currentStaff && (
        <>
          <PushNotificationPrompt
            visible={webPush.showPrompt}
            loading={webPush.loading}
            configured={webPush.configured}
            error={webPush.error}
            warning={webPush.warning}
            isIosStandaloneHint={shouldShowIosInstallHint()}
            onEnable={() => { void webPush.enablePush(); }}
            onDismiss={webPush.dismissPrompt}
          />
          <PwaInstallPrompt />
        </>
      )}

      <MobileMoreMenu
        isOpen={isMobileMoreMenuOpen}
        onClose={() => setIsMobileMoreMenuOpen(false)}
        items={mobileMoreMenuItems}
        activeMenu={activeMenu as ActiveMenuId}
        onNavigate={(menuId) => handleMobileMoreNavigate(menuId)}
      />

      <SheetsSyncBridge
        reportRef={sheetsSyncReportRef}
        loadWhenReady={medicalDataLoadState.phase === 'ready'}
      />

      </SidebarInset>
    </div>
    </ViewSubheaderProvider>
    </SheetsSyncFeedbackProvider>
  );
}
