/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useMemo } from 'react';
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
  Source,
  RolePreset,
  formatVNTime,
  removeDiacritics,
  findPatientByKey,
  normalizePatientKey
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
import ArchiveView from './components/ArchiveView';
import WorkspaceDashboard from './components/WorkspaceDashboard';
import MRISchedulerView from './components/MRISchedulerView';
import MRIRegisterView from './components/MRIRegisterView';
import MRIResultView from './components/MRIResultView';
import MRICalendarView from './components/MRICalendarView';
import SurgeryRoomView from './components/SurgeryRoomView';
import DevelopingFeatureView from './components/DevelopingFeatureView';
import StaffManagementView from './components/StaffManagementView';
import StaffAccountMenu from './components/StaffAccountMenu';
import StaffProfileView from './components/StaffProfileView';
import { SearchableEnumSelect } from './components/SearchableEnumSelect';
import { VNDateInput } from './components/VNDateInput';
import { SOURCE_PROVINCE, getSourceDiagnosisOptions } from './data/source';
import { AppModule, canAccessModule, canManageStaff, setRuntimeRolePresets } from './auth/permissions';

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
  Home,
  Menu,
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
  Activity
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

const getExcelAgeHelper = (dobStr: string) => {
  if (!dobStr) return '';
  try {
    const birth = new Date(dobStr);
    const now = new Date('2026-06-06'); // Reference mock date 2026-06-06
    
    const diffTime = now.getTime() - birth.getTime();
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays < 0) return 'Sơ sinh';
    if (diffDays < 30) {
      return `${diffDays} ngày tuổi`;
    }
    
    let years = now.getFullYear() - birth.getFullYear();
    let months = now.getMonth() - birth.getMonth();
    if (months < 0 || (months === 0 && now.getDate() < birth.getDate())) {
      years--;
      months = 12 + months;
    }
    
    const totalMonths = years * 12 + months;
    if (totalMonths < 12) {
      return `${totalMonths} tháng tuổi`;
    } else if (years <= 5) {
      if (months > 0) {
        return `${years} tuổi ${months} tháng`;
      } else {
        return `${years} tuổi`;
      }
    } else {
      return `${years} tuổi`;
    }
  } catch (e) {
    return '';
  }
};

export default function App() {
  // Session State
  const [currentStaff, setCurrentStaff] = useState<Staff | null>(null);
  const [staffList, setStaffList] = useState<Staff[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [consults, setConsults] = useState<Consult[]>([]);
  const [cathlabs, setCathlabs] = useState<CathLab[]>([]);
  const [operations, setOperations] = useState<Operation[]>([]);
  const [cmrs, setCmrs] = useState<CMR[]>([]);
  const [sources, setSources] = useState<Source[]>([]);
  const [rolePresetRecords, setRolePresetRecords] = useState<RolePreset[]>([]);

  const diagnosisOptions = useMemo(() => getSourceDiagnosisOptions(sources), [sources]);

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
  const topScrollRef = useRef<HTMLDivElement>(null);
  const bottomScrollRef = useRef<HTMLDivElement>(null);
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
  const [activeMenu, setActiveMenu] = useState<'home' | 'workspace' | 'profile' | 'patients' | 'consult-form' | 'consult-list' | 'results-staff' | 'schedule-tt' | 'schedule-view' | 'cathlab-room' | 'mri-scheduler' | 'mri-register' | 'mri-result' | 'mri-calendar' | 'surgery-room' | 'surgery-scheduler' | 'surgery-schedule-view' | 'archive' | 'excel-export' | 'google-sheets' | 'staff-mgmt'>('home');
  const [profileReturnMenu, setProfileReturnMenu] = useState<typeof activeMenu>('home');
  const [isStaffAccountMenuOpen, setIsStaffAccountMenuOpen] = useState(false);
  const [archiveInitialTab, setArchiveInitialTab] = useState<'transferred' | 'archive'>('archive');

  // Collapsible Sidebar State
  const [isSidebarExpanded, setIsSidebarExpanded] = useState<boolean>(false);

  // Collapsible Filter Panel State
  const [isFilterExpanded, setIsFilterExpanded] = useState<boolean>(false);

  // Login Form State
  const [loginStaffKey, setLoginStaffKey] = useState<string>('');
  const [loginPassword, setLoginPassword] = useState<string>('');
  const [loginError, setLoginError] = useState<string>('');

  // Search Filter State (Patient List & Globals)
  const [patientSearch, setPatientSearch] = useState<string>('');
  const [consultListSearch, setConsultListSearch] = useState<string>('');
  const [patientCurrentPage, setPatientCurrentPage] = useState<number>(1);
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
    const targetTime = beforeDate ? new Date(beforeDate).getTime() : Number.POSITIVE_INFINITY;

    return [...consults]
      .filter(c => normalizePatientKey(c.PatientKey) === normalizedKey && String(c.DetailDiagnosis || '').trim())
      .filter(c => {
        if (!beforeDate || !c.ConsultDate) return true;
        const consultTime = new Date(c.ConsultDate).getTime();
        return !Number.isNaN(consultTime) && consultTime <= targetTime;
      })
      .sort((a, b) => {
        const dateA = a.ConsultDate ? new Date(a.ConsultDate).getTime() : 0;
        const dateB = b.ConsultDate ? new Date(b.ConsultDate).getTime() : 0;
        if (dateA !== dateB) return dateB - dateA;
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

  // Consult Outcome Results Form State (TRẦN MINH PHÚC style drawer, screenshot 9)
  const [editingConsultKey, setEditingConsultKey] = useState<string | null>(null);
  const [isDrawerEditing, setIsDrawerEditing] = useState<boolean>(false);
  const [resultUpdateData, setResultUpdateData] = useState({
    ConsultResultID: '' as ConsultResultEnum,
    DetailConsultResult: '',
    PlannedDevice: '',
    PlannedPrice: '',
    CheckDevice: '' as 'Đủ' | 'Thiếu' | '',
    PatientWeight: '',
    PatientHeight: '',
    ConsultType: 'Staff mổ' as ConsultTypeEnum,
    ConsultDate: '',
    RequestBy: '',
    DiagnosisID: '',
    DetailDiagnosis: '',
    ConsultMember: [] as string[],
    PriorityOrder: 'Chương trình' as PriorityOrderEnum,
    ConsultResultUpdatedBy: '',
    ConsultResultUpdatedTime: ''
  });

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
  const [consultSortOrder, setConsultSortOrder] = useState<'asc' | 'desc'>('desc');

  // Filter & Export Screen States
  const [filterDate, setFilterDate] = useState<string>('');
  const [filterType, setFilterType] = useState<string>('Tất cả');
  const [exportLoading, setExportLoading] = useState<boolean>(false);
  const [botMessage, setBotMessage] = useState<string>('');

  // Bot Trigger PDF simulation State
  const [pdfBotRunning, setPdfBotRunning] = useState<string | null>(null);

  // Custom alerts and confirms to replace browser native window.alert/confirm (which fails inside sandboxed iframe previews)
  const [customAlert, setCustomAlert] = useState<{ message: string; title?: string } | null>(null);
  const [customConfirm, setCustomConfirm] = useState<{
    message: string;
    title?: string;
    onConfirm: () => void;
    onCancel?: () => void;
  } | null>(null);

  const triggerAlert = (message: string, title = 'Thông báo') => {
    setCustomAlert({ message, title });
  };

  const triggerConfirm = (message: string, onConfirm: () => void, title = 'Xác nhận', onCancel?: () => void) => {
    setCustomConfirm({ message, title, onConfirm, onCancel });
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

    fetchSources();
  };

  useEffect(() => {
    fetchStaff();
    fetchPatients();
    fetchConsults();
    fetchCathlabs();
    fetchOperations();
    fetchCmrs();
    fetchSources();
    fetchRolePresets();

    // Recover logged-in session if exists
    const storedStaff = localStorage.getItem('CurrentStaffKey');
    if (storedStaff) {
      try {
        const parsed = JSON.parse(storedStaff);
        setCurrentStaff(parsed);
      } catch (e) {
        localStorage.removeItem('CurrentStaffKey');
      }
    }
  }, []);

  useEffect(() => {
    if (!currentStaff?.StaffKey || staffList.length === 0) return;
    const updated = staffList.find(staff => staff.StaffKey === currentStaff.StaffKey);
    if (updated && JSON.stringify(updated) !== JSON.stringify(currentStaff)) {
      setCurrentStaff(updated);
      localStorage.setItem('CurrentStaffKey', JSON.stringify(updated));
    }
  }, [staffList, currentStaff?.StaffKey]);

  useEffect(() => {
    if (!currentStaff) return;
    if (activeMenu === 'profile') return;
    if (!canAccessModule(currentStaff, activeMenu as AppModule)) {
      setActiveMenu('workspace');
    }
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

  // Login handler
  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');

    // [TEMP] Hardcode bypass: tài khoản Admin/123 để test giao diện Dashboard
    if (loginPassword === '123') {
      const found = staffList.find(s => s.StaffKey === loginStaffKey);
      const bypassStaff: Staff = found ?? ({
        StaffKey: loginStaffKey || 'Admin',
        StaffName: 'Admin (Test)',
        Password: '123',
        Role: 'Admin',
        Email: '',
        FireDate: ''
      } as Staff);
      localStorage.setItem('CurrentStaffKey', JSON.stringify(bypassStaff));
      setCurrentStaff(bypassStaff);
      setNewConsultData(prev => ({ ...prev, RequestBy: bypassStaff.StaffName }));
      return;
    }
    // [END TEMP]

    const staffMember = staffList.find(s => s.StaffKey === loginStaffKey);
    if (!staffMember) {
      setLoginError('Mã nhân viên nhập vào không tồn tại trong hệ thống!');
      return;
    }

    if (staffMember.Password !== loginPassword) {
      setLoginError('Mật khẩu đăng nhập không trùng khớp. Vui lòng nhập lại!');
      return;
    }

    if (staffMember.FireDate) {
      setLoginError(`Tài khoản nhân viên đã bị vô hiệu hóa! Người này đã nghỉ việc vào ngày: ${staffMember.FireDate}`);
      return;
    }

    localStorage.setItem('CurrentStaffKey', JSON.stringify(staffMember));
    setCurrentStaff(staffMember);
    setNewConsultData(prev => ({
      ...prev,
      RequestBy: staffMember.StaffName
    }));
  };

  // Logout handler
  const handleLogout = () => {
    localStorage.removeItem('CurrentStaffKey');
    setCurrentStaff(null);
  };

  const navigateMenu = (menu: typeof activeMenu) => {
    if (menu === 'profile') {
      setProfileReturnMenu(activeMenu === 'profile' ? 'home' : activeMenu);
      setActiveMenu('profile');
      setIsStaffAccountMenuOpen(false);
      return;
    }
    if (!canAccessModule(currentStaff, menu as AppModule)) {
      triggerAlert('Bạn không có quyền truy cập module này.', 'Từ chối truy cập');
      setActiveMenu('workspace');
      return;
    }
    setActiveMenu(menu);
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
    const matchingPending = consults.filter(c => c.PatientKey === patientKey && !c.ConsultResultID);
    setPendingConsultsCount(matchingPending.length);
  };

  // Set up a new patient insertion or update
  const handleAddPatientSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPatientData.PatientID1 || !newPatientData.PatientName) {
      triggerAlert('Vui lòng điền tối thiểu Mã bệnh nhân và Họ tên!');
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
      triggerAlert(`Mã bệnh nhân này đã tồn tại trong hệ thống (Họ tên: ${duplicateIdPatient.PatientName}). Đề nghị cập nhật lại thông tin!`);
      return;
    }

    // 2. Relative Warning — duplicate Name + DOB check
    const duplicateInfoPatient = patients.find(p =>
      String(p.PatientKey) !== String(editingPatientKey || '') &&
      String(p.PatientName || '').trim().toLowerCase() === cleanName &&
      p.PatientDOB === newPatientData.PatientDOB
    );

    const proceedSave = () => {
      const payload: Patient = {
        PatientKey: editingPatientKey || `pat_${Date.now()}`,
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
      const url = isEdit ? `/api/patients/${editingPatientKey}` : '/api/patients';
      const method = isEdit ? 'PUT' : 'POST';

      fetch(url, {
        method: method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
        .then(res => res.json())
        .then(() => {
          fetchPatients();
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
          setFormSuccessMessage(isEdit ? 'Cập nhật hồ sơ hành chính thành công!' : 'Thêm bệnh nhi CHD mới thành công!');
          setTimeout(() => setFormSuccessMessage(''), 3000);
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
            "Xác nhận lưu hồ sơ"
          );
        },
        "Cảnh báo trùng thông tin"
      );
    } else {
      triggerConfirm(
        editingPatientKey 
          ? "Bạn có chắc chắn muốn LƯU những thay đổi hành chính này không?" 
          : "Bạn có chắc chắn muốn TẠO MỚI hồ sơ bệnh nhi này không?",
        proceedSave,
        "Xác nhận lưu"
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
      triggerAlert('Vui lòng chọn 1 bệnh nhân để đăng ký hội chẩn!');
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

      fetch('/api/consults', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
        .then(res => res.json())
        .then(() => {
          fetchConsults();
          // Reset state
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
          setFormSuccessMessage('Đã gửi thông tin đăng ký Hội chẩn thành công lên hệ thống!');
          setShowAddConsult(false);
          setActiveMenu('consult-list');
          setTimeout(() => setFormSuccessMessage(''), 4000);
        });
    };

    triggerConfirm("Bạn có chắc chắn muốn Lưu đăng ký này không?", proceedSave, "Xác nhận đăng ký");
  };

  // Prepare registration edit
  const makeRegisterEdit = (c: Consult) => {
    setEditingRegConsultKey(c.ConsultKey);
    setEditConsultData({
      ConsultType: c.ConsultType || 'Staff mổ',
      PatientWeight: c.PatientWeight || '',
      PatientHeight: c.PatientHeight || '',
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

    fetch(`/api/consults/${editingRegConsultKey}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(editConsultData)
    })
      .then(res => res.json())
      .then(() => {
        fetchConsults();
        setEditingRegConsultKey(null);
        triggerAlert('Đã cập nhật thông tin đăng ký staff thành công!', 'Cập nhật thành công');
      });
  };

  // Prepare result update
  const makeResultEdit = (c: Consult) => {
    setEditingConsultKey(c.ConsultKey);
    setIsDrawerEditing(false);
    
    // Safety check for ConsultMember which might be a comma-separated string or an array
    let normalizedMembers: string[] = [];
    if (c.ConsultMember) {
      if (Array.isArray(c.ConsultMember)) {
        normalizedMembers = c.ConsultMember;
      } else if (typeof c.ConsultMember === 'string') {
        normalizedMembers = (c.ConsultMember as string)
          .split(',')
          .map(s => s.trim())
          .filter(Boolean);
      }
    }

    setResultUpdateData({
      ConsultResultID: c.ConsultResultID || '' as ConsultResultEnum,
      DetailConsultResult: c.DetailConsultResult || '',
      PlannedDevice: c.PlannedDevice || '',
      PlannedPrice: c.PlannedPrice || '',
      CheckDevice: c.CheckDevice || '',
      PatientWeight: c.PatientWeight || '',
      PatientHeight: c.PatientHeight || '',
      ConsultType: c.ConsultType || 'Staff mổ',
      ConsultDate: c.ConsultDate || '',
      RequestBy: c.RequestBy || '',
      DiagnosisID: c.DiagnosisID || '',
      DetailDiagnosis: c.DetailDiagnosis || '',
      ConsultMember: normalizedMembers,
      PriorityOrder: normalizePriorityOrder(c.PriorityOrder),
    });
  };

  // Submit clinical result update
  const submitResultUpdate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingConsultKey) return;
    
    if (!resultUpdateData.DiagnosisID) {
      triggerAlert('Vui lòng chọn ICD (DiagnosisID)!', 'Thiếu thông tin');
      return;
    }

    if (!resultUpdateData.ConsultResultID) {
      triggerAlert('Vui lòng chọn Kết luận chính (ConsultResultID)!', 'Thiếu thông tin');
      return;
    }

    if (!resultUpdateData.ConsultMember || resultUpdateData.ConsultMember.length === 0) {
      triggerAlert('Vui lòng chọn ít nhất một Thành viên duyệt hội chẩn!', 'Thiếu thông tin');
      return;
    }

    const currentConsult = consults.find(c => c.ConsultKey === editingConsultKey);
    const patKey = currentConsult?.PatientKey;
    
    const finalData = {
      ...resultUpdateData,
      ConsultResultUpdatedBy: currentStaff?.StaffKey || '01378',
      ConsultResultUpdatedTime: new Date().toISOString()
    };

    fetch(`/api/consults/${editingConsultKey}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(finalData)
    })
      .then(res => res.json())
      .then(() => {
        // Automatically sync patient outcome based on result!
        let automaticOutcome: OutcomeType = '';
        if (resultUpdateData.ConsultResultID === 'Can thiệp thông tim') {
          automaticOutcome = 'Đã thông';
        } else if (resultUpdateData.ConsultResultID === 'Phẫu thuật tim hở' || resultUpdateData.ConsultResultID === 'Mổ tim' as any) {
          automaticOutcome = 'Đã mổ';
        }
        
        if (patKey && automaticOutcome) {
          fetch(`/api/patients/${patKey}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ Outcome: automaticOutcome })
          })
          .then(() => {
            fetchPatients();
          });
        }

        fetchConsults();
        setIsDrawerEditing(false);
        setEditingConsultKey(null);
        triggerAlert('Đã cập nhật chỉ định kết quả hội chẩn và đồng bộ trạng thái bệnh nhi thành công!', 'Cập nhật thành công');
      });
  };

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
      fetchConsults();
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
          fetchConsults();
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
        const filtered = getFilteredConsults();
        if (filtered.length === 0) {
          triggerAlert('Không tìm thấy bản ghi nào khớp bộ lọc để xuất!', 'Cảnh báo');
          setExportLoading(false);
          setBotMessage('');
          return;
        }

        try {
          // Helper for age computation
          const getAgeDescription = (dobStr: string) => {
            if (!dobStr) return '';
            try {
              const birth = new Date(dobStr);
              const now = new Date('2026-06-06');
              
              const diffTime = now.getTime() - birth.getTime();
              const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
              
              if (diffDays < 0) return '(Sơ sinh)';
              if (diffDays < 30) {
                return `(${diffDays} ngày tuổi)`;
              }
              
              let years = now.getFullYear() - birth.getFullYear();
              let months = now.getMonth() - birth.getMonth();
              if (months < 0 || (months === 0 && now.getDate() < birth.getDate())) {
                years--;
                months = 12 + months;
              }
              
              const totalMonths = years * 12 + months;
              if (totalMonths < 12) {
                return `(${totalMonths} tháng tuổi)`;
              } else if (years <= 5) {
                if (months > 0) {
                  return `(${years} tuổi ${months} tháng)`;
                } else {
                  return `(${years} tuổi)`;
                }
              } else {
                return `(${years} tuổi)`;
              }
            } catch (e) {
              return '';
            }
          };

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
              const ageDesc = getAgeDescription(pat.PatientDOB) || '';
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

            const weightClean = item.PatientWeight ? item.PatientWeight.toString().replace(/kg/gi, '').trim() : '';
            const weightDisplay = weightClean ? `${weightClean} (kg)` : '';
            const heightClean = item.PatientHeight ? item.PatientHeight.toString().replace(/cm/gi, '').trim() : '';
            const heightDisplay = heightClean ? `${heightClean} (cm)` : '';

            const weightHeightLines = [];
            if (weightDisplay) weightHeightLines.push(weightDisplay);
            if (heightDisplay) weightHeightLines.push(heightDisplay);
            const weightHeightDisplay = weightHeightLines.join('\n');

            const dangKy = item.RequestBy || '';
            const chanDoan = item.DetailDiagnosis || item.DiagnosisID || '';
            const ketQua = item.ConsultResultID || '';
            const dungCu = item.PlannedDevice || '';
            const luuY = item.ConsultNote || '';

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
            const maxCharsInCell = Math.max(chanDoan.length, ketQua.length, dungCu.length, luuY.length);
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
          triggerAlert('Có lỗi xảy ra khi tạo file Excel! Vui lòng kiểm tra lại.', 'Lỗi xuất Excel');
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
            fetchPatients();
            fetchConsults();
            fetchStaff();
            triggerAlert('Khôi phục cơ sở dữ liệu về mặc định thành công!', 'Thành công');
          });
      },
      "Xác nhận phục hồi DB"
    );
  };

  // Query Filters Handler (Relocated to prevent conditional hook errors)
  const getFilteredConsults = () => {
    const list = consults.filter(c => {
      const typeMatch = filterType === 'Tất cả' || c.ConsultType === filterType;
      const dateMatch = !filterDate || c.ConsultDate === filterDate;
      const resVal = String(c.ConsultResultID || '').trim().toLowerCase();
      const notConsultedYet = !c.ConsultResultID || resVal === '' || resVal === 'nodata' || resVal === 'no data' || resVal === '—' || resVal === '-';
      
      const pat = getPatientByKey(c.PatientKey);
      if (!pat) return false; // Ẩn bệnh nhân không tìm thấy hồ sơ (tránh mismatch đếm ca)

      let searchMatch = true;
      const q = consultListSearch.toLowerCase().trim();
      if (q) {
        const qRaw = removeDiacritics(q);
        const nameRaw = removeDiacritics(String(pat.PatientName || '')).toLowerCase();
        const id1 = String(pat.PatientID1 || '').toLowerCase();
        const id2 = pat.PatientID2 ? String(pat.PatientID2).toLowerCase() : '';
        
        searchMatch = (
          nameRaw.includes(qRaw) ||
          id1.includes(q) ||
          id2.includes(q)
        );
      }

      return typeMatch && dateMatch && notConsultedYet && searchMatch;
    });

    return list.sort((a, b) => {
      const dateA = a.ConsultDate ? new Date(a.ConsultDate).getTime() : 0;
      const dateB = b.ConsultDate ? new Date(b.ConsultDate).getTime() : 0;
      return consultSortOrder === 'asc' ? dateA - dateB : dateB - dateA;
    });
  };

  const filteredPatients = useMemo(() => {
    return patients.filter(p => {
      const q = (patientSearch || '').toLowerCase().trim();
      if (!q) return true;
      
      const qRaw = removeDiacritics(q);
      
      const name = p.PatientName ? String(p.PatientName).toLowerCase() : '';
      const nameRaw = removeDiacritics(name);
      
      const id1 = p.PatientID1 ? String(p.PatientID1).toLowerCase() : '';
      const id2 = p.PatientID2 ? String(p.PatientID2).toLowerCase() : '';
      
      const addr = (p.PatientAddress || (p as any).PatientAddress) ? String(p.PatientAddress || (p as any).PatientAddress).toLowerCase() : '';
      const addrRaw = removeDiacritics(addr);
      
      return name.includes(q) || nameRaw.includes(qRaw) ||
             id1.includes(q) || id2.includes(q) ||
             addr.includes(q) || addrRaw.includes(qRaw);
    });
  }, [patients, patientSearch]);

  const PATIENTS_PER_PAGE = 50;
  const totalPatientPages = Math.ceil(filteredPatients.length / PATIENTS_PER_PAGE) || 1;
  const displayedPatients = filteredPatients.slice(
    (patientCurrentPage - 1) * PATIENTS_PER_PAGE,
    patientCurrentPage * PATIENTS_PER_PAGE
  );

  const CONSULTS_PER_PAGE = 100;
  const filteredConsultsList = useMemo(() => {
    return getFilteredConsults();
  }, [consults, patientsMap, filterType, filterDate, consultListSearch, consultSortOrder]);
  const totalConsultPages = Math.ceil(filteredConsultsList.length / CONSULTS_PER_PAGE) || 1;
  const displayedConsults = filteredConsultsList.slice(
    (consultCurrentPage - 1) * CONSULTS_PER_PAGE,
    consultCurrentPage * CONSULTS_PER_PAGE
  );

  // Return Login screen if not authenticated
  if (!currentStaff) {
    return (
      <div className="min-h-screen bg-neutral-950 flex flex-col items-center justify-center p-4 relative overflow-hidden font-sans">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-[#d2145a]/10 rounded-full blur-3xl pointer-events-none"></div>
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-pink-500/10 rounded-full blur-3xl pointer-events-none"></div>

        <div className="w-full max-w-sm bg-neutral-900 border border-neutral-800 rounded-3xl p-6 md:p-8 shadow-2xl relative z-10 animate-in fade-in zoom-in-95 duration-200">
          
          <div className="text-center mb-6">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-[#d2145a]/10 border border-[#d2145a]/20 text-[#d2145a] mb-2.5">
              <Heart className="w-6 h-6 fill-[#d2145a]/10 animate-pulse" />
            </div>
            <h1 className="text-lg md:text-xl font-black text-white uppercase tracking-tight leading-none pt-1">CHD Management 5.0</h1>
            <p className="text-[10px] text-neutral-400 font-bold uppercase tracking-wider mt-1.5 leading-relaxed">
              HỆ THỐNG QUẢN LÝ TIM BẨM SINH<br />
              KHOA TIM MẠCH - BVNĐTP
            </p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            {loginError && (
              <div className="bg-red-500/15 border border-red-500/30 text-red-300 rounded-xl p-3 text-xs leading-relaxed flex gap-1.5">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{loginError}</span>
              </div>
            )}

            <div>
              <label className="block text-slate-400 text-[10px] font-black uppercase tracking-wider mb-1.5">
                Tên nhân viên
              </label>
              <select
                value={loginStaffKey}
                onChange={(e) => setLoginStaffKey(e.target.value)}
                className="w-full bg-neutral-950 text-white border border-neutral-800 rounded-xl px-3 py-2.5 text-xs focus:outline-none focus:ring-1 focus:ring-[#d2145a] transition-all font-semibold"
              >
                {staffList.map((s) => (
                  <option key={s.StaffKey} value={s.StaffKey}>
                    {s.Name || s.StaffName} ({s.Role})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-slate-400 text-[10px] font-black uppercase tracking-wider mb-1.5">
                Mật khẩu
              </label>
              <input
                type="password"
                required
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                className="w-full bg-neutral-950 text-white border border-neutral-800 rounded-xl px-3 py-2.5 text-xs focus:outline-none focus:ring-1 focus:ring-[#d2145a] placeholder:text-neutral-700 transition"
                placeholder="Nhập Password nhân viên"
              />
            </div>

            <button
              type="submit"
              className="w-full bg-[#d2145a] hover:bg-pink-700 text-white font-extrabold rounded-xl py-2.5 text-xs transition shadow-lg shadow-pink-950/20 uppercase tracking-wider flex items-center justify-center gap-1.5"
            >
              <UserCheck className="w-4 h-4" /> Đăng nhập hệ thống
            </button>
          </form>

          <div className="mt-5 pt-5 border-t border-neutral-800 text-[10px] text-neutral-500 leading-relaxed text-center space-y-1 font-bold uppercase font-mono">
            <p>Sử dụng mật khẩu trong danh sách Google Sheet để Đăng nhập</p>
          </div>
        </div>
      </div>
    );
  }

  // Define sidebar shortcuts navigation schema
  const primarySideMenus = [
    { id: 'home', label: 'Home', icon: <Home className="w-4 h-4" /> },
    { id: 'workspace', label: 'Không gian làm việc', icon: <LayoutDashboard className="w-4 h-4" /> },
    { id: 'patients', label: 'Hồ sơ bệnh án', icon: <Heart className="w-4 h-4" /> },
    { id: 'consult-list', label: 'Hội chẩn', icon: <ClipboardList className="w-4 h-4" /> },
    { id: 'results-staff', label: 'Nhập kết quả staff', icon: <FileText className="w-4 h-4" /> },
    { id: 'schedule-tt', label: 'Xếp lịch & Dụng cụ', icon: <CalendarDays className="w-4 h-4" /> },
    { id: 'mri-register', label: 'Đăng ký MRI', icon: <Activity className="w-4 h-4" /> },
    { id: 'mri-scheduler', label: 'Xếp lịch MRI', icon: <Activity className="w-4 h-4" /> },
    { id: 'mri-result', label: 'Điền KQ MRI', icon: <Activity className="w-4 h-4" /> },
    { id: 'mri-calendar', label: 'Lịch chụp MRI', icon: <CalendarDays className="w-4 h-4" /> },
    { id: 'google-sheets', label: 'Virtual Google Sheets', icon: <Database className="w-4 h-4" /> },
    { id: 'excel-export', label: 'Bảng Filter_Consult', icon: <Download className="w-4 h-4" /> },
    { id: 'staff-mgmt', label: 'Quản lý nhân sự', icon: <UserCog className="w-4 h-4" /> },
  ].filter(menu => canAccessModule(currentStaff, menu.id as AppModule));



  const getHeaderContent = () => {
    switch (activeMenu) {
      case 'home':
        return {
          title: "HỆ THỐNG QUẢN LÝ TIM BẨM SINH - KHOA TIM MẠCH - BVNĐTP",
          subtitle: "",
          icon: <Heart className="w-5 h-5 text-pink-200 animate-pulse fill-pink-500/20" />
        };
      case 'profile':
        return {
          title: "HỒ SƠ CÁ NHÂN",
          subtitle: currentStaff?.StaffName || '',
          icon: <UserCog className="w-5 h-5 text-pink-200" />
        };
      case 'patients':
        return {
          title: "HỒ SƠ BỆNH ÁN",
          subtitle: "",
          icon: <Heart className="w-5 h-5 text-pink-200" />
        };
      case 'consult-list':
        return {
          title: "ĐĂNG KÝ HỘI CHẨN NỘI - NGOẠI KHOA",
          subtitle: "",
          icon: <ClipboardList className="w-5 h-5 text-pink-200" />
        };
      case 'results-staff':
        return {
          title: "NHẬP KẾT QUẢ HỘI CHẨN NỘI - NGOẠI KHOA",
          subtitle: "",
          icon: <FileText className="w-5 h-5 text-pink-200" />
        };
      case 'schedule-tt':
        return {
          title: "XẾP LỊCH & DỤNG CỤ",
          subtitle: "",
          icon: <CalendarDays className="w-5 h-5 text-pink-200 animate-pulse" />
        };
      case 'schedule-view':
        return {
          title: "LỊCH THÔNG TIM DỰ KIẾN",
          subtitle: "",
          icon: <CalendarDays className="w-5 h-5 text-pink-200" />
        };
      case 'mri-scheduler':
        return {
          title: "XẾP LỊCH MRI",
          subtitle: "Quản lý MRI tim",
          icon: <Activity className="w-5 h-5 text-pink-200 animate-pulse" />
        };
      case 'mri-register':
        return {
          title: "ĐĂNG KÝ MRI TIM",
          subtitle: "Danh sách đăng ký chụp MRI",
          icon: <Activity className="w-5 h-5 text-pink-200 animate-pulse" />
        };
      case 'mri-result':
        return {
          title: "ĐIỀN KẾT QUẢ MRI TIM",
          subtitle: "Danh sách chờ điền kết quả MRI tim",
          icon: <Activity className="w-5 h-5 text-pink-200 animate-pulse" />
        };
      case 'mri-calendar':
        return {
          title: "LỊCH CHỤP MRI TIM",
          subtitle: "Lịch các ca dự kiến chụp MRI",
          icon: <CalendarDays className="w-5 h-5 text-pink-200" />
        };
      case 'cathlab-room':
        return {
          title: "PHÒNG THÔNG TIM",
          subtitle: "",
          icon: <Activity className="w-5 h-5 text-pink-200" />
        };
      case 'surgery-room':
        return {
          title: "PHÒNG PHẪU THUẬT",
          subtitle: "Quản lý ca mổ tim",
          icon: <Activity className="w-5 h-5 text-pink-200" />
        };
      case 'surgery-scheduler':
        return {
          title: "XẾP LỊCH PHẪU THUẬT",
          subtitle: "",
          icon: <CalendarDays className="w-5 h-5 text-pink-200" />
        };
      case 'surgery-schedule-view':
        return {
          title: "LỊCH PHẪU THUẬT DỰ KIẾN",
          subtitle: "",
          icon: <CalendarDays className="w-5 h-5 text-pink-200" />
        };
      case 'archive':
        return {
          title: "LƯU TRỮ",
          subtitle: "Danh sách đã chuyển phòng TT & ca lưu trữ",
          icon: <Archive className="w-5 h-5 text-pink-200" />
        };
      case 'google-sheets':
        return {
          title: "HỆ THỐNG CƠ SỞ DỮ LIỆU VIRTUAL GOOGLE SHEETS",
          subtitle: "",
          icon: <Database className="w-5 h-5 text-pink-200" />
        };
      case 'excel-export':
        return {
          title: "BẢNG FILTER & CONTAINER XUẤT DIRECT BIÊN BẢN",
          subtitle: "",
          icon: <Download className="w-5 h-5 text-pink-200" />
        };
      case 'staff-mgmt':
        return {
          title: "QUẢN LÝ NHÂN SỰ & PHÂN QUYỀN",
          subtitle: "Module 6 · Gán vai trò và quyền truy cập",
          icon: <UserCog className="w-5 h-5 text-pink-200" />
        };
      default:
        return {
          title: "HỆ THỐNG QUẢN LÝ TIM BẨM SINH - KHOA TIM MẠCH - BVNĐTP",
          subtitle: "",
          icon: <Heart className="w-5 h-5 text-pink-200" />
        };
    }
  };

  const headerInfo = getHeaderContent();

  return (
    <div className="h-screen bg-slate-50 text-slate-800 flex flex-col font-sans overflow-hidden">
      
      {/* Top Application Header Bar styled beautifully like the secondary custom red banner in screenshot */}
      <header className="bg-[#d2145a] text-white shrink-0 shadow-md">
        <div className="max-w-none px-4 md:px-6 py-2 flex items-center justify-between min-h-[52px]">
          
          {/* Left Panel: Menu toggle + View title & Subtitle */}
          <div className="flex items-center gap-2.5 min-w-0">
            <button 
              onClick={() => setIsSidebarExpanded(!isSidebarExpanded)}
              className="hover:bg-white/10 p-1.5 rounded-xl transition shrink-0"
              title="Mở rộng Sidebar"
            >
              <Menu className="w-5 h-5 text-white/90" />
            </button>
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="shrink-0 hidden sm:block">
                {headerInfo.icon}
              </div>
              <div className="min-w-0">
                <h1 className="text-sm md:text-base font-extrabold tracking-wide uppercase truncate leading-tight flex items-center gap-2 text-white">
                  {headerInfo.title}
                </h1>
                {headerInfo.subtitle && (
                  <p className="text-[10px] text-pink-100/90 font-medium truncate normal-case leading-none mt-0.5">
                    {headerInfo.subtitle}
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Right Panel: CHD MANAGEMENT V5.0, circular Admin avatar, Log out */}
          <div className="flex items-center gap-2 shrink-0">
            
            {/* Sync trigger icon */}
            <button 
              onClick={() => {
                fetchPatients();
                fetchConsults();
                fetchStaff();
                fetchCmrs();
              }}
              className="hover:bg-white/10 p-1.5 rounded-xl transition flex items-center gap-1 text-xs shrink-0"
              title="Đồng bộ lại"
            >
              <RefreshCw className="w-3.5 h-3.5 text-white/90" />
            </button>

            {/* Title: CHD MANAGEMENT V5.0 */}
            <div className="hidden md:flex items-center gap-1 text-xs font-black tracking-tight text-white/90">
              <span>CHD MANAGEMENT</span>
              <span className="bg-white/15 border border-white/25 rounded px-1.5 py-0.5 text-[8px] font-mono leading-none">V5.0</span>
            </div>

            {/* Separator line */}
            <span className="hidden md:block w-px h-5 bg-white/25"></span>

            {/* Staff account menu */}
            <StaffAccountMenu
              staff={currentStaff}
              isOpen={isStaffAccountMenuOpen}
              onToggle={() => setIsStaffAccountMenuOpen(prev => !prev)}
              onClose={() => setIsStaffAccountMenuOpen(false)}
              onViewProfile={openStaffProfile}
            />

            {/* Logout Button */}
            <button
              onClick={handleLogout}
              className="hover:bg-white/10 border border-white/15 p-1.5 rounded-xl text-white hover:text-red-200 transition shrink-0"
              title="Đăng xuất"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>

        </div>
      </header>

      {/* Hero success/error notifications */}
      {formSuccessMessage && (
        <div className="bg-green-600 text-white text-center py-2 text-xs font-bold shadow-inner">
          ✓ {formSuccessMessage}
        </div>
      )}

      {/* Dual Panel Workspace Block */}
      <div className={`${activeMenu === 'schedule-tt' || activeMenu === 'schedule-view' || activeMenu === 'mri-scheduler' || activeMenu === 'mri-register' || activeMenu === 'mri-result' || activeMenu === 'mri-calendar' || activeMenu === 'surgery-room' || activeMenu === 'surgery-scheduler' || activeMenu === 'surgery-schedule-view' || activeMenu === 'google-sheets' || activeMenu === 'results-staff' ? 'max-w-none px-4 md:px-6' : 'max-w-7xl px-4 sm:px-6 lg:px-8'} mx-auto py-4 flex-1 w-full flex flex-row gap-4 overflow-hidden min-h-0`}>
        
        {/* Collapsible Left navigation Aside drawer */}
        <aside className={`${isSidebarExpanded ? 'w-full md:w-64' : 'w-16'} transition-all duration-200 shrink-0 h-full overflow-y-auto pb-4`}>
          <div className={`bg-white border border-slate-200 rounded-3xl ${isSidebarExpanded ? 'p-4' : 'p-2 sm:p-2'} shadow-sm space-y-4`}>
            
            {/* Quick profile overview */}
            {isSidebarExpanded && (
              <div className="bg-slate-50 border border-slate-150 p-3 rounded-2xl">
                <span className="text-[10px] font-black uppercase text-slate-400 font-mono tracking-wider">Tài khoản</span>
                <p className="font-extrabold text-neutral-900 text-xs truncate leading-snug">{currentStaff.StaffName}</p>
                <p className="text-[10px] text-[#d2145a] font-mono leading-none pt-0.5 font-bold">Chức vụ: {currentStaff.Role}</p>
              </div>
            )}

            {/* Menu Group lists */}
            <nav className="space-y-1">
              {primarySideMenus.map((menu) => (
                <button
                  key={menu.id}
                  onClick={() => navigateMenu(menu.id as typeof activeMenu)}
                  title={!isSidebarExpanded ? menu.label : undefined}
                  className={`relative w-full flex items-center ${isSidebarExpanded ? 'gap-2.5 px-3' : 'justify-center p-2'} py-2 text-xs font-semibold rounded-2xl transition-all ${
                    activeMenu === menu.id 
                      ? 'bg-pink-50 text-[#d2145a] hover:bg-pink-100/55' 
                      : 'text-neutral-600 hover:bg-slate-100 hover:text-neutral-900'
                  }`}
                >
                  <span className={`${activeMenu === menu.id ? 'text-[#d2145a]' : 'text-slate-400'}`}>
                    {menu.icon}
                  </span>
                  {isSidebarExpanded && (
                    <span className="truncate flex-1 text-left">{menu.label}</span>
                  )}
                  {menu.id === 'results-staff' && consults.filter(c => !c.ConsultResultID || ['nodata', 'no data', '—', '-'].includes(String(c.ConsultResultID).trim().toLowerCase())).length > 0 && (
                    isSidebarExpanded ? (
                      <span className="bg-pink-100 text-[#d2145a] text-[9px] font-bold px-1.5 py-0.5 rounded-full ml-auto">
                        {consults.filter(c => !c.ConsultResultID || ['nodata', 'no data', '—', '-'].includes(String(c.ConsultResultID).trim().toLowerCase())).length}
                      </span>
                    ) : (
                      <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-[#d2145a] rounded-full"></span>
                    )
                  )}
                </button>
              ))}
            </nav>

            {/* Reset option section */}
            {isSidebarExpanded && (
              <div className="pt-3 border-t border-slate-150 space-y-2">
                <button
                  onClick={handleResetDatabase}
                  className="w-full bg-slate-100 hover:bg-red-50 hover:text-red-700 text-slate-500 font-extrabold text-[10px] py-1.5 px-3 rounded-xl transition border border-slate-150 flex items-center justify-center gap-1"
                >
                  Kiểm Reset Database
                </button>
              </div>
            )}

          </div>
        </aside>

        {/* Primary View content frame */}
        <main className={`flex-1 min-w-0 h-full flex flex-col min-h-0 ${activeMenu === 'home' || activeMenu === 'profile' || activeMenu === 'cathlab-room' || activeMenu === 'surgery-room' || activeMenu === 'patients' || activeMenu === 'schedule-tt' || activeMenu === 'schedule-view' || activeMenu === 'archive' || activeMenu === 'mri-scheduler' || activeMenu === 'mri-register' || activeMenu === 'mri-result' || activeMenu === 'mri-calendar' || activeMenu === 'surgery-scheduler' || activeMenu === 'surgery-schedule-view' || activeMenu === 'google-sheets' || activeMenu === 'results-staff' || activeMenu === 'consult-list' || activeMenu === 'staff-mgmt' ? 'overflow-hidden' : 'overflow-y-auto'}`}>
          
          {/* HOME PANEL */}
          {activeMenu === 'home' && (
            <HomeDashboard 
              onNavigate={(menu) => navigateMenu(menu as typeof activeMenu)}
              patientCount={patients.length}
              pendingConsultCount={consults.filter(c => !c.ConsultResultID || ['nodata', 'no data', '—', '-'].includes(String(c.ConsultResultID).trim().toLowerCase())).length}
              completedConsultCount={consults.filter(c => c.ConsultResultID && !['nodata', 'no data', '—', '-'].includes(String(c.ConsultResultID).trim().toLowerCase())).length}
              onOpenScheduler={(type) => setActiveScheduler(type)}
              onOpenRules={(type) => setActiveRules(type)}
              currentStaffName={currentStaff?.StaffName}
              patients={patients}
              consults={consults}
              cathlabs={cathlabs}
              canAccessModule={(module) => canAccessModule(currentStaff, module)}
            />
          )}

          {activeMenu === 'profile' && currentStaff && (
            <div className="flex-1 min-h-0 h-full overflow-hidden p-4 sm:p-6">
              <StaffProfileView
                staff={currentStaff}
                staffList={staffList}
                consults={consults}
                cathlabs={cathlabs}
                operations={operations}
                onClose={() => setActiveMenu(profileReturnMenu)}
                onStaffUpdated={(updated) => {
                  setCurrentStaff(updated);
                  localStorage.setItem('CurrentStaffKey', JSON.stringify(updated));
                  fetchStaff();
                }}
                triggerAlert={triggerAlert}
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
              pendingConsultCount={consults.filter(c => !c.ConsultResultID || ['nodata', 'no data', '—', '-'].includes(String(c.ConsultResultID).trim().toLowerCase())).length}
              pendingMriCount={cmrs.filter(c => !c.CMRScheduledDate).length + consults.filter(c => String(c.ConsultResultID || '').trim().toLowerCase() === 'chụp mri').length}
              canAccessModule={(module) => canAccessModule(currentStaff, module)}
            />
          )}

          {/* PATIENT MANAGER PANEL */}
          {activeMenu === 'patients' && (
            <div className="flex-1 min-h-0 h-full flex flex-col animate-in fade-in duration-200 bg-slate-50 p-4 sm:p-6 space-y-4 overflow-hidden">
              
              {/* Header and Add Patient Trigger */}
              <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-3 shrink-0">
                <div>
                  <h2 className="text-base font-extrabold text-neutral-900 tracking-tight flex items-center gap-1.5 uppercase">
                    <Heart className="w-5 h-5 text-pink-600 fill-pink-50" /> DANH SÁCH BỆNH NHI
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">Quản lý hồ sơ hành chính, lịch sử hội chẩn, can thiệp, phẫu thuật</p>
                </div>
                
                <div className="flex items-center gap-2">
                  <div className="relative">
                    <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                    <input
                      type="text"
                      placeholder="Tìm tên, mã ID1 bệnh nhi..."
                      value={patientSearch}
                      onChange={(e) => {
                        setPatientSearch(e.target.value);
                        setPatientCurrentPage(1);
                      }}
                      className="w-[220px] pl-9 pr-8 py-2 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-[#d2145a] focus:border-[#d2145a] font-sans shadow-sm"
                    />
                    {patientSearch && (
                      <button 
                        onClick={() => {
                          setPatientSearch('');
                          setPatientCurrentPage(1);
                        }}
                        className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600 cursor-pointer"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>

                  <button
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
                    className="bg-[#d2145a] hover:bg-pink-700 text-white font-extrabold px-3.5 py-2.5 rounded-2xl text-xs flex items-center justify-center gap-1 shadow-sm transition cursor-pointer shrink-0"
                  >
                    <Plus className="w-4 h-4" /> Thêm bệnh nhi mới
                  </button>
                </div>
              </div>

              {/* Patient data flat list table styled strictly like Screenshot 3 */}
              <div className="flex-1 min-h-0 bg-white border border-slate-200 rounded-3xl flex flex-col shadow-sm overflow-hidden">
                
                <div className="flex-1 overflow-x-auto overflow-y-auto custom-scrollbar">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="sticky top-0 z-10">
                      <tr className="bg-slate-50 text-slate-600 border-b border-slate-200 text-[10px] uppercase font-black tracking-wider font-mono">
                        <th className="py-3 px-4 shadow-sm">Họ và tên bé</th>
                        <th className="py-3 px-4 shadow-sm">Ngày sinh</th>
                        <th className="py-3 px-4 shadow-sm">Giới tính</th>
                        <th className="py-3 px-4 shadow-sm">Địa chỉ</th>
                        <th className="py-3 px-4 shadow-sm">Chẩn đoán gần nhất</th>
                        <th className="py-3 px-4 text-right shadow-sm">Chi tiết</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-semibold text-slate-700">
                      {filteredPatients.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="text-center py-10 italic text-slate-400">
                            Không tìm thấy hồ sơ bệnh nhi nào khớp với truy vấn tìm kiếm.
                          </td>
                        </tr>
                      ) : (
                        displayedPatients.map((pat) => {
                          const pateConsults = consults.filter(c => c.PatientKey === pat.PatientKey);
                          const latestConsult = pateConsults.length > 0
                            ? [...pateConsults].sort((a, b) => new Date(b.ConsultDate).getTime() - new Date(a.ConsultDate).getTime())[0]
                            : null;
                          return (
                            <tr 
                              key={pat.PatientKey} 
                              onClick={() => setSelectedPatientForDetail(pat)}
                              className="hover:bg-pink-50/50 cursor-pointer transition duration-150 group"
                            >
                              <td className="py-3 px-4">
                                <p className="font-extrabold text-neutral-900 leading-tight uppercase group-hover:text-[#d2145a]">{pat.PatientName}</p>
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
                                {latestConsult ? (
                                  <div className="flex flex-col">
                                    <span className="text-red-700 bg-red-50 border border-red-100 font-extrabold px-1.5 py-0.5 rounded text-[10px] font-mono w-max">
                                      {latestConsult.DiagnosisID}
                                    </span>
                                    {latestConsult.DetailDiagnosis && (
                                      <span className="text-[10px] text-slate-400 font-bold italic truncate max-w-[140px] mt-0.5">
                                        {latestConsult.DetailDiagnosis}
                                      </span>
                                    )}
                                  </div>
                                ) : (
                                  <span className="text-[10px] text-slate-400 font-bold italic">Chưa có staff hội chẩn</span>
                                )}
                              </td>
                              <td className="py-3 px-4 text-right">
                                <button 
                                  className="text-slate-350 group-hover:text-[#d2145a] transition translate-x-0 group-hover:translate-x-1 duration-200"
                                >
                                  <ChevronRight className="w-4 h-4 ml-auto" />
                                </button>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>

                <div className="bg-slate-50 border-t border-slate-200 p-4 flex flex-col sm:flex-row items-center justify-between gap-4 shrink-0">
                  <div className="text-[11px] text-slate-500 font-semibold font-mono uppercase">
                    Tổng số: {filteredPatients.length} / {patients.length} bệnh nhi tim bẩm sinh CHD 
                    {filteredPatients.length > 0 && (
                      <span className="text-[#d2145a] ml-1">
                        (Trang {patientCurrentPage} / {totalPatientPages} - Hiển thị {(patientCurrentPage - 1) * PATIENTS_PER_PAGE + 1} đến {Math.min(patientCurrentPage * PATIENTS_PER_PAGE, filteredPatients.length)})
                      </span>
                    )}
                  </div>
                  
                  {totalPatientPages > 1 && (
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => setPatientCurrentPage(1)}
                        disabled={patientCurrentPage === 1}
                        className="px-2 py-1 rounded text-[10px] uppercase font-bold bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                      >
                        Đầu
                      </button>
                      <button
                        onClick={() => setPatientCurrentPage(p => Math.max(1, p - 1))}
                        disabled={patientCurrentPage === 1}
                        className="px-2 py-1 rounded text-[10px] uppercase font-bold bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                      >
                        Trước
                      </button>
                      
                      <span className="text-xs font-semibold text-slate-700 px-2 font-mono">
                        {patientCurrentPage} / {totalPatientPages}
                      </span>
                      
                      <button
                        onClick={() => setPatientCurrentPage(p => Math.min(totalPatientPages, p + 1))}
                        disabled={patientCurrentPage === totalPatientPages}
                        className="px-2 py-1 rounded text-[10px] uppercase font-bold bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                      >
                        Sau
                      </button>
                      <button
                        onClick={() => setPatientCurrentPage(totalPatientPages)}
                        disabled={patientCurrentPage === totalPatientPages}
                        className="px-2 py-1 rounded text-[10px] uppercase font-bold bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                      >
                        Cuối
                      </button>
                    </div>
                  )}
                </div>

              </div>

            </div>
          )}

          {/* NEW CONSULT REGISTRATION OVERLAY DIALOG MODAL */}
          <AnimatePresence>
            {showAddConsult && (
              <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-40 flex items-center justify-center p-4">
                <div className="bg-white rounded-3xl max-w-xl w-full max-h-[92vh] shadow-2xl border border-slate-150 flex flex-col overflow-hidden text-xs text-slate-700 font-semibold leading-relaxed animate-in zoom-in-95 duration-150">
                  
                  <div className="flex items-center justify-between border-b border-slate-150 px-6 py-3.5 text-[#d2145a] shrink-0">
                    <h3 className="font-extrabold text-sm uppercase flex items-center gap-1.5 font-sans">
                      <ClipboardList className="w-5 h-5 animate-pulse" /> Đăng ký staff
                    </h3>
                    <button 
                      type="button"
                      onClick={() => {
                        triggerConfirm("Bạn có chắc chắn muốn Hủy đăng ký không?", () => {
                          setShowAddConsult(false);
                        }, "Xác nh��n Hủy");
                      }}
                      className="text-slate-400 hover:text-slate-600 transition cursor-pointer"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>

                  <form onSubmit={handleAddConsultSubmit} className="flex-1 flex flex-col overflow-hidden min-h-0 font-semibold text-slate-700">
                    
                    {/* Scrollable Form body */}
                    <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3.5 scrollbar-thin">
                    
                    {/* Searchable Patient Selection Block */}
                    <div className="bg-slate-50 border border-slate-150 p-4 rounded-2xl space-y-3">
                      <div className="flex items-center justify-between">
                        <label className="block text-[#d2145a] font-extrabold uppercase text-[10px]">
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
                          className="bg-[#d2145a]/10 hover:bg-[#d2145a]/20 text-[#d2145a] font-extrabold px-3 py-1 rounded-lg text-[10px] transition flex items-center gap-1 cursor-pointer"
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
                        <div className="max-h-48 overflow-y-auto border border-slate-250 rounded-xl bg-white divide-y divide-slate-100 shadow-sm">
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
                                className="w-full text-left px-3 py-2.5 text-xs transition flex justify-between items-center cursor-pointer hover:bg-pink-50 hover:text-[#d2145a]"
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
                                <h4 className="font-black text-sm uppercase text-[#d2145a] flex items-center gap-2">
                                  <span>👤 {selectedPat.PatientName}</span>
                                  <span className="bg-white border border-pink-200 text-[#d2145a] text-[10px] px-2 py-0.5 rounded-full font-mono normal-case">{selectedPat.PatientSex}</span>
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
                                className="bg-white hover:bg-pink-100 hover:text-[#d2145a] transition text-slate-400 font-bold w-6 h-6 rounded-full flex items-center justify-center border border-pink-100 cursor-pointer shadow-sm ml-2"
                                title="Bỏ chọn & Tìm bệnh nhân khác"
                              >
                                ✕
                              </button>
                            </div>
                          </div>
                        );
                      })()}

                      {/* Red/Amber Warning if already has pending consults in system */}
                      {newConsultData.PatientKey && consults.some(c => c.PatientKey === newConsultData.PatientKey && !c.ConsultResultID) && (
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
                                  ? 'bg-[#d2145a] text-white border-[#d2145a] shadow-sm'
                                  : 'bg-white text-slate-600 border-slate-200 hover:border-[#d2145a]/40'
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
                          className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 font-bold font-mono focus:outline-none"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-3">
                      <div>
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

                      <div>
                        <label className="block text-slate-500 font-bold uppercase text-[10px] mb-1">Chiều cao (cm)</label>
                        <input
                          type="text"
                          placeholder="vd: 85"
                          value={newConsultData.PatientHeight}
                          onChange={(e) => setNewConsultData(prev => ({ ...prev, PatientHeight: e.target.value }))}
                          className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 font-semibold focus:outline-none"
                        />
                      </div>

                      <div>
                        <label className="block text-slate-500 font-bold uppercase text-[10px] mb-1">Người đăng ký *</label>
                        <select
                          required={!showAddDocInput}
                          value={showAddDocInput ? 'ADD_NEW' : (newConsultData.RequestBy || '')}
                          onChange={(e) => {
                            const val = e.target.value;
                            if (val === 'ADD_NEW') {
                              setShowAddDocInput(true);
                              setNewConsultData(prev => ({ ...prev, RequestBy: '' }));
                            } else {
                              setShowAddDocInput(false);
                              setNewConsultData(prev => ({ ...prev, RequestBy: val }));
                            }
                          }}
                          className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 font-semibold focus:outline-none text-slate-700 font-bold"
                        >
                          <option value="">-- Chọn BS --</option>
                          {staffList.map(s => {
                            const displayName = getShortStaffName(s.StaffName, staffList);
                            return (
                              <option key={s.StaffKey} value={displayName}>
                                {displayName}
                              </option>
                            );
                          })}
                          {Array.from(new Set(consults.map(c => String(c.RequestBy || '')))).filter((d: string) => d && !staffList.some(s => getShortStaffName(s.StaffName, staffList) === d)).map((d: string) => (
                            <option key={d} value={d}>{d}</option>
                          ))}
                          <option value="ADD_NEW" className="text-rose-500 font-bold">+ Thêm bác sĩ mới...</option>
                        </select>

                        {showAddDocInput && (
                          <div className="mt-1.5 flex gap-1 animate-in fade-in slide-in-from-top-1 duration-200">
                            <input
                              type="text"
                              required
                              placeholder="Nhập tên bác sĩ..."
                              value={customDocVal}
                              onChange={(e) => {
                                setCustomDocVal(e.target.value);
                                setNewConsultData(prev => ({ ...prev, RequestBy: e.target.value }));
                              }}
                              className="flex-1 bg-white border border-rose-300 rounded-xl px-3 py-1.5 text-xs font-bold focus:outline-none"
                            />
                            <button
                              type="button"
                              onClick={() => {
                                setShowAddDocInput(false);
                                setCustomDocVal('');
                                setNewConsultData(prev => ({ ...prev, RequestBy: '' }));
                              }}
                              className="text-slate-400 hover:text-[#d2145a] px-2 text-xs font-bold"
                              title="Quay lại"
                            >
                              Quay lại
                            </button>
                          </div>
                        )}
                      </div>
                    </div>

                    <div>
                      <label className="block text-slate-500 font-bold uppercase text-[10px] mb-1">Khoa nội trú</label>
                      <select
                        value={showAddDeptInput ? 'ADD_NEW' : (newConsultData.Department || '')}
                        onChange={(e) => {
                          const val = e.target.value;
                          if (val === 'ADD_NEW') {
                            setShowAddDeptInput(true);
                            setNewConsultData(prev => ({ ...prev, Department: '' }));
                          } else {
                            setShowAddDeptInput(false);
                            setNewConsultData(prev => ({ ...prev, Department: val as any }));
                          }
                        }}
                        className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 focus:outline-none text-slate-600 font-semibold"
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

                      {showAddDeptInput && (
                        <div className="mt-1.5 flex gap-1 animate-in fade-in slide-in-from-top-1 duration-200">
                          <input
                            type="text"
                            placeholder="Nhập tên khoa mới..."
                            value={customDeptVal}
                            onChange={(e) => {
                              setCustomDeptVal(e.target.value);
                              setNewConsultData(prev => ({ ...prev, Department: e.target.value }));
                            }}
                            className="flex-1 bg-white border border-rose-300 rounded-xl px-3 py-1.5 text-xs font-semibold focus:outline-none"
                          />
                          <button
                            type="button"
                            onClick={() => {
                              setShowAddDeptInput(false);
                              setCustomDeptVal('');
                              setNewConsultData(prev => ({ ...prev, Department: '' }));
                            }}
                            className="text-slate-400 hover:text-slate-600 px-2 text-xs font-bold"
                            title="Quay lại"
                          >
                            Quay lại
                          </button>
                        </div>
                      )}
                    </div>

                    <div>
                      <label className="block text-slate-500 font-bold uppercase text-[10px] mb-1">Chẩn đoán chi tiết *</label>
                      <textarea
                        rows={2}
                        required
                        placeholder="vd: Buồng thất trái giãn nhẹ, dòng chảy qua lỗ thông liên thất shunt Trái-Phải..."
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
                  <div className="border-t border-slate-150 px-6 py-3.5 bg-slate-50 flex gap-3 shrink-0 rounded-b-3xl w-full">
                    <button
                      type="button"
                      onClick={() => {
                        triggerConfirm("Bạn có chắc chắn muốn Hủy đăng ký không?", () => {
                          setShowAddConsult(false);
                        }, "Xác nhận Hủy");
                      }}
                      className="flex-1 bg-white hover:bg-slate-100 text-slate-700 font-extrabold uppercase py-2 rounded-xl transition border border-slate-200 shadow-sm cursor-pointer text-xs"
                    >
                      Hủy
                    </button>
                    <button
                      type="submit"
                      className="flex-1 bg-[#d2145a] hover:bg-pink-700 text-white font-extrabold uppercase py-2 rounded-xl transition shadow-md cursor-pointer text-xs"
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
            <div className="flex-1 min-h-0 h-full flex flex-col lg:flex-row gap-4 lg:gap-6 animate-in fade-in duration-200 w-full bg-slate-50 p-4 lg:p-6">
              
              {/* L: Waiting group and list */}
              <div className="flex-1 min-h-0 h-full flex flex-col bg-white border border-slate-200 rounded-3xl p-4 lg:p-5 shadow-sm min-w-0">
                
                <div className="shrink-0 flex flex-col sm:flex-row justify-between sm:items-center gap-3 border-b border-slate-150 pb-2.5 mb-2">
                  <div>
                    <h3 className="font-extrabold text-neutral-900 uppercase flex items-center gap-1.5">
                      <ClipboardCheck className="w-5 h-5 text-teal-600" />
                      Danh sách chờ hội chẩn
                    </h3>
                    <p className="text-[10px] text-slate-400 mt-0.5">Đăng ký + báo cáo danh sách hội chẩn thông tim - mổ tim</p>
                  </div>

                  <div className="flex items-center gap-2">
                    <div className="relative">
                      <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                      <input
                        type="text"
                        placeholder="Tìm tên, ID1 bệnh nhi..."
                        value={consultListSearch}
                        onChange={(e) => {
                          setConsultListSearch(e.target.value);
                          setConsultCurrentPage(1);
                        }}
                        className="w-[220px] pl-9 pr-8 py-2 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-pink-400 focus:border-pink-400 font-sans shadow-sm"
                      />
                      {consultListSearch && (
                        <button 
                          onClick={() => {
                            setConsultListSearch('');
                            setConsultCurrentPage(1);
                          }}
                          className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600 cursor-pointer"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                    <button
                      onClick={() => {
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
                      }}
                      className="bg-[#d2145a] hover:bg-pink-700 text-white font-extrabold px-3.5 py-2 rounded-2xl text-xs flex items-center justify-center gap-1.5 shadow-sm transition shrink-0 cursor-pointer"
                    >
                      <Plus className="w-4 h-4" /> Đăng kí staff
                    </button>
                  </div>
                </div>

                {/* Double Scrollbar: Top Scroll */}
                <div 
                  ref={topScrollRef} 
                  onScroll={handleTopScroll}
                  className="shrink-0 overflow-x-auto overflow-y-hidden select-none mb-1 scrollbar-thin" 
                  style={{ height: '8px' }}
                >
                  <div style={{ width: `${tableScrollWidth}px`, height: '1px' }}></div>
                </div>

                {/* Main flat logs table */}
                <div 
                  ref={bottomScrollRef} 
                  onScroll={handleBottomScroll}
                  className="flex-1 min-h-0 overflow-x-auto overflow-y-auto custom-scrollbar"
                >
                  <table className="w-full text-left text-xs border-collapse min-w-[850px]">
                    <thead className="sticky top-0 z-10">
                      <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 text-[10px] uppercase font-black tracking-wider font-mono">
                        <th className="py-2.5 px-3">Bệnh nhi</th>
                        <th className="py-2.5 px-3">Kiểu staff</th>
                        <th className="py-2.5 px-3">Chẩn đoán</th>
                        <th 
                          className="py-2.5 px-3 cursor-pointer hover:text-[#d2145a] select-none transition-colors duration-150"
                          onClick={() => setConsultSortOrder(prev => prev === 'asc' ? 'desc' : 'asc')}
                          title="Click để sắp xếp theo thời gian"
                        >
                          <div className="flex items-center gap-1">
                            <span>Ngày staff</span>
                            <span className="text-[12px] text-[#d2145a]">
                              {consultSortOrder === 'asc' ? '↑' : '↓'}
                            </span>
                          </div>
                        </th>
                        <th className="py-2.5 px-3">BS đăng ký</th>
                        <th className="py-2.5 px-3 text-right">Biên bản PDF / Kịch bản</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-semibold text-slate-700">
                      {filteredConsultsList.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="text-center py-8 italic text-slate-400">
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
                              className="hover:bg-pink-50/45 cursor-pointer transition duration-150 group"
                            >
                              <td className="py-3 px-3">
                                <p className="font-black text-neutral-900 leading-tight uppercase group-hover:text-[#d2145a]">{pat.PatientName}</p>
                                <p className="text-[10px] text-slate-500 font-mono">MNB: {pat.PatientID1}</p>
                              </td>
                              <td className="py-3 px-3 uppercase tracking-wide font-extrabold font-mono text-[10px] text-[#d2145a]">{item.ConsultType}</td>
                              <td className="py-3 px-3">
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
                              <td className="py-3 px-3 text-right" onClick={(e) => e.stopPropagation()}>
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
                                    className="bg-slate-100 hover:bg-[#d2145a] hover:text-white border border-slate-200 font-bold px-1.5 py-1 rounded text-[10px] transition cursor-pointer"
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

                {/* Pagination footer */}
                <div className="shrink-0 bg-slate-50 border border-slate-200 mt-4 rounded-2xl p-4 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-sm">
                  <div className="text-[11px] text-slate-500 font-semibold font-mono uppercase">
                    Tổng số: {filteredConsultsList.length} / {consults.length} đợt hội chẩn
                    {filteredConsultsList.length > 0 && (
                      <span className="text-[#d2145a] ml-1">
                        (Trang {consultCurrentPage}/{totalConsultPages} - Hiển thị {(consultCurrentPage - 1) * CONSULTS_PER_PAGE + 1} đến {Math.min(consultCurrentPage * CONSULTS_PER_PAGE, filteredConsultsList.length)})
                      </span>
                    )}
                  </div>
                  
                  {totalConsultPages > 1 && (
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => setConsultCurrentPage(1)}
                        disabled={consultCurrentPage === 1}
                        className="px-2 py-1 rounded text-[10px] uppercase font-bold bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                      >
                        Đầu
                      </button>
                      <button
                        onClick={() => setConsultCurrentPage(p => Math.max(1, p - 1))}
                        disabled={consultCurrentPage === 1}
                        className="px-2 py-1 rounded text-[10px] uppercase font-bold bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                      >
                        Trước
                      </button>
                      
                      <span className="text-xs font-semibold text-slate-700 px-2 font-mono">
                        {consultCurrentPage} / {totalConsultPages}
                      </span>
                      
                      <button
                        onClick={() => setConsultCurrentPage(p => Math.min(totalConsultPages, p + 1))}
                        disabled={consultCurrentPage === totalConsultPages}
                        className="px-2 py-1 rounded text-[10px] uppercase font-bold bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                      >
                        Sau
                      </button>
                      <button
                        onClick={() => setConsultCurrentPage(totalConsultPages)}
                        disabled={consultCurrentPage === totalConsultPages}
                        className="px-2 py-1 rounded text-[10px] uppercase font-bold bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                      >
                        Cuối
                      </button>
                    </div>
                  )}
                </div>

              </div>

              {/* R: Collapsible Dynamic filters dashboard pane, width shrunk to 2/3 and collapsable similar to the left sidebar */}
              {!isFilterExpanded ? (
                <div 
                  onClick={() => setIsFilterExpanded(true)}
                  className="bg-white hover:bg-slate-50 border border-slate-200 rounded-3xl p-3 flex flex-row lg:flex-col items-center justify-center lg:justify-start lg:pt-8 gap-2 cursor-pointer shadow-sm w-full lg:w-14 shrink-0 h-full group transition-all duration-200"
                  title="Mở rộng bộ lọc"
                >
                  <Filter className="w-5 h-5 text-[#d2145a] group-hover:scale-110 transition-transform" />
                  <ChevronLeft className="w-4 h-4 text-slate-400 hidden lg:block" />
                  <span className="text-[10px] uppercase font-extrabold tracking-wider text-slate-500 lg:[writing-mode:vertical-lr] lg:rotate-180">
                    Mở bộ lọc &amp; xuất báo cáo
                  </span>
                </div>
              ) : (
                <div className="bg-white border border-slate-200 rounded-3xl p-5 flex flex-col shadow-sm text-xs font-semibold text-slate-700 w-full lg:w-[280px] shrink-0 h-full min-h-0 animate-in slide-in-from-right-4 duration-200">
                  <div className="flex items-center justify-between border-b border-slate-150 pb-2 mb-4 shrink-0">
                    <div className="flex items-center gap-1.5">
                      <Filter className="w-4 h-4 text-[#d2145a]" />
                      <h4 className="font-extrabold uppercase text-[10px] text-neutral-900 tracking-wider">Bộ lọc &amp; Xuất báo cáo</h4>
                    </div>
                    <button
                      onClick={() => setIsFilterExpanded(false)}
                      className="p-1 text-slate-400 hover:text-[#d2145a] hover:bg-slate-100 rounded-lg transition"
                      title="Thu gọn bộ lọc"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="flex-1 min-h-0 overflow-y-auto space-y-4 pr-1 custom-scrollbar">
                    <div className="space-y-3 font-medium">
                    <div>
                      <label className="block text-slate-400 font-bold uppercase text-[9px] mb-1">Chọn Ngày staff</label>
                      <input
                        type="date"
                        value={filterDate}
                        onChange={(e) => {
                          setFilterDate(e.target.value);
                          setConsultCurrentPage(1);
                        }}
                        className="w-full bg-slate-50 border border-slate-250 rounded-xl px-3 py-2 font-bold font-mono focus:outline-none"
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
                        className="w-full bg-slate-50 border border-slate-250 rounded-xl px-3 py-2 font-bold"
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
              sources={sources}
              staffList={staffList}
              currentStaff={currentStaff}
              onSelectConsult={(c) => makeResultEdit(c)}
              onRefreshData={() => {
                fetchPatients();
                fetchConsults();
                fetchStaff();
                fetchSources();
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
              onRefreshData={() => {
                fetchPatients();
                fetchConsults();
                fetchCathlabs();
                fetchStaff();
                fetchSources();
              }}
              triggerConfirm={triggerConfirm}
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
               onRefreshData={() => {
                 fetchPatients();
                 fetchConsults();
               }}
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
              staffList={staffList}
              currentStaff={currentStaff}
              pureCalendarMode={false}
              onRefreshData={() => {
                fetchPatients();
                fetchConsults();
                fetchCathlabs();
                fetchStaff();
                fetchSources();
              }}
              onViewPatientRecord={(pat) => {
                setActiveMenu('patients');
                setSelectedPatientForDetail(pat);
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
              staffList={staffList}
              currentStaff={currentStaff}
              pureCalendarMode={true}
              onRefreshData={() => {
                fetchPatients();
                fetchConsults();
                fetchCathlabs();
                fetchStaff();
                fetchSources();
              }}
              onViewPatientRecord={(pat) => {
                setActiveMenu('patients');
                setSelectedPatientForDetail(pat);
              }}
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
              onRefreshData={() => {
                fetchPatients();
                fetchConsults();
                fetchCmrs();
                fetchSources();
              }}
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
              onRefreshData={() => {
                fetchPatients();
                fetchConsults();
                fetchCmrs();
                fetchSources();
              }}
              onEditPatientAdmin={handleEditPatientAdmin}
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
              onRefreshData={() => {
                fetchPatients();
                fetchConsults();
                fetchCmrs();
                fetchSources();
              }}
              onEditPatientAdmin={handleEditPatientAdmin}
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

          {/* EXCEL EXPORT PANEL */}
          {activeMenu === 'excel-export' && (
            <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm max-w-xl mx-auto space-y-6 text-xs animate-in fade-in duration-200">
              
              <div className="text-center">
                <div className="bg-emerald-50 text-emerald-600 inline-flex p-3 rounded-2xl mb-2">
                  <Download className="w-6 h-6" />
                </div>
                <h2 className="text-base font-extrabold text-[#d2145a] uppercase">Báo cáo &amp; Kết xuất Dữ liệu Hội chẩn</h2>
                <p className="text-slate-400 mt-0.5">Lập Bảng Excel lưu trữ, liên hệ gia đình NB hoặc nộp lưu trữ khoa mạch.</p>
              </div>

              <div className="bg-slate-50 border border-slate-150 rounded-2xl p-4 space-y-3">
                <span className="font-extrabold text-[#d2145a] block uppercase text-[10px] tracking-wider">Cơ cấu bộ lọc Slice</span>
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
              onRefreshData={fetchStaff}
              onRefreshRolePresets={fetchRolePresets}
              triggerAlert={triggerAlert}
              triggerConfirm={triggerConfirm}
            />
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
              onRefreshData={() => {
                fetchPatients();
                fetchConsults();
                fetchStaff();
                fetchCathlabs();
                fetchOperations();
                fetchCmrs();
                fetchSources();
              }}
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
              setPendingConsultsCount(consults.filter(c => c.PatientKey === pat.PatientKey && !c.ConsultResultID).length);
              setActiveMenu('consult-form');
            }}
          />
        )}
      </AnimatePresence>

      {/* Slide-over Outcome Decision Input Drawer (TRẦN MINH PHÚC style, Screenshot 9) */}
      <AnimatePresence>
        {editingConsultKey && (
          <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-40 flex items-center justify-center p-4 animate-in fade-in duration-200">
            <div 
              className="absolute inset-0" 
              onClick={() => {
                setEditingConsultKey(null);
                setIsDrawerEditing(false);
              }}
            ></div>
            <div className="relative bg-white w-full max-w-6xl rounded-3xl shadow-2xl flex flex-col z-50 animate-in zoom-in-95 duration-200 overflow-hidden max-h-[96vh]">
              
              <div className="bg-[#d2145a] text-white px-6 py-4 flex items-center justify-between shadow-sm shrink-0">
                <h3 className="font-extrabold text-sm uppercase tracking-wider flex items-center gap-1.5 font-sans">
                  <Stethoscope className="w-5 h-5 text-white" /> Điền kết quả staff
                </h3>
                <button 
                  onClick={() => {
                    setEditingConsultKey(null);
                    setIsDrawerEditing(false);
                  }}
                  className="text-white hover:bg-white/10 p-1.5 rounded-full transition-colors font-bold text-lg leading-none"
                >
                  ✕
                </button>
              </div>

              {/* Output Form Frame */}
              <form 
                onSubmit={submitResultUpdate} 
                className="flex-1 overflow-y-auto p-6 text-xs text-slate-700 leading-relaxed font-sans"
              >
                
                {(() => {
                  const edc = consults.find(c => c.ConsultKey === editingConsultKey);
                  const edp = edc ? getPatientByKey(edc.PatientKey) : null;
                  if (!edp || !edc) return null;

                  const conclusionOptions = [
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

                  return (
                    <div className="space-y-6">
                      
                      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch animate-in fade-in duration-300">
                        
                        {/* Khung 1: Bệnh nhi đang hội chẩn (Hành chính) */}
                        <div className="lg:col-span-3 flex flex-col">
                          <div className="bg-slate-50 border border-slate-200 rounded-3xl p-4.5 space-y-3 relative shadow-sm h-full flex flex-col justify-between">
                            <div>
                              <div className="flex items-center border-b border-slate-100 pb-2">
                                <span className="text-[9px] uppercase tracking-wide font-mono font-bold text-slate-400">Bệnh nhi đang hội chẩn</span>
                              </div>
                              
                              <h4 className="text-sm font-black text-[#d2145a] uppercase leading-tight mt-3">{edp.PatientName}</h4>
                              {edp.OtherPatientName && (
                                <p className="text-[10px] text-slate-400 font-medium italic mt-1">Tên khác: {edp.OtherPatientName}</p>
                              )}
                              
                              <div className="grid grid-cols-1 gap-y-1.5 text-[11px] text-slate-600 font-medium pt-3 border-t border-slate-100 mt-3">
                                <p><span className="text-slate-400">Mã BN 1:</span> <span className="font-bold text-slate-800 font-mono">{edp.PatientID1 || ''}</span></p>
                                {edp.PatientID2 && <p><span className="text-slate-400">Mã BN 2:</span> <span className="font-bold text-slate-800 font-mono">{edp.PatientID2}</span></p>}
                                <p><span className="text-slate-400">Ngày sinh:</span> <span className="font-bold text-slate-800 font-mono">{formatVNTime(edp.PatientDOB)}</span></p>
                                <p><span className="text-slate-400">Tuổi:</span> <span className="font-bold text-rose-600 font-mono">{getExcelAgeHelper(edp.PatientDOB)}</span></p>
                                <p><span className="text-slate-400">Giới tính:</span> <span className="font-bold text-slate-800">{edp.PatientSex}</span></p>
                                {edp.PatientAddress && <p className="col-span-1"><span className="text-slate-400">Địa chỉ:</span> <span className="font-bold text-slate-800 leading-tight">{edp.PatientAddress}</span></p>}
                                {edp.PatientPhone1 && <p><span className="text-slate-400">Số ĐT 1:</span> <span className="font-bold text-slate-800 font-mono">{edp.PatientPhone1}</span></p>}
                                {edp.PatientPhone2 && <p><span className="text-slate-400">Số ĐT 2:</span> <span className="font-bold text-slate-800 font-mono">{edp.PatientPhone2}</span></p>}
                              </div>
                            </div>

                            <div className="space-y-4">
                               <div className="grid grid-cols-2 gap-2 mt-4 pt-4 border-t border-slate-100">
                                  {!isDrawerEditing ? (
                                    <>
                                      {resultUpdateData.PatientHeight && <p className="text-[11px]"><span className="text-slate-400 block mb-0.5">Chiều cao:</span> <span className="font-bold text-slate-800 font-mono">{resultUpdateData.PatientHeight} cm</span></p>}
                                      {resultUpdateData.PatientWeight && <p className="text-[11px]"><span className="text-slate-400 block mb-0.5">Cân nặng:</span> <span className="font-bold text-slate-800 font-mono">{resultUpdateData.PatientWeight} kg</span></p>}
                                    </>
                                  ) : (
                                    <>
                                      <div>
                                        <label className="block text-slate-500 font-bold text-[10px] mb-1">Chiều cao (cm)</label>
                                        <input
                                          type="text"
                                          placeholder="vd: 110"
                                          value={resultUpdateData.PatientHeight}
                                          onChange={(e) => setResultUpdateData(prev => ({ ...prev, PatientHeight: e.target.value }))}
                                          className="w-full bg-white border border-slate-200 rounded-xl px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-teal-500 text-xs font-medium"
                                        />
                                      </div>
                                      <div>
                                        <label className="block text-slate-500 font-bold text-[10px] mb-1">Cân nặng (kg)</label>
                                        <input
                                          type="text"
                                          placeholder="vd: 12"
                                          value={resultUpdateData.PatientWeight}
                                          onChange={(e) => setResultUpdateData(prev => ({ ...prev, PatientWeight: e.target.value }))}
                                          className="w-full bg-white border border-slate-200 rounded-xl px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-teal-500 text-xs font-medium"
                                        />
                                      </div>
                                    </>
                                  )}
                               </div>

                              <button
                                type="button"
                                onClick={() => {
                                  setEditingConsultKey(null);
                                  setEditingPatientKey(edp.PatientKey);
                                  setNewPatientData({
                                    PatientID1: edp.PatientID1,
                                    PatientID2: edp.PatientID2 || '',
                                    PatientName: edp.PatientName,
                                    OtherPatientName: edp.OtherPatientName || '',
                                    PatientDOB: edp.PatientDOB,
                                    PatientSex: edp.PatientSex,
                                    PatientAddress: edp.PatientAddress || (edp as any).PatientAddress || '',
                                    PatientPhone1: edp.PatientPhone1,
                                    PatientPhone2: edp.PatientPhone2 || '',
                                    Outcome: edp.Outcome || ''
                                  });
                                  setShowAddPatient(true);
                                }}
                                className="w-full bg-[#d2145a] hover:bg-pink-700 text-white font-extrabold uppercase text-[10px] px-3 py-2.5 rounded-xl transition-transform hover:scale-[1.02] shrink-0 shadow-sm"
                              >
                                ✏ Sửa hành chính
                              </button>
                            </div>
                          </div>
                        </div>

                        {/* Khung 2: Thông tin hội chẩn */}
                        <div className="lg:col-span-3 flex flex-col">
                          <div className="bg-slate-50 border border-slate-200 rounded-3xl p-4.5 space-y-3 shadow-sm h-full flex flex-col justify-start">
                            <span className="text-[9px] uppercase tracking-wide font-mono font-bold text-teal-600 block border-b border-slate-100 pb-2 shrink-0">Thông tin hội chẩn</span>
                            
                            {!isDrawerEditing ? (
                              <div className="grid grid-cols-1 gap-y-1.5 text-[11px] text-slate-600 font-medium pt-1">
                                <p><span className="text-slate-400">Ngày hội chẩn:</span> <span className="font-bold text-slate-800 font-mono">{formatVNTime(resultUpdateData.ConsultDate)}</span></p>
                                <p><span className="text-slate-400">Kiểu staff:</span> <span className="font-bold text-[#d2145a]">{resultUpdateData.ConsultType || ''}</span></p>
                                <p><span className="text-slate-400">BS đăng ký:</span> <span className="font-bold text-slate-800">{resultUpdateData.RequestBy || ''}</span></p>
                                {resultUpdateData.ConsultMember && (Array.isArray(resultUpdateData.ConsultMember) ? resultUpdateData.ConsultMember : [String(resultUpdateData.ConsultMember)]).length > 0 && (
                                  <p>
                                    <span className="text-slate-400">Thành viên duyệt HC:</span>{' '}
                                    <span className="font-bold text-slate-800">
                                      {(Array.isArray(resultUpdateData.ConsultMember) 
                                        ? resultUpdateData.ConsultMember 
                                        : String(resultUpdateData.ConsultMember).split(',').map(s => s.trim()).filter(Boolean)
                                      ).join(', ')}
                                    </span>
                                  </p>
                                )}
                              </div>
                            ) : (
                              <div className="space-y-3 pt-1 flex-1">
                                <div>
                                  <label className="block text-slate-500 font-bold text-[10px] mb-1">Ngày hội chẩn</label>
                                  <VNDateInput
                                    required
                                    value={resultUpdateData.ConsultDate}
                                    onChange={(val) => setResultUpdateData(prev => ({ ...prev, ConsultDate: val }))}
                                    className="w-full bg-white border border-slate-200 rounded-xl px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-teal-500 text-xs font-medium font-sans"
                                  />
                                </div>
                                <div>
                                  <label className="block text-slate-500 font-bold text-[10px] mb-1">Kiểu staff</label>
                                  <div className="grid grid-cols-2 gap-2">
                                    {(['Staff thông', 'Staff mổ'] as ConsultTypeEnum[]).map(type => (
                                      <button
                                        key={type}
                                        type="button"
                                        onClick={() => setResultUpdateData(prev => ({ ...prev, ConsultType: type }))}
                                        className={`rounded-xl px-2.5 py-1.5 text-xs font-extrabold border transition ${
                                          resultUpdateData.ConsultType === type
                                            ? 'bg-[#d2145a] text-white border-[#d2145a] shadow-sm'
                                            : 'bg-white text-slate-600 border-slate-200 hover:border-[#d2145a]/40'
                                        }`}
                                      >
                                        {type}
                                      </button>
                                    ))}
                                  </div>
                                </div>
                                
                                <div>
                                  <label className="block text-slate-500 font-bold text-[10px] mb-1">BS đăng ký</label>
                                  <select
                                    required
                                    value={resultUpdateData.RequestBy || ''}
                                    onChange={(e) => setResultUpdateData(prev => ({ ...prev, RequestBy: e.target.value }))}
                                    className="w-full bg-white border border-slate-200 rounded-xl px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-teal-500 text-xs font-semibold"
                                  >
                                    <option value="">-- Chọn BS --</option>
                                    {staffList.map(s => {
                                      const displayName = getShortStaffName(s.StaffName, staffList);
                                      return (
                                        <option key={s.StaffKey} value={displayName}>
                                          {displayName}
                                        </option>
                                      );
                                    })}
                                    {Array.from(new Set(consults.map(c => String(c.RequestBy || '')))).filter((d: string) => d && !staffList.some(s => getShortStaffName(s.StaffName, staffList) === d)).map((d: string) => (
                                      <option key={d} value={d}>{d}</option>
                                    ))}
                                  </select>
                                </div>

                                <div className="pb-2">
                                  <label className="block text-slate-500 font-bold text-[10px] mb-1">Thành viên duyệt hội chẩn <span className="text-red-500">*</span></label>
                                  <SearchableEnumSelect
                                    multiple
                                    required
                                    options={[
                                      ...staffList.map(s => getShortStaffName(s.StaffName, staffList)),
                                      ...Array.from(new Set(consults.flatMap(c => Array.isArray(c.ConsultMember) ? c.ConsultMember : String(c.ConsultMember || '').split(',').map(s => s.trim()).filter(Boolean))))
                                    ]}
                                    values={resultUpdateData.ConsultMember || []}
                                    onMultiChange={(members) => setResultUpdateData(prev => ({ ...prev, ConsultMember: members }))}
                                    placeholder="-- Bấm hoặc tìm để chọn bác sĩ --"
                                    searchPlaceholder="Gõ tìm bác sĩ..."
                                  />
                                </div>

                              </div>
                            )}
                          </div>
                        </div>

                        {/* Khung 3: Kết quả hội chẩn */}
                        <div className="lg:col-span-6 flex flex-col">
                          <div className="bg-indigo-50/20 border border-slate-200 rounded-3xl p-4.5 space-y-3 shadow-sm h-full">
                            <span className="text-[9px] uppercase tracking-wide font-mono font-bold text-indigo-600 block border-b border-slate-100 pb-2">Kết quả hội chẩn</span>
                            
                            {!isDrawerEditing ? (
                              <div className="space-y-3 text-[11px] text-slate-600 font-medium pt-1">
                                <div className="grid grid-cols-2 gap-3.5">
                                  <p><span className="text-slate-400">ICD:</span> {resultUpdateData.DiagnosisID ? <span className="font-bold text-red-600 bg-red-50 border border-red-200 px-1.5 py-0.5 rounded font-mono ml-1">{resultUpdateData.DiagnosisID}</span> : ''}</p>
                                  <p><span className="text-slate-400">Kết luận chính:</span> {resultUpdateData.ConsultResultID ? <span className="font-extrabold text-[#d2145a] ml-1">{resultUpdateData.ConsultResultID}</span> : ''}</p>
                                </div>

                                <p>
                                  <span className="text-slate-400">Ưu tiên:</span>{' '}
                                  <span className="font-extrabold text-indigo-800 ml-1">{resultUpdateData.PriorityOrder || 'Chương trình'}</span>
                                </p>
                                
                                <div>
                                  <span className="text-slate-400 block mb-0.5">Chẩn đoán chi tiết:</span>
                                  {resultUpdateData.DetailDiagnosis ? (
                                    <p className="bg-white border border-slate-100 p-2.5 rounded-xl text-slate-700 italic font-semibold leading-normal">{resultUpdateData.DetailDiagnosis}</p>
                                  ) : ''}
                                </div>

                                <div>
                                  <span className="text-slate-400 block mb-0.5">Kết luận hội chẩn chi tiết:</span>
                                  {resultUpdateData.DetailConsultResult ? (
                                    <p className="bg-white border border-slate-100 p-2.5 rounded-xl text-slate-700 font-semibold whitespace-pre-wrap leading-normal">{resultUpdateData.DetailConsultResult}</p>
                                  ) : ''}
                                </div>

                                <div>
                                  <span className="text-slate-400 block mb-0.5">Dụng cụ dự kiến:</span>
                                  {resultUpdateData.PlannedDevice ? (
                                    <p className="bg-white border border-slate-100 p-2.5 rounded-xl text-slate-700 font-semibold leading-normal">{resultUpdateData.PlannedDevice}</p>
                                  ) : ''}
                                </div>

                                <div>
                                  <p><span className="text-slate-400">Số tiền dự kiến:</span> {resultUpdateData.PlannedPrice ? <span className="font-bold text-emerald-700 font-mono ml-1">{resultUpdateData.PlannedPrice}</span> : ''}</p>
                                </div>
                              </div>
                            ) : (
                              <div className="space-y-3.5 pt-1">
                                <div className="grid grid-cols-2 gap-3.5">
                                  <div>
                                    <label className="block text-slate-500 font-bold text-[10px] mb-1">ICD <span className="text-red-500">*</span></label>
                                    <SearchableEnumSelect
                                      required
                                      options={diagnosisOptions}
                                      value={resultUpdateData.DiagnosisID}
                                      onChange={(value) => setResultUpdateData(prev => ({ ...prev, DiagnosisID: value }))}
                                      allowCreate
                                      createLabel={(value) => `Thêm DiagnosisID "${value}" vào Source`}
                                      onCreateOption={createDiagnosisSource}
                                      placeholder="-- Chọn ICD --"
                                      searchPlaceholder="Gõ ICD để tìm..."
                                    />
                                  </div>
                                  <div>
                                    <label className="block text-slate-500 font-bold text-[10px] mb-1 font-sans">Kết luận chính <span className="text-red-500">*</span></label>
                                    <SearchableEnumSelect
                                      required
                                      options={conclusionOptions}
                                      value={resultUpdateData.ConsultResultID}
                                      onChange={(value) => setResultUpdateData(prev => ({ ...prev, ConsultResultID: value as any }))}
                                      placeholder="-- Chọn Kết luận chính --"
                                      searchPlaceholder="Gõ tìm kết luận..."
                                    />
                                  </div>
                                </div>

                                <div>
                                  <label className="block text-slate-500 font-bold text-[10px] mb-1">Ưu tiên</label>
                                  <div className="flex gap-2">
                                    {PRIORITY_OPTIONS.map((opt) => {
                                      const isSel = resultUpdateData.PriorityOrder === opt;
                                      return (
                                        <button
                                          key={opt}
                                          type="button"
                                          onClick={() => setResultUpdateData(prev => ({ ...prev, PriorityOrder: opt }))}
                                          className={`flex-1 py-1.5 px-2 rounded-xl border text-[11px] font-bold transition text-center cursor-pointer ${
                                            isSel
                                              ? 'bg-indigo-600 border-indigo-600 text-white shadow-sm font-extrabold ring-1 ring-indigo-400'
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
                                  <label className="block text-slate-500 font-bold text-[10px] mb-1">Chẩn đoán chi tiết</label>
                                  <textarea
                                    rows={2}
                                    value={resultUpdateData.DetailDiagnosis}
                                    onChange={(e) => setResultUpdateData(prev => ({ ...prev, DetailDiagnosis: e.target.value }))}
                                    className="w-full bg-white border border-slate-200 rounded-xl px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-500 text-xs italic font-semibold leading-relaxed"
                                  />
                                </div>

                                <div>
                                  <label className="block text-slate-500 font-bold text-[10px] mb-1">Kết luận hội chẩn chi tiết</label>
                                  <textarea
                                    rows={2}
                                    required
                                    placeholder="vd: Thống nhất chỉ định mổ tim hở..."
                                    value={resultUpdateData.DetailConsultResult}
                                    onChange={(e) => setResultUpdateData(prev => ({ ...prev, DetailConsultResult: e.target.value }))}
                                    className="w-full bg-white border border-slate-200 rounded-xl px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-500 text-xs font-bold leading-relaxed"
                                  />
                                </div>

                                <div>
                                  <label className="block text-slate-500 font-bold text-[10px] mb-1">Dụng cụ dự kiến</label>
                                  <textarea
                                    rows={2}
                                    placeholder="vd: Vá thông liên thất..."
                                    value={resultUpdateData.PlannedDevice}
                                    onChange={(e) => setResultUpdateData(prev => ({ ...prev, PlannedDevice: e.target.value }))}
                                    className="w-full bg-white border border-slate-200 rounded-xl px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-500 text-xs font-semibold leading-relaxed"
                                  />
                                </div>

                                <div>
                                  <label className="block text-slate-500 font-bold text-[10px] mb-1">Số tiền dự kiến (VND / text)</label>
                                  <input
                                    type="text"
                                    placeholder="vd: 45.000.000đ"
                                    value={resultUpdateData.PlannedPrice}
                                    onChange={(e) => setResultUpdateData(prev => ({ ...prev, PlannedPrice: e.target.value }))}
                                    className="w-full bg-white border border-slate-200 rounded-xl px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-500 text-xs font-bold font-mono"
                                  />
                                </div>
                                <div className="grid grid-cols-2 gap-2 mt-4 pt-4 border-t border-indigo-100">
                                  <div>
                                    <label className="block text-slate-400 font-bold text-[9px] mb-1 uppercase">Người điền KQ</label>
                                    <input
                                      type="text"
                                      disabled
                                      value={(() => {
                                        const editorId = currentStaff?.StaffKey;
                                        return staffList.find(s => s.StaffKey === editorId)?.StaffName || editorId || '01378';
                                      })()}
                                      className="w-full bg-slate-50 text-slate-400 border border-slate-200 rounded-lg px-2 py-1 text-[10px] font-bold"
                                    />
                                  </div>
                                  <div>
                                    <label className="block text-slate-400 font-bold text-[9px] mb-1 uppercase cursor-default" title="ConsultResultUpdatedTime">Điền lúc</label>
                                    <input
                                      type="text"
                                      disabled
                                      value={formatDateTime(new Date().toISOString())}
                                      className="w-full bg-slate-50 text-slate-400 border border-slate-200 rounded-lg px-2 py-1 text-[10px] font-mono cursor-default"
                                    />
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>

                      </div>

                      {/* Action buttons area */}
                      <div className="pt-2 border-t border-slate-100 flex justify-end gap-3 shrink-0">
                        {!isDrawerEditing ? (
                          <div className="w-full flex justify-end">
                            <button
                              type="button"
                              onClick={() => setIsDrawerEditing(true)}
                              className="bg-[#d2145a] hover:bg-pink-700 text-white font-extrabold uppercase py-3 px-6 rounded-2xl shadow-md transition-transform hover:scale-[1.02] cursor-pointer text-xs flex items-center justify-center gap-1.5 font-sans"
                            >
                              <ClipboardList className="w-4 h-4" />
                              {edc.ConsultResultID ? "Sửa kết quả hội chẩn" : "Điền kết quả hội chẩn"}
                            </button>
                          </div>
                        ) : (
                          <div className="w-full grid grid-cols-2 lg:flex lg:justify-end gap-3">
                            <button
                              type="button"
                              onClick={() => {
                                setResultUpdateData({
                                  ConsultResultID: edc.ConsultResultID || '' as ConsultResultEnum,
                                  DetailConsultResult: edc.DetailConsultResult || '',
                                  PlannedDevice: edc.PlannedDevice || '',
                                  PlannedPrice: edc.PlannedPrice || '',
                                  CheckDevice: edc.CheckDevice || '',
                                  PatientWeight: edc.PatientWeight || '',
                                  PatientHeight: edc.PatientHeight || '',
                                  ConsultType: edc.ConsultType || 'Staff mổ',
                                  ConsultDate: edc.ConsultDate || '',
                                  RequestBy: edc.RequestBy || '',
                                  DiagnosisID: edc.DiagnosisID || '',
                                  DetailDiagnosis: edc.DetailDiagnosis || '',
                                  ConsultMember: edc.ConsultMember || [],
                                  PriorityOrder: normalizePriorityOrder(edc.PriorityOrder),
                                });
                                setIsDrawerEditing(false);
                              }}
                              className="bg-slate-200 hover:bg-slate-300 text-slate-700 font-extrabold uppercase py-3 px-6 rounded-2xl transition cursor-pointer text-xs font-sans text-center lg:w-48"
                            >
                              Hủy chỉnh sửa
                            </button>
                            <button
                              type="submit"
                              className="bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold uppercase py-3 px-6 rounded-2xl shadow-md transition cursor-pointer text-xs font-sans text-center font-bold lg:w-48"
                            >
                              ✓ Lưu kết quả
                            </button>
                          </div>
                        )}
                      </div>

                    </div>
                  );
                })()}

              </form>
            </div>
          </div>
        )}
      </AnimatePresence>

      {/* Centered Registration Edit Modal Dialog (Sửa Đăng ký staff) */}
      <AnimatePresence>
        {editingRegConsultKey && (
          <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-40 flex items-center justify-center p-4 animate-in fade-in duration-200">
            <div className="absolute inset-0" onClick={() => setEditingRegConsultKey(null)}></div>
            <div className="relative bg-white w-full max-w-4xl rounded-3xl shadow-2xl flex flex-col z-50 animate-in zoom-in-95 duration-200 overflow-hidden">
              
              <div className="bg-[#d2145a] text-white px-6 py-4 flex items-center justify-between shadow-sm shrink-0">
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
              <form onSubmit={submitConsultRegistrationUpdate} className="flex flex-col text-xs text-slate-700 leading-relaxed font-semibold">
                
                {(() => {
                  const edc = consults.find(c => c.ConsultKey === editingRegConsultKey);
                  const edp = edc ? getPatientByKey(edc.PatientKey) : null;
                  if (!edp || !edc) return null;

                  return (
                    <div className="flex flex-col">
                      
                      {/* Grid Body */}
                      <div className="grid grid-cols-1 md:grid-cols-12 gap-5 p-6">
                        
                        {/* Left Column: Administrative block */}
                        <div className="md:col-span-5 bg-slate-50 border border-slate-200 rounded-2xl p-4.5 space-y-3 shadow-sm self-start">
                          <div className="flex items-center justify-between border-b border-slate-150 pb-2">
                            <span className="text-[9px] uppercase tracking-wider font-mono font-black text-rose-500">THÔNG TIN HÀNH CHÍNH</span>
                            
                            {/* Sửa hành chính button */}
                            <button
                              type="button"
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
                              className="bg-white hover:bg-slate-100 text-[#d2145a] border border-rose-200 text-[10px] px-2.5 py-1 rounded-xl font-bold uppercase transition shadow-xs cursor-pointer inline-flex items-center gap-1"
                            >
                              ✏️ Sửa
                            </button>
                          </div>

                          <div className="grid grid-cols-2 gap-x-3 gap-y-2.5 text-[11px] text-slate-500 font-bold">
                            <div className="col-span-2">
                              <span className="text-slate-400 font-medium block text-[9px] uppercase">Họ và tên:</span>
                              <span className="text-neutral-950 font-black uppercase text-xs">{edp.PatientName}</span>
                            </div>
                            <div>
                              <span className="text-slate-400 font-medium block text-[9px] uppercase">Ngày sinh:</span>
                              <span className="text-slate-800 font-bold font-mono">{formatVNTime(edp.PatientDOB)}</span>
                            </div>
                            <div>
                              <span className="text-slate-400 font-medium block text-[9px] uppercase">Giới tính:</span>
                              <span className="text-slate-800 font-bold">{edp.PatientSex}</span>
                            </div>
                            <div className="col-span-2">
                              <span className="text-slate-400 font-medium block text-[9px] uppercase">Mã người bệnh:</span>
                              <span className="text-slate-850 font-extrabold font-mono text-[10px] bg-slate-200/50 border border-slate-300 rounded px-1.5 py-0.5 w-max block mt-0.5">{edp.PatientID1} {edp.PatientID2 ? `| ${edp.PatientID2}` : ''}</span>
                            </div>
                            <div className="col-span-2 border-t border-slate-150 pt-2">
                              <span className="text-slate-400 font-medium block text-[9px] uppercase">Địa chỉ:</span>
                              <span className="text-slate-700 font-semibold">{edp.PatientAddress || (edp as any).PatientAddress || '—'}</span>
                            </div>
                            <div>
                              <span className="text-slate-400 font-medium block text-[9px] uppercase">Số ĐT 1:</span>
                              <span className="text-slate-850 font-mono font-bold text-slate-850">{edp.PatientPhone1 || '—'}</span>
                            </div>
                            <div>
                              <span className="text-slate-400 font-medium block text-[9px] uppercase">Số ĐT 2:</span>
                              <span className="text-slate-850 font-mono font-bold text-slate-850">{edp.PatientPhone2 || '—'}</span>
                            </div>
                          </div>
                        </div>

                        {/* Right Column: Interactive form fields */}
                        <div className="md:col-span-7 space-y-4">
                          
                          {/* Chẩn đoán Chi tiết (DetailDiagnosis) */}
                          <div>
                            <label className="block text-slate-500 font-black uppercase text-[10px] mb-1">Chẩn đoán Chi tiết *</label>
                            <textarea
                              rows={2}
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
                                        ? 'bg-[#d2145a] text-white border-[#d2145a] shadow-sm'
                                        : 'bg-white text-slate-600 border-slate-200 hover:border-[#d2145a]/40'
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
                                className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 font-bold font-mono focus:ring-1 focus:ring-pink-500 focus:outline-none"
                              />
                            </div>
                          </div>

                          {/* RequestBy and Department Section */}
                          <div className="grid grid-cols-2 gap-3">
                            
                            {/* RequestBy Select */}
                            <div>
                              <label className="block text-slate-500 font-bold uppercase text-[10px] mb-1">Người đăng ký *</label>
                              <select
                                required={!showEditAddDocInput}
                                value={showEditAddDocInput ? 'ADD_NEW' : (editConsultData.RequestBy || '')}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  if (val === 'ADD_NEW') {
                                    setShowEditAddDocInput(true);
                                    setEditConsultData(prev => ({ ...prev, RequestBy: '' }));
                                  } else {
                                    setShowEditAddDocInput(false);
                                    setEditConsultData(prev => ({ ...prev, RequestBy: val }));
                                  }
                                }}
                                className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 font-semibold focus:outline-none text-[#d2145a] font-bold"
                              >
                                <option value="">-- Chọn BS --</option>
                                {staffList.map(s => {
                                  const displayName = getShortStaffName(s.StaffName, staffList);
                                  return (
                                    <option key={s.StaffKey} value={displayName}>
                                      {displayName}
                                    </option>
                                  );
                                })}
                                {Array.from(new Set(consults.map(c => String(c.RequestBy || '')))).filter((d: string) => d && !staffList.some(s => getShortStaffName(s.StaffName, staffList) === d)).map((d: string) => (
                                  <option key={d} value={d}>{d}</option>
                                ))}
                                <option value="ADD_NEW" className="text-rose-500 font-bold">+ Thêm bác sĩ mới...</option>
                              </select>

                              {showEditAddDocInput && (
                                <div className="mt-1.5 flex gap-1 animate-in fade-in slide-in-from-top-1 duration-200">
                                  <input
                                    type="text"
                                    required
                                    placeholder="Nhập tên bác sĩ..."
                                    value={customEditDocVal}
                                    onChange={(e) => {
                                      setCustomEditDocVal(e.target.value);
                                      setEditConsultData(prev => ({ ...prev, RequestBy: e.target.value }));
                                    }}
                                    className="flex-1 bg-white border border-rose-300 rounded-xl px-3 py-1.5 text-xs font-bold focus:outline-none"
                                  />
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setShowEditAddDocInput(false);
                                      setCustomEditDocVal('');
                                      setEditConsultData(prev => ({ ...prev, RequestBy: '' }));
                                    }}
                                    className="text-slate-400 hover:text-[#d2145a] px-2 text-xs font-bold"
                                    title="Quay lại"
                                  >
                                    Quay lại
                                  </button>
                                </div>
                              )}
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
                                className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 focus:outline-none text-[#d2145a] font-bold"
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

                      {/* Sticky Fixed Footer */}
                      <div className="border-t border-slate-150 p-4 bg-slate-50 flex gap-3 justify-end shrink-0 w-full">
                        <button
                          type="button"
                          onClick={() => setEditingRegConsultKey(null)}
                          className="px-6 py-2.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-extrabold uppercase rounded-xl transition cursor-pointer text-xs"
                        >
                          Hủy bỏ
                        </button>
                        <button
                          type="submit"
                          className="px-10 py-2.5 bg-[#d2145a] hover:bg-[#b0104b] text-white font-extrabold uppercase rounded-xl shadow-md transition cursor-pointer text-xs"
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
            <div className="bg-white rounded-3xl max-w-lg w-full max-h-[90vh] overflow-y-auto shadow-2xl border border-slate-150 p-6 space-y-5 text-xs text-slate-700 font-semibold leading-relaxed">
              
              <div className="flex items-center justify-between border-b border-slate-150 pb-2.5 text-[#d2145a]">
                <h3 className="font-extrabold text-sm uppercase flex items-center gap-1.5 font-sans">
                  <Heart className="w-5 h-5 animate-pulse" /> {editingPatientKey ? "SỬA HỒ SƠ HÀNH CHÍNH" : "Đăng ký hồ sơ mới"}
                </h3>
                <button 
                  type="button"
                  onClick={() => {
                    triggerConfirm("Bạn có chắc chắn muốn Hủy thao tác này không?", () => {
                      setShowAddPatient(false);
                      setEditingPatientKey(null);
                    }, "Xác nhận Hủy");
                  }}
                  className="text-slate-400 hover:text-slate-600 transition cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleAddPatientSubmit} className="space-y-4 font-medium text-slate-700">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[#d2145a] font-extrabold uppercase text-[10px] mb-1">Mã người bệnh *</label>
                    <input
                      type="text"
                      required
                      placeholder="vd: BN014902"
                      value={newPatientData.PatientID1}
                      onChange={(e) => setNewPatientData(prev => ({ ...prev, PatientID1: e.target.value }))}
                      className="w-full bg-slate-50 border border-slate-255 rounded-xl px-3 py-2 font-mono font-bold"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-500 font-bold uppercase text-[10px] mb-1">Mã người bệnh khác</label>
                    <input
                      type="text"
                      placeholder="vd: MHN-850"
                      value={newPatientData.PatientID2}
                      onChange={(e) => setNewPatientData(prev => ({ ...prev, PatientID2: e.target.value }))}
                      className="w-full bg-slate-50 border border-slate-255 rounded-xl px-3 py-2 font-mono"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
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
                      placeholder="vd: BÉ AN"
                      value={newPatientData.OtherPatientName}
                      onChange={(e) => setNewPatientData(prev => ({ ...prev, OtherPatientName: e.target.value }))}
                      className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-500 font-bold uppercase text-[10px] mb-1">Ngày sinh *</label>
                    <VNDateInput
                      required
                      value={newPatientData.PatientDOB}
                      onChange={(val) => setNewPatientData(prev => ({ ...prev, PatientDOB: val }))}
                      className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 font-bold font-mono focus:outline-none"
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

                <div className="grid grid-cols-2 gap-3">
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
                    options={SOURCE_PROVINCE}
                    value={newPatientData.PatientAddress}
                    onChange={(value) => setNewPatientData(prev => ({ ...prev, PatientAddress: value }))}
                    placeholder="-- Chọn tỉnh/thành --"
                    searchPlaceholder="Gõ tỉnh/thành để tìm..."
                  />
                </div>

                {/* Patient Creator Admin Details (Grayed Out ReadOnly Column inputs) */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-400 font-bold uppercase text-[10px] mb-1">Người tạo mới</label>
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
                    <label className="block text-slate-400 font-bold uppercase text-[10px] mb-1 font-sans">Thời gian tạo mới</label>
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
                      }, "Xác nhận Hủy");
                    }}
                    className="w-full bg-slate-100 hover:bg-slate-200 text-slate-700 font-extrabold uppercase py-3 rounded-2xl transition border border-slate-200 shadow-sm cursor-pointer"
                  >
                    Hủy
                  </button>
                  <button
                    type="submit"
                    className="w-full bg-[#d2145a] hover:bg-pink-700 text-white font-extrabold uppercase py-3 rounded-2xl transition shadow-md cursor-pointer"
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
      {selectedConsultForPDF && selectedPatientForPDF && (
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
              className="bg-white rounded-3xl max-w-sm w-full p-6 shadow-2xl border border-slate-150 text-center space-y-4 font-sans"
            >
              <div className="mx-auto bg-amber-50 text-amber-600 rounded-full w-12 h-12 flex items-center justify-center">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <h3 className="text-sm font-black text-slate-800 uppercase tracking-tight">
                {customAlert.title || 'Thông báo'}
              </h3>
              <p className="text-xs text-slate-505 font-semibold leading-relaxed">
                {customAlert.message}
              </p>
              <button
                type="button"
                onClick={() => setCustomAlert(null)}
                className="w-full bg-[#d2145a] hover:bg-pink-700 text-white font-extrabold uppercase py-2.5 rounded-2xl transition shadow-md cursor-pointer text-xs"
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
              className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-150 space-y-4 font-sans"
            >
              <div className="flex items-center gap-3 border-b border-slate-100 pb-2.5">
                <div className="bg-pink-50 text-[#d2145a] rounded-full w-10 h-10 flex items-center justify-center shrink-0">
                  <ClipboardCheck className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-xs font-black text-slate-800 uppercase tracking-tight">
                    {customConfirm.title || 'Xác nhận yêu cầu'}
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
                    customConfirm.onConfirm();
                    setCustomConfirm(null);
                  }}
                  className="w-full bg-[#d2145a] hover:bg-pink-700 text-white font-extrabold uppercase py-2.5 rounded-2xl transition shadow-md cursor-pointer text-xs"
                >
                  Xác nhận
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Footer bar */}
      <footer className="bg-slate-900 border-t border-slate-800 text-slate-400 text-[10px] py-1.5 shrink-0 text-center font-medium font-sans">
        <span>© 2026 CHD Management v5.0 | Bệnh viện Tim Tim Mạch &amp; Khoa Phẫu Thuật Tim Nhi (Google Sheets &amp; PDF Sync)</span>
      </footer>

    </div>
  );
}
