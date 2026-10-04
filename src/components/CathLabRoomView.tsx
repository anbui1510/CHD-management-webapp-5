import React, { useState, useMemo, useEffect, useRef, useCallback, startTransition } from 'react';
import { Patient, Consult, Staff, CathLab, Source, findPatientByKey, formatVNTime, removeDiacritics, normalizePatientKey } from '../types';
import { Search, Plus, Undo2, Stethoscope, Save, Archive, Ban, CalendarDays, Activity, ArrowUpDown, X, User, AlertTriangle } from 'lucide-react';
import { SOURCE_CATH_METHOD, SOURCE_PROVINCE, getSourceDiagnosisOptions, normalizeDiagnosisID, getSourceProvinceOptions, getSourceCathMethodOptions } from '../data/source';
import { SearchableEnumSelect } from './SearchableEnumSelect';
import { VNDateInput } from './VNDateInput';
import { SortColumnIcon } from './SortColumnIcon';
import { SearchTextInput } from './SearchTextInput';
import { MobileAutoExpandTextarea } from './MobileAutoExpandTextarea';
import { useSheetsSyncFeedback } from '../context/SheetsSyncFeedbackContext';
import { buildSyncContext, persistWithSheetsSync, withSyncContext } from '../utils/sheetsSyncMutation';
import {
  REPEAT_INTERVENTION_WARNING,
  createRepeatInterventionWorkflow,
  isRepeatInterventionPlan,
} from '../utils/repeatInterventionConsult';
import { MODAL_TITLE } from '../utils/modalTitles';
import { useViewSubheader } from '../hooks/useViewSubheader';
import { useIsMobile } from '../hooks/useMediaQuery';
import { getViewSubheaderTitle } from '../config/viewSubheaderTitles';
import { getFormattedDateKey } from '../utils/patientFormValidation';
import { compareByPatientSearchScore, matchesPatientIdentitySearch } from '../utils/listSearch';
import {
  buildEmergProgCaseAScar,
  buildEmergProgCaseBHieuScar,
  buildEmergProgCaseBTaiScar,
  buildEmergProgCaseCScar,
} from '../utils/workflowMessages';

interface Props {
  patients: Patient[];
  consults: Consult[];
  cathlabs: CathLab[];
  sources: Source[];
  staffList: Staff[];
  onRefreshData: (force?: boolean) => void;
  triggerAlert: (msg: string, title?: string) => void;
  triggerConfirm: (msg: string, onConfirm: () => void, title?: string) => void;
  onViewPatientRecord: (pat: Patient) => void;
  onPatchConsult?: (consultKey: string, patch: Partial<Consult>) => void;
  onPatchCathlab?: (cathKey: string, patch: Partial<CathLab>) => void;
  onAddCathlab?: (cath: CathLab) => void;
  onAddConsult?: (consult: Consult) => void;
  onAddPatient?: (patient: Patient) => void;
  onSaveSuccess?: (message: string) => void;
}

const CATH_METHODS_SPECIAL = [
  "Đặt stent Động Mạch Thận", 
  "Đặt stent Ống Động Mạch", 
  "Đặt máy tạo nhịp", 
  "Nong mạch/đặt stent mạch các loại"
];

const SCHEDULING_ELIGIBLE_RESULTS = [
  'Can thiệp thông tim',
  'Chụp chẩn đoán +/- can thiệp',
  'Chụp chẩn đoán-Đo kháng lực',
  'Chụp chẩn đoán/Đo kháng lực',
  'Tiền Glenn',
  'Tiền Fontan',
  'Điện sinh lý'
];

const buildLatestConsultsMap = (consults: Consult[]) => {
  const map = new Map<string, string>();
  const sorted = [...consults].sort((a, b) => {
    const aDate = a.ConsultDate || '';
    const bDate = b.ConsultDate || '';
    if (aDate !== bDate) return bDate.localeCompare(aDate);
    return (b.ConsultCreateTime || '').localeCompare(a.ConsultCreateTime || '');
  });
  sorted.forEach(c => {
    if (!c.PatientKey) return;
    const patientKey = normalizePatientKey(c.PatientKey);
    if (!map.has(patientKey)) map.set(patientKey, c.ConsultKey);
  });
  return map;
};

const isConsultInSchedulingWaitlist = (
  c: Consult,
  latestMap: Map<string, string>,
  patients: Patient[]
) => {
  const normalized = normalizePatientKey(c.PatientKey);
  if (!normalized || latestMap.get(normalized) !== c.ConsultKey) return false;
  if (!c.ConsultDate) return false;

  const isRemoved = c.Removed === true
    || String(c.Removed).toUpperCase() === 'TRUE'
    || String(c.Removed).toLowerCase() === 'có'
    || String(c.Removed).toLowerCase() === 'yes';
  if (isRemoved) return false;

  const isTransferred = c.TransferredToCathLab === true
    || String(c.TransferredToCathLab).trim().toLowerCase() === 'true'
    || String(c.TransferredToCathLab).trim().toLowerCase() === 'yes'
    || String(c.TransferredToCathLab).trim().toLowerCase() === 'có';
  if (isTransferred) return false;

  const resID = (c.ConsultResultID || '').trim();
  const normalizedResults = SCHEDULING_ELIGIBLE_RESULTS.map(e => e.trim().toLowerCase());
  const matchRes = SCHEDULING_ELIGIBLE_RESULTS.includes(resID)
    || normalizedResults.includes(resID.toLowerCase());
  if (!matchRes) return false;

  const callSt = String(c.CallStatus || '').trim().toLowerCase();
  if (
    callSt === 'đã can thiệp/mổ'
    || callSt === 'loại'
    || callSt === 'đã làm nơi khác'
    || callSt === 'muốn theo dõi nơi khác'
  ) return false;

  const pat = findPatientByKey(patients, c.PatientKey);
  if (!pat) return false;

  const pOut = String(pat.Outcome || '').toLowerCase().trim();
  if (pOut === 'tử vong' || pOut === 'nặng xin về') return false;

  return true;
};

const getSchedulingWaitlistConsult = (
  patientKey: string,
  consults: Consult[],
  patients: Patient[]
): Consult | undefined => {
  const latestMap = buildLatestConsultsMap(consults);
  const normalized = normalizePatientKey(patientKey);
  if (!normalized) return undefined;
  const latestKey = latestMap.get(normalized);
  if (!latestKey) return undefined;
  const consult = consults.find(c => String(c.ConsultKey || '').trim().toLowerCase() === String(latestKey || '').trim().toLowerCase());
  if (!consult || !isConsultInSchedulingWaitlist(consult, latestMap, patients)) return undefined;
  return consult;
};

/**
 * Returns the consult that is already queued in the CathLab room (TransferredToCathLab=true, no cath result yet)
 * for the given patientKey. Used to prevent PTV from accidentally creating duplicate ad-hoc records.
 */
const getPatientPendingCathLabConsult = (
  patientKey: string,
  consults: Consult[],
  cathlabs: CathLab[]
): Consult | undefined => {
  const normalized = normalizePatientKey(patientKey);
  if (!normalized) return undefined;
  return consults.find(c => {
    if (normalizePatientKey(c.PatientKey) !== normalized) return false;
    const transferred = c.TransferredToCathLab === true
      || String(c.TransferredToCathLab).trim().toLowerCase() === 'true'
      || String(c.TransferredToCathLab).trim().toLowerCase() === 'yes'
      || String(c.TransferredToCathLab).trim().toLowerCase() === 'có';
    if (!transferred) return false;
    const isRemoved = c.Removed === true
      || String(c.Removed).toUpperCase() === 'TRUE'
      || String(c.Removed).toLowerCase() === 'có'
      || String(c.Removed).toLowerCase() === 'yes';
    if (isRemoved) return false;
    // Only counts if no cath result has been recorded yet
    if (cathLabHasConsultKey(cathlabs, c.ConsultKey)) return false;
    return true;
  });
};

const parseCathMethods = (methodStr: any): string[] => {
  if (Array.isArray(methodStr)) return methodStr.map(String);
  if (typeof methodStr !== 'string' || !methodStr) return [];
  
  if (methodStr.includes('+')) {
    return methodStr.split('+').map(s => s.trim()).filter(Boolean);
  }
  
  const trimmed = methodStr.trim();
  return trimmed ? [trimmed] : [];
};

const INIT_CATHLAB: Partial<CathLab> = {
  CathDate: '',
  PostDiagnosisID: '',
  PostDiagnosis: '',
  CathResultID: 'Thành công',
  CathMethod: [],
  CathPlan: 'Tái khám thường',
  CathNote: '',
  _1stInterventionist: '',
  _2ndInterventionist: '',
  _3rdInterventionist: '',
  _4thInterventionist: '',
  PlannedFollowUpDate: ''
};

const removeVietnameseTones = (str: any): string => {
  return removeDiacritics(str);
};

const normalizeRefKey = (value: any): string =>
  String(value ?? '').trim().toLowerCase();

const hasConsultResult = (consult: Consult) => {
  const result = String(consult.ConsultResultID || '').trim().toLowerCase();
  return !!result && !['nodata', 'no data', '-', '—'].includes(result);
};

const isTransferredToCathLab = (consult: Consult) =>
  consult.TransferredToCathLab === true ||
  String(consult.TransferredToCathLab || '').trim().toLowerCase() === 'true' ||
  String(consult.TransferredToCathLab || '').trim().toLowerCase() === 'yes' ||
  String(consult.TransferredToCathLab || '').trim().toLowerCase() === 'có';

const cathLabHasConsultKey = (cathlabs: CathLab[], consultKey: any): boolean => {
  const normalizedConsultKey = normalizeRefKey(consultKey);
  if (!normalizedConsultKey) return false;
  return cathlabs.some(cath => normalizeRefKey(cath.ConsultKey) === normalizedConsultKey);
};

type PendingSortField = 'name' | 'dob' | 'diagnosis' | 'date' | 'ptv';
type DoneSortField = 'name' | 'dob' | 'postDiagnosis' | 'postDiagnosisText' | 'method' | 'date' | 'ptv';

const PLANS_REQUIRING_FOLLOW_UP = ['Theo dõi sát', 'Cần thông tim can thiệp lại'];

const suggestCathPlanFromMethods = (methods: string[]): string => {
  const hasSpecial = methods.some(method => CATH_METHODS_SPECIAL.includes(method));
  return hasSpecial ? 'Theo dõi sát' : 'Tái khám thường';
};

const buildCathFormSnapshot = (data: Partial<CathLab>, note: string): string =>
  JSON.stringify({
    CathDate: data.CathDate || '',
    PostDiagnosisID: data.PostDiagnosisID || '',
    PostDiagnosis: data.PostDiagnosis || '',
    CathResultID: data.CathResultID || '',
    CathMethod: parseCathMethods(data.CathMethod).slice().sort().join(' + '),
    CathPlan: data.CathPlan || '',
    CathNote: data.CathNote || '',
    _1stInterventionist: data._1stInterventionist || '',
    _2ndInterventionist: data._2ndInterventionist || '',
    _3rdInterventionist: data._3rdInterventionist || '',
    _4thInterventionist: data._4thInterventionist || '',
    PlannedFollowUpDate: data.PlannedFollowUpDate || '',
    callNote: note
  });

export default function CathLabRoomView({ patients, consults, cathlabs, sources, staffList, onRefreshData, triggerAlert, triggerConfirm, onViewPatientRecord, onPatchConsult, onPatchCathlab, onAddCathlab, onAddConsult, onAddPatient, onSaveSuccess }: Props) {
  const { reportMutationResponse } = useSheetsSyncFeedback();
  // Tabs
  const [activeTab, setActiveTab] = useState<'pending' | 'done'>('pending');
  const [searchTerm, setSearchTerm] = useState('');
  const [pendingSortField, setPendingSortField] = useState<PendingSortField>('date');
  const [pendingSortOrder, setPendingSortOrder] = useState<'asc' | 'desc'>('asc');
  const [doneSortField, setDoneSortField] = useState<DoneSortField>('date');
  const [doneSortOrder, setDoneSortOrder] = useState<'asc' | 'desc'>('asc');
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 50;

  useEffect(() => {
    setCurrentPage(1);
  }, [activeTab, searchTerm]);
  const diagnosisOptions = useMemo(() => getSourceDiagnosisOptions(sources), [sources]);
  const provinceOptions = useMemo(() => getSourceProvinceOptions(sources), [sources]);
  const cathMethodOptions = useMemo(() => getSourceCathMethodOptions(sources), [sources]);

  const createDiagnosisSource = async (DiagnosisID: string) => {
    const trimmed = normalizeDiagnosisID(DiagnosisID);
    if (!trimmed) return;

    await persistWithSheetsSync(
      reportMutationResponse,
      '/api/sources',
      { method: 'POST', body: JSON.stringify({ DiagnosisID: trimmed }) },
      buildSyncContext('cathlab-room', { viewLabel: 'Phòng thông tim' }),
      { baseMessage: 'Đã thêm mã chẩn đoán vào danh mục' }
    );

    onRefreshData();
  };
  
  // Data prep
  const patientsByKey = useMemo(() => {
    const map = new Map<string, Patient>();
    patients.forEach((patient) => {
      const key = normalizePatientKey(patient.PatientKey);
      if (key) map.set(key, patient);
      const id1 = String(patient.PatientID1 || '').trim().toLowerCase();
      if (id1 && !map.has(id1)) map.set(id1, patient);
    });
    return map;
  }, [patients]);

  const getPatientCached = useCallback(
    (patientKey?: string) => {
      const key = normalizePatientKey(patientKey);
      if (!key) return undefined;
      return patientsByKey.get(key) || patientsByKey.get(String(patientKey).trim().toLowerCase());
    },
    [patientsByKey]
  );

  const pendingBase = useMemo(() => {
    return consults
      .filter((c) => {
        const transferred = c.TransferredToCathLab === true || String(c.TransferredToCathLab).trim().toLowerCase() === 'true';
        return transferred && !c.Removed && !cathLabHasConsultKey(cathlabs, c.ConsultKey);
      })
      .map((c) => {
        const p = getPatientCached(c.PatientKey);
        return {
          consult: c,
          patient: p,
          nameKey: removeVietnameseTones(String(p?.PatientName || '')).toLowerCase(),
          id1Key: String(p?.PatientID1 || '').toLowerCase(),
          id2Key: String(p?.PatientID2 || '').toLowerCase(),
          diagKey: removeVietnameseTones(String(c.DiagnosisID || '')).toLowerCase(),
          dobKey: getFormattedDateKey(p?.PatientDOB),
          dateKey: getFormattedDateKey(c.PlannedCathLabDate) || '9999-99-99',
          ptvKey: removeVietnameseTones(String(c.Scheduled2ndInterventionist || '')).toLowerCase(),
        };
      });
  }, [consults, cathlabs, getPatientCached]);

  const doneBase = useMemo(() => {
    return cathlabs.map((cath) => {
      const p = getPatientCached(cath.PatientKey);
      return {
        cath,
        patient: p,
        nameKey: removeVietnameseTones(String(p?.PatientName || '')).toLowerCase(),
        id1Key: String(p?.PatientID1 || '').toLowerCase(),
        id2Key: String(p?.PatientID2 || '').toLowerCase(),
        postDiagKey: removeVietnameseTones(String(cath.PostDiagnosisID || '')).toLowerCase(),
        postDiagTextKey: removeVietnameseTones(String(cath.PostDiagnosis || '')).toLowerCase(),
        methodKey: removeVietnameseTones(parseCathMethods(cath.CathMethod).join(', ')).toLowerCase(),
        dobKey: getFormattedDateKey(p?.PatientDOB),
        dateKey: getFormattedDateKey(cath.CathDate),
        ptvKey: removeVietnameseTones(String(cath._2ndInterventionist || '')).toLowerCase(),
      };
    });
  }, [cathlabs, getPatientCached]);

  const pendingConsults = useMemo(() => {
    let list = searchTerm.trim()
      ? pendingBase.filter((row) =>
          matchesPatientIdentitySearch(searchTerm, {
            PatientName: row.patient?.PatientName,
            PatientID1: row.patient?.PatientID1,
            PatientID2: row.patient?.PatientID2,
          })
        )
      : pendingBase;

    list = [...list].sort((a, b) => {
      if (searchTerm.trim()) {
        const byScore = compareByPatientSearchScore(
          searchTerm,
          a.patient?.PatientName || '',
          b.patient?.PatientName || '',
          [a.patient?.PatientID1, a.patient?.PatientID2].filter(Boolean) as string[],
          [b.patient?.PatientID1, b.patient?.PatientID2].filter(Boolean) as string[]
        );
        if (byScore !== 0) return byScore;
      }
      let comparison = 0;
      switch (pendingSortField) {
        case 'name':
          comparison = a.nameKey.localeCompare(b.nameKey);
          break;
        case 'dob':
          comparison = a.dobKey.localeCompare(b.dobKey);
          break;
        case 'diagnosis':
          comparison = a.diagKey.localeCompare(b.diagKey);
          break;
        case 'date':
          comparison = a.dateKey.localeCompare(b.dateKey);
          break;
        case 'ptv':
          comparison = a.ptvKey.localeCompare(b.ptvKey);
          break;
      }
      return pendingSortOrder === 'asc' ? comparison : -comparison;
    });

    return list.map((row) => row.consult);
  }, [pendingBase, searchTerm, pendingSortField, pendingSortOrder]);

  const doneCathlabs = useMemo(() => {
    let list = searchTerm.trim()
      ? doneBase.filter((row) =>
          matchesPatientIdentitySearch(searchTerm, {
            PatientName: row.patient?.PatientName,
            PatientID1: row.patient?.PatientID1,
            PatientID2: row.patient?.PatientID2,
          })
        )
      : doneBase;

    list = [...list].sort((a, b) => {
      if (searchTerm.trim()) {
        const byScore = compareByPatientSearchScore(
          searchTerm,
          a.patient?.PatientName || '',
          b.patient?.PatientName || '',
          [a.patient?.PatientID1, a.patient?.PatientID2].filter(Boolean) as string[],
          [b.patient?.PatientID1, b.patient?.PatientID2].filter(Boolean) as string[]
        );
        if (byScore !== 0) return byScore;
      }
      let comparison = 0;
      switch (doneSortField) {
        case 'name':
          comparison = a.nameKey.localeCompare(b.nameKey);
          break;
        case 'dob':
          comparison = a.dobKey.localeCompare(b.dobKey);
          break;
        case 'postDiagnosis':
          comparison = a.postDiagKey.localeCompare(b.postDiagKey);
          break;
        case 'postDiagnosisText':
          comparison = a.postDiagTextKey.localeCompare(b.postDiagTextKey);
          break;
        case 'method':
          comparison = a.methodKey.localeCompare(b.methodKey);
          break;
        case 'date':
          comparison = a.dateKey.localeCompare(b.dateKey);
          break;
        case 'ptv':
          comparison = a.ptvKey.localeCompare(b.ptvKey);
          break;
      }
      return doneSortOrder === 'asc' ? comparison : -comparison;
    });

    return list.map((row) => row.cath);
  }, [doneBase, searchTerm, doneSortField, doneSortOrder]);

  useEffect(() => {
    const q = removeVietnameseTones(searchTerm).toLowerCase().trim();
    if (!q) return;
    const pendingHit = pendingConsults.length > 0;
    const doneHit = doneCathlabs.length > 0;
    if (activeTab === 'pending' && !pendingHit && doneHit) setActiveTab('done');
    else if (activeTab === 'done' && !doneHit && pendingHit) setActiveTab('pending');
  }, [searchTerm, activeTab, pendingConsults.length, doneCathlabs.length]);

  const totalPages = Math.max(1, Math.ceil(doneCathlabs.length / ITEMS_PER_PAGE));
  const paginatedDoneCathlabs = useMemo(() => {
    return doneCathlabs.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);
  }, [doneCathlabs, currentPage]);

  const [selectedPending, setSelectedPending] = useState<{c: Consult, p: Patient} | null>(null);
  const [selectedDone, setSelectedDone] = useState<{p: Patient, cath: CathLab} | null>(null);
  const [isAdHocModalOpen, setIsAdHocModalOpen] = useState(false);
  const [adHocMobileMenuOpen, setAdHocMobileMenuOpen] = useState(false);
  const adHocMobileMenuRef = useRef<HTMLDivElement>(null);
  const isMobile = useIsMobile();

  // Form State
  const [formData, setFormData] = useState<Partial<CathLab>>(INIT_CATHLAB);
  const [callNote, setCallNote] = useState('');
  const [formSnapshot, setFormSnapshot] = useState<string | null>(null);
  const [exitConfirmOpen, setExitConfirmOpen] = useState(false);
  const [pendingExitAction, setPendingExitAction] = useState<(() => void) | null>(null);
  const [exitConfirmError, setExitConfirmError] = useState('');
  const [saving, setSaving] = useState(false);
  const cathPlanManuallySetRef = useRef(false);

  // AdHoc State
  const [adHocPatientMode, setAdHocPatientMode] = useState<'existing' | 'new'>('existing');
  const [adHocPriorityOrder, setAdHocPriorityOrder] = useState<'Cấp cứu' | 'Chương trình'>('Cấp cứu');
  const [adHocSearchQuery, setAdHocSearchQuery] = useState('');
  const [adHocSelectedPatientKey, setAdHocSelectedPatientKey] = useState('');
  const [adHocSearchHasFocus, setAdHocSearchHasFocus] = useState(false);
  const [adHocPatientID1, setAdHocPatientID1] = useState('');
  const [adHocPatientID2, setAdHocPatientID2] = useState('');
  const [adHocPatientName, setAdHocPatientName] = useState('');
  const [adHocPatientDOB, setAdHocPatientDOB] = useState('');
  const [adHocPatientSex, setAdHocPatientSex] = useState<'Nam'|'Nữ'>('Nam');
  const [adHocPatientAddress, setAdHocPatientAddress] = useState('');
  const [adHocPatientPhone1, setAdHocPatientPhone1] = useState('');
  const [adHocPatientPhone2, setAdHocPatientPhone2] = useState('');

  let loggedInStaffId = localStorage.getItem('CurrentStaffKey') || '';
  if (loggedInStaffId.trim().startsWith('{')) {
    try {
      const parsed = JSON.parse(loggedInStaffId);
      loggedInStaffId = parsed.StaffKey || '';
    } catch (e) {
      // ignore
    }
  }
  const loggedInStaff = staffList.find(s => s.StaffKey === loggedInStaffId);
  const loggedInStaffNameShort = loggedInStaff ? (['bs', 'bs.', 'pgs', 'gs', 'th.s', 'ths', 'pgs.ts', 'gs.ts'].includes(loggedInStaff.StaffName.split(' ')[0].toLowerCase()) ? loggedInStaff.StaffName : `BS. ${loggedInStaff.StaffName.split(' ').pop()}`) : '';
  
  const openPendingForm = (c: Consult, p: Patient) => {
    cathPlanManuallySetRef.current = false;
    const initial = {
      ...INIT_CATHLAB,
      CathDate: new Date().toISOString().split('T')[0],
      PostDiagnosisID: c.DiagnosisID || '',
      PostDiagnosis: c.DetailDiagnosis || '',
      CathMethod: parseCathMethods(c.CathMethod),
      _1stInterventionist: c.Scheduled1stInterventionist || '',
      _2ndInterventionist: c.Scheduled2ndInterventionist || loggedInStaffNameShort || '',
      _3rdInterventionist: c.Scheduled3rdInterventionist || ''
    };
    setSelectedPending({c, p});
    setFormData(initial);
    setCallNote('');
    setFormSnapshot(buildCathFormSnapshot(initial, ''));
  };

  const openDoneForm = (cath: CathLab) => {
    const p = findPatientByKey(patients, cath.PatientKey);
    
    if(p) {
      cathPlanManuallySetRef.current = true;
      const initial = {
        ...cath,
        CathMethod: parseCathMethods(cath.CathMethod)
      };
      setSelectedDone({p, cath});
      try {
        setFormData(initial);
        setFormSnapshot(buildCathFormSnapshot(initial, ''));
      } catch (err) {
        console.error("Error setting form data:", err);
      }
    }
  };

  const forceCloseModal = () => {
    cathPlanManuallySetRef.current = false;
    setSelectedPending(null);
    setSelectedDone(null);
    setIsAdHocModalOpen(false);
    setAdHocMobileMenuOpen(false);
    setAdHocPriorityOrder('Cấp cứu');
    setFormSnapshot(null);
  };

  const hasUnsavedChanges = () => {
    if (!formSnapshot || (!selectedPending && !selectedDone)) return false;
    return buildCathFormSnapshot(formData, callNote) !== formSnapshot;
  };

  const requestCloseModal = (onClose?: () => void) => {
    const close = onClose || forceCloseModal;
    if ((selectedPending || selectedDone) && hasUnsavedChanges()) {
      setExitConfirmError('');
      setPendingExitAction(() => close);
      setExitConfirmOpen(true);
      return;
    }
    close();
  };

  const closeModal = () => requestCloseModal();

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

  const openAdHocForm = useCallback(
    (priority: 'Cấp cứu' | 'Chương trình' = 'Cấp cứu') => {
      cathPlanManuallySetRef.current = false;
      setFormData({
        ...INIT_CATHLAB,
        CathDate: new Date().toISOString().split('T')[0],
        _1stInterventionist: '',
        _2ndInterventionist: loggedInStaffNameShort || '',
        _3rdInterventionist: ''
      });
      setAdHocPatientMode('existing');
      setAdHocSearchQuery('');
      setAdHocSelectedPatientKey('');
      setAdHocPatientID1('');
      setAdHocPatientID2('');
      setAdHocPatientName('');
      setAdHocPatientDOB('');
      setAdHocPatientAddress('');
      setAdHocPatientPhone1('');
      setAdHocPatientPhone2('');
      setAdHocPriorityOrder(priority);
      setAdHocMobileMenuOpen(false);
      setIsAdHocModalOpen(true);
    },
    [loggedInStaffNameShort]
  );

  useEffect(() => {
    if (!adHocMobileMenuOpen) return;
    const onPointerDown = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node;
      if (adHocMobileMenuRef.current?.contains(target)) return;
      setAdHocMobileMenuOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('touchstart', onPointerDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('touchstart', onPointerDown);
    };
  }, [adHocMobileMenuOpen]);

  const activateEmergencyTransferFromScheduling = async (consult: Consult, patient: Patient) => {
    const today = new Date().toISOString().split('T')[0];
    const payload = {
      CheckDevice: 'Đủ' as const,
      CallStatus: 'Đồng ý',
      PlannedCathLabDate: today,
      TransferredToCathLab: true,
      PriorityOrder: 'Cấp cứu' as const,
      CheckDeviceUpdatedBy: loggedInStaffId,
      CheckDeviceUpdatedTime: new Date().toISOString()
    };

    onPatchConsult?.(consult.ConsultKey, payload);

    const mergedConsult: Consult = { ...consult, ...payload };
    setIsAdHocModalOpen(false);
    setAdHocSelectedPatientKey('');
    setAdHocSearchQuery('');
    setActiveTab('pending');
    openPendingForm(mergedConsult, patient);

    persistWithSheetsSync(
      reportMutationResponse,
      `/api/consults/${consult.ConsultKey}`,
      { method: 'PUT', body: JSON.stringify(payload) },
      buildSyncContext('cathlab-room', { patientName: patient?.PatientName, patientKey: consult.PatientKey }),
      { baseMessage: 'Đã chuyển phòng thông tim cấp cứu' }
    )
      .then(() => onRefreshData())
      .catch(err => {
        console.error(err);
        triggerAlert(err instanceof Error ? err.message : 'Không thể chuyển phòng thông tim. Vui lòng thử lại.', MODAL_TITLE.saveError);
        onRefreshData();
      });
  };

  const handleAdHocPatientSelect = (patient: Patient) => {
    // TH(2) — Check 1: BN đang chờ trong Danh sách chờ TT (đã chuyển phòng, chưa có kết quả)
    const pendingCathConsult = getPatientPendingCathLabConsult(patient.PatientKey, consults, cathlabs);
    if (pendingCathConsult) {
      triggerConfirm(
        `BN "${patient.PatientName}" đang có trong danh sách chờ thông tim phòng cathlab. Bạn có muốn mở phiếu kết quả của BN này thay vì tạo mới?`,
        () => {
          setIsAdHocModalOpen(false);
          setAdHocSelectedPatientKey('');
          setAdHocSearchQuery('');
          setActiveTab('pending');
          openPendingForm(pendingCathConsult, patient);
        },
        'BN đã trong danh sách chờ TT'
      );
      return;
    }

    setAdHocSelectedPatientKey(patient.PatientKey);
    setAdHocPatientName(patient.PatientName);
    setAdHocSearchQuery('');
  };

  const saveAdHocCathLab = async () => {
     const safeCathMethod = parseCathMethods(formData.CathMethod);
     if (!formData.CathDate || !formData.PostDiagnosisID || !formData.CathResultID || safeCathMethod.length === 0 || !formData.CathPlan || !formData._1stInterventionist || !formData._2ndInterventionist) {
        triggerAlert('Vui lòng điền đầy đủ các thông tin bắt buộc (*)', MODAL_TITLE.missingInfo);
        return;
     }
     
     if (adHocPatientMode === 'existing' && !adHocSelectedPatientKey) {
        triggerAlert('Vui lòng chọn bệnh nhân.', MODAL_TITLE.missingInfo);
        return;
     }

     if (adHocPatientMode === 'existing' && adHocSelectedPatientKey) {
        const patient = findPatientByKey(patients, adHocSelectedPatientKey);

        // TH(2) — Khi Lưu: check BN đã có trong danh sách chờ TT phòng cathlab (đã chuyển phòng, chưa có kết quả)
        const pendingCathConsult = getPatientPendingCathLabConsult(adHocSelectedPatientKey, consults, cathlabs);
        if (pendingCathConsult && patient) {
          triggerConfirm(
            `BN "${patient.PatientName}" đang có trong danh sách chờ thông tim. Mở phiếu kết quả của BN này thay vì tạo hồ sơ cấp cứu mới?`,
            () => {
              setIsAdHocModalOpen(false);
              setAdHocSelectedPatientKey('');
              setActiveTab('pending');
              openPendingForm(pendingCathConsult, patient);
            },
            'BN đã trong danh sách chờ TT'
          );
          return;
        }
     }

     if (adHocPatientMode === 'new' && (!adHocPatientID1 || !adHocPatientName || !adHocPatientDOB || !adHocPatientAddress)) {
        triggerAlert('Vui lòng điền đầy đủ thông tin hành chính bệnh nhân.', MODAL_TITLE.missingInfo);
        return;
     }

     const cathKey = `cath_${Date.now()}`;
     const patientKey = adHocPatientMode === 'existing' ? adHocSelectedPatientKey : `pat_${Date.now()}`;

     let pName = adHocPatientName;
     let existingPat: Patient | undefined = undefined;
     if (adHocPatientMode === 'existing') {
        existingPat = findPatientByKey(patients, patientKey);
        if (existingPat) pName = existingPat.PatientName;
     }

     // Determine workflow case & perform scarring if priority order is 'Chương trình'
     let latestConsult: Consult | undefined = undefined;
     let consultCase: 'A' | 'B' | 'C' = 'A';

     if (adHocPatientMode === 'existing') {
       const patientConsults = consults.filter(c => normalizePatientKey(c.PatientKey) === normalizePatientKey(patientKey) && !c.Removed);
       if (patientConsults.length > 0) {
         // Sort descending by ConsultDate
         latestConsult = [...patientConsults].sort((a, b) => String(b.ConsultDate || '').localeCompare(String(a.ConsultDate || '')))[0];
         if (latestConsult) {
           if (!hasConsultResult(latestConsult)) {
             consultCase = 'B'; // Treo ở Chờ hội chẩn
           } else if (!isTransferredToCathLab(latestConsult)) {
             consultCase = 'C'; // Treo ở Xếp lịch
           }
         }
       }
     }

     const consultKey = (consultCase === 'B' || consultCase === 'C') && latestConsult ? latestConsult.ConsultKey : `consult_${Date.now()}`;

     const cathPayload: CathLab = {
       ...formData,
       CathKey: cathKey,
       ConsultKey: consultKey,
       PatientKey: patientKey,
       CathMethod: safeCathMethod.join(' + ')
     } as CathLab;

     // Setup consult payload
     let consultPayload: Consult;
     if ((consultCase === 'B' || consultCase === 'C') && latestConsult) {
       if (consultCase === 'B') {
         consultPayload = {
           ...latestConsult,
           ConsultResultID: 'Can thiệp thông tim' as const,
           DetailConsultResult: 'Tự động hoàn tất hội chẩn do làm chương trình vượt cấp cứu',
           ConsultResultUpdatedBy: loggedInStaffId || 'SYSTEM',
           ConsultResultUpdatedTime: new Date().toISOString(),
           CallStatus: 'Đã can thiệp/mổ',
           PlannedCathLabDate: formData.CathDate,
           TransferredToCathLab: true,
           CathMethod: safeCathMethod.join(' + '),
           Scheduled1stInterventionist: formData._1stInterventionist,
           Scheduled2ndInterventionist: formData._2ndInterventionist,
           Scheduled3rdInterventionist: formData._3rdInterventionist,
           CheckDevice: 'Đủ' as const,
           PriorityOrder: 'Chương trình' as const,
           CheckDeviceUpdatedBy: loggedInStaffId || 'SYSTEM',
           CheckDeviceUpdatedTime: new Date().toISOString()
         };
       } else {
         consultPayload = {
           ...latestConsult,
           TransferredToCathLab: true,
           PlannedCathLabDate: formData.CathDate,
           CallStatus: 'Đã can thiệp/mổ',
           CheckDevice: 'Đủ' as const,
           Scheduled1stInterventionist: formData._1stInterventionist,
           Scheduled2ndInterventionist: formData._2ndInterventionist,
           Scheduled3rdInterventionist: formData._3rdInterventionist,
           CheckDeviceUpdatedBy: loggedInStaffId || 'SYSTEM',
           CheckDeviceUpdatedTime: new Date().toISOString(),
           PriorityOrder: 'Chương trình' as const
         };
       }
     } else {
       consultPayload = {
         ConsultKey: consultKey,
         PatientKey: patientKey,
         ConsultType: 'Staff thông',
         ConsultDate: formData.CathDate,
         RequestBy: loggedInStaff?.StaffName || '',
         DiagnosisID: formData.PostDiagnosisID,
         DetailDiagnosis: formData.PostDiagnosis,
         ConsultCreateBy: loggedInStaffId,
         ConsultCreateTime: new Date().toISOString(),
         ConsultResultID: 'Can thiệp thông tim',
         DetailConsultResult: 'Tạo mới thông tim chương trình vượt HC',
         PriorityOrder: adHocPriorityOrder,
         PlannedCathLabDate: formData.CathDate,
         TransferredToCathLab: true,
         Scheduled1stInterventionist: formData._1stInterventionist,
         Scheduled2ndInterventionist: formData._2ndInterventionist,
         Scheduled3rdInterventionist: formData._3rdInterventionist,
         CheckDevice: 'Đủ' as const
       } as Consult;
     }

     // Build workflow marks if Programme (Chương trình) is selected
     const marksToCreate: any[] = [];
     if (adHocPriorityOrder === 'Chương trình') {
       const bsHieu = staffList?.find(s => {
         const name = removeVietnameseTones(s.Name || '').toLowerCase();
         const staffName = removeVietnameseTones(s.StaffName || '').toLowerCase();
         return name.includes('hieu') || staffName.includes('hieu');
       });
       const bsTai = staffList?.find(s => {
         const name = removeVietnameseTones(s.Name || '').toLowerCase();
         const staffName = removeVietnameseTones(s.StaffName || '').toLowerCase();
         return name.includes('tai') || staffName.includes('tai');
       });

       const keyHieu = bsHieu?.StaffKey || '01541';
       const nameHieu = bsHieu?.StaffName || 'BS. Hiếu';

       const keyTai = bsTai?.StaffKey || '01442';
       const nameTai = bsTai?.StaffName || 'BS. Tài';

       const patientIdVal = adHocPatientMode === 'existing' ? (existingPat?.PatientID1 || '') : adHocPatientID1;
       const diagnosisID = String(formData.PostDiagnosisID || latestConsult?.DiagnosisID || '').trim();

       if (consultCase === 'A') {
         const scar = buildEmergProgCaseAScar({ patientName: pName, diagnosisID });
         marksToCreate.push({
           MarkKey: `mark_emerg_prog_${Date.now()}_hieu`,
           StaffKey: keyHieu,
           StaffName: nameHieu,
           MarkType: 'scheduler_missing_transfer',
           Score: 1,
           Label: scar.label,
           Reason: scar.reason,
           RelatedEntityType: 'Patient',
           RelatedEntityKey: patientKey,
           PatientKey: patientKey,
           PatientID: patientIdVal,
           PatientName: pName,
           DedupKey: `emerg_prog_hieu:${patientKey}`,
           CreatedBy: loggedInStaffId || 'SYSTEM',
           CreatedTime: new Date().toISOString()
         });
       } else if (consultCase === 'B' && latestConsult) {
         const scarTai = buildEmergProgCaseBTaiScar({ patientName: pName, diagnosisID });
         marksToCreate.push({
           MarkKey: `mark_emerg_prog_${Date.now()}_tai`,
           StaffKey: keyTai,
           StaffName: nameTai,
           MarkType: 'missing_staff_result',
           Score: 1,
           Label: scarTai.label,
           Reason: scarTai.reason,
           RelatedEntityType: 'Consult',
           RelatedEntityKey: latestConsult.ConsultKey,
           PatientKey: patientKey,
           PatientID: patientIdVal,
           PatientName: pName,
           DedupKey: `emerg_prog_tai:${latestConsult.ConsultKey}`,
           CreatedBy: loggedInStaffId || 'SYSTEM',
           CreatedTime: new Date().toISOString()
         });

         const scarHieu = buildEmergProgCaseBHieuScar({ patientName: pName, diagnosisID });
         marksToCreate.push({
           MarkKey: `mark_emerg_prog_${Date.now()}_hieu`,
           StaffKey: keyHieu,
           StaffName: nameHieu,
           MarkType: 'scheduler_missing_transfer',
           Score: 1,
           Label: scarHieu.label,
           Reason: scarHieu.reason,
           RelatedEntityType: 'Consult',
           RelatedEntityKey: latestConsult.ConsultKey,
           PatientKey: patientKey,
           PatientID: patientIdVal,
           PatientName: pName,
           DedupKey: `emerg_prog_hieu:${latestConsult.ConsultKey}`,
           CreatedBy: loggedInStaffId || 'SYSTEM',
           CreatedTime: new Date().toISOString()
         });
       } else if (consultCase === 'C' && latestConsult) {
         const scar = buildEmergProgCaseCScar({ patientName: pName, diagnosisID });
         marksToCreate.push({
           MarkKey: `mark_emerg_prog_${Date.now()}_hieu`,
           StaffKey: keyHieu,
           StaffName: nameHieu,
           MarkType: 'scheduler_missing_transfer',
           Score: 1,
           Label: scar.label,
           Reason: scar.reason,
           RelatedEntityType: 'Consult',
           RelatedEntityKey: latestConsult.ConsultKey,
           PatientKey: patientKey,
           PatientID: patientIdVal,
           PatientName: pName,
           DedupKey: `emerg_prog_hieu:${latestConsult.ConsultKey}`,
           CreatedBy: loggedInStaffId || 'SYSTEM',
           CreatedTime: new Date().toISOString()
         });
       }
     }

     const newPatientObj: Patient = {
       PatientKey: patientKey,
       PatientID1: adHocPatientID1,
       PatientID2: adHocPatientID2,
       PatientName: adHocPatientName,
       PatientDOB: adHocPatientDOB,
       PatientSex: adHocPatientSex,
       PatientAddress: adHocPatientAddress,
       PatientPhone1: adHocPatientPhone1,
       PatientPhone2: adHocPatientPhone2,
       PatientCreateBy: loggedInStaffId,
       PatientCreateTime: new Date().toISOString(),
       Outcome: ''
     } as Patient;

     // Sync React Local State immediately
     if (adHocPatientMode === 'new') {
       onAddPatient?.(newPatientObj);
     }
     if (consultCase === 'A') {
       onAddConsult?.(consultPayload);
     } else {
       onPatchConsult?.(consultPayload.ConsultKey, consultPayload);
     }
     onAddCathlab?.(cathPayload);
     forceCloseModal();

     // Save to database
     const persist = async () => {
       // Declare before the new-patient POST — that branch reads syncContext.
       const syncContext = buildSyncContext('cathlab-room', {
         patientName: adHocPatientName || pName,
         patientKey: patientKey
       });

       if (adHocPatientMode === 'new') {
         await persistWithSheetsSync(
           reportMutationResponse,
           '/api/patients',
           {
             method: 'POST',
             headers: {
               'Content-Type': 'application/json',
               'Authorization': `Bearer ${localStorage.getItem('CHD_AUTH_TOKEN') || ''}`
             },
             body: JSON.stringify(newPatientObj)
           },
           syncContext,
           { baseMessage: 'Đã tạo bệnh nhi mới' }
         );
       }

       // Save consult (either POST for Case A or PUT for Case B/C)
       const consultUrl = consultCase === 'A' ? '/api/consults' : `/api/consults/${consultPayload.ConsultKey}`;
       const consultMethod = consultCase === 'A' ? 'POST' : 'PUT';
       const conRes = await fetch(consultUrl, {
         method: consultMethod,
         headers: { 
           'Content-Type': 'application/json',
           'Authorization': `Bearer ${localStorage.getItem('CHD_AUTH_TOKEN') || ''}`
         },
         body: JSON.stringify(withSyncContext(consultPayload, syncContext))
       });
       if (!conRes.ok) throw new Error('Không thể lưu thông tin hội chẩn/chuyển phòng');
       reportMutationResponse(await conRes.json(), { baseMessage: 'Đã lưu thông tin hội chẩn' });

       // Save CathLab result
       const cathRes = await fetch('/api/cathlabs', {
         method: 'POST',
         headers: { 
           'Content-Type': 'application/json',
           'Authorization': `Bearer ${localStorage.getItem('CHD_AUTH_TOKEN') || ''}`
         },
         body: JSON.stringify(withSyncContext(cathPayload, syncContext))
       });
       if (!cathRes.ok) throw new Error('Không thể lưu kết quả thông tim');
       reportMutationResponse(await cathRes.json(), { baseMessage: 'Đã lưu kết quả thông tim' });

       if (isRepeatInterventionPlan(formData.CathPlan)) {
         const repeatPatient = adHocPatientMode === 'existing'
           ? findPatientByKey(patients, patientKey)
           : newPatientObj;
         await createRepeatInterventionWorkflow({
           patientKey,
           patient: repeatPatient,
           cathDate: formData.CathDate || '',
           postDiagnosisID: formData.PostDiagnosisID || '',
           postDiagnosis: formData.PostDiagnosis || '',
           cathNote: formData.CathNote || '',
           requestBy: loggedInStaff?.StaffName || loggedInStaffNameShort || '',
           loggedInStaffId,
           consults,
           recentlySavedConsults: [consultPayload],
           staffList,
           reportMutationResponse,
           onSaveSuccess,
           onAddConsult,
         });
       }

       // Save scars if any
       for (const mark of marksToCreate) {
         try {
           await persistWithSheetsSync(
             reportMutationResponse,
             '/api/doctor-performance-marks',
             {
               method: 'POST',
               headers: { Authorization: `Bearer ${localStorage.getItem('CHD_AUTH_TOKEN') || ''}` },
               body: JSON.stringify(mark)
             },
             syncContext,
             { baseMessage: 'Đã ghi cảnh báo workflow' }
           );
         } catch (err) {
           const errMsg = err instanceof Error ? err.message : 'Lỗi không xác định';
           triggerAlert(`Lỗi khi lưu cảnh báo workflow cho BS: ${errMsg}`, MODAL_TITLE.saveError);
           console.error('Lỗi khi lưu cảnh báo workflow BS:', mark, errMsg);
         }
       }

       onRefreshData(true);
     };

     persist().catch(e => {
       console.error(e);
       triggerAlert(e instanceof Error ? e.message : 'Không thể lưu ca cấp cứu thông tim', MODAL_TITLE.saveError);
       onRefreshData(true);
     });
  };

  const applyCathMethodChange = (methods: string[]) => {
    setFormData(prev => ({
      ...prev,
      CathMethod: methods,
      ...(cathPlanManuallySetRef.current ? {} : { CathPlan: suggestCathPlanFromMethods(methods) }),
    }));
  };

  const handleCathMethodToggle = (method: string) => {
     setFormData(prev => {
        const methods = parseCathMethods(prev.CathMethod);
        const nextMethods = methods.includes(method)
          ? methods.filter(m => m !== method)
          : [...methods, method];
        return {
          ...prev,
          CathMethod: nextMethods,
          ...(cathPlanManuallySetRef.current ? {} : { CathPlan: suggestCathPlanFromMethods(nextMethods) }),
        };
     });
  };

  const saveCathLab = async (isEdit: boolean, options?: { closeOnSuccess?: boolean }): Promise<boolean> => {
     const safeCathMethod = parseCathMethods(formData.CathMethod);
     if (!formData.CathDate || !formData.PostDiagnosisID || !formData.CathResultID || safeCathMethod.length === 0 || !formData.CathPlan || !formData._1stInterventionist || !formData._2ndInterventionist) {
        triggerAlert('Vui lòng điền đầy đủ các thông tin bắt buộc (*)', MODAL_TITLE.missingInfo);
        return false;
     }

     if (PLANS_REQUIRING_FOLLOW_UP.includes(String(formData.CathPlan || '')) && !formData.PlannedFollowUpDate) {
        triggerAlert('Vui lòng nhập Ngày hẹn tái khám', MODAL_TITLE.missingInfo);
        return false;
     }

     const method = isEdit ? 'PUT' : 'POST';
     const url = isEdit ? `/api/cathlabs/${formData.CathKey}` : '/api/cathlabs';
     
     const consultKey = isEdit ? selectedDone?.cath.ConsultKey : selectedPending?.c.ConsultKey;
     const patientKey = isEdit ? selectedDone?.p.PatientKey : selectedPending?.p.PatientKey;
     const patient = isEdit ? selectedDone?.p : selectedPending?.p;
     const needsRepeatWorkflow = !isEdit && isRepeatInterventionPlan(formData.CathPlan);

     const payload = {
       ...formData,
       ConsultKey: consultKey,
       PatientKey: patientKey,
       CathMethod: safeCathMethod.join(' + ')
     };

     const closeOnSuccess = options?.closeOnSuccess !== false;

     setSaving(true);
     try {
       const syncContext = buildSyncContext('cathlab-room', {
         patientName: patient?.PatientName,
         patientKey,
       });

       await persistWithSheetsSync(
         reportMutationResponse,
         url,
         {
           method,
           headers: {
             'Content-Type': 'application/json',
             Authorization: `Bearer ${localStorage.getItem('CHD_AUTH_TOKEN') || ''}`,
           },
           body: JSON.stringify(withSyncContext(payload, syncContext)),
         },
         syncContext,
         { baseMessage: 'Đã lưu kết quả thông tim' }
       );

       if (needsRepeatWorkflow && patientKey && patient) {
         await createRepeatInterventionWorkflow({
           patientKey,
           patient,
           cathDate: formData.CathDate || '',
           postDiagnosisID: formData.PostDiagnosisID || '',
           postDiagnosis: formData.PostDiagnosis || '',
           cathNote: formData.CathNote || '',
           requestBy: loggedInStaff?.StaffName || loggedInStaffNameShort || '',
           loggedInStaffId,
           consults,
           recentlySavedConsults: selectedPending ? [selectedPending.c] : undefined,
           staffList,
           reportMutationResponse,
           onSaveSuccess,
           onAddConsult,
         });
       }

       if (isEdit && formData.CathKey) {
         onPatchCathlab?.(formData.CathKey, payload);
       } else {
         onAddCathlab?.(payload as CathLab);
       }

       onRefreshData(true);

       if (closeOnSuccess) {
         forceCloseModal();
       }

       if (!needsRepeatWorkflow) {
         onSaveSuccess?.('Đã lưu kết quả thông tim thành công!');
       }

       return true;
     } catch (e) {
       console.error(e);
       triggerAlert(e instanceof Error ? e.message : 'Không thể lưu kết quả thông tim', MODAL_TITLE.saveError);
       onRefreshData(true);
       return false;
     } finally {
       setSaving(false);
     }
  };

  const handleExitSave = async () => {
    setExitConfirmError('');
    const ok = await saveCathLab(!!selectedDone, { closeOnSuccess: true });
    if (ok) {
      handleExitDiscard();
    } else if (!formData.CathDate || !formData.PostDiagnosisID) {
      setExitConfirmError('Vui lòng điền đầy đủ các thông tin bắt buộc trước khi lưu.');
    }
  };

  const handlePendingSort = (field: PendingSortField) => {
    startTransition(() => {
      if (pendingSortField === field) {
        setPendingSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
      } else {
        setPendingSortField(field);
        setPendingSortOrder('asc');
      }
    });
  };

  const handleDoneSort = (field: DoneSortField) => {
    startTransition(() => {
      if (doneSortField === field) {
        setDoneSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
      } else {
        setDoneSortField(field);
        setDoneSortOrder('asc');
      }
    });
  };

  const renderPendingSortHeader = (field: PendingSortField, label: string, className = '') => {
    const isSorted = pendingSortField === field;
    return (
      <th
        className={`py-3 px-4 shadow-sm cursor-pointer select-none hover:bg-slate-100 transition ${className}`}
        onClick={() => handlePendingSort(field)}
      >
        <div className={`flex items-center gap-1 ${className.includes('text-center') ? 'justify-center' : ''}`}>
          <span>{label}</span>
          <SortColumnIcon active={isSorted} order={pendingSortOrder} />
        </div>
      </th>
    );
  };

  const renderDoneSortHeader = (field: DoneSortField, label: string, className = '') => {
    const isSorted = doneSortField === field;
    return (
      <th
        className={`py-3 px-4 shadow-sm cursor-pointer select-none hover:bg-slate-100 transition ${className}`}
        onClick={() => handleDoneSort(field)}
      >
        <div className={`flex items-center gap-1 ${className.includes('text-center') ? 'justify-center' : ''}`}>
          <span>{label}</span>
          <SortColumnIcon active={isSorted} order={doneSortOrder} />
        </div>
      </th>
    );
  };

  const handlePostpone = (action: 'return' | 'remove') => {
     if(!selectedPending) return;
     if(!callNote) {
       triggerAlert('Vui lòng điền ghi chú (Call Note) lý do trạng thái hoãn', MODAL_TITLE.missingInfo);
       return;
     }

     triggerConfirm(`Xác nhận ${action === 'return' ? 'chuyển về Xếp lịch' : 'Loại ca này'} với lý do nãy?`, () => {
       const payload: Partial<Consult> = action === 'return'
         ? {
             TransferredToCathLab: false,
             PlannedCathLabDate: '',
             CheckDevice: '' as Consult['CheckDevice'],
             CallStatus: '' as Consult['CallStatus'],
             CallNote: callNote,
             Scheduled1stInterventionist: '',
             Scheduled2ndInterventionist: '',
             Scheduled3rdInterventionist: ''
           }
         : {
             TransferredToCathLab: false,
             Removed: false,
             CallStatus: 'Loại',
             CallNote: callNote,
             PlannedCathLabDate: '',
             CheckDevice: '' as Consult['CheckDevice']
           };

       onPatchConsult?.(selectedPending.c.ConsultKey, payload);
       forceCloseModal();

       persistWithSheetsSync(
         reportMutationResponse,
         `/api/consults/${selectedPending.c.ConsultKey}`,
         { method: 'PUT', body: JSON.stringify(payload) },
         buildSyncContext('cathlab-room', {
           patientName: selectedPending.p?.PatientName,
           patientKey: selectedPending.c.PatientKey
         }),
         { baseMessage: 'Đã cập nhật trạng thái ca' }
       )
         .then(() => onRefreshData())
         .catch(err => {
           console.error(err);
           triggerAlert(err instanceof Error ? err.message : 'Không thể cập nhật trạng thái ca', MODAL_TITLE.saveError);
           onRefreshData();
         });
     });
  };

  const handleSubheaderSearch = useCallback((value: string) => {
    setSearchTerm(value);
    setCurrentPage(1);
  }, []);

  const subheaderActions = useMemo(
    () => (
      <button
        type="button"
        onClick={() => openAdHocForm('Cấp cứu')}
        className="font-extrabold text-[11px] px-3 py-1.5 rounded-xl transition flex items-center gap-1.5 bg-rose-600 text-white shadow-sm hover:bg-rose-700"
      >
        <Plus className="w-3.5 h-3.5 shrink-0" />
        Nhập TT cấp cứu
      </button>
    ),
    [openAdHocForm]
  );

  useViewSubheader({
    title: getViewSubheaderTitle('cathlab-room'),
    icon: <Activity className="w-4 h-4" />,
    searchValue: searchTerm,
    onSearchChange: handleSubheaderSearch,
    actions: subheaderActions,
  });

  return (
    <div className="mobile-view-shell flex-1 flex flex-col p-2 sm:p-4 w-full h-full overflow-hidden bg-slate-50">
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 mb-2 sm:mb-4 shrink-0 lg:flex-nowrap">
           <div className="flex items-center gap-1.5 w-full sm:w-auto shrink-0">
              <button 
                onClick={() => setActiveTab('pending')}
                className={`mobile-tab-pill font-extrabold text-[11px] sm:text-[13px] sm:px-5 sm:py-2.5 sm:rounded-2xl transition flex-1 sm:flex-initial flex items-center justify-center gap-1.5 sm:gap-2 ${activeTab === 'pending' ? 'bg-indigo-600 text-white shadow-md' : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50 shadow-sm'}`}
              >
                 <CalendarDays className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0"/>
                 <span className="hidden sm:inline">Chờ thông tim</span>
                 <span className="sm:hidden">Chờ thông</span>
                 <span className={`px-1.5 sm:px-2 py-0.5 rounded-full text-[10px] sm:text-[11px] font-black ${activeTab==='pending'?'bg-indigo-500 text-white':'bg-slate-100 text-slate-500'}`}>{pendingConsults.length}</span>
              </button>
              
              <button 
                onClick={() => setActiveTab('done')}
                className={`mobile-tab-pill font-extrabold text-[11px] sm:text-[13px] sm:px-5 sm:py-2.5 sm:rounded-2xl transition flex-1 sm:flex-initial flex items-center justify-center gap-1.5 sm:gap-2 ${activeTab === 'done' ? 'bg-indigo-600 text-white shadow-md' : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50 shadow-sm'}`}
              >
                 <Activity className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0"/>
                 <span className="hidden sm:inline">Đã thông tim</span>
                 <span className="sm:hidden">Đã thông</span>
                 <span className={`px-1.5 sm:px-2 py-0.5 rounded-full text-[10px] sm:text-[11px] font-black ${activeTab==='done'?'bg-indigo-500 text-white':'bg-slate-100 text-slate-500'}`}>{doneCathlabs.length}</span>
              </button>
           </div>

           <div className="md:hidden sm:ml-auto flex flex-wrap lg:flex-nowrap items-center gap-1.5 w-full sm:w-auto shrink-0">
              <div className="mobile-view-search-wrap flex-1 sm:flex-initial flex items-center gap-1.5 bg-white border border-slate-200">
                 <Search className="w-4 h-4 text-slate-400 shrink-0 ml-0.5" />
                 <SearchTextInput
                    type="text"
                    placeholder="Tìm tên, mã ICD..."
                    value={searchTerm}
                    onChange={setSearchTerm}
                    className="mobile-view-search-input bg-transparent border-none outline-none text-[12px] sm:text-[13px] text-slate-700 w-full sm:w-56 font-bold placeholder:font-medium placeholder:text-slate-400"
                 />
              </div>
              {isMobile ? (
                <div className="relative shrink-0" ref={adHocMobileMenuRef}>
                  <button
                    type="button"
                    aria-label="Thêm ca thông tim"
                    aria-expanded={adHocMobileMenuOpen}
                    onClick={() => setAdHocMobileMenuOpen((open) => !open)}
                    className="mobile-tab-pill font-extrabold text-[11px] transition flex items-center justify-center bg-rose-600 text-white shadow-md hover:bg-rose-700 w-9 h-9 p-0 rounded-xl"
                  >
                    <Plus className="w-5 h-5 shrink-0" />
                  </button>
                  {adHocMobileMenuOpen && (
                    <div className="absolute right-0 top-full mt-1 z-50 min-w-[9.5rem] rounded-xl border border-slate-200 bg-white py-1 shadow-lg">
                      <button
                        type="button"
                        onClick={() => openAdHocForm('Cấp cứu')}
                        className="w-full px-3 py-2 text-left text-[12px] font-extrabold text-rose-700 hover:bg-rose-50"
                      >
                        Cấp cứu
                      </button>
                      <button
                        type="button"
                        onClick={() => openAdHocForm('Chương trình')}
                        className="w-full px-3 py-2 text-left text-[12px] font-extrabold text-indigo-700 hover:bg-indigo-50 border-t border-slate-100"
                      >
                        Chương trình
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => openAdHocForm('Cấp cứu')}
                  className="mobile-tab-pill font-extrabold text-[11px] sm:text-[13px] sm:px-5 sm:py-2.5 sm:rounded-2xl transition flex items-center gap-1.5 sm:gap-2 bg-rose-600 text-white shadow-md hover:bg-rose-700 sm:ml-2"
                >
                  <Plus className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
                  <span className="hidden sm:inline">Nhập TT cấp cứu</span>
                  <span className="sm:hidden">Cấp cứu</span>
                </button>
              )}
           </div>
        </div>

       {activeTab === 'pending' && (
         <div className="flex-1 overflow-hidden bg-white rounded-3xl shadow-sm border border-slate-200 flex flex-col">
            <div className="flex-1 overflow-auto custom-scrollbar">
              <table className="w-full text-left text-xs border-collapse min-w-[800px]">
                <thead className="sticky top-0 z-10">
                  <tr className="bg-slate-50 text-slate-600 border-b border-slate-200 text-[10px] uppercase font-black tracking-wider font-mono">
                    {renderPendingSortHeader('name', 'Họ tên Bệnh Nhi', 'min-w-[250px] w-72')}
                    {renderPendingSortHeader('dob', 'Ngày sinh', 'w-32 text-center')}
                    {renderPendingSortHeader('diagnosis', 'Mã bệnh (ICD)', 'w-32 text-center')}
                    {renderPendingSortHeader('date', 'Ngày TT dự kiến', 'w-40 text-center')}
                    {renderPendingSortHeader('ptv', 'PTV Phụ 1', 'w-48 text-center')}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-semibold text-slate-700">
                   {pendingConsults.length === 0 && (
                     <tr>
                       <td colSpan={5} className="p-8 text-center text-slate-400 italic font-semibold">Chưa có ca chờ thông tim</td>
                     </tr>
                   )}
                   {pendingConsults.map((c) => {
                      const p = findPatientByKey(patients, c.PatientKey);
                      if (!p) return null;
                      return (
                        <tr key={c.ConsultKey} onClick={() => openPendingForm(c, p)} className="hover:bg-slate-50 cursor-pointer transition">
                          <td className="py-4 px-4 text-slate-800 font-extrabold uppercase">{p.PatientName}</td>
                          <td className="py-4 px-4 text-slate-600 text-center font-medium">{formatVNTime(p.PatientDOB) || '-'}</td>
                          <td className="py-4 px-4 text-center font-extrabold text-[#d2145a]">{c.DiagnosisID || '-'}</td>
                          <td className="py-4 px-4 text-center text-slate-500 font-medium">
                            {c.PlannedCathLabDate ? formatVNTime(c.PlannedCathLabDate) : '-'}
                          </td>
                          <td className="py-4 px-4 text-center text-indigo-700 font-bold">{c.Scheduled2ndInterventionist || '-'}</td>
                        </tr>
                      );
                   })}
                </tbody>
              </table>
            </div>
            {/* Footer */}
            <div className="bg-slate-50 border-t border-slate-200 p-4 flex flex-col sm:flex-row items-center justify-between gap-4 shrink-0">
              <div className="text-[11px] text-slate-500 font-semibold font-mono uppercase">
                TỔNG SỐ CHỜ: {pendingConsults.length} CA 
              </div>
            </div>
         </div>
       )}

       {activeTab === 'done' && (
         <div className="flex-1 overflow-hidden bg-white rounded-3xl shadow-sm border border-slate-200 flex flex-col">
            <div className="flex-1 overflow-auto custom-scrollbar">
              <table className="w-full text-left text-xs border-collapse min-w-[800px]">
                <thead className="sticky top-0 z-10">
                  <tr className="bg-slate-50 text-slate-600 border-b border-slate-200 text-[10px] uppercase font-black tracking-wider font-mono">
                    {renderDoneSortHeader('name', 'Họ tên Bệnh Nhi', 'min-w-[250px] w-72')}
                    {renderDoneSortHeader('dob', 'Ngày sinh', 'w-32 text-center')}
                    {renderDoneSortHeader('postDiagnosis', 'ICD (Sau TT)', 'w-32 text-center')}
                    {renderDoneSortHeader('postDiagnosisText', 'Chẩn đoán sau TT', 'min-w-[250px] w-64')}
                    {renderDoneSortHeader('method', 'PP Can thiệp', 'min-w-[250px] w-64')}
                    {renderDoneSortHeader('date', 'Ngày thực hiện', 'w-40 text-center')}
                    {renderDoneSortHeader('ptv', 'PTV Phụ 1', 'w-48 text-center')}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-semibold text-slate-700">
                   {doneCathlabs.length === 0 && (
                     <tr>
                       <td colSpan={7} className="p-8 text-center text-slate-400 italic font-semibold">Chưa có ca đã thông tim</td>
                     </tr>
                   )}
                   {paginatedDoneCathlabs.map((cath) => {
                      const p = findPatientByKey(patients, cath.PatientKey);
                      if (!p) return null;
                      return (
                        <tr key={cath.CathKey} onClick={() => openDoneForm(cath)} className="hover:bg-slate-50 cursor-pointer transition">
                          <td className="py-4 px-4 text-slate-800 font-extrabold uppercase">{p.PatientName}</td>
                          <td className="py-4 px-4 text-slate-600 text-center font-medium">{formatVNTime(p.PatientDOB) || '-'}</td>
                          <td className="py-4 px-4 text-center font-extrabold text-[#d2145a]">{typeof cath.PostDiagnosisID === 'string' ? cath.PostDiagnosisID : (cath.PostDiagnosisID ? String(cath.PostDiagnosisID) : '-')}</td>
                          <td className="py-4 px-4 text-slate-700 font-medium line-clamp-2">{typeof cath.PostDiagnosis === 'string' ? cath.PostDiagnosis : (cath.PostDiagnosis ? String(cath.PostDiagnosis) : '-')}</td>
                          <td className="py-4 px-4 text-slate-700 font-medium whitespace-pre-wrap">{parseCathMethods(cath.CathMethod).join(', ')}</td>
                          <td className="py-4 px-4 text-center text-slate-500 font-medium">
                            {cath.CathDate ? formatVNTime(cath.CathDate) : '-'}
                          </td>
                          <td className="py-4 px-4 text-center text-indigo-700 font-bold">{cath._2ndInterventionist || '-'}</td>
                        </tr>
                      );
                   })}
                </tbody>
              </table>
            </div>
            {/* Footer */}
            <div className="bg-slate-50 border-t border-slate-200 p-4 flex flex-col sm:flex-row items-center justify-between gap-4 shrink-0 text-xs">
              <div className="text-[10px] text-slate-500 font-semibold font-mono uppercase">
                TỔNG SỐ ĐÃ THÔNG TIM: {doneCathlabs.length} CA {totalPages > 1 && `(Trang ${currentPage}/${totalPages})`}
              </div>
              {totalPages > 1 && (
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
              )}
            </div>
         </div>
       )}

       {/* ===================== FORM MODAL ===================== */}
       {(selectedPending || selectedDone || isAdHocModalOpen) && (
          <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center p-2 sm:p-4 bg-slate-900/60 backdrop-blur-sm overflow-y-auto">
            <div className="bg-white rounded-3xl max-w-4xl w-full my-auto max-h-[calc(100dvh-16px)] sm:max-h-[90vh] shadow-2xl border border-slate-200 flex flex-col text-sm font-medium overflow-hidden">
              <div className="bg-[#1e293b] text-white px-5 py-3 flex justify-between items-center shrink-0 z-10">
                <h3 className="font-extrabold uppercase tracking-wide flex items-center gap-2">
                   <Stethoscope /> 
                   {isAdHocModalOpen ? 'NHẬP TT CẤP CỨU' : (selectedDone ? 'HỒ SƠ THÔNG TIM (SỬA)' : 'NHẬP KẾT QUẢ THÔNG TIM')}
                </h3>
                <button onClick={closeModal} className="p-2 hover:bg-slate-700 rounded-lg transition"><Undo2 className="w-4 h-4"/></button>
              </div>

              {saving && (
                <div className="bg-sky-50 border-b border-sky-200 text-sky-800 px-5 py-2.5 text-[11px] font-semibold flex items-center gap-2 shrink-0">
                  <div className="w-4 h-4 border-2 border-sky-600 border-t-transparent rounded-full animate-spin shrink-0" />
                  <span>Đang lưu vào Google Sheets, vui lòng chờ...</span>
                </div>
              )}

              <div className="flex-1 p-3 bg-slate-50/50 space-y-3 overflow-y-auto custom-scrollbar">
                
                {/* Hành chính & Hội chẩn info card OR AdHoc Patient Selection */}
                {isAdHocModalOpen ? (
                      <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 flex flex-col text-xs font-semibold relative mb-4">
                         <div className="flex items-center justify-between mb-3">
                            <label className="block text-[#d2145a] font-extrabold uppercase text-[10px]">
                              Chọn Bệnh nhi cần đăng ký *
                            </label>
                            <button
                               type="button"
                               onClick={() => setAdHocPatientMode('new')} 
                               className="bg-[#d2145a]/10 hover:bg-[#d2145a]/20 text-[#d2145a] font-extrabold px-3 py-1 rounded-lg text-[10px] transition flex items-center gap-1 cursor-pointer"
                            >
                               <Plus className="w-3 h-3" /> Mới
                            </button>
                         </div>

                         {/* Search Input - Only show when no patient is selected */}
                         {adHocPatientMode === 'existing' && !adHocSelectedPatientKey && (
                            <div className="relative">
                              <input
                                type="text"
                                placeholder="🔍 Nhập tên hoặc mã ID1 của bệnh nhi..."
                                value={adHocSearchQuery}
                                onChange={(e) => setAdHocSearchQuery(e.target.value)}
                                className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs focus:outline-none placeholder-slate-400 font-semibold"
                              />
                            </div>
                         )}

                         {/* Filtered list dropdown simulator */}
                         {adHocPatientMode === 'existing' && !adHocSelectedPatientKey && adHocSearchQuery.trim().length > 0 && (
                            <div className="max-h-48 overflow-y-auto border border-slate-250 rounded-xl bg-white divide-y divide-slate-100 shadow-sm mt-2">
                              {(() => {
                                const trimmedQuery = removeVietnameseTones(adHocSearchQuery).toLowerCase().trim();
                                const matched = (patients || []).filter(p => {
                                   const nameOk = p?.PatientName ? removeVietnameseTones(String(p.PatientName)).toLowerCase().includes(trimmedQuery) : false;
                                   const idOk = p?.PatientID1 ? removeVietnameseTones(String(p.PatientID1)).toLowerCase().includes(trimmedQuery) : false;
                                   return nameOk || idOk;
                                });

                                if (matched.length === 0) {
                                  return <div className="p-3 text-center text-slate-400 italic">Không tìm thấy bệnh nhi "{adHocSearchQuery}"</div>;
                                }

                                return matched.slice(0, 15).map(p => (
                                  <button
                                    key={p.PatientKey}
                                    type="button"
                                    onClick={() => handleAdHocPatientSelect(p)}
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
                         {adHocPatientMode === 'existing' && adHocSelectedPatientKey && (() => {
                            const selectedPat = findPatientByKey(patients, adHocSelectedPatientKey);
                            if (!selectedPat) return null;
                            return (
                              <div className="bg-pink-50/70 border border-pink-100 rounded-2xl p-4 text-xs text-slate-800 relative shadow-sm mt-2">
                                <button
                                  onClick={() => {
                                     setAdHocSelectedPatientKey('');
                                     setAdHocPatientName('');
                                     setAdHocSearchQuery('');
                                  }}
                                  className="absolute top-3 right-3 text-slate-400 hover:text-slate-600 hover:bg-slate-200/50 p-1.5 rounded-full transition"
                                >
                                  <X className="w-4 h-4" />
                                </button>
                                
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
                                        <span className="font-bold text-slate-800 font-mono">{selectedPat.PatientPhone1 || selectedPat.PatientPhone2 || '—'}</span>
                                      </div>
                                      <div className="col-span-2">
                                        <span className="font-extrabold text-slate-400 uppercase text-[9px] block">Địa chỉ thường trú:</span>
                                        <span className="font-bold text-slate-800">{selectedPat.PatientAddress || '—'}</span>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            );
                         })()}

                            {adHocPatientMode === 'new' && (
                               <div className="mt-2 space-y-3">
                                  <div className="flex justify-between items-center bg-rose-50 px-3 py-2 rounded-lg border border-rose-100">
                                     <span className="text-rose-600 font-bold text-xs">📝 Tạo Khách Hàng Mới</span>
                                     <button 
                                        type="button" 
                                        className="text-xs font-bold text-slate-500 hover:text-slate-700 underline" 
                                        onClick={() => setAdHocPatientMode('existing')}
                                     >
                                        Hủy tạo mới / Quay lại tìm
                                     </button>
                                  </div>
                                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
                                  <div>
                                     <label className="block text-slate-500 font-bold text-[10px] uppercase mb-1">Mã BN1 <span className="text-rose-500">*</span></label>
                                     <input type="text"
                                        value={adHocPatientID1}
                                        onChange={e => setAdHocPatientID1(e.target.value)}
                                        className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 font-bold text-slate-800"
                                     />
                                  </div>
                                  <div>
                                     <label className="block text-slate-500 font-bold text-[10px] uppercase mb-1">Họ tên <span className="text-rose-500">*</span></label>
                                     <input type="text"
                                        value={adHocPatientName}
                                        onChange={e => setAdHocPatientName(e.target.value.toUpperCase())}
                                        className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 font-bold text-slate-800 uppercase"
                                     />
                                  </div>
                                  <div>
                                     <label className="block text-slate-500 font-bold text-[10px] uppercase mb-1">Ngày sinh <span className="text-rose-500">*</span></label>
                                     <VNDateInput
                                        value={adHocPatientDOB}
                                        onChange={(val: string) => setAdHocPatientDOB(val)}
                                        className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 font-bold text-slate-800 font-sans text-center"
                                     />
                                  </div>
                                  <div>
                                     <label className="block text-slate-500 font-bold text-[10px] uppercase mb-1">Giới tính</label>
                                     <select
                                        value={adHocPatientSex}
                                        onChange={e => setAdHocPatientSex(e.target.value as any)}
                                        className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 font-bold text-slate-800"
                                     >
                                        <option value="Nam">Nam</option>
                                        <option value="Nữ">Nữ</option>
                                     </select>
                                  </div>
                                  <div className="md:col-span-2">
                                     <label className="block text-slate-500 font-bold text-[10px] uppercase mb-1">Địa chỉ <span className="text-rose-500">*</span></label>
                                     <SearchableEnumSelect
                                        required
                                        options={provinceOptions}
                                        value={adHocPatientAddress}
                                        onChange={setAdHocPatientAddress}
                                        placeholder="-- Chọn tỉnh/thành --"
                                        searchPlaceholder="Gõ tỉnh/thành để tìm..."
                                     />
                                  </div>
                                  <div>
                                     <label className="block text-slate-500 font-bold text-[10px] uppercase mb-1">SĐT 1</label>
                                     <input type="text"
                                        value={adHocPatientPhone1}
                                        onChange={e => setAdHocPatientPhone1(e.target.value)}
                                        className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 font-bold text-slate-800"
                                     />
                                  </div>
                                  <div>
                                     <label className="block text-slate-500 font-bold text-[10px] uppercase mb-1">SĐT 2</label>
                                     <input type="text"
                                        value={adHocPatientPhone2}
                                        onChange={e => setAdHocPatientPhone2(e.target.value)}
                                        className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 font-bold text-slate-800"
                                     />
                                  </div>
                               </div>
                              </div>
                            )}
                      </div>
                ) : (() => {
                   const p = selectedPending ? selectedPending.p : selectedDone!.p;
                   const c = selectedPending ? selectedPending.c : null;
                   return (
                     <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-5 grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                           <div className="font-extrabold text-[#d2145a] text-xs uppercase mb-3 border-b border-indigo-50 pb-2">Thông tin hành chính</div>
                           <div className="space-y-1.5 text-xs">
                             <div className="flex gap-2"><span className="text-slate-500 w-20 shrink-0">Họ tên:</span> <span className="font-extrabold text-slate-800 uppercase">{p.PatientName}</span></div>
                             <div className="flex gap-2"><span className="text-slate-500 w-20 shrink-0">Giới tính:</span> <span className="font-bold text-slate-800">{p.PatientSex}</span></div>
                             <div className="flex gap-2"><span className="text-slate-500 w-20 shrink-0">Ngày sinh:</span> <span className="font-bold text-slate-800">{formatVNTime(p.PatientDOB)}</span></div>
                             <div className="flex gap-2"><span className="text-slate-500 w-20 shrink-0">Mã NB:</span> <span className="font-bold text-slate-800 font-mono">{p.PatientID1}</span></div>
                             <div className="flex gap-2"><span className="text-slate-500 w-20 shrink-0">Địa chỉ:</span> <span className="font-bold text-slate-800 break-words">{(p as any).PatientAddress || p.PatientAddress}</span></div>
                           </div>
                        </div>
                        {c && (
                           <div>
                              <div className="font-extrabold text-[#d2145a] text-xs uppercase mb-3 border-b border-indigo-50 pb-2">Thông tin hội chẩn</div>
                              <div className="space-y-1.5 text-xs">
                                <div className="flex gap-2"><span className="text-slate-500 w-28 shrink-0">Chẩn đoán chi tiết:</span> <span className="font-bold text-slate-800 break-words">{c.DetailDiagnosis}</span></div>
                                <div className="flex gap-2"><span className="text-slate-500 w-28 shrink-0">Kết quả chi tiết HC:</span> <span className="font-bold text-slate-800 break-words">{c.DetailConsultResult}</span></div>
                                <div className="flex gap-2"><span className="text-slate-500 w-28 shrink-0">Ngày staff:</span> <span className="font-bold text-slate-800">{formatVNTime(c.ConsultDate)}</span></div>
                              </div>
                           </div>
                        )}
                        {!c && selectedDone && (
                           <div>
                              <div className="font-extrabold text-[#d2145a] text-xs uppercase mb-3 border-b border-indigo-50 pb-2">Thông tin ca can thiệp</div>
                              <div className="space-y-1.5 text-xs text-slate-500 italic">
                                Hồ sơ cập nhật trực tiếp từ khoá chính Can thiệp tim mạch.
                              </div>
                           </div>
                        )}
                     </div>
                   );
                })()}

                {/* Form Editor */}
                <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-4 space-y-3">
                  <div className="font-extrabold text-indigo-700 text-xs uppercase mb-3 border-b border-indigo-50 pb-2 flex justify-between items-center">
                    <span>KẾT QUẢ THÔNG TIM</span>
                    {formData.CathResultID === 'Hoãn' && <span className="px-2 py-0.5 rounded bg-rose-100 text-rose-700 text-[10px]">Chế độ Hoãn Thủ Thuật</span>}
                  </div>
                  
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-xs font-semibold">
                    <div>
                      <label className="block text-slate-500 font-bold text-[10px] uppercase mb-1">Kết quả thông tim <span className="text-rose-500">*</span></label>
                      <select 
                        value={formData.CathResultID} 
                        onChange={e => setFormData({...formData, CathResultID: e.target.value as any})}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-bold text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      >
                         <option value="Thành công">Thành công</option>
                         <option value="Không thành công">Không thành công</option>
                         <option value="Hoãn">Hoãn</option>
                      </select>
                    </div>

                    {isAdHocModalOpen && (
                      <div>
                        <label className="block text-[#d2145a] font-bold text-[10px] uppercase mb-1">Loại can thiệp (PriorityOrder) <span className="text-rose-500">*</span></label>
                        <select 
                          value={adHocPriorityOrder} 
                          onChange={e => setAdHocPriorityOrder(e.target.value as any)}
                          className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-bold text-slate-800 focus:outline-none focus:ring-1 focus:ring-[#d2145a]"
                        >
                           <option value="Cấp cứu">Cấp cứu</option>
                           <option value="Chương trình">Chương trình</option>
                        </select>
                      </div>
                    )}
                  </div>

                  {formData.CathResultID !== 'Hoãn' ? (
                    <>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-xs font-semibold">
                      <div>
                        <label className="block text-slate-500 font-bold text-[10px] uppercase mb-1">Ngày thông tim <span className="text-rose-500">*</span></label>
                        <VNDateInput
                          value={formData.CathDate || ''} 
                          onChange={(val: string) => setFormData({...formData, CathDate: val})}
                          className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-bold text-slate-800 font-sans focus:outline-none focus:ring-1 focus:ring-indigo-500 text-center"
                        />
                      </div>
                      
                      <div>
                        <label className="block text-slate-500 font-bold text-[10px] uppercase mb-1">ICD sau thông tim <span className="text-rose-500">*</span></label>
                        <SearchableEnumSelect
                          required
                          options={diagnosisOptions}
                          value={formData.PostDiagnosisID} 
                          onChange={(value) => setFormData({...formData, PostDiagnosisID: value})}
                          allowCreate
                          createLabel={(value) => `Thêm DiagnosisID "${value}" vào Source`}
                          onCreateOption={createDiagnosisSource}
                          placeholder="- Chọn mã -"
                          searchPlaceholder="Gõ ICD để tìm..."
                        />
                      </div>

                      <div className="col-span-2 md:col-span-1">
                        <label className="block text-slate-500 font-bold text-[10px] uppercase mb-1">Kế hoạch sau thông tim <span className="text-rose-500">*</span></label>
                        <select 
                          value={formData.CathPlan} 
                          onChange={e => {
                            cathPlanManuallySetRef.current = true;
                            setFormData({...formData, CathPlan: e.target.value});
                          }}
                          className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-bold text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                        >
                           <option value="Tái khám thường">Tái khám thường</option>
                           <option value="Theo dõi sát">Theo dõi sát</option>
                           <option value="Cần thông tim can thiệp lại">Cần thông tim can thiệp lại</option>
                           <option value="Đăng ký staff nội-ngoại khoa">Đăng ký staff nội-ngoại khoa</option>
                           <option value="Mổ khẩn">Mổ khẩn</option>
                        </select>
                        {isRepeatInterventionPlan(formData.CathPlan) && (
                          <div className="mt-2 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[10px] sm:text-[11px] font-semibold text-amber-800 leading-snug">
                            <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                            <span>{REPEAT_INTERVENTION_WARNING}</span>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="space-y-4 pt-2">
                       <div>
                         <label className="block text-slate-500 font-bold text-[10px] uppercase mb-1">Phương pháp can thiệp <span className="text-rose-500">*</span></label>
                         <SearchableEnumSelect
                           multiple
                           required
                           options={cathMethodOptions}
                           values={parseCathMethods(formData.CathMethod)}
                           onMultiChange={applyCathMethodChange}
                           placeholder="Chọn phương pháp..."
                           searchPlaceholder="Gõ phương pháp để tìm..."
                           direction="up"
                         />
                       </div>

                       {PLANS_REQUIRING_FOLLOW_UP.includes(String(formData.CathPlan || '')) && (
                          <div className="bg-amber-50 border border-amber-200 p-4 rounded-xl animate-in slide-in-from-top-1">
                             <label className="block text-amber-800 font-bold text-[10px] uppercase mb-1 flex items-center gap-1">
                               <CalendarDays className="w-3 h-3"/> Ngày hẹn tái khám <span className="text-rose-500">*</span>
                             </label>
                             <VNDateInput
                               value={formData.PlannedFollowUpDate || ''} 
                               onChange={(val: string) => setFormData({...formData, PlannedFollowUpDate: val})}
                               className="w-full max-w-[250px] bg-white border border-amber-300 rounded-xl px-3 py-2 font-bold text-slate-800 font-sans focus:outline-none focus:ring-1 focus:ring-amber-500"
                             />
                          </div>
                       )}

                       <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                         <div>
                           <label className="block text-slate-500 font-bold text-[10px] uppercase mb-1">Chẩn đoán chi tiết sau TT <span className="text-[9px] font-normal italic lowercase opacity-80">[Điền Nếu có khác biệt lớn]</span></label>
                           <MobileAutoExpandTextarea
                             minRows={2}
                             value={formData.PostDiagnosis}
                             onChange={e => setFormData({...formData, PostDiagnosis: e.target.value})}
                             className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                           />
                         </div>
                         <div>
                           <label className="block text-slate-500 font-bold text-[10px] uppercase mb-1">Ghi chú</label>
                           <MobileAutoExpandTextarea
                             minRows={2}
                             value={formData.CathNote}
                             onChange={e => setFormData({...formData, CathNote: e.target.value})}
                             className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                           />
                         </div>
                       </div>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-2">
                       {/* Surgeons */}
                       {[
                         { id: 1, label: 'PTV Chính *', field: '_1stInterventionist', options: ['BS. Phụng', 'BS. Lợi', 'BS. Thịnh'] },
                         { id: 2, label: 'PTV Phụ 1 *', field: '_2ndInterventionist', options: ['BS. Thịnh', 'BS. Ân', 'BS. Hùng', 'BS. Hiếu', 'BS. Tài', 'BS Tĩnh'] },
                         { id: 3, label: 'PTV Phụ 2', field: '_3rdInterventionist', options: ['BS. Thịnh', 'BS. Ân', 'BS. Hùng', 'BS. Hiếu', 'BS. Tài', 'BS Tĩnh'] },
                         { id: 4, label: 'PTV Phụ 3', field: '_4thInterventionist', options: ['BS. Thịnh', 'BS. Ân', 'BS. Hùng', 'BS. Hiếu', 'BS. Tài', 'BS Tĩnh'] }
                       ].map(s => (
                         <div key={s.id}>
                           <label className="block text-slate-500 font-bold text-[10px] uppercase mb-1">{s.label}</label>
                           <select 
                             value={(formData as any)[s.field] || ''} 
                             onChange={e => setFormData({...formData, [s.field]: e.target.value})}
                             className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-bold text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                           >
                              <option value="">-- Chọn BS --</option>
                              {s.options.map(o => <option key={o} value={o}>{o}</option>)}
                           </select>
                         </div>
                       ))}
                    </div>
                    </>
                  ) : (
                    <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 mt-2">
                      <label className="block text-rose-800 font-bold text-xs uppercase mb-1">Ghi chú / Lý do hoãn <span className="text-rose-500">*</span></label>
                      <textarea 
                         rows={2}
                         value={callNote} 
                         onChange={e => setCallNote(e.target.value)}
                         placeholder="Vì sao phải hoãn không làm can thiệp..."
                         className="w-full bg-white border border-rose-300 rounded-xl px-3 py-2 text-rose-800 focus:outline-none focus:ring-1 focus:ring-rose-500 resize-y"
                      />
                    </div>
                  )}

                </div>
              </div>

              {/* Action Footer */}
              <div className="px-5 py-3 bg-slate-100 border-t border-slate-200 flex justify-end gap-3 shrink-0">
                 {isAdHocModalOpen ? (
                     <button 
                       onClick={saveAdHocCathLab}
                       className="px-6 py-2 bg-rose-600 text-white hover:bg-rose-700 rounded-xl font-black text-xs transition flex items-center gap-2"
                     ><Save className="w-4 h-4"/> Lưu hồ sơ cấp cứu</button>
                 ) : formData.CathResultID === 'Hoãn' ? (
                    <>
                      <button 
                        onClick={() => handlePostpone('return')}
                        className="px-6 py-2 bg-indigo-100 text-indigo-700 hover:bg-indigo-200 rounded-xl font-black text-xs transition"
                      >Chuyển về Xếp lịch</button>
                      <button 
                        onClick={() => handlePostpone('remove')}
                        className="px-6 py-2 bg-rose-600 text-white hover:bg-rose-700 rounded-xl font-black text-xs transition"
                      >Loại</button>
                    </>
                 ) : (
                    <>
                      {selectedDone && (
                        <button 
                          onClick={() => {
                            requestCloseModal(() => {
                              forceCloseModal();
                              onViewPatientRecord(selectedDone.p);
                            });
                          }}
                          className="mr-auto px-6 py-2 bg-slate-200 text-slate-800 hover:bg-slate-300 rounded-xl font-black text-xs transition"
                        >Xem hồ sơ</button>
                      )}
                      
                      <button 
                        onClick={() => saveCathLab(!!selectedDone)}
                        disabled={saving}
                        className="px-6 py-2 bg-indigo-600 text-white hover:bg-indigo-700 rounded-xl font-black text-xs transition flex items-center gap-2 disabled:opacity-50"
                      ><Save className="w-4 h-4"/> {saving ? 'Đang lưu vào Google Sheets...' : 'Lưu'}</button>
                    </>
                 )}
              </div>
           </div>
         </div>
       )}

       {exitConfirmOpen && (
         <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-[75] flex items-center justify-center p-4 animate-in fade-in duration-200">
           <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden animate-in zoom-in-95">
             <div className="py-3 px-4 flex items-center gap-2 bg-amber-50 border-b border-amber-100">
               <AlertTriangle className="w-5 h-5 text-amber-600" />
               <h3 className="font-extrabold text-[13px] uppercase tracking-wide text-amber-900">Thay đổi chưa lưu</h3>
             </div>
             <div className="p-5 space-y-3">
               <p className="text-sm font-semibold text-slate-700 leading-relaxed">
                 Bạn có thay đổi chưa được lưu. Bạn có muốn lưu kết quả thông tim không?
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
                 {saving ? 'Đang lưu vào Google Sheets...' : 'Lưu'}
               </button>
             </div>
           </div>
         </div>
       )}

    </div>
  );
}
