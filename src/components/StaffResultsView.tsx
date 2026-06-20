import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Patient, Consult, CathLab, Source, DeviceTemplate, formatVNTime, Staff, removeDiacritics, findPatientByKey, normalizePatientKey, PriorityOrderEnum, PRIORITY_OPTIONS } from '../types';
import { ClipboardList, Stethoscope, Clock, CheckCircle, Scissors, Search, X, Plus, AlertTriangle, CheckCircle2, ArrowUpDown } from 'lucide-react';
import { SearchableEnumSelect } from './SearchableEnumSelect';
import { getSourceDiagnosisOptions, normalizeDiagnosisID } from '../data/source';
import { PlannedDeviceSuggestBox } from './PlannedDeviceSuggestBox';
import { useIsMobile } from '../hooks/useMediaQuery';

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
  onSelectConsult: (consult: Consult) => void;
  onRefreshData?: () => void;
  onAddPatient?: (patient: Patient) => void;
  onPatchPatient?: (patientKey: string, patch: Partial<Patient>) => void;
  onAddConsult?: (consult: Consult) => void;
}

export default function StaffResultsView({ patients, consults, cathlabs = [], sources = [], deviceTemplates = [], staffList = [], currentStaff, onSelectConsult, onRefreshData, onAddPatient, onPatchPatient, onAddConsult }: StaffResultsViewProps) {
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

  // New Staff Registration combined states
  const [showCombinedForm, setShowCombinedForm] = useState<boolean>(false);
  const [submitLoading, setSubmitLoading] = useState<boolean>(false);
  const [successMsg, setSuccessMsg] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string>('');
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

    onRefreshData?.();
  };

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
  
  const [consultMembers, setConsultMembers] = useState<string[]>([]);
  
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
    setConsultMembers([]);
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
          setErrorMsg('Vui lòng nhập Mã bệnh nhi (ID1) và Họ tên bệnh nhi!');
          return;
        }

        // Check for duplicate PatientID1
        const dup = patients.find(p => String(p.PatientID1 || '').trim().toLowerCase() === newPatID1.trim().toLowerCase());
        if (dup) {
          setSubmitLoading(false);
          setErrorMsg(`Mã bệnh nhân này đã tồn tại trong hệ thống (Họ tên: ${dup.PatientName}). Đề nghị chọn bệnh nhi sẵn có hoặc kiểm tra lại thông tin!`);
          return;
        }

        finalPatientKey = `pat_${Date.now()}`;
        const patientPayload: Patient = {
          PatientKey: finalPatientKey,
          PatientID1: String(newPatID1 || '').trim(),
          PatientID2: String(newPatID2 || '').trim(),
          PatientName: newPatName,
          OtherPatientName: newPatName,
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
          setErrorMsg('Vui lòng tìm và chọn bệnh nhi sẵn có hoặc đổi sang chế độ tạo mới!');
          return;
        }

        if (automaticOutcome) {
          onPatchPatient?.(finalPatientKey, { Outcome: automaticOutcome });
        }
      }

      // 2. Add the consult
      const chosenDept = showAddDeptInput ? customDeptVal : department;
      const chosenDoc = showAddDocInput ? customDocVal : requestBy;

      const consultPayload: Consult = {
        ConsultKey: `con_${Date.now()}`,
        PatientKey: finalPatientKey,
        ConsultType: consultType,
        PatientWeight: patWeight,
        PatientHeight: patHeight || '',
        ConsultDate: consultDate,
        RequestBy: chosenDoc || 'BS Hội đồng',
        ConsultMember: consultMembers,
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
        PDFTrigger: false
      };

      onAddConsult?.(consultPayload);
      setSuccessMsg('Đã đăng ký và nhập thành công kết quả staff bổ sung!');
      setShowCombinedForm(false);
      resetForm();
      setSubmitLoading(false);

      const persist = async () => {
        if (patientMode === 'create') {
          const patRes = await fetch('/api/patients', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              PatientKey: finalPatientKey,
              PatientID1: String(newPatID1 || '').trim(),
              PatientID2: String(newPatID2 || '').trim(),
              PatientName: newPatName,
              OtherPatientName: newPatName,
              PatientDOB: newPatDOB || '2020-01-01',
              PatientSex: newPatSex,
              PatientAddress: newPatAddress || 'TP Hà Nội',
              PatientPhone1: newPatPhone || '',
              PatientPhone2: '',
              PatientCreateBy: currentStaff?.StaffKey || '01378',
              PatientCreateTime: new Date().toISOString(),
              Outcome: automaticOutcome
            })
          });
          if (!patRes.ok) throw new Error('Không thể đăng ký bệnh nhi mới');
        } else if (automaticOutcome) {
          const patRes = await fetch(`/api/patients/${finalPatientKey}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ Outcome: automaticOutcome })
          });
          if (!patRes.ok) throw new Error('Không thể cập nhật trạng thái bệnh nhi');
        }
        const conRes = await fetch('/api/consults', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(consultPayload)
        });
        if (!conRes.ok) throw new Error('Không thể đăng ký kết quả hội chẩn');
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

  // Search filter strings
  const [cathSearch, setCathSearch] = useState<string>('');
  const [surgSearch, setSurgSearch] = useState<string>('');

  // Filters state for Column 1 (Staff thông) and Column 2 (Staff mổ)
  const [cathTab, setCathTab] = useState<'all' | 'pending' | 'completed'>('all');
  const [surgTab, setSurgTab] = useState<'all' | 'pending' | 'completed'>('all');

  // Pagination state
  const [cathPage, setCathPage] = useState<number>(1);
  const [surgPage, setSurgPage] = useState<number>(1);

  const handleCathTabChange = (tab: 'all' | 'pending' | 'completed') => {
    setCathTab(tab);
    setCathPage(1);
  };

  const handleSurgTabChange = (tab: 'all' | 'pending' | 'completed') => {
    setSurgTab(tab);
    setSurgPage(1);
  };

  // Categorize based on ConsultType
  const cathConsults = consults.filter(c => c.ConsultType === 'Staff thông');
  const surgConsults = consults.filter(c => c.ConsultType === 'Staff mổ');

  const isPendingResult = (resultId: any) => {
    if (!resultId) return true;
    const s = String(resultId).trim().toLowerCase();
    return s === '' || s === 'nodata' || s === 'no data' || s === '—' || s === '-';
  };

  const cathConsultKeys = useMemo(
    () => new Set(cathlabs.map(cath => normalizeRefKey(cath.ConsultKey)).filter(Boolean)),
    [cathlabs]
  );

  const isPendingStaffResult = (consult: Consult) => {
    if (!isPendingResult(consult.ConsultResultID)) return false;
    const consultKey = normalizeRefKey(consult.ConsultKey);
    return !consultKey || !cathConsultKeys.has(consultKey);
  };

  // Counters
  const cathStats = {
    all: cathConsults.length,
    pending: cathConsults.filter(isPendingStaffResult).length,
    completed: cathConsults.filter(c => !isPendingStaffResult(c)).length
  };

  const surgStats = {
    all: surgConsults.length,
    pending: surgConsults.filter(isPendingStaffResult).length,
    completed: surgConsults.filter(c => !isPendingStaffResult(c)).length
  };

  const [cathSortOrder, setCathSortOrder] = useState<'desc' | 'asc'>('desc');
  const [surgSortOrder, setSurgSortOrder] = useState<'desc' | 'asc'>('desc');

  // Filter lists with pagination support
  const filteredCathAll = cathConsults.filter(c => {
    // 1. Tab filtering
    if (cathTab === 'pending' && !isPendingStaffResult(c)) return false;
    if (cathTab === 'completed' && isPendingStaffResult(c)) return false;

    // 2. Search query filtering
    if (cathSearch.trim() !== '') {
      const q = removeDiacritics(cathSearch).toLowerCase().trim();
      const pat = findPatientByKey(patients, c.PatientKey);
      const nameMatch = pat?.PatientName ? removeDiacritics(String(pat.PatientName)).toLowerCase().includes(q) : false;
      const id1Match = pat?.PatientID1 ? removeDiacritics(String(pat.PatientID1)).toLowerCase().includes(q) : false;
      const id2Match = pat?.PatientID2 ? removeDiacritics(String(pat.PatientID2)).toLowerCase().includes(q) : false;
      const diagMatch = c.DiagnosisID ? removeDiacritics(String(c.DiagnosisID)).toLowerCase().includes(q) : false;
      return nameMatch || id1Match || id2Match || diagMatch;
    }

    return true;
  }).sort((a, b) => {
    const da = a.ConsultDate ? new Date(a.ConsultDate).getTime() : 0;
    const db = b.ConsultDate ? new Date(b.ConsultDate).getTime() : 0;
    return cathSortOrder === 'asc' ? da - db : db - da;
  });

  const filteredSurgAll = surgConsults.filter(c => {
    // 1. Tab filtering
    if (surgTab === 'pending' && !isPendingStaffResult(c)) return false;
    if (surgTab === 'completed' && isPendingStaffResult(c)) return false;

    // 2. Search query filtering
    if (surgSearch.trim() !== '') {
      const q = removeDiacritics(surgSearch).toLowerCase().trim();
      const pat = findPatientByKey(patients, c.PatientKey);
      const nameMatch = pat?.PatientName ? removeDiacritics(String(pat.PatientName)).toLowerCase().includes(q) : false;
      const id1Match = pat?.PatientID1 ? removeDiacritics(String(pat.PatientID1)).toLowerCase().includes(q) : false;
      const id2Match = pat?.PatientID2 ? removeDiacritics(String(pat.PatientID2)).toLowerCase().includes(q) : false;
      const diagMatch = c.DiagnosisID ? removeDiacritics(String(c.DiagnosisID)).toLowerCase().includes(q) : false;
      return nameMatch || id1Match || id2Match || diagMatch;
    }

    return true;
  }).sort((a, b) => {
    const da = a.ConsultDate ? new Date(a.ConsultDate).getTime() : 0;
    const db = b.ConsultDate ? new Date(b.ConsultDate).getTime() : 0;
    return surgSortOrder === 'asc' ? da - db : db - da;
  });

  const totalCathPages = Math.max(1, Math.ceil(filteredCathAll.length / ITEMS_PER_PAGE));
  const totalSurgPages = Math.max(1, Math.ceil(filteredSurgAll.length / ITEMS_PER_PAGE));

  const filteredCath = filteredCathAll.slice((cathPage - 1) * ITEMS_PER_PAGE, cathPage * ITEMS_PER_PAGE);
  const filteredSurg = filteredSurgAll.slice((surgPage - 1) * ITEMS_PER_PAGE, surgPage * ITEMS_PER_PAGE);

  const isMobile = useIsMobile();
  const MOBILE_STAFF_BATCH = 50;
  const [mobileStaffCol, setMobileStaffCol] = useState<'cath' | 'surg'>('cath');
  const [mobileSearch, setMobileSearch] = useState('');
  const [mobileStatusTab, setMobileStatusTab] = useState<'all' | 'pending' | 'completed'>('all');
  const [mobileVisibleCount, setMobileVisibleCount] = useState(MOBILE_STAFF_BATCH);
  const mobileTableScrollRef = useRef<HTMLDivElement>(null);

  const mobileActiveConsults = mobileStaffCol === 'cath' ? cathConsults : surgConsults;
  const mobileActiveSort = mobileStaffCol === 'cath' ? cathSortOrder : surgSortOrder;

  const mobileFilteredAll = useMemo(() => {
    return mobileActiveConsults.filter(c => {
      if (mobileStatusTab === 'pending' && !isPendingStaffResult(c)) return false;
      if (mobileStatusTab === 'completed' && isPendingStaffResult(c)) return false;

      if (mobileSearch.trim() !== '') {
        const q = removeDiacritics(mobileSearch).toLowerCase().trim();
        const pat = findPatientByKey(patients, c.PatientKey);
        const nameMatch = pat?.PatientName ? removeDiacritics(String(pat.PatientName)).toLowerCase().includes(q) : false;
        const id1Match = pat?.PatientID1 ? removeDiacritics(String(pat.PatientID1)).toLowerCase().includes(q) : false;
        const id2Match = pat?.PatientID2 ? removeDiacritics(String(pat.PatientID2)).toLowerCase().includes(q) : false;
        const diagMatch = c.DiagnosisID ? removeDiacritics(String(c.DiagnosisID)).toLowerCase().includes(q) : false;
        return nameMatch || id1Match || id2Match || diagMatch;
      }

      return true;
    }).sort((a, b) => {
      const da = a.ConsultDate ? new Date(a.ConsultDate).getTime() : 0;
      const db = b.ConsultDate ? new Date(b.ConsultDate).getTime() : 0;
      return mobileActiveSort === 'asc' ? da - db : db - da;
    });
  }, [mobileActiveConsults, mobileStatusTab, mobileSearch, mobileActiveSort, patients]);

  const mobileStats = useMemo(() => ({
    all: mobileActiveConsults.length,
    pending: mobileActiveConsults.filter(isPendingStaffResult).length,
    completed: mobileActiveConsults.filter(c => !isPendingStaffResult(c)).length,
  }), [mobileActiveConsults]);

  useEffect(() => {
    setMobileVisibleCount(MOBILE_STAFF_BATCH);
  }, [mobileStaffCol, mobileStatusTab, mobileSearch]);

  const displayedMobileConsults = mobileFilteredAll.slice(0, mobileVisibleCount);

  const handleMobileTableScroll = useCallback(() => {
    if (!isMobile) return;
    const el = mobileTableScrollRef.current;
    if (!el || mobileVisibleCount >= mobileFilteredAll.length) return;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 240) {
      setMobileVisibleCount(prev => Math.min(prev + MOBILE_STAFF_BATCH, mobileFilteredAll.length));
    }
  }, [isMobile, mobileVisibleCount, mobileFilteredAll.length]);

  const toggleMobileSort = () => {
    if (mobileStaffCol === 'cath') {
      setCathSortOrder(prev => prev === 'desc' ? 'asc' : 'desc');
    } else {
      setSurgSortOrder(prev => prev === 'desc' ? 'asc' : 'desc');
    }
  };

  // Render lists helper
  const renderList = (filtered: Consult[]) => {
    if (filtered.length === 0) {
      return (
        <p className="text-center italic text-xs text-slate-400 py-8 bg-slate-50/50 rounded-2xl border border-dashed border-slate-200">
          Không có ca nào trong trạng thái đã chọn.
        </p>
      );
    }

    return (
      <div className="space-y-2.5">
        {filtered.map((c) => {
          const pat = findPatientByKey(patients, c.PatientKey);
          if (!pat) return null;

          return (
            <button
              key={c.ConsultKey}
              onClick={() => onSelectConsult(c)}
              className="w-full text-left bg-white border border-slate-200 hover:border-[#d2145a] rounded-2xl p-4 shadow-sm hover:shadow-md transition duration-200 flex flex-col justify-between items-start focus:outline-none focus:ring-1 focus:ring-pink-400 cursor-pointer"
            >
              <div className="flex justify-between items-start w-full">
                <div>
                  <h5 className="font-extrabold text-[#d2145a] text-sm uppercase leading-tight">
                    {pat.PatientName}
                  </h5>
                  <p className="text-[10px] text-slate-500 font-mono mt-0.5">
                    Mã NB: {pat.PatientID1} | DOB: {formatVNTime(pat.PatientDOB)}
                  </p>
                </div>
              </div>

              <div className="mt-3 pt-2 border-t border-slate-100 w-full grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] text-slate-600 font-medium font-sans font-sans">
                <div>
                  <span className="text-slate-400">Chẩn đoán:</span>{' '}
                  <span className="font-bold text-red-600 bg-red-50 border border-red-200 px-1 rounded">{c.DiagnosisID}</span>
                </div>
                <div>
                  <span className="text-slate-400">Ngày staff:</span>{' '}
                  <span className="font-semibold text-slate-700 font-mono">{formatVNTime(c.ConsultDate)}</span>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    );
  };

  return (
    <div className="flex-1 h-full flex flex-col gap-2 md:gap-4 animate-in fade-in duration-200 font-sans min-h-0 p-2 md:p-4 lg:p-6 bg-slate-50 overflow-hidden">
      
      {/* Mobile: tab Staff thông / Staff mổ + nút (+) cùng hàng */}
      <div className="md:hidden flex-1 min-h-0 flex flex-col gap-2 overflow-hidden">
        <div className="shrink-0 flex items-center gap-2">
          <div className="flex-1 flex items-center bg-white border border-slate-200 rounded-xl p-1 text-xs font-semibold text-slate-600 gap-1 min-w-0">
            <button
              type="button"
              onClick={() => setMobileStaffCol('cath')}
              className={`flex-1 text-center py-2 rounded-lg transition-colors cursor-pointer flex items-center justify-center gap-1 min-w-0 ${
                mobileStaffCol === 'cath'
                  ? 'bg-teal-600 text-white font-bold'
                  : 'hover:bg-slate-100 text-slate-700'
              }`}
            >
              <Stethoscope className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">Staff thông</span>
              <span className="text-[10px] opacity-80 font-mono shrink-0">({cathStats.all})</span>
            </button>
            <button
              type="button"
              onClick={() => setMobileStaffCol('surg')}
              className={`flex-1 text-center py-2 rounded-lg transition-colors cursor-pointer flex items-center justify-center gap-1 min-w-0 ${
                mobileStaffCol === 'surg'
                  ? 'bg-rose-600 text-white font-bold'
                  : 'hover:bg-slate-100 text-slate-700'
              }`}
            >
              <Scissors className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">Staff mổ</span>
              <span className="text-[10px] opacity-80 font-mono shrink-0">({surgStats.all})</span>
            </button>
          </div>
          <button
            type="button"
            onClick={() => {
              resetForm();
              setShowCombinedForm(true);
            }}
            className="w-10 h-10 shrink-0 rounded-full bg-indigo-600 hover:bg-indigo-700 text-white shadow-md transition duration-200 flex items-center justify-center cursor-pointer"
            title="Staff bổ sung"
            aria-label="Staff bổ sung"
          >
            <Plus className="w-5 h-5" />
          </button>
        </div>

        <div className="shrink-0 flex flex-wrap items-center bg-white border border-slate-200 rounded-xl p-1 text-xs font-semibold text-slate-600 gap-1">
          <button
            type="button"
            onClick={() => setMobileStatusTab('all')}
            className={`flex-1 min-w-[72px] text-center py-1.5 rounded-lg transition-colors cursor-pointer ${
              mobileStatusTab === 'all' ? 'bg-slate-900 text-white font-bold' : 'hover:bg-slate-100'
            }`}
          >
            All <span className="text-[10px] opacity-75 font-mono">({mobileStats.all})</span>
          </button>
          <button
            type="button"
            onClick={() => setMobileStatusTab('pending')}
            className={`flex-1 text-center py-1.5 rounded-lg transition-colors cursor-pointer ${
              mobileStatusTab === 'pending' ? 'bg-amber-600 text-white font-bold' : 'text-amber-700 hover:bg-amber-50'
            }`}
          >
            ⚠ Chờ staff <span className="text-[10px] opacity-75 font-mono">({mobileStats.pending})</span>
          </button>
          <button
            type="button"
            onClick={() => setMobileStatusTab('completed')}
            className={`flex-1 text-center py-1.5 rounded-lg transition-colors cursor-pointer ${
              mobileStatusTab === 'completed' ? 'bg-green-700 text-white font-bold' : 'text-green-800 hover:bg-green-50'
            }`}
          >
            ✓ Đã staff <span className="text-[10px] opacity-75 font-mono">({mobileStats.completed})</span>
          </button>
        </div>

        <div className="shrink-0 flex gap-2">
          <div className="relative flex-1">
            <span className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
              <Search className="h-4 w-4 text-slate-400" />
            </span>
            <input
              type="text"
              value={mobileSearch}
              onChange={(e) => setMobileSearch(e.target.value)}
              placeholder="Tìm tên, mã NB, chẩn đoán..."
              className="w-full pl-9 pr-8 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-pink-400 focus:border-pink-400 font-sans shadow-sm"
            />
            {mobileSearch && (
              <button
                type="button"
                onClick={() => setMobileSearch('')}
                className="absolute inset-y-0 right-0 flex items-center pr-2.5 text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={toggleMobileSort}
            className="bg-white border border-slate-200 text-slate-600 px-3 rounded-xl flex items-center justify-center hover:bg-slate-50 transition-colors shrink-0 shadow-sm cursor-pointer"
            title="Sắp xếp theo thời gian"
          >
            <ArrowUpDown className={`w-4 h-4 transition-transform duration-300 ${mobileActiveSort === 'asc' ? 'rotate-180' : ''}`} />
          </button>
        </div>

        <div
          ref={mobileTableScrollRef}
          onScroll={handleMobileTableScroll}
          className="flex-1 min-h-0 overflow-x-auto overflow-y-auto bg-white border border-slate-200 rounded-2xl shadow-sm custom-scrollbar"
        >
          <table className="w-full text-left text-xs border-collapse min-w-[520px]">
            <thead className="sticky top-0 z-10">
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 text-[10px] uppercase font-black tracking-wider font-mono">
                <th className="py-2.5 px-3 sticky left-0 z-20 bg-slate-50 min-w-[140px] shadow-[2px_0_4px_-2px_rgba(15,23,42,0.08)]">Họ và tên</th>
                <th className="py-2.5 px-3">Chẩn đoán</th>
                <th className="py-2.5 px-3">Ngày staff</th>
                <th className="py-2.5 px-3">Trạng thái</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-semibold text-slate-700">
              {displayedMobileConsults.length === 0 ? (
                <tr>
                  <td colSpan={4} className="text-center py-10 italic text-slate-400">
                    Không có ca nào trong trạng thái đã chọn.
                  </td>
                </tr>
              ) : (
                displayedMobileConsults.map((c) => {
                  const pat = findPatientByKey(patients, c.PatientKey);
                  if (!pat) return null;
                  const pending = isPendingStaffResult(c);
                  return (
                    <tr
                      key={c.ConsultKey}
                      onClick={() => onSelectConsult(c)}
                      className="hover:bg-pink-50/45 cursor-pointer transition duration-150 group"
                    >
                      <td className="py-3 px-3 sticky left-0 z-[5] bg-white group-hover:bg-pink-50/45 min-w-[140px] shadow-[2px_0_4px_-2px_rgba(15,23,42,0.08)]">
                        <p className="font-black text-neutral-900 leading-tight uppercase group-hover:text-[#d2145a]">{pat.PatientName}</p>
                        <p className="text-[10px] text-slate-500 font-mono">MNB: {pat.PatientID1}</p>
                      </td>
                      <td className="py-3 px-3">
                        <span className="font-bold text-red-600 bg-red-50 border border-red-200 px-1 rounded text-[10px]">{c.DiagnosisID || '—'}</span>
                      </td>
                      <td className="py-3 px-3 font-mono text-slate-600">{formatVNTime(c.ConsultDate)}</td>
                      <td className="py-3 px-3">
                        {pending ? (
                          <span className="text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded">Chờ staff</span>
                        ) : (
                          <span className="text-[10px] font-bold text-green-800 bg-green-50 border border-green-200 px-1.5 py-0.5 rounded">Đã staff</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
              {mobileFilteredAll.length > displayedMobileConsults.length && (
                <tr>
                  <td colSpan={4} className="text-center py-3 text-[10px] text-slate-400 font-medium">
                    {displayedMobileConsults.length} / {mobileFilteredAll.length} · Cuộn để tải thêm
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Desktop: Title with Staff bổ sung action button */}
      <div className="hidden md:flex shrink-0 flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 sm:p-5 border border-slate-200 rounded-3xl shadow-sm">
        <div>
          <h2 className="text-base font-extrabold text-neutral-[#d2145a] tracking-tight flex items-center gap-2 uppercase">
            <ClipboardList className="w-5 h-5 text-[#d2145a] animate-pulse" /> Nhập kết quả staff
          </h2>
          <p className="text-xs text-slate-500 mt-0.5 font-medium">Điều phối viên và Hội đồng duyệt kết quả chỉ định can thiệp thông tim hoặc phẫu thuật tim hở.</p>
        </div>
        <button
          type="button"
          onClick={() => {
            resetForm();
            setShowCombinedForm(true);
          }}
          className="bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold px-4 py-2.5 rounded-2xl text-xs flex items-center justify-center gap-1.5 shadow-md hover:shadow-lg transition duration-200 shrink-0 cursor-pointer uppercase tracking-wider"
        >
          <Plus className="w-4 h-4 text-white" /> Staff bổ sung
        </button>
      </div>

      {/* Desktop: Grid columns */}
      <div className="hidden md:grid flex-1 min-h-0 grid-cols-1 md:grid-cols-2 gap-6">
        
        {/* COLUMN 1: Staff thông */}
        <div className="min-h-0 h-full flex flex-col bg-white border border-slate-200 rounded-3xl p-4 lg:p-5 shadow-sm">
          <div className="shrink-0 flex items-center gap-1.5 border-b border-slate-200 pb-2.5 mb-4">
            <Stethoscope className="w-5 h-5 text-teal-600" />
            <h4 className="font-extrabold text-xs text-neutral-900 uppercase">Staff thông</h4>
          </div>

          {/* Filtering choice headers exactly matching screenshot 7 */}
          <div className="shrink-0 flex flex-wrap items-center bg-white border border-slate-200 rounded-xl p-1 text-xs font-semibold text-slate-600 mb-4 gap-1">
            <button
              onClick={() => handleCathTabChange('all')}
              className={`flex-1 min-w-[88px] text-center py-1.5 rounded-lg transition-colors cursor-pointer ${
                cathTab === 'all' 
                  ? 'bg-slate-900 text-white font-bold' 
                  : 'hover:bg-slate-100'
              }`}
            >
              All <span className="text-[10px] opacity-75 font-mono">({cathStats.all})</span>
            </button>
            <button
              onClick={() => handleCathTabChange('pending')}
              className={`flex-1 text-center py-1.5 rounded-lg transition-colors cursor-pointer ${
                cathTab === 'pending' 
                  ? 'bg-amber-600 text-white font-bold' 
                  : 'text-amber-700 hover:bg-amber-50'
              }`}
            >
              ⚠ Chờ staff <span className="text-[10px] opacity-75 font-mono">({cathStats.pending})</span>
            </button>
            <button
              onClick={() => handleCathTabChange('completed')}
              className={`flex-1 text-center py-1.5 rounded-lg transition-colors cursor-pointer ${
                cathTab === 'completed' 
                  ? 'bg-green-700 text-white font-bold' 
                  : 'text-green-800 hover:bg-green-50'
              }`}
            >
              ✓ Đã staff <span className="text-[10px] opacity-75 font-mono">({cathStats.completed})</span>
            </button>
          </div>

          {/* Search bar & Sort Column 1 */}
          <div className="shrink-0 flex gap-2 mb-4">
            <div className="relative flex-1">
              <span className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
                <Search className="h-4 w-4 text-slate-400" />
              </span>
              <input
                type="text"
                value={cathSearch}
                onChange={(e) => {
                  setCathSearch(e.target.value);
                  setCathPage(1);
                }}
                placeholder="Tìm tên, mã NB, chẩn đoán..."
                className="w-full pl-9 pr-8 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-pink-400 focus:border-pink-400 font-sans shadow-sm"
              />
              {cathSearch && (
                <button
                  type="button"
                  onClick={() => {
                    setCathSearch('');
                    setCathPage(1);
                  }}
                  className="absolute inset-y-0 right-0 flex items-center pr-2.5 text-slate-400 hover:text-slate-600 cursor-pointer"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
            <button
              onClick={() => setCathSortOrder(prev => prev === 'desc' ? 'asc' : 'desc')}
              className="bg-white border border-slate-200 text-slate-600 px-3 rounded-xl flex items-center justify-center hover:bg-slate-50 transition-colors shrink-0 shadow-sm cursor-pointer"
              title="Sắp xếp theo thời gian"
            >
              <ArrowUpDown className={`w-4 h-4 transition-transform duration-300 object-center ${cathSortOrder === 'asc' ? 'rotate-180' : ''}`} />
            </button>
          </div>

          {/* List area */}
          <div className="flex-1 min-h-0 space-y-2 overflow-y-auto pr-1">
            {renderList(filteredCath)}
          </div>

          {/* Pagination for Column 1 */}
          {totalCathPages > 1 && (
            <div className="shrink-0 pt-3 mt-4 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-1.5 text-xs">
              <div className="text-[10px] text-slate-505 font-semibold font-mono uppercase text-slate-500">
                Trang {cathPage}/{totalCathPages} (Hiển thị {(cathPage - 1) * ITEMS_PER_PAGE + 1} đến {Math.min(cathPage * ITEMS_PER_PAGE, filteredCathAll.length)})
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  onClick={() => setCathPage(1)}
                  disabled={cathPage === 1}
                  className="px-2 py-1 rounded text-[9px] uppercase font-bold bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                >
                  Đầu
                </button>
                <button
                  type="button"
                  onClick={() => setCathPage(p => Math.max(1, p - 1))}
                  disabled={cathPage === 1}
                  className="px-2 py-1 rounded text-[9px] uppercase font-bold bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                >
                  Trước
                </button>
                
                <span className="text-xs font-semibold text-slate-700 px-1 font-mono">
                  {cathPage} / {totalCathPages}
                </span>
                
                <button
                  type="button"
                  onClick={() => setCathPage(p => Math.min(totalCathPages, p + 1))}
                  disabled={cathPage === totalCathPages}
                  className="px-2 py-1 rounded text-[9px] uppercase font-bold bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                >
                  Sau
                </button>
                <button
                  type="button"
                  onClick={() => setCathPage(totalCathPages)}
                  disabled={cathPage === totalCathPages}
                  className="px-2 py-1 rounded text-[9px] uppercase font-bold bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                >
                  Cuối
                </button>
              </div>
            </div>
          )}
        </div>

        {/* COLUMN 2: Staff mổ */}
        <div className="min-h-0 h-full flex flex-col bg-white border border-slate-200 rounded-3xl p-4 lg:p-5 shadow-sm">
          <div className="shrink-0 flex items-center gap-1.5 border-b border-slate-200 pb-2.5 mb-4">
            <Scissors className="w-5 h-5 text-rose-500" />
            <h4 className="font-extrabold text-xs text-neutral-900 uppercase">Staff mổ</h4>
          </div>

          {/* Filtering choice headers exactly matching screenshot 7 */}
          <div className="shrink-0 flex flex-wrap items-center bg-white border border-slate-200 rounded-xl p-1 text-xs font-semibold text-slate-600 mb-4 gap-1">
            <button
              onClick={() => handleSurgTabChange('all')}
              className={`flex-1 min-w-[88px] text-center py-1.5 rounded-lg transition-colors cursor-pointer ${
                surgTab === 'all' 
                  ? 'bg-slate-900 text-white font-bold' 
                  : 'hover:bg-slate-100'
              }`}
            >
              All <span className="text-[10px] opacity-75 font-mono">({surgStats.all})</span>
            </button>
            <button
              onClick={() => handleSurgTabChange('pending')}
              className={`flex-1 text-center py-1.5 rounded-lg transition-colors cursor-pointer ${
                surgTab === 'pending' 
                  ? 'bg-amber-600 text-white font-bold' 
                  : 'text-amber-700 hover:bg-amber-50'
              }`}
            >
              ⚠ Chờ staff <span className="text-[10px] opacity-75 font-mono">({surgStats.pending})</span>
            </button>
            <button
              onClick={() => handleSurgTabChange('completed')}
              className={`flex-1 text-center py-1.5 rounded-lg transition-colors cursor-pointer ${
                surgTab === 'completed' 
                  ? 'bg-green-700 text-white font-bold' 
                  : 'text-green-800 hover:bg-green-50'
              }`}
            >
              ✓ Đã staff <span className="text-[10px] opacity-75 font-mono">({surgStats.completed})</span>
            </button>
          </div>

          {/* Search bar & Sort Column 2 */}
          <div className="shrink-0 flex gap-2 mb-4">
            <div className="relative flex-1">
              <span className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
                <Search className="h-4 w-4 text-slate-400" />
              </span>
              <input
                type="text"
                value={surgSearch}
                onChange={(e) => {
                  setSurgSearch(e.target.value);
                  setSurgPage(1);
                }}
                placeholder="Tìm tên, mã NB, chẩn đoán..."
                className="w-full pl-9 pr-8 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-pink-400 focus:border-pink-400 font-sans shadow-sm"
              />
              {surgSearch && (
                <button
                  type="button"
                  onClick={() => {
                    setSurgSearch('');
                    setSurgPage(1);
                  }}
                  className="absolute inset-y-0 right-0 flex items-center pr-2.5 text-slate-400 hover:text-slate-600 cursor-pointer"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
            <button
              onClick={() => setSurgSortOrder(prev => prev === 'desc' ? 'asc' : 'desc')}
              className="bg-white border border-slate-200 text-slate-600 px-3 rounded-xl flex items-center justify-center hover:bg-slate-50 transition-colors shrink-0 shadow-sm cursor-pointer"
              title="Sắp xếp theo thời gian"
            >
              <ArrowUpDown className={`w-4 h-4 transition-transform duration-300 object-center ${surgSortOrder === 'asc' ? 'rotate-180' : ''}`} />
            </button>
          </div>

          {/* List area */}
          <div className="flex-1 min-h-0 space-y-2 overflow-y-auto pr-1">
            {renderList(filteredSurg)}
          </div>

          {/* Pagination for Column 2 */}
          {totalSurgPages > 1 && (
            <div className="shrink-0 pt-3 mt-4 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-1.5 text-xs">
              <div className="text-[10px] text-slate-505 font-semibold font-mono uppercase text-slate-500">
                Trang {surgPage}/{totalSurgPages} (Hiển thị {(surgPage - 1) * ITEMS_PER_PAGE + 1} đến {Math.min(surgPage * ITEMS_PER_PAGE, filteredSurgAll.length)})
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  onClick={() => setSurgPage(1)}
                  disabled={surgPage === 1}
                  className="px-2 py-1 rounded text-[9px] uppercase font-bold bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                >
                  Đầu
                </button>
                <button
                  type="button"
                  onClick={() => setSurgPage(p => Math.max(1, p - 1))}
                  disabled={surgPage === 1}
                  className="px-2 py-1 rounded text-[9px] uppercase font-bold bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                >
                  Trước
                </button>
                
                <span className="text-xs font-semibold text-slate-700 px-1 font-mono">
                  {surgPage} / {totalSurgPages}
                </span>
                
                <button
                  type="button"
                  onClick={() => setSurgPage(p => Math.min(totalSurgPages, p + 1))}
                  disabled={surgPage === totalSurgPages}
                  className="px-2 py-1 rounded text-[9px] uppercase font-bold bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                >
                  Sau
                </button>
                <button
                  type="button"
                  onClick={() => setSurgPage(totalSurgPages)}
                  disabled={surgPage === totalSurgPages}
                  className="px-2 py-1 rounded text-[9px] uppercase font-bold bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                >
                  Cuối
                </button>
              </div>
            </div>
          )}
        </div>

      </div>

      {/* COMBINED STAFF BỔ SUNG MODAL */}
      {showCombinedForm && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-3 md:p-4 pb-[calc(4rem+env(safe-area-inset-bottom))] md:pb-4">
          <div className="bg-white rounded-3xl max-w-4xl w-full max-h-[min(88dvh,calc(100dvh-4.5rem-env(safe-area-inset-bottom)))] md:max-h-[85vh] shadow-2xl border border-slate-200 flex flex-col overflow-hidden text-xs text-slate-700 font-semibold leading-relaxed animate-in zoom-in-95 duration-150 relative">
            
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
                          const selectedPat = findPatientByKey(patients, selectedPatKey);
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
                            <input
                              type="date"
                              required
                              value={newPatDOB}
                              onChange={(e) => setNewPatDOB(e.target.value)}
                              className="w-full bg-white border border-slate-200 rounded-xl px-2.5 py-1 font-semibold font-mono text-xs focus:outline-none"
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
                        <input
                          type="date"
                          required
                          value={consultDate}
                          onChange={(e) => setConsultDate(e.target.value)}
                          className="w-full bg-white border border-slate-200 rounded-xl px-2.5 py-1 font-semibold font-mono text-xs focus:outline-none"
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
                        <select
                          required={!showAddDocInput}
                          value={showAddDocInput ? 'ADD_NEW' : requestBy}
                          onChange={(e) => {
                            const val = e.target.value;
                            if (val === 'ADD_NEW') {
                              setShowAddDocInput(true);
                              setRequestBy('');
                            } else {
                              setShowAddDocInput(false);
                              setRequestBy(val);
                            }
                          }}
                          className="w-full bg-white border border-slate-200 rounded-xl px-2.5 py-1 font-bold focus:outline-none text-xs text-slate-800"
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
                          {Array.from(new Set(consults.map(c => String(c.RequestBy || '')))).filter(d => d && !staffList.some(s => getShortStaffName(s.StaffName, staffList) === d)).map(d => (
                            <option key={d} value={d}>{d}</option>
                          ))}
                          <option value="ADD_NEW" className="text-rose-600 font-bold">+ Thêm bác sĩ mới...</option>
                        </select>

                        {showAddDocInput && (
                          <div className="mt-1 flex gap-1 animate-in slide-in-from-top-1 duration-150">
                            <input
                              type="text"
                              required
                              placeholder="Họ tên bác sĩ mới..."
                              value={customDocVal}
                              onChange={(e) => {
                                setCustomDocVal(e.target.value);
                              }}
                              className="flex-1 bg-white border border-indigo-200 rounded-lg px-2 py-1 text-xs font-bold focus:outline-none"
                            />
                            <button
                              type="button"
                              onClick={() => {
                                setShowAddDocInput(false);
                                setCustomDocVal('');
                              }}
                              className="text-slate-400 hover:text-red-500 text-[10px] font-bold"
                            >
                              Xóa
                            </button>
                          </div>
                        )}
                      </div>

                      <div>
                        <label className="block text-slate-500 font-bold text-[9px] uppercase mb-0.5">Khoa nội trú *</label>
                        <select
                          required={!showAddDeptInput}
                          value={showAddDeptInput ? 'ADD_NEW' : department}
                          onChange={(e) => {
                            const val = e.target.value;
                            if (val === 'ADD_NEW') {
                              setShowAddDeptInput(true);
                              setDepartment('');
                            } else {
                              setShowAddDeptInput(false);
                              setDepartment(val);
                            }
                          }}
                          className="w-full bg-white border border-slate-200 rounded-xl px-2.5 py-1 font-semibold focus:outline-none text-xs text-slate-800"
                        >
                          <option value="">-- Chọn khoa --</option>
                          {DEFAULT_DEPARTMENTS.map(d => (
                            <option key={d} value={d}>{d}</option>
                          ))}
                          {Array.from(new Set(consults.map(c => String(c.Department || '')))).filter(d => d && !DEFAULT_DEPARTMENTS.includes(d)).map(d => (
                            <option key={d} value={d}>{d}</option>
                          ))}
                          <option value="ADD_NEW" className="text-rose-600 font-bold">+ Thêm khoa mới...</option>
                        </select>

                        {showAddDeptInput && (
                          <div className="mt-1 flex gap-1 animate-in slide-in-from-top-1 duration-150">
                            <input
                              type="text"
                              required
                              placeholder="Tên khoa mới..."
                              value={customDeptVal}
                              onChange={(e) => {
                                setCustomDeptVal(e.target.value);
                              }}
                              className="flex-1 bg-white border border-indigo-200 rounded-lg px-2 py-1 text-xs font-bold focus:outline-none"
                            />
                            <button
                              type="button"
                              onClick={() => {
                                setShowAddDeptInput(false);
                                setCustomDeptVal('');
                              }}
                              className="text-slate-400 hover:text-red-500 text-[10px] font-bold"
                            >
                              Xóa
                            </button>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="pb-0.5">
                      <label className="block text-slate-500 font-bold text-[9px] uppercase mb-0.5">Thành viên duyệt hội chẩn <span className="text-red-500">*</span></label>
                      <SearchableEnumSelect
                        multiple
                        required
                        options={[
                          ...staffList.map(s => getShortStaffName(s.StaffName, staffList)),
                          ...Array.from(new Set(consults.flatMap(c => Array.isArray(c.ConsultMember) ? c.ConsultMember : String(c.ConsultMember || '').split(',').map(s => s.trim()).filter(Boolean))))
                        ]}
                        values={consultMembers}
                        onMultiChange={(members) => setConsultMembers(members)}
                        placeholder="-- Bấm hoặc tìm để chọn bác sĩ --"
                        searchPlaceholder="Gõ tìm bác sĩ..."
                        direction="up"
                      />
                    </div>

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
                      <textarea
                        rows={2}
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
                      <textarea
                        rows={2}
                        required
                        placeholder="Nhập phác đồ, chi tiết kết quả hoặc phương án xử trí chi tiết của hội đồng..."
                        value={detailConsultResult}
                        onChange={(e) => setDetailConsultResult(e.target.value)}
                        className="w-full bg-white border border-slate-200 rounded-xl px-2.5 py-1 font-semibold text-xs focus:outline-none text-slate-800 min-h-[50px]"
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
                      textareaClassName="w-full h-[46px] bg-white border border-slate-200 rounded-xl px-2.5 py-1 font-bold focus:outline-none text-xs text-slate-800 font-mono resize-y"
                    />

                    <div>
                      <label className="block text-slate-500 font-bold text-[9px] uppercase mb-0.5">Dự trù kinh phí (VNĐ)</label>
                      <input
                        type="text"
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

    </div>
  );
}

// Global submit function implementation matching layout
async function handleCombinedSubmit(this: any) {
  // Done inside component context inline
}
