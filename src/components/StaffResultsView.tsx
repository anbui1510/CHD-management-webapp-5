import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Patient, Consult, CathLab, Source, DeviceTemplate, formatVNTime, Staff, removeDiacritics, findPatientByKey, normalizePatientKey, PriorityOrderEnum, PRIORITY_OPTIONS, restoreWeightFromDate } from '../types';
import { ClipboardList, Stethoscope, Clock, CheckCircle, Scissors, Search, X, Plus, AlertTriangle, CheckCircle2, ArrowUpDown, Trash2, CheckSquare, Square } from 'lucide-react';
import { SearchableEnumSelect } from './SearchableEnumSelect';
import { getSourceDiagnosisOptions, normalizeDiagnosisID, getSourceConsultResultOptions } from '../data/source';
import { PlannedDeviceSuggestBox } from './PlannedDeviceSuggestBox';
import { MobileAutoExpandTextarea } from './MobileAutoExpandTextarea';
import { VNDateInput } from './VNDateInput';
import { useIsMobile } from '../hooks/useMediaQuery';
import ResultStaffDrawer from './ResultStaffDrawer';
import { SortColumnIcon } from './SortColumnIcon';
import { useSheetsSyncFeedback } from '../context/SheetsSyncFeedbackContext';
import { buildSyncContext, withSyncContext } from '../utils/sheetsSyncMutation';
import {
  findDuplicatePatientById1,
  PATIENT_VALIDATION_MSG,
} from '../utils/patientFormValidation';
import { MODAL_TITLE } from '../utils/modalTitles';
import { useViewSubheader } from '../hooks/useViewSubheader';
import { getViewSubheaderTitle } from '../config/viewSubheaderTitles';

const DEFAULT_CONCLUSION_OPTIONS = [
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

const ADDRESS_OPTIONS = [
  "TP Hà Nội", "Tuyên Quang", "Cao Bằng", "Lai Châu", "Lào Cai", "Thái Nguyên", "Điện Biên", "Lạng Sơn", "Sơn La", "Phú Thọ", "Bắc Ninh", "Quảng Ninh", "TP Hải Phòng", "Hưng Yên", "Ninh Bình", "Thanh Hoá", "Nghệ An", "Hà Tĩnh", "Quảng Trị", "TP Huế", "TP Đà Nẵng", "Quảng Ngãi", "Gia Lai", "Đắk Lắk", "Khánh Hoà", "Lâm Đồng", "Đồng Nai", "Tây Ninh", "TP Hồ Chí Minh", "Đồng Tháp", "An Giang", "Vĩnh Long", "TP Cần Thơ", "Cà Mau"
];

const normalizeRefKey = (value: unknown) => String(value ?? '').trim().toLowerCase();

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
    return sFirstName === firstName && s.StaffName !== fullName;
  });
  
  if (hasFirstNameDuplicate && middleName) {
    return `BS. ${middleName} ${firstName}`;
  }
  
  return `BS. ${firstName}`;
};

interface StaffResultsViewProps {
  patients: Patient[];
  consults: Consult[];
  cathlabs?: CathLab[];
  sources?: Source[];
  deviceTemplates?: DeviceTemplate[];
  staffList?: Staff[];
  currentStaff?: Staff | null;
  onRefreshData?: () => void;
  onAddPatient?: (patient: Patient) => void;
  onPatchPatient?: (patientKey: string, patch: Partial<Patient>) => void;
  onAddConsult?: (consult: Consult) => void;
  onRemoveConsult?: (consultKey: string) => void;
  onRemoveConsults?: (consultKeys: string[]) => void;
  onPatchConsult: (consultKey: string, patch: Partial<Consult>) => void;
  onEditPatientAdmin: (patient: Patient) => void;
  createDiagnosisSource: (DiagnosisID: string) => Promise<void>;
  triggerAlert: (message: string, title?: string) => void;
  onSaveSuccess?: (message: string) => void;
}

export default function StaffResultsView({ patients, consults, cathlabs = [], sources = [], deviceTemplates = [], staffList = [], currentStaff, onRefreshData, onAddPatient, onPatchPatient, onAddConsult, onRemoveConsult, onRemoveConsults, onPatchConsult, onEditPatientAdmin, createDiagnosisSource, triggerAlert, onSaveSuccess }: StaffResultsViewProps) {
  const { reportMutationResponse } = useSheetsSyncFeedback();
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

  const ITEMS_PER_PAGE = 100;
  const isMobile = useIsMobile();
  const [selectedConsultKey, setSelectedConsultKey] = useState<string | null>(null);
  const [mobileDrawerKey, setMobileDrawerKey] = useState<string | null>(null);

  const doctorOptions = useMemo(() => {
    const fromStaff = staffList.map(s => getShortStaffName(s.StaffName, staffList));
    const extra = Array.from(new Set(consults.map(c => String(c.RequestBy || ''))))
      .filter(d => d && !fromStaff.some(x => x.toLowerCase() === d.toLowerCase()));
    return [...fromStaff, ...extra];
  }, [staffList, consults]);

  const departmentOptions = useMemo(() => {
    const extra = Array.from(new Set(consults.map(c => String(c.Department || ''))))
      .filter(d => d && !DEFAULT_DEPARTMENTS.includes(d));
    return [...DEFAULT_DEPARTMENTS, ...extra];
  }, [consults]);

  const handleOpenConsult = useCallback((c: Consult) => {
    if (isMobile) {
      setMobileDrawerKey(c.ConsultKey);
    } else {
      setSelectedConsultKey(c.ConsultKey);
    }
  }, [isMobile]);

  useEffect(() => {
    if (isMobile) {
      setSelectedConsultKey(null);
    } else {
      setMobileDrawerKey(null);
    }
  }, [isMobile]);

  const patientMap = useMemo(() => {
    const map = new Map<string, Patient>();
    patients.forEach(p => {
      if (!p.PatientKey) return;
      const keyStr = normalizePatientKey(p.PatientKey);
      map.set(keyStr, p);
      const pid1 = String(p.PatientID1 || '').trim().toLowerCase();
      if (pid1) {
        map.set(pid1, p);
      }
    });
    return map;
  }, [patients]);

  const getPatientByKey = useCallback((patientKey: any): Patient | undefined => {
    if (!patientKey) return undefined;
    const keyStr = normalizePatientKey(patientKey);
    // Prioritize direct match by PatientKey to prevent collisions with PatientID1 mapping
    const directMatch = patients.find(p => p && normalizePatientKey(p.PatientKey) === keyStr);
    if (directMatch) return directMatch;
    return patientMap.get(keyStr);
  }, [patients, patientMap]);

  // New Staff Registration combined states
  const [showCombinedForm, setShowCombinedForm] = useState<boolean>(false);
  const [submitLoading, setSubmitLoading] = useState<boolean>(false);
  const [successMsg, setSuccessMsg] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string>('');
  const diagnosisOptions = useMemo(
    () => getSourceDiagnosisOptions(sources),
    [sources]
  );
  const conclusionOptions = useMemo(
    () => getSourceConsultResultOptions(sources),
    [sources]
  );

  // 1. Patient Mode (select existing vs create new)
  const [patientMode, setPatientMode] = useState<'select' | 'create'>('select');
  const [searchPatQuery, setSearchPatQuery] = useState<string>('');
  const [selectedPatKey, setSelectedPatKey] = useState<string>('');

  // 2. New Patient fields (Create mode)
  const [newPatID1, setNewPatID1] = useState<string>('');
  const [newPatID2, setNewPatID2] = useState<string>('');
  const [newPatName, setNewPatName] = useState<string>('');
  const [newPatDOB, setNewPatDOB] = useState<string>('');
  const [newPatSex, setNewPatSex] = useState<'Nam' | 'Nữ'>('Nam');
  const [newPatAddress, setNewPatAddress] = useState<string>('TP Hà Nội');
  const [newPatPhone, setNewPatPhone] = useState<string>('');

  // 3. Consult Registration fields
  const [consultType, setConsultType] = useState<'Staff mổ' | 'Staff thông'>('Staff mổ');
  const [consultDate, setConsultDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [patWeight, setPatWeight] = useState<string>('');
  const [patHeight, setPatHeight] = useState<string>('');
  const [requestBy, setRequestBy] = useState<string>('');
  const [showAddDocInput, setShowAddDocInput] = useState<boolean>(false);
  const [customDocVal, setCustomDocVal] = useState<string>('');

  const [department, setDepartment] = useState<string>('Tim Mạch');
  const [showAddDeptInput, setShowAddDeptInput] = useState<boolean>(false);
  const [customDeptVal, setCustomDeptVal] = useState<string>('');

  const [diagnosisID, setDiagnosisID] = useState<string>('');
  const [detailDiagnosis, setDetailDiagnosis] = useState<string>('');
  
  const [consultMembers, setConsultMembers] = useState<string>('');
  const [scheduled1st, setScheduled1st] = useState<string>('');
  
  // 4. Clinical Result outcome fields
  const [consultResultID, setConsultResultID] = useState<string>('');
  const [detailConsultResult, setDetailConsultResult] = useState<string>('');
  const [plannedDevice, setPlannedDevice] = useState<string>('');
  const [plannedPrice, setPlannedPrice] = useState<string>('');
  const [checkDevice, setCheckDevice] = useState<'Đủ' | 'Thiếu' | 'Thừa'>('Đủ');
  const [priorityOrder, setPriorityOrder] = useState<PriorityOrderEnum>('Chương trình');

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
    if (patientMode !== 'select' || !selectedPatKey) {
      setDetailDiagnosis('');
      return;
    }
    setDetailDiagnosis(getLatestPriorDetailDiagnosis(selectedPatKey, consultDate));
  }, [patientMode, selectedPatKey]);

  const resetForm = () => {
    setPatientMode('select');
    setSearchPatQuery('');
    setSelectedPatKey('');
    setNewPatID1('');
    setNewPatID2('');
    setNewPatName('');
    setNewPatDOB('');
    setNewPatSex('Nam');
    setNewPatAddress('TP Hà Nội');
    setNewPatPhone('');
    setConsultType('Staff mổ');
    setConsultDate(new Date().toISOString().split('T')[0]);
    setPatWeight('');
    setPatHeight('');
    setRequestBy('');
    setShowAddDocInput(false);
    setCustomDocVal('');
    setDepartment('Tim Mạch');
    setShowAddDeptInput(false);
    setCustomDeptVal('');
    setConsultMembers('');
    setScheduled1st('');
    setDiagnosisID('');
    setDetailDiagnosis('');
    setConsultResultID('');
    setDetailConsultResult('');
    setPlannedDevice('');
    setPlannedPrice('');
    setCheckDevice('Đủ');
    setPriorityOrder('Chương trình');
    setSuccessMsg('');
    setErrorMsg('');
  };

  const handleCombinedSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitLoading(true);
    setErrorMsg('');
    setSuccessMsg('');

    try {
      let finalPatientKey = selectedPatKey;

      if (!diagnosisID) {
        setSubmitLoading(false);
        setErrorMsg('Vui lòng chọn ICD!');
        return;
      }

      if (!consultResultID) {
        setSubmitLoading(false);
        setErrorMsg('Vui lòng chọn Kết luận chính!');
        return;
      }

      // Calculate automatic outcome
      let automaticOutcome: any = '';
      if (consultResultID === 'Can thiệp thông tim') {
        automaticOutcome = 'Đã thông';
      } else if (consultResultID === 'Phẫu thuật tim hở' || consultResultID === 'Mổ tim') {
        automaticOutcome = 'Đã mổ';
      }

      // 1. If create mode, create the patient first
      if (patientMode === 'create') {
        if (!newPatID1.trim() || !newPatName.trim()) {
          setSubmitLoading(false);
          setErrorMsg(PATIENT_VALIDATION_MSG.missingIdAndName);
          return;
        }

        // Check for duplicate PatientID1
        const dup = findDuplicatePatientById1(patients, newPatID1);
        if (dup) {
          setSubmitLoading(false);
          setErrorMsg(PATIENT_VALIDATION_MSG.duplicateIdSuggestSelect(dup.PatientName));
          return;
        }

        finalPatientKey = `pat_${Date.now()}`;
        const patientPayload: Patient = {
          PatientKey: finalPatientKey,
          PatientID1: String(newPatID1 || '').trim(),
          PatientID2: String(newPatID2 || '').trim(),
          PatientName: newPatName,
          OtherPatientName: '',
          PatientDOB: newPatDOB || '2020-01-01',
          PatientSex: newPatSex,
          PatientAddress: newPatAddress || 'TP Hà Nội',
          PatientPhone1: newPatPhone || '',
          PatientPhone2: '',
          PatientCreateBy: currentStaff?.StaffKey || '01378',
          PatientCreateTime: new Date().toISOString(),
          Outcome: automaticOutcome
        };
        onAddPatient?.(patientPayload);
      } else {
        // Select mode: selected patient must be chose
        if (!finalPatientKey) {
          setSubmitLoading(false);
          setErrorMsg(PATIENT_VALIDATION_MSG.selectExistingOrCreate);
          return;
        }

        if (automaticOutcome) {
          onPatchPatient?.(finalPatientKey, { Outcome: automaticOutcome });
        }
      }

      // 2. Add the consult
      const chosenDept = department;
      const chosenDoc = requestBy;

      // For "Staff thông": auto-fill Scheduled1stInterventionist & Scheduled2ndInterventionist
      const isCathStaff = consultType === 'Staff thông';
      if (isCathStaff && !scheduled1st) {
        setSubmitLoading(false);
        setErrorMsg('Vui lòng chọn PTV chính (Hội chẩn PTV chính)!');
        return;
      }

      const consultPayload: Consult = {
        ConsultKey: `con_${Date.now()}`,
        PatientKey: finalPatientKey,
        ConsultType: consultType,
        PatientWeight: patWeight,
        PatientHeight: patHeight || '',
        ConsultDate: consultDate,
        RequestBy: chosenDoc || 'BS Hội đồng',
        ConsultMember: isCathStaff ? '' : consultMembers,
        DiagnosisID: diagnosisID,
        DetailDiagnosis: detailDiagnosis,
        Department: chosenDept || 'Tim Mạch',
        ConsultCreateBy: currentStaff?.StaffKey || '01378',
        ConsultCreateTime: new Date().toISOString(),
        ConsultResultID: consultResultID,
        DetailConsultResult: detailConsultResult,
        ConsultNote: '',
        PlannedDevice: plannedDevice,
        PlannedPrice: plannedPrice,
        PriorityOrder: priorityOrder,
        RiskFactor: '3 - Không HF, HF độ I-II / có chỉ định mổ',
        CheckDevice: checkDevice,
        ConsultResultUpdatedBy: currentStaff?.StaffKey || '01378',
        ConsultResultUpdatedTime: new Date().toISOString(),
        PDFTrigger: false,
        ...(isCathStaff && {
          Scheduled1stInterventionist: scheduled1st,
          Scheduled2ndInterventionist: chosenDoc || '',
        }),
      };

      onAddConsult?.(consultPayload);
      setSuccessMsg('Đã đăng ký và nhập thành công kết quả staff bổ sung!');
      setShowCombinedForm(false);
      resetForm();
      setSubmitLoading(false);

      const persist = async () => {
        const syncContext = buildSyncContext('results-staff', {
          patientName: newPatName || patients.find(p => p.PatientKey === finalPatientKey)?.PatientName,
          patientKey: finalPatientKey
        });
        if (patientMode === 'create') {
          const patRes = await fetch('/api/patients', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(withSyncContext({
              PatientKey: finalPatientKey,
              PatientID1: String(newPatID1 || '').trim(),
              PatientID2: String(newPatID2 || '').trim(),
              PatientName: newPatName,
              OtherPatientName: '',
              PatientDOB: newPatDOB || '2020-01-01',
              PatientSex: newPatSex,
              PatientAddress: newPatAddress || 'TP Hà Nội',
              PatientPhone1: newPatPhone || '',
              PatientPhone2: '',
              PatientCreateBy: currentStaff?.StaffKey || '01378',
              PatientCreateTime: new Date().toISOString(),
              Outcome: automaticOutcome
            }, syncContext))
          });
          if (!patRes.ok) throw new Error('Không thể đăng ký bệnh nhi mới');
          reportMutationResponse(await patRes.json(), { baseMessage: 'Đã đăng ký bệnh nhi mới' });
        } else if (automaticOutcome) {
          const patRes = await fetch(`/api/patients/${finalPatientKey}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(withSyncContext({ Outcome: automaticOutcome }, syncContext))
          });
          if (!patRes.ok) throw new Error('Không thể cập nhật trạng thái bệnh nhi');
          reportMutationResponse(await patRes.json(), { baseMessage: 'Đã cập nhật trạng thái bệnh nhi' });
        }
        const conRes = await fetch('/api/consults', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(withSyncContext(consultPayload, syncContext))
        });
        if (!conRes.ok) throw new Error('Không thể đăng ký kết quả hội chẩn');
        reportMutationResponse(await conRes.json(), { baseMessage: 'Đã đăng ký kết quả staff bổ sung' });
        onRefreshData?.();
      };

      persist().catch((err: any) => {
        setErrorMsg(`Đã xảy ra lỗi: ${err.message || err}`);
        onRefreshData?.();
      });

    } catch (err: any) {
      setErrorMsg(`Đã xảy ra lỗi: ${err.message || err}`);
    } finally {
      setSubmitLoading(false);
    }
  };

  // Combined state variables for filter and pagination
  const [staffType, setStaffType] = useState<'cath' | 'surg'>('cath');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [statusTab, setStatusTab] = useState<'all' | 'pending' | 'completed'>('all');
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [sortField, setSortField] = useState<'name' | 'id' | 'dob' | 'diagnosis' | 'date'>('date');
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc');
  const [confirmDeleteKeys, setConfirmDeleteKeys] = useState<string[] | null>(null);
  const [selectedDeleteKeys, setSelectedDeleteKeys] = useState<Set<string>>(() => new Set());
  const [deletingKeys, setDeletingKeys] = useState<Set<string>>(() => new Set());

  const toggleSelectDeleteKey = useCallback((consultKey: string) => {
    setSelectedDeleteKeys(prev => {
      const next = new Set(prev);
      if (next.has(consultKey)) next.delete(consultKey);
      else next.add(consultKey);
      return next;
    });
  }, []);

  const executeDeleteConsults = useCallback(async (keys: string[]) => {
    const uniqueKeys = Array.from(new Set(keys.filter(Boolean)));
    if (uniqueKeys.length === 0) return;

    onRemoveConsults?.(uniqueKeys);
    if (!onRemoveConsults) {
      uniqueKeys.forEach(key => onRemoveConsult?.(key));
    }
    setSelectedDeleteKeys(prev => {
      const next = new Set(prev);
      uniqueKeys.forEach(key => next.delete(key));
      return next;
    });
    setConfirmDeleteKeys(null);
    setDeletingKeys(prev => new Set([...prev, ...uniqueKeys]));

    const results = await Promise.allSettled(
      uniqueKeys.map(async (key) => {
        const consult = consults.find(c => c.ConsultKey === key);
        const patient = consult ? findPatientByKey(patients, consult.PatientKey) : undefined;
        const res = await fetch(`/api/consults/${encodeURIComponent(key)}`, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(withSyncContext({}, buildSyncContext('results-staff', {
            patientName: patient?.PatientName,
            patientKey: consult?.PatientKey
          })))
        });
        if (!res.ok) {
          const errText = await res.text();
          throw new Error(errText || `HTTP ${res.status}`);
        }
        reportMutationResponse(await res.json(), { baseMessage: 'Đã xóa đăng ký staff' });
      })
    );

    setDeletingKeys(prev => {
      const next = new Set(prev);
      uniqueKeys.forEach(key => next.delete(key));
      return next;
    });

    const failedCount = results.filter(r => r.status === 'rejected').length;
    if (failedCount > 0) {
      onRefreshData?.();
      triggerAlert(`Không xoá được ${failedCount}/${uniqueKeys.length} ca. Đã tải lại danh sách.`, MODAL_TITLE.warning);
    }
  }, [consults, onRemoveConsult, onRemoveConsults, onRefreshData, patients, reportMutationResponse, triggerAlert]);

  useEffect(() => {
    setSelectedDeleteKeys(new Set());
    setSelectedConsultKey(null);
  }, [staffType, statusTab, currentPage]);

  // Deduplicate consults client-side to ensure each ConsultKey has only 1 row on the UI
  // and prevent React rendering key collision issues.
  const uniqueConsults = useMemo(() => {
    if (!Array.isArray(consults)) return [];
    const seen = new Set<string>();
    return consults.filter(c => {
      if (!c.ConsultKey) return true;
      const k = String(c.ConsultKey).trim().toLowerCase();
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  }, [consults]);

  // Categorize based on ConsultType
  const cathConsults = useMemo(() => uniqueConsults.filter(c => c.ConsultType === 'Staff thông'), [uniqueConsults]);
  const surgConsults = useMemo(() => uniqueConsults.filter(c => c.ConsultType === 'Staff mổ'), [uniqueConsults]);

  const isPendingResult = (resultId: any) => {
    if (!resultId) return true;
    const s = String(resultId).trim().toLowerCase();
    return s === '' || s === 'nodata' || s === 'no data' || s === '—' || s === '-';
  };

  const cathConsultKeys = useMemo(
    () => new Set(cathlabs.map(cath => normalizeRefKey(cath.ConsultKey)).filter(Boolean)),
    [cathlabs]
  );

  const isPendingStaffResult = useCallback((consult: Consult) => {
    if (!isPendingResult(consult.ConsultResultID)) return false;
    const consultKey = normalizeRefKey(consult.ConsultKey);
    return !consultKey || !cathConsultKeys.has(consultKey);
  }, [cathConsultKeys]);

  // Counters
  const cathStats = useMemo(() => ({
    all: cathConsults.length,
    pending: cathConsults.filter(isPendingStaffResult).length,
    completed: cathConsults.filter(c => !isPendingStaffResult(c)).length
  }), [cathConsults, isPendingStaffResult]);

  const surgStats = useMemo(() => ({
    all: surgConsults.length,
    pending: surgConsults.filter(isPendingStaffResult).length,
    completed: surgConsults.filter(c => !isPendingStaffResult(c)).length
  }), [surgConsults, isPendingStaffResult]);

  // Filter lists with pagination support
  const activeConsults = useMemo(() => {
    return staffType === 'cath' ? cathConsults : surgConsults;
  }, [staffType, cathConsults, surgConsults]);

  const filteredConsultsAll = useMemo(() => {
    return activeConsults.filter(c => {
      // 1. Tab filtering
      if (statusTab === 'pending' && !isPendingStaffResult(c)) return false;
      if (statusTab === 'completed' && isPendingStaffResult(c)) return false;

      // 2. Search query filtering
      if (searchTerm.trim() !== '') {
        const q = removeDiacritics(searchTerm).toLowerCase().trim();
        const pat = getPatientByKey(c.PatientKey);
        const nameMatch = pat?.PatientName ? removeDiacritics(String(pat.PatientName)).toLowerCase().includes(q) : false;
        const id1Match = pat?.PatientID1 ? removeDiacritics(String(pat.PatientID1)).toLowerCase().includes(q) : false;
        const id2Match = pat?.PatientID2 ? removeDiacritics(String(pat.PatientID2)).toLowerCase().includes(q) : false;
        const diagMatch = c.DiagnosisID ? removeDiacritics(String(c.DiagnosisID)).toLowerCase().includes(q) : false;
        return nameMatch || id1Match || id2Match || diagMatch;
      }

      return true;
    }).sort((a, b) => {
      let comparison = 0;
      if (sortField === 'date') {
        const da = a.ConsultDate ? new Date(a.ConsultDate).getTime() : 0;
        const db = b.ConsultDate ? new Date(b.ConsultDate).getTime() : 0;
        comparison = da - db;
      } else if (sortField === 'name') {
        const patA = getPatientByKey(a.PatientKey);
        const patB = getPatientByKey(b.PatientKey);
        const nameA = patA?.PatientName ? removeDiacritics(patA.PatientName).toLowerCase() : '';
        const nameB = patB?.PatientName ? removeDiacritics(patB.PatientName).toLowerCase() : '';
        comparison = nameA.localeCompare(nameB);
      } else if (sortField === 'id') {
        const patA = getPatientByKey(a.PatientKey);
        const patB = getPatientByKey(b.PatientKey);
        const idA = patA?.PatientID1 ? patA.PatientID1.toLowerCase() : '';
        const idB = patB?.PatientID1 ? patB.PatientID1.toLowerCase() : '';
        comparison = idA.localeCompare(idB);
      } else if (sortField === 'dob') {
        const patA = getPatientByKey(a.PatientKey);
        const patB = getPatientByKey(b.PatientKey);
        const dobA = patA?.PatientDOB ? new Date(patA.PatientDOB).getTime() : 0;
        const dobB = patB?.PatientDOB ? new Date(patB.PatientDOB).getTime() : 0;
        comparison = dobA - dobB;
      } else if (sortField === 'diagnosis') {
        const diagA = a.DiagnosisID ? removeDiacritics(a.DiagnosisID).toLowerCase() : '';
        const diagB = b.DiagnosisID ? removeDiacritics(b.DiagnosisID).toLowerCase() : '';
        comparison = diagA.localeCompare(diagB);
      }
      return sortOrder === 'asc' ? comparison : -comparison;
    });
  }, [activeConsults, statusTab, searchTerm, sortField, sortOrder, getPatientByKey, isPendingStaffResult]);

  const totalPages = Math.max(1, Math.ceil(filteredConsultsAll.length / ITEMS_PER_PAGE));
  const displayedConsults = useMemo(() => {
    return filteredConsultsAll.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);
  }, [filteredConsultsAll, currentPage]);

  const handleSubheaderSearch = useCallback((value: string) => {
    setSearchTerm(value);
    setCurrentPage(1);
  }, []);

  const subheaderActions = useMemo(
    () => (
      <>
        <button
          type="button"
          onClick={() => setSortOrder(prev => (prev === 'desc' ? 'asc' : 'desc'))}
          className="bg-white border border-slate-200 text-slate-600 p-2 rounded-xl flex items-center justify-center hover:bg-slate-50 transition-colors shadow-sm cursor-pointer"
          title="Sắp xếp theo thời gian"
        >
          <ArrowUpDown className={`w-4 h-4 transition-transform duration-300 ${sortOrder === 'asc' ? 'rotate-180' : ''}`} />
        </button>
        <button
          type="button"
          onClick={() => {
            resetForm();
            setShowCombinedForm(true);
          }}
          className="bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold px-3 py-1.5 rounded-xl text-[11px] flex items-center justify-center gap-1.5 shadow-sm transition cursor-pointer uppercase tracking-wider"
        >
          <Plus className="w-3.5 h-3.5 text-white" /> Staff bổ sung
        </button>
      </>
    ),
    [sortOrder]
  );

  useViewSubheader({
    title: getViewSubheaderTitle('results-staff'),
    icon: <ClipboardList className="w-4 h-4" />,
    searchValue: searchTerm,
    onSearchChange: handleSubheaderSearch,
    actions: subheaderActions,
  });

  const renderList = (filtered: Consult[]) => {
    if (filtered.length === 0) {
      return (
        <div className="py-12 text-center italic text-xs text-slate-400 bg-slate-50/50 rounded-2xl border border-dashed border-slate-200">
          Không có ca nào trong trạng thái đã chọn.
        </div>
      );
    }

    const pageKeys = filtered.map(c => c.ConsultKey).filter(Boolean);
    const allPageSelected = pageKeys.length > 0 && pageKeys.every(key => selectedDeleteKeys.has(key));
    const somePageSelected = pageKeys.some(key => selectedDeleteKeys.has(key));

    const renderSortableHeader = (field: 'name' | 'id' | 'dob' | 'diagnosis' | 'date', label: string, freezeName = false) => {
      const isSorted = sortField === field;
      return (
        <th 
          scope="col" 
          onClick={() => {
            if (isSorted) {
              setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
            } else {
              setSortField(field);
              setSortOrder('asc');
            }
          }}
          className={`px-4 py-3 bg-slate-50 border-b border-slate-200 cursor-pointer select-none hover:bg-slate-100 transition duration-150 text-slate-500 font-extrabold uppercase text-[10px] tracking-wider sticky top-0 z-20 ${
            freezeName ? 'sticky left-10 z-30 min-w-[160px] border-r border-slate-200 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.08)]' : ''
          }`}
        >
          <div className="flex items-center gap-1.5 justify-start">
            <span>{label}</span>
            <SortColumnIcon active={isSorted} order={sortOrder} />
          </div>
        </th>
      );
    };

    return (
      <div className="w-full rounded-2xl shadow-xs bg-white">
        <table className="min-w-full border-separate border-spacing-0 table-auto text-left font-sans text-xs">
          <thead className="bg-slate-50 text-slate-500 font-extrabold uppercase text-[10px] tracking-wider">
            <tr>
              <th scope="col" className="px-2 py-3 bg-slate-50 border-b border-slate-200 text-center w-10 sticky left-0 top-0 z-40 border-r border-slate-200">
                <button
                  type="button"
                  onClick={() => {
                    setSelectedDeleteKeys(prev => {
                      const next = new Set(prev);
                      if (allPageSelected) {
                        pageKeys.forEach(key => next.delete(key));
                      } else {
                        pageKeys.forEach(key => next.add(key));
                      }
                      return next;
                    });
                  }}
                  className="p-1 rounded-md hover:bg-slate-100 text-slate-500 hover:text-[#d2145a] cursor-pointer"
                  title={allPageSelected ? 'Bỏ chọn trang này' : 'Chọn tất cả trang này'}
                >
                  {allPageSelected ? <CheckSquare className="w-4 h-4" /> : somePageSelected ? <CheckSquare className="w-4 h-4 opacity-50" /> : <Square className="w-4 h-4" />}
                </button>
              </th>
              {renderSortableHeader('name', 'Họ và tên', true)}
              {renderSortableHeader('id', 'Mã bệnh nhi')}
              {renderSortableHeader('dob', 'Ngày sinh / GT')}
              {renderSortableHeader('diagnosis', 'Chẩn đoán')}
              {renderSortableHeader('date', 'Ngày staff')}
              <th scope="col" className="px-4 py-3 bg-slate-50 border-b border-slate-200 text-center text-slate-500 font-extrabold uppercase text-[10px] tracking-wider sticky top-0 z-20">Hành động</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white">
            {filtered.map((c) => {
              const pat = getPatientByKey(c.PatientKey);
              if (!pat) return null;

              return (
                <tr 
                  key={c.ConsultKey}
                  className={`hover:bg-slate-50/80 transition duration-150 group ${
                    selectedDeleteKeys.has(c.ConsultKey) ? 'bg-rose-50/40' : ''
                  } ${selectedConsultKey === c.ConsultKey ? 'bg-indigo-50/80 ring-1 ring-inset ring-indigo-200' : ''} ${deletingKeys.has(c.ConsultKey) ? 'opacity-50' : ''}`}
                >
                  <td className={`px-2 py-3 text-center whitespace-nowrap sticky left-0 z-10 border-r border-slate-200 group-hover:bg-slate-50/80 ${
                    selectedConsultKey === c.ConsultKey ? 'bg-indigo-50/80' : selectedDeleteKeys.has(c.ConsultKey) ? 'bg-rose-50/40' : 'bg-white'
                  }`}>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleSelectDeleteKey(c.ConsultKey);
                      }}
                      className="p-1 rounded-md hover:bg-slate-100 text-slate-500 hover:text-[#d2145a] cursor-pointer"
                      title={selectedDeleteKeys.has(c.ConsultKey) ? 'Bỏ chọn' : 'Chọn để xoá'}
                    >
                      {selectedDeleteKeys.has(c.ConsultKey)
                        ? <CheckSquare className="w-4 h-4 text-[#d2145a]" />
                        : <Square className="w-4 h-4" />}
                    </button>
                  </td>
                  <td 
                    onClick={() => handleOpenConsult(c)}
                    className={`px-4 py-3 font-extrabold text-[#d2145a] uppercase hover:underline cursor-pointer min-w-[160px] sticky left-10 z-10 border-r border-slate-200 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.08)] group-hover:bg-slate-50/80 ${
                      selectedConsultKey === c.ConsultKey ? 'bg-indigo-50/80' : selectedDeleteKeys.has(c.ConsultKey) ? 'bg-rose-50/40' : 'bg-white'
                    }`}
                  >
                    {pat.PatientName}
                  </td>
                  <td 
                    onClick={() => handleOpenConsult(c)}
                    className="px-4 py-3 text-slate-700 font-mono font-bold cursor-pointer whitespace-nowrap"
                  >
                    {pat.PatientID1}
                    {pat.PatientID2 && <span className="text-[9px] text-slate-450 font-semibold block font-sans">Mã phụ: {pat.PatientID2}</span>}
                  </td>
                  <td 
                    onClick={() => handleOpenConsult(c)}
                    className="px-4 py-3 text-slate-600 font-medium cursor-pointer whitespace-nowrap"
                  >
                    <span className="font-mono">{formatVNTime(pat.PatientDOB)}</span>
                    <span className="ml-2 px-1.5 py-0.5 rounded-md text-[9px] font-bold bg-slate-100 text-slate-600 border border-slate-200">
                      {pat.PatientSex}
                    </span>
                  </td>
                  <td 
                    onClick={() => handleOpenConsult(c)}
                    className="px-4 py-3 cursor-pointer"
                  >
                    <span className="font-bold text-red-650 bg-red-50 border border-red-200 px-2 py-0.5 rounded text-[10px] font-mono">
                      {c.DiagnosisID || '—'}
                    </span>
                  </td>
                  <td 
                    onClick={() => handleOpenConsult(c)}
                    className="px-4 py-3 text-slate-600 font-semibold font-mono cursor-pointer"
                  >
                    {formatVNTime(c.ConsultDate)}
                  </td>
                  <td className="px-4 py-3 text-center whitespace-nowrap min-w-[120px]">
                    <div className="flex items-center justify-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => handleOpenConsult(c)}
                        className="lg:hidden px-2 py-1 text-[10px] font-bold text-indigo-650 hover:text-indigo-850 bg-indigo-50 hover:bg-indigo-100 border border-indigo-150 rounded-lg shadow-xs transition cursor-pointer"
                      >
                        Chi tiết
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setConfirmDeleteKeys([c.ConsultKey]);
                        }}
                        className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 border border-transparent hover:border-rose-200 rounded-lg transition cursor-pointer"
                        title="Xoá ca hội chẩn"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  };

  return (
    <div className="flex-1 h-full flex flex-col gap-3 md:gap-4 animate-in fade-in duration-200 font-sans min-h-0 p-2 md:p-4 lg:p-6 bg-slate-50 overflow-hidden">
      
      {/* Header Area — mobile only; desktop dùng subheader toàn app */}
      <div className="md:hidden shrink-0 flex flex-col gap-3 bg-white p-4 border border-slate-200 rounded-3xl shadow-sm">
        <div className="flex items-center gap-2 shrink-0">
          <ClipboardList className="w-5 h-5 text-[#d2145a] animate-pulse" />
          <h2 className="text-base font-extrabold text-neutral-[#d2145a] tracking-tight uppercase">
            Nhập kết quả staff
          </h2>
        </div>

        {/* Search box in the center */}
        <div className="flex-1 w-full relative">
          <span className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
            <Search className="h-4 w-4 text-slate-400" />
          </span>
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setCurrentPage(1);
            }}
            placeholder="Tìm tên, mã NB, chẩn đoán..."
            className="w-full pl-9 pr-8 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-pink-400 focus:border-pink-400 font-sans shadow-sm"
          />
          {searchTerm && (
            <button
              type="button"
              onClick={() => {
                setSearchTerm('');
                setCurrentPage(1);
              }}
              className="absolute inset-y-0 right-0 flex items-center pr-2.5 text-slate-400 hover:text-slate-600 cursor-pointer"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Action buttons (Sort and Add) — mobile */}
        <div className="flex items-center justify-end gap-2 w-full shrink-0">
          <button
            type="button"
            onClick={() => setSortOrder(prev => prev === 'desc' ? 'asc' : 'desc')}
            className="bg-white border border-slate-200 text-slate-600 p-2.5 rounded-xl flex items-center justify-center hover:bg-slate-50 transition-colors shadow-sm cursor-pointer"
            title="Sắp xếp theo thời gian"
          >
            <ArrowUpDown className={`w-4 h-4 transition-transform duration-300 ${sortOrder === 'asc' ? 'rotate-180' : ''}`} />
          </button>

          <button
            type="button"
            onClick={() => {
              resetForm();
              setShowCombinedForm(true);
            }}
            className="bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold px-4 py-2.5 rounded-2xl text-xs flex items-center justify-center gap-1.5 shadow-md hover:shadow-lg transition duration-200 cursor-pointer uppercase tracking-wider w-full text-center"
          >
            <Plus className="w-4 h-4 text-white" /> Staff bổ sung
          </button>
        </div>
      </div>

      {/* Main workspace: split list + detail panel on desktop */}
      <div className="flex-1 min-h-0 flex flex-col lg:flex-row gap-4 overflow-hidden">
        <div className={`flex flex-col min-h-0 bg-white border border-slate-200 rounded-3xl p-4 lg:p-6 shadow-sm gap-4 overflow-hidden transition-all duration-300 ${
          selectedConsultKey && !isMobile ? 'lg:w-[46%] lg:shrink-0' : 'flex-1'
        }`}>
        
        {/* Tab "Staff thông" và "Staff mổ" cùng line */}
        <div className="shrink-0 flex border-b border-slate-200 gap-6">
          <button
            type="button"
            onClick={() => {
              setStaffType('cath');
              setCurrentPage(1);
            }}
            className={`pb-3 text-sm font-extrabold uppercase tracking-wider transition-colors cursor-pointer border-b-2 flex items-center gap-1.5 ${
              staffType === 'cath' ? 'border-[#d2145a] text-[#d2145a]' : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            <Stethoscope className="w-4 h-4 shrink-0" />
            <span>Staff thông</span>
            <span className="text-[10px] opacity-80 font-mono shrink-0">({cathStats.all})</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setStaffType('surg');
              setCurrentPage(1);
            }}
            className={`pb-3 text-sm font-extrabold uppercase tracking-wider transition-colors cursor-pointer border-b-2 flex items-center gap-1.5 ${
              staffType === 'surg' ? 'border-[#d2145a] text-[#d2145a]' : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            <Scissors className="w-4 h-4 shrink-0" />
            <span>Staff mổ</span>
            <span className="text-[10px] opacity-80 font-mono shrink-0">({surgStats.all})</span>
          </button>
        </div>

        {/* Tag "All", "Chờ staff", "Đã staff" */}
        <div className="shrink-0 flex flex-wrap items-center bg-white border border-slate-200 rounded-xl p-1 text-xs font-semibold text-slate-600 gap-1 max-w-md">
          <button
            type="button"
            onClick={() => {
              setStatusTab('all');
              setCurrentPage(1);
            }}
            className={`flex-1 min-w-[80px] text-center py-1.5 rounded-lg transition-colors cursor-pointer ${
              statusTab === 'all' ? 'bg-slate-900 text-white font-bold' : 'hover:bg-slate-100'
            }`}
          >
            All <span className="text-[10px] opacity-75 font-mono">({staffType === 'cath' ? cathStats.all : surgStats.all})</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setStatusTab('pending');
              setCurrentPage(1);
            }}
            className={`flex-1 text-center py-1.5 rounded-lg transition-colors cursor-pointer ${
              statusTab === 'pending' ? 'bg-amber-600 text-white font-bold' : 'text-amber-700 hover:bg-amber-50'
            }`}
          >
            ⚠ Chờ staff <span className="text-[10px] opacity-75 font-mono">({staffType === 'cath' ? cathStats.pending : surgStats.pending})</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setStatusTab('completed');
              setCurrentPage(1);
            }}
            className={`flex-1 text-center py-1.5 rounded-lg transition-colors cursor-pointer ${
              statusTab === 'completed' ? 'bg-green-700 text-white font-bold' : 'text-green-800 hover:bg-green-50'
            }`}
          >
            ✓ Đã staff <span className="text-[10px] opacity-75 font-mono">({staffType === 'cath' ? cathStats.completed : surgStats.completed})</span>
          </button>
        </div>

        {selectedDeleteKeys.size > 0 && (
          <div className="shrink-0 flex flex-wrap items-center justify-between gap-2 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2 shadow-sm">
            <span className="text-xs font-bold text-rose-800">
              Đã chọn {selectedDeleteKeys.size} ca
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setSelectedDeleteKeys(new Set())}
                className="text-[10px] font-bold uppercase text-slate-600 hover:text-slate-800 px-2 py-1 rounded-lg hover:bg-white cursor-pointer"
              >
                Bỏ chọn
              </button>
              <button
                type="button"
                onClick={() => setConfirmDeleteKeys(Array.from(selectedDeleteKeys))}
                className="text-[10px] font-extrabold uppercase bg-red-600 hover:bg-red-700 text-white px-3 py-1.5 rounded-lg cursor-pointer flex items-center gap-1"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Xoá đã chọn
              </button>
            </div>
          </div>
        )}

        {/* Cards Grid — single scroll container for sticky header + frozen columns */}
        <div className="flex-1 min-h-0 overflow-auto pr-1 custom-scrollbar">
          {renderList(displayedConsults)}
        </div>

        {/* Pagination control */}
        {totalPages > 1 && (
          <div className="shrink-0 pt-3 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-1.5 text-xs">
            <div className="text-[10px] text-slate-500 font-semibold font-mono uppercase">
              Trang {currentPage}/{totalPages} (Hiển thị {(currentPage - 1) * ITEMS_PER_PAGE + 1} đến {Math.min(currentPage * ITEMS_PER_PAGE, filteredConsultsAll.length)})
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                onClick={() => setCurrentPage(1)}
                disabled={currentPage === 1}
                className="px-2 py-1 rounded text-[9px] uppercase font-bold bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
              >
                Đầu
              </button>
              <button
                type="button"
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="px-2 py-1 rounded text-[9px] uppercase font-bold bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
              >
                Trước
              </button>
              
              <span className="text-xs font-semibold text-slate-700 px-1 font-mono">
                {currentPage} / {totalPages}
              </span>
              
              <button
                type="button"
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="px-2 py-1 rounded text-[9px] uppercase font-bold bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
              >
                Sau
              </button>
              <button
                type="button"
                onClick={() => setCurrentPage(totalPages)}
                disabled={currentPage === totalPages}
                className="px-2 py-1 rounded text-[9px] uppercase font-bold bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
              >
                Cuối
              </button>
            </div>
          </div>
        )}
        </div>

        {selectedConsultKey && !isMobile && (
          <div className="hidden lg:flex lg:flex-1 lg:min-w-0 flex-col min-h-0">
            <ResultStaffDrawer
              layout="panel"
              autoEdit
              consultKey={selectedConsultKey}
              consults={consults}
              patients={patients}
              staffList={staffList}
              sources={sources}
              deviceTemplates={deviceTemplates}
              currentStaff={currentStaff ?? null}
              onClose={() => setSelectedConsultKey(null)}
              onPatchConsult={onPatchConsult}
              onPatchPatient={onPatchPatient ?? (() => {})}
              onRefreshData={onRefreshData ?? (() => {})}
              onEditPatientAdmin={onEditPatientAdmin}
              createDiagnosisSource={createDiagnosisSource}
              triggerAlert={triggerAlert}
              onSaveSuccess={onSaveSuccess}
            />
          </div>
        )}
      </div>

      {mobileDrawerKey && isMobile && (
        <ResultStaffDrawer
          layout="modal"
          consultKey={mobileDrawerKey}
          consults={consults}
          patients={patients}
          staffList={staffList}
          sources={sources}
          deviceTemplates={deviceTemplates}
          currentStaff={currentStaff ?? null}
          onClose={() => setMobileDrawerKey(null)}
          onPatchConsult={onPatchConsult}
          onPatchPatient={onPatchPatient ?? (() => {})}
          onRefreshData={onRefreshData ?? (() => {})}
          onEditPatientAdmin={onEditPatientAdmin}
          createDiagnosisSource={createDiagnosisSource}
          triggerAlert={triggerAlert}
          onSaveSuccess={onSaveSuccess}
        />
      )}

      {/* COMBINED STAFF BỔ SUNG MODAL */}
      {showCombinedForm && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-3 md:p-4 pb-[calc(4rem+env(safe-area-inset-bottom))] md:pb-4">
          <div className="bg-white rounded-3xl max-w-4xl w-full max-h-[min(88dvh,calc(100dvh-4.5rem-env(safe-area-inset-bottom)))] md:max-h-[85vh] shadow-2xl border border-slate-200 flex flex-col overflow-hidden text-xs text-slate-700 font-semibold leading-relaxed animate-in zoom-in-95 duration-150 relative font-sans">
            
            {/* Header */}
            <div className="flex items-center justify-between gap-2 border-b border-slate-150 px-4 md:px-6 py-3 md:py-4 bg-indigo-50/50 text-[#d2145a] shrink-0">
              <div className="flex items-center gap-2 min-w-0">
                <ClipboardList className="w-5 h-5 animate-pulse text-indigo-600 shrink-0" />
                <div className="min-w-0">
                  <h3 className="font-extrabold text-xs md:text-sm uppercase font-sans text-indigo-900 leading-tight">
                    Đăng ký &amp; Nhập kết quả Staff bổ sung
                  </h3>
                  <p className="hidden md:block text-[10px] text-slate-500 normal-case mt-0.5">Dành cho ca hội chẩn phát sinh đột xuất ngay tại hội đồng hoặc đăng ký hội chẩn nhanh không thông qua hội đồng</p>
                </div>
              </div>
              <button 
                type="button"
                onClick={() => {
                  setShowCombinedForm(false);
                  resetForm();
                }}
                className="text-slate-400 hover:text-red-600 p-1 shrink-0 transition cursor-pointer md:bg-white md:hover:bg-red-50 md:border md:border-slate-200 md:rounded-full"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleCombinedSubmit} className="flex-1 flex flex-col overflow-hidden min-h-0">
              
              {/* Success Screen Banner Overlay */}
              {successMsg && (
                <div className="absolute inset-x-0 top-0 bg-emerald-500 text-white py-3.5 px-6 font-bold text-center z-50 animate-in slide-in-from-top flex items-center justify-center gap-2 text-xs">
                  <CheckCircle2 className="w-5 h-5 shrink-0" />
                  <span>{successMsg}</span>
                </div>
              )}

              {/* Error Message Banner if validation fails */}
              {errorMsg && (
                <div className="bg-rose-50 border-r-4 border-rose-500 text-rose-800 py-2.5 px-6 text-[11px] font-semibold animate-in slide-in-from-top flex items-center gap-2 shrink-0">
                  <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>{errorMsg}</span>
                </div>
              )}

              {/* Scrollable Body split into 2 visual columns */}
              <div className="flex-1 overflow-y-auto px-4 py-2 md:py-3 grid grid-cols-1 md:grid-cols-2 gap-3 divide-y md:divide-y-0 md:divide-x divide-slate-100 bg-slate-50/50">
                
                {/* COLUMN 1: Patients & Registration */}
                <div className="space-y-2 pr-0 md:pr-3">
                  <span className="font-extrabold text-[#d2145a] text-[11px] uppercase tracking-wider block border-b border-slate-200 pb-1">
                    1. Đăng ký Staff &amp; Bệnh Nhi
                  </span>

                  {/* Patient Choice Group Selector */}
                  <div className="bg-white border border-slate-200 p-2 rounded-2xl shadow-sm space-y-1.5">
                    
                    <div className="flex gap-2 p-1 bg-slate-100 rounded-xl">
                      <button
                        type="button"
                        onClick={() => {
                          setPatientMode('select');
                          setSelectedPatKey('');
                          setSearchPatQuery('');
                        }}
                        className={`flex-1 py-1 px-2 text-center font-bold transition-all text-xs cursor-pointer ${
                          patientMode === 'select' 
                            ? 'bg-indigo-600 text-white shadow-sm rounded-lg' 
                            : 'text-slate-600 hover:text-slate-800 rounded-lg'
                        }`}
                      >
                        Chọn bệnh nhi có sẵn
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setPatientMode('create');
                          setSelectedPatKey('');
                          setSearchPatQuery('');
                        }}
                        className={`flex-1 py-1 px-2 text-center font-bold transition-all text-xs cursor-pointer ${
                          patientMode === 'create' 
                            ? 'bg-indigo-600 text-white shadow-sm rounded-lg' 
                            : 'text-slate-600 hover:text-slate-800 rounded-lg'
                        }`}
                      >
                        Tạo nhanh bệnh nhi mới
                      </button>
                    </div>

                    {/* SELECT EXISTING PATIENT */}
                    {patientMode === 'select' && (
                      <div className="space-y-1.5">
                        {!selectedPatKey && (
                          <div className="relative">
                            <span className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
                              <Search className="h-4 w-4 text-slate-400" />
                            </span>
                            <input
                              type="text"
                              placeholder="Tìm tên, mã NB (ID1) để chọn..."
                              value={searchPatQuery}
                              onChange={(e) => setSearchPatQuery(e.target.value)}
                              className="w-full pl-9 pr-3 py-1.5 bg-white border border-slate-200 rounded-xl text-[11px] font-semibold focus:outline-none focus:ring-1 focus:ring-indigo-500 text-slate-800 placeholder-slate-400 font-sans shadow-sm"
                            />
                          </div>
                        )}

                        {!selectedPatKey && searchPatQuery.trim().length > 0 && (
                          <div className="max-h-32 overflow-y-auto border border-slate-250 rounded-xl bg-white divide-y divide-slate-100 shadow-lg animate-in fade-in-50 duration-150">
                            {(() => {
                              const trimmed = removeDiacritics(searchPatQuery).trim().toLowerCase();
                              const matched = patients.filter(p => {
                                const nameOk = p.PatientName ? removeDiacritics(String(p.PatientName)).toLowerCase().includes(trimmed) : false;
                                const idOk = p.PatientID1 ? removeDiacritics(String(p.PatientID1)).toLowerCase().includes(trimmed) : false;
                                return nameOk || idOk;
                              });

                              if (matched.length === 0) {
                                  return <div className="p-3 text-center text-slate-400 italic">Không tìm thấy bệnh nhi "{searchPatQuery}"</div>;
                              }

                              return matched.slice(0, 12).map(p => (
                                <button
                                  key={p.PatientKey}
                                  type="button"
                                  onClick={() => {
                                    setSelectedPatKey(p.PatientKey);
                                    setSearchPatQuery('');
                                  }}
                                  className="w-full text-left px-3 py-2 text-xs hover:bg-slate-50 transition flex justify-between items-center cursor-pointer"
                                >
                                  <div>
                                    <span className="font-extrabold uppercase text-slate-800">{p.PatientName}</span>
                                    <span className="text-[10px] text-slate-500 font-mono ml-1">(ID1: {p.PatientID1})</span>
                                  </div>
                                  <span className="text-[10px] text-slate-400 italic">DOB: {formatVNTime(p.PatientDOB)} | {p.PatientSex}</span>
                                </button>
                              ));
                            })()}
                          </div>
                        )}

                        {selectedPatKey && (() => {
                          const selectedPat = getPatientByKey(selectedPatKey);
                          if (!selectedPat) return null;
                          return (
                            <div className="bg-indigo-50/50 border border-indigo-150 rounded-xl p-2.5 text-slate-800 flex flex-col gap-1.5 animate-in zoom-in-95 duration-150 shadow-sm relative">
                              <div className="flex justify-between items-center border-b border-indigo-100 pb-1 shrink-0">
                                <span className="text-[10px] uppercase font-bold text-indigo-850">Thông tin đối chiếu</span>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setSelectedPatKey('');
                                  }}
                                  className="text-indigo-600 hover:text-red-500 font-bold text-[9px] bg-white hover:bg-rose-50 hover:border-rose-200 px-2 py-0.5 rounded-lg border border-indigo-150 shadow-xs transition shrink-0 cursor-pointer"
                                >
                                  ✕ Bỏ chọn
                                </button>
                              </div>

                              <div className="flex flex-col gap-1 md:grid md:grid-cols-2 md:gap-x-3 md:gap-y-1 text-xs">
                                <div className="flex items-baseline gap-2 min-w-0 md:block md:col-span-2">
                                  <span className="text-slate-400 font-bold text-[8px] uppercase shrink-0 md:block">Họ và tên:</span>
                                  <span className="font-extrabold text-indigo-950 uppercase text-[11px] truncate">{selectedPat.PatientName}</span>
                                </div>
                                <div className="flex items-baseline gap-2 min-w-0 md:block">
                                  <span className="text-slate-400 font-bold text-[8px] uppercase shrink-0 md:block">Giới tính:</span>
                                  <span className="font-bold text-slate-800 text-[11px]">{selectedPat.PatientSex}</span>
                                </div>
                                <div className="flex items-baseline gap-2 min-w-0 md:block">
                                  <span className="text-slate-400 font-bold text-[8px] uppercase shrink-0 md:block">Mã NB1 (ID1):</span>
                                  <span className="font-bold font-mono text-slate-800">{selectedPat.PatientID1}</span>
                                </div>
                                {selectedPat.PatientID2 && (
                                  <div className="flex items-baseline gap-2 min-w-0 md:block">
                                    <span className="text-slate-400 font-bold text-[8px] uppercase shrink-0 md:block">Mã NB2 (ID2):</span>
                                    <span className="font-bold font-mono text-slate-800">{selectedPat.PatientID2}</span>
                                  </div>
                                )}
                                <div className="flex items-baseline gap-2 min-w-0 md:block">
                                  <span className="text-slate-400 font-bold text-[8px] uppercase shrink-0 md:block">Ngày sinh (DOB):</span>
                                  <span className="font-bold font-mono text-slate-800">{formatVNTime(selectedPat.PatientDOB)}</span>
                                </div>
                                {(selectedPat.PatientAddress || (selectedPat as any).PatientAddress) && (
                                  <div className="flex items-baseline gap-2 min-w-0 md:block">
                                    <span className="text-slate-400 font-bold text-[8px] uppercase shrink-0 md:block">Địa chỉ:</span>
                                    <span className="font-bold text-slate-800 truncate">{selectedPat.PatientAddress || (selectedPat as any).PatientAddress}</span>
                                  </div>
                                )}
                                {selectedPat.PatientPhone1 && (
                                  <div className="flex items-baseline gap-2 min-w-0 md:block">
                                    <span className="text-slate-400 font-bold text-[8px] uppercase shrink-0 md:block">Số ĐT1:</span>
                                    <span className="font-bold font-mono text-slate-800">{selectedPat.PatientPhone1}</span>
                                  </div>
                                )}
                                {selectedPat.PatientPhone2 && (
                                  <div className="flex items-baseline gap-2 min-w-0 md:block">
                                    <span className="text-slate-400 font-bold text-[8px] uppercase shrink-0 md:block">Số ĐT2:</span>
                                    <span className="font-bold font-mono text-slate-800">{selectedPat.PatientPhone2}</span>
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })()}

                        {selectedPatKey && consults.some(c => String(c.PatientKey) === String(selectedPatKey) && !c.ConsultResultID) && (
                          <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-xl p-3 text-[10px] flex gap-2 animate-in fade-in duration-200">
                            <AlertTriangle className="w-4 h-4 shrink-0 text-amber-600 mt-0.5" />
                            <div>
                              <p className="font-bold">Bệnh nhân đã có lượt đăng ký chờ hội chẩn trong hệ thống.</p>
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* CREATE QUICK NEW PATIENT FIELDS */}
                    {patientMode === 'create' && (
                      <div className="bg-pink-50/50 border border-pink-100 rounded-2xl p-2.5 space-y-2 animate-in slide-in-from-top-1.5 duration-200">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          <div>
                            <label className="block text-slate-500 font-bold text-[9px] uppercase mb-0.5">Mã bệnh nhi (ID1) *</label>
                            <input
                              type="text"
                              required
                              placeholder="Mã ID1..."
                              value={newPatID1}
                              onChange={(e) => setNewPatID1(e.target.value)}
                              className="w-full bg-white border border-slate-200 rounded-xl px-2.5 py-1 font-semibold font-mono text-xs focus:outline-none"
                            />
                          </div>
                          <div>
                            <label className="block text-slate-500 font-bold text-[9px] uppercase mb-0.5">Mã bệnh nhi phụ (ID2)</label>
                            <input
                              type="text"
                              placeholder="Mã ID2 (nếu có)..."
                              value={newPatID2}
                              onChange={(e) => setNewPatID2(e.target.value)}
                              className="w-full bg-white border border-slate-200 rounded-xl px-2.5 py-1 font-semibold font-mono text-xs focus:outline-none"
                            />
                          </div>
                        </div>

                        <div>
                          <label className="block text-slate-500 font-bold text-[9px] uppercase mb-0.5">Họ tên Bệnh Nhi *</label>
                          <input
                            type="text"
                            required
                            placeholder="Nhập họ và tên viết hoa..."
                            value={newPatName}
                            onChange={(e) => setNewPatName(e.target.value.toUpperCase())}
                            className="w-full bg-white border border-slate-200 rounded-xl px-2.5 py-1 font-bold text-xs focus:outline-none uppercase text-slate-800"
                          />
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          <div>
                            <label className="block text-slate-500 font-bold text-[9px] uppercase mb-0.5">Ngày sinh *</label>
                            <VNDateInput
                              required
                              value={newPatDOB}
                              onChange={setNewPatDOB}
                              className="w-full bg-white border border-slate-200 rounded-xl px-2.5 py-1 font-semibold font-sans text-xs focus:outline-none"
                            />
                          </div>
                          <div>
                            <label className="block text-slate-500 font-bold text-[9px] uppercase mb-0.5">Giới tính *</label>
                            <div className="flex gap-2 pt-1">
                              <label className="flex items-center gap-1 font-bold cursor-pointer">
                                <input
                                  type="radio"
                                  name="gender"
                                  checked={newPatSex === 'Nam'}
                                  onChange={() => setNewPatSex('Nam')}
                                  className="accent-indigo-600 scale-105"
                                /> Nam
                              </label>
                              <label className="flex items-center gap-1 font-bold cursor-pointer">
                                <input
                                  type="radio"
                                  name="gender"
                                  checked={newPatSex === 'Nữ'}
                                  onChange={() => setNewPatSex('Nữ')}
                                  className="accent-indigo-600 scale-105"
                                /> Nữ
                              </label>
                            </div>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          <div>
                            <label className="block text-slate-500 font-bold text-[9px] uppercase mb-0.5">SĐT gia đình</label>
                            <input
                              type="text"
                              placeholder="Số ĐT..."
                              value={newPatPhone}
                              onChange={(e) => setNewPatPhone(e.target.value)}
                              className="w-full bg-white border border-slate-200 rounded-xl px-2.5 py-1 font-semibold font-mono text-xs focus:outline-none"
                            />
                          </div>
                          <div>
                            <label className="block text-slate-500 font-bold text-[9px] uppercase mb-0.5">Địa chỉ *</label>
                            <select
                              value={newPatAddress}
                              onChange={(e) => setNewPatAddress(e.target.value)}
                              className="w-full bg-white border border-slate-200 rounded-xl px-2.5 py-1 font-bold focus:outline-none text-xs text-slate-800"
                            >
                              {ADDRESS_OPTIONS.map((addr) => (
                                <option key={addr} value={addr}>{addr}</option>
                              ))}
                            </select>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Medical Registration parameters fields */}
                  <div className="bg-white border border-slate-200 p-2.5 rounded-2xl shadow-sm space-y-2">
                    
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <div>
                        <label className="block text-slate-500 font-bold text-[9px] uppercase mb-0.5">Kiểu staff *</label>
                        <select
                          value={consultType}
                          onChange={(e) => setConsultType(e.target.value as any)}
                          className="w-full bg-white border border-slate-200 rounded-xl px-2.5 py-1 font-bold focus:outline-none text-xs"
                        >
                          <option value="Staff mổ">Staff mổ</option>
                          <option value="Staff thông">Staff thông</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-slate-500 font-bold text-[9px] uppercase mb-0.5 font-sans">Ngày Hội Chẩn *</label>
                        <VNDateInput
                          required
                          value={consultDate}
                          onChange={setConsultDate}
                          className="w-full bg-white border border-slate-200 rounded-xl px-2.5 py-1 font-semibold font-sans text-xs focus:outline-none"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <div>
                        <label className="block text-slate-500 font-bold text-[9px] uppercase mb-0.5">Cân nặng (kg) *</label>
                        <input
                          type="text"
                          required
                          placeholder="vd: 12.5"
                          value={patWeight}
                          onChange={(e) => setPatWeight(e.target.value)}
                          className="w-full bg-white border border-slate-200 rounded-xl px-2.5 py-1 font-bold focus:outline-none text-xs"
                        />
                      </div>

                      <div>
                        <label className="block text-slate-500 font-bold text-[9px] uppercase mb-0.5">Chiều cao (cm)</label>
                        <input
                          type="text"
                          placeholder="vd: 90"
                          value={patHeight}
                          onChange={(e) => setPatHeight(e.target.value)}
                          className="w-full bg-white border border-slate-200 rounded-xl px-2.5 py-1 font-semibold focus:outline-none text-xs"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <div>
                        <label className="block text-slate-500 font-bold text-[9px] uppercase mb-0.5">BS đăng ký *</label>
                        <SearchableEnumSelect
                          required
                          options={doctorOptions}
                          value={requestBy}
                          onChange={setRequestBy}
                          allowCreate
                          createLabel={(val) => `Thêm BS "${val}"`}
                          placeholder="-- Chọn BS --"
                          searchPlaceholder="Gõ tên BS..."
                        />
                      </div>

                      <div>
                        <label className="block text-slate-500 font-bold text-[9px] uppercase mb-0.5">Khoa nội trú *</label>
                        <SearchableEnumSelect
                          required
                          options={departmentOptions}
                          value={department}
                          onChange={setDepartment}
                          allowCreate
                          createLabel={(val) => `Thêm khoa "${val}"`}
                          placeholder="-- Chọn khoa --"
                          searchPlaceholder="Gõ tên khoa..."
                        />
                      </div>
                    </div>

                    {consultType === 'Staff thông' ? (
                      <div className="pb-0.5">
                        <label className="block text-slate-500 font-bold text-[9px] uppercase mb-0.5">Hội chẩn PTV chính <span className="text-red-500">*</span></label>
                        <SearchableEnumSelect
                          required
                          options={[
                            'BS. Phụng', 'BS. Lợi', 'BS. Thịnh', 'BS. Ân', 'BS. Hiếu', 'BS. Tài', 'BS. Hùng', 'BS. Tĩnh',
                            ...Array.from(new Set(consults.map(c => String(c.Scheduled1stInterventionist || '')).filter(Boolean)))
                          ]}
                          value={scheduled1st}
                          onChange={setScheduled1st}
                          placeholder="-- Chọn PTV chính --"
                          searchPlaceholder="Gõ tìm PTV chính..."
                          direction="up"
                        />
                      </div>
                    ) : (
                      <div className="pb-0.5">
                        <label className="block text-slate-500 font-bold text-[9px] uppercase mb-0.5">Thành viên duyệt hội chẩn <span className="text-red-500">*</span></label>
                        <MobileAutoExpandTextarea
                          minRows={2}
                          required
                          value={consultMembers}
                          onChange={(e) => setConsultMembers(e.target.value)}
                          placeholder="Ví dụ: BS. Tài, BS. Ân, BS. Phụng"
                          className="w-full bg-white border border-slate-200 rounded-xl px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-teal-500 text-xs font-semibold"
                        />
                      </div>
                    )}

                  </div>
                </div>

                {/* COLUMN 2: Clinical outcome details */}
                <div className="space-y-2 pl-0 md:pl-3 pt-3 md:pt-0">
                  <span className="font-extrabold text-[#d2145a] text-[11px] uppercase tracking-wider block border-b border-slate-200 pb-1">
                    2. Kết quả hội chẩn
                  </span>

                  <div className="bg-white border border-slate-200 p-2.5 rounded-2xl shadow-sm space-y-2">
                    <div>
                      <label className="block text-slate-500 font-bold text-[9px] uppercase mb-0.5">ICD *</label>
                      <SearchableEnumSelect
                        required
                        options={diagnosisOptions}
                        value={diagnosisID}
                        onChange={setDiagnosisID}
                        allowCreate
                        createLabel={(value) => `Thêm DiagnosisID "${value}" vào Source`}
                        onCreateOption={createDiagnosisSource}
                        placeholder="-- Chọn ICD --"
                        searchPlaceholder="Gõ ICD để tìm..."
                      />
                    </div>

                    <div>
                      <label className="block text-slate-500 font-bold text-[9px] uppercase mb-0.5">Chẩn đoán chi tiết *</label>
                      <MobileAutoExpandTextarea
                        minRows={2}
                        required
                        placeholder="Nhập thông tin chẩn đoán chính, tình trạng bệnh lý mạch, van tim, shunt..."
                        value={detailDiagnosis}
                        onChange={(e) => setDetailDiagnosis(e.target.value)}
                        className="w-full bg-white border border-slate-200 rounded-xl px-2.5 py-1 font-semibold focus:outline-none text-xs placeholder-slate-400 text-slate-800"
                      />
                    </div>

                    <div>
                      <label className="block text-slate-500 font-bold text-[9px] uppercase mb-0.5">Kết luận chính *</label>
                      <SearchableEnumSelect
                        required
                        options={conclusionOptions}
                        value={consultResultID}
                        onChange={setConsultResultID}
                        placeholder="-- Chọn Kết luận chính --"
                        searchPlaceholder="Gõ tìm kết luận..."
                      />
                    </div>

                    <div>
                      <label className="block text-slate-500 font-bold text-[9px] uppercase mb-0.5">Ưu tiên</label>
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
                      <label className="block text-slate-500 font-bold text-[9px] uppercase mb-0.5">Kết quả chi tiết *</label>
                      <MobileAutoExpandTextarea
                        minRows={2}
                        required
                        placeholder="Nhập phác đồ, chi tiết kết quả hoặc phương án xử trí chi tiết của hội đồng..."
                        value={detailConsultResult}
                        onChange={(e) => setDetailConsultResult(e.target.value)}
                        className="w-full bg-white border border-slate-200 rounded-xl px-2.5 py-1 font-semibold text-xs focus:outline-none text-slate-800"
                      />
                    </div>

                    <PlannedDeviceSuggestBox
                      diagnosisID={diagnosisID}
                      value={plannedDevice}
                      onChange={setPlannedDevice}
                      deviceTemplates={deviceTemplates}
                      consults={consults}
                      rows={2}
                      placeholder="vd: Amplatzer ADOII..."
                      textareaClassName="w-full bg-white border border-slate-200 rounded-xl px-2.5 py-1 font-bold focus:outline-none text-xs text-slate-800 font-mono"
                    />

                    <div>
                      <label className="block text-slate-500 font-bold text-[9px] uppercase mb-0.5">Dự trù kinh phí (VNĐ)</label>
                      <MobileAutoExpandTextarea
                        minRows={2}
                        placeholder="vd: 45,000,000..."
                        value={plannedPrice}
                        onChange={(e) => setPlannedPrice(e.target.value)}
                        className="w-full bg-white border border-slate-200 rounded-xl px-2.5 py-1 font-semibold text-xs focus:outline-none text-slate-800 font-mono"
                      />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2 pt-2 border-t border-slate-100">
                      <div>
                        <label className="block text-slate-400 font-bold text-[9px] mb-1 uppercase text-left">Người điền KQ</label>
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
                        <label className="block text-slate-400 font-bold text-[9px] mb-1 uppercase cursor-default text-left" title="ConsultResultUpdatedTime">Điền lúc</label>
                        <input
                          type="text"
                          disabled
                          value={formatDateTime(new Date().toISOString())}
                          className="w-full bg-slate-50 text-slate-400 border border-slate-200 rounded-lg px-2 py-1 text-[10px] font-mono cursor-default"
                        />
                      </div>
                    </div>

                  </div>

                </div>

              </div>

              {/* Footer */}
              <div className="border-t border-slate-200 px-4 md:px-5 py-3 bg-slate-100 flex justify-end gap-3 shrink-0 rounded-b-3xl pb-[max(0.75rem,env(safe-area-inset-bottom))] md:pb-3">
                <button
                  type="button"
                  disabled={submitLoading}
                  onClick={() => {
                    setShowCombinedForm(false);
                    resetForm();
                  }}
                  className="bg-white hover:bg-slate-200 border border-slate-250 text-slate-700 font-extrabold uppercase px-6 py-2.5 rounded-xl transition cursor-pointer"
                >
                  Hủy bỏ
                </button>
                <button
                  type="submit"
                  disabled={submitLoading}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold uppercase px-8 py-2.5 rounded-xl transition shadow-md hover:shadow-lg disabled:opacity-50 cursor-pointer flex items-center gap-1.5"
                >
                  {submitLoading ? (
                    <>
                      <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      Đang xử lý...
                    </>
                  ) : (
                    'Lưu kết quả Staff'
                  )}
                </button>
              </div>

            </form>

          </div>
        </div>
      )}
      {/* CONFIRM DELETE MODAL */}
      {confirmDeleteKeys && confirmDeleteKeys.length > 0 && (() => {
        const keysToDelete = confirmDeleteKeys;
        const isBulk = keysToDelete.length > 1;
        const consultToDelete = !isBulk ? consults.find(c => c.ConsultKey === keysToDelete[0]) : null;
        const pat = consultToDelete ? getPatientByKey(consultToDelete.PatientKey) : null;
        return (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-3xl max-w-sm w-full shadow-2xl border border-slate-200 p-6 animate-in zoom-in-95 duration-150 text-slate-700 text-xs">
              <div className="flex items-center gap-3 text-red-650 mb-3.5">
                <div className="bg-red-50 p-2 rounded-full border border-red-150">
                  <AlertTriangle className="w-6 h-6 animate-bounce text-red-600" />
                </div>
                <div>
                  <h4 className="font-extrabold text-sm uppercase font-sans tracking-wide text-red-600">
                    Xác nhận xoá{isBulk ? ` (${keysToDelete.length} ca)` : ''}
                  </h4>
                  <p className="text-[10px] text-slate-500 font-semibold normal-case">Hành động này không thể hoàn tác</p>
                </div>
              </div>
              
              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3.5 mb-4 space-y-1.5 max-h-40 overflow-y-auto">
                {isBulk ? (
                  keysToDelete.map(key => {
                    const c = consults.find(item => item.ConsultKey === key);
                    const p = c ? getPatientByKey(c.PatientKey) : null;
                    return (
                      <p key={key} className="font-semibold text-slate-700 border-b border-slate-100 pb-1 last:border-0">
                        <span className="font-extrabold text-[#d2145a] uppercase">{p?.PatientName || '—'}</span>
                        <span className="text-slate-400 font-mono ml-2">{p?.PatientID1 || key}</span>
                      </p>
                    );
                  })
                ) : (
                  <>
                    {pat && (
                      <p className="font-bold text-slate-800">
                        Bệnh nhi: <span className="font-extrabold text-[#d2145a] uppercase">{pat.PatientName}</span>
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
                  </>
                )}
              </div>
              
              <p className="text-slate-600 leading-relaxed mb-5 font-medium">
                {isBulk
                  ? `Bạn có chắc chắn muốn xoá ${keysToDelete.length} lượt hội chẩn đã chọn khỏi hệ thống không?`
                  : 'Bạn có chắc chắn muốn xoá lượt hội chẩn này khỏi hệ thống không?'}
              </p>
              
              <div className="flex justify-end gap-3 font-extrabold uppercase">
                <button
                  type="button"
                  onClick={() => setConfirmDeleteKeys(null)}
                  className="bg-white hover:bg-slate-100 border border-slate-250 text-slate-700 px-4 py-2 rounded-xl transition cursor-pointer"
                >
                  Hủy bỏ
                </button>
                <button
                  type="button"
                  onClick={() => void executeDeleteConsults(keysToDelete)}
                  className="bg-red-600 hover:bg-red-700 text-white px-5 py-2 rounded-xl transition shadow-md hover:shadow-lg cursor-pointer"
                >
                  {isBulk ? `Xoá ${keysToDelete.length} ca` : 'Xoá ca'}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

    </div>
  );
}

// Global submit function implementation matching layout
async function handleCombinedSubmit(this: any) {
  // Done inside component context inline
}
