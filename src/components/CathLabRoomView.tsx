import React, { useState, useMemo, useEffect, useRef } from 'react';
import * as XLSX from 'xlsx';
import { Patient, Consult, Staff, CathLab, Source, findPatientByKey, formatVNTime, removeDiacritics, normalizePatientKey } from '../types';
import { Search, Plus, Undo2, Stethoscope, Save, Archive, Ban, CalendarDays, Activity, ArrowUpDown, X, User, Upload } from 'lucide-react';
import { SOURCE_CATH_METHOD, SOURCE_PROVINCE, getSourceDiagnosisOptions, normalizeDiagnosisID } from '../data/source';
import { SearchableEnumSelect } from './SearchableEnumSelect';
import { VNDateInput } from './VNDateInput';
import { classifyDiagnosisText } from '../utils/diagnosisClassifier';
import { resolveStaffByNameOrKey } from '../utils/staffNameMatch';

interface Props {
  patients: Patient[];
  consults: Consult[];
  cathlabs: CathLab[];
  sources: Source[];
  staffList: Staff[];
  onRefreshData: () => void;
  triggerConfirm: (msg: string, onConfirm: () => void, title?: string) => void;
  onViewPatientRecord: (pat: Patient) => void;
  onPatchConsult?: (consultKey: string, patch: Partial<Consult>) => void;
  onPatchCathlab?: (cathKey: string, patch: Partial<CathLab>) => void;
  onAddCathlab?: (cath: CathLab) => void;
  onAddConsult?: (consult: Consult) => void;
  onAddPatient?: (patient: Patient) => void;
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
  const consult = consults.find(c => c.ConsultKey === latestKey);
  if (!consult || !isConsultInSchedulingWaitlist(consult, latestMap, patients)) return undefined;
  return consult;
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

const DEFAULT_HIS_PATIENT_ADDRESS = 'TP Hồ Chí Minh';
const HIS_ADDRESS_WARNING = 'BN được tạo tự động từ import HIS, địa chỉ đang mặc định là TP Hồ Chí Minh. Cần cập nhật lại địa chỉ hành chính chính xác.';

const normalizeHisText = (value: any): string => String(value ?? '').trim().replace(/\s+/g, ' ');

const normalizeHisHeader = (value: any): string =>
  removeVietnameseTones(normalizeHisText(value)).toLowerCase().replace(/[^a-z0-9]/g, '');

const normalizeHisKey = (value: any): string =>
  normalizeHisText(value).toLowerCase();

const parseHisDateOnly = (value: any): string => {
  if (!value) return '';
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().split('T')[0];
  }
  if (typeof value === 'number') {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (parsed) {
      const month = String(parsed.m).padStart(2, '0');
      const day = String(parsed.d).padStart(2, '0');
      return `${parsed.y}-${month}-${day}`;
    }
  }

  const raw = normalizeHisText(value).split(/\s+/)[0];
  const rawFull = normalizeHisText(value);
  const numericValue = Number(rawFull);
  if (/^\d+(\.\d+)?$/.test(rawFull) && numericValue > 20000) {
    const parsed = XLSX.SSF.parse_date_code(numericValue);
    if (parsed) {
      const month = String(parsed.m).padStart(2, '0');
      const day = String(parsed.d).padStart(2, '0');
      return `${parsed.y}-${month}-${day}`;
    }
  }
  if (/[a-zA-Z]/.test(rawFull)) {
    const parsedTime = Date.parse(rawFull);
    if (!Number.isNaN(parsedTime)) return new Date(parsedTime).toISOString().split('T')[0];
  }
  const parts = raw.includes('/') ? raw.split('/') : raw.split('-');
  if (parts.length !== 3) return raw;

  const [first, second, third] = parts.map(part => part.trim());
  if (first.length === 4) {
    return `${first}-${second.padStart(2, '0')}-${third.padStart(2, '0')}`;
  }
  return `${third}-${second.padStart(2, '0')}-${first.padStart(2, '0')}`;
};

const normalizeHisSex = (value: any): 'Nam' | 'Nữ' => {
  const normalized = removeVietnameseTones(normalizeHisText(value)).toLowerCase();
  return normalized.includes('nu') ? 'Nữ' : 'Nam';
};

const normalizeHisDoctor = (value: any): string => {
  const cleaned = normalizeHisText(value)
    .replace(/\([^)]*\)/g, '')
    .replace(/^(bsckii|bscki|ths|th\.s|ts|bs|bác sĩ)\.?\s+/i, '')
    .trim();
  if (!cleaned) return '';
  const parts = cleaned.split(/\s+/);
  return `BS. ${parts[parts.length - 1]}`;
};

const getHisCell = (row: any[], headerMap: Map<string, number>, aliases: string[]): string => {
  for (const alias of aliases) {
    const index = headerMap.get(alias);
    if (index !== undefined) return normalizeHisText(row[index]);
  }
  return '';
};

const getDateDistanceDays = (a?: string, b?: string) => {
  if (!a || !b) return Number.POSITIVE_INFINITY;
  const timeA = new Date(`${parseHisDateOnly(a)}T00:00:00`).getTime();
  const timeB = new Date(`${parseHisDateOnly(b)}T00:00:00`).getTime();
  if (Number.isNaN(timeA) || Number.isNaN(timeB)) return Number.POSITIVE_INFINITY;
  return Math.abs(timeA - timeB) / (1000 * 60 * 60 * 24);
};

const hasConsultResult = (consult: Consult) => {
  const result = String(consult.ConsultResultID || '').trim().toLowerCase();
  return !!result && !['nodata', 'no data', '-', '—'].includes(result);
};

const isTransferredToCathLab = (consult: Consult) =>
  consult.TransferredToCathLab === true ||
  String(consult.TransferredToCathLab || '').trim().toLowerCase() === 'true' ||
  String(consult.TransferredToCathLab || '').trim().toLowerCase() === 'yes' ||
  String(consult.TransferredToCathLab || '').trim().toLowerCase() === 'có';

type HisWorkflowStage = 'missing_staff_result' | 'scheduler_missing_transfer' | 'missing_cath_result';

const getHisWorkflowStage = (consult: Consult): HisWorkflowStage => {
  if (!hasConsultResult(consult)) return 'missing_staff_result';
  if (!consult.PlannedCathLabDate || !isTransferredToCathLab(consult)) return 'scheduler_missing_transfer';
  return 'missing_cath_result';
};

const getHisStageLabel = (stage: HisWorkflowStage) => {
  if (stage === 'missing_staff_result') return 'Chưa hoàn tất kết quả staff';
  if (stage === 'scheduler_missing_transfer') return 'Chưa hoàn tất xếp lịch/chuyển phòng TT';
  return 'Chưa nhập kết quả thông tim';
};

export default function CathLabRoomView({ patients, consults, cathlabs, sources, staffList, onRefreshData, triggerConfirm, onViewPatientRecord, onPatchConsult, onPatchCathlab, onAddCathlab, onAddConsult, onAddPatient }: Props) {
  // Tabs
  const [activeTab, setActiveTab] = useState<'pending' | 'done'>('pending');
  const [searchTerm, setSearchTerm] = useState('');
  const [sortAsc, setSortAsc] = useState(true);
  const diagnosisOptions = useMemo(() => getSourceDiagnosisOptions(sources), [sources]);

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
  
  // Data prep
  const pendingConsults = useMemo(() => {
     let list = consults.filter(c => {
       const transferred = c.TransferredToCathLab === true || String(c.TransferredToCathLab).trim().toLowerCase() === 'true';
       return transferred && !c.Removed && !cathlabs.some(cath => cath.ConsultKey === c.ConsultKey);
     });
     
     if (searchTerm.trim() !== '') {
        const lowerSearch = removeVietnameseTones(searchTerm).toLowerCase();
        list = list.filter(c => {
           const p = findPatientByKey(patients, c.PatientKey);
           const pName = removeVietnameseTones(String(p?.PatientName || '')).toLowerCase();
           const dId = removeVietnameseTones(String(c.DiagnosisID || '')).toLowerCase();
           return pName.includes(lowerSearch) || dId.includes(lowerSearch);
        });
     }

     list.sort((a, b) => {
        const da = new Date(a.PlannedCathLabDate || '2100-01-01').getTime();
        const db = new Date(b.PlannedCathLabDate || '2100-01-01').getTime();
        return sortAsc ? da - db : db - da;
     });

     return list;
  }, [consults, cathlabs, patients, searchTerm, sortAsc]);

  const doneCathlabs = useMemo(() => {
     let list = cathlabs;
     if (searchTerm.trim() !== '') {
        const lowerSearch = removeVietnameseTones(searchTerm).toLowerCase();
        list = list.filter(cath => {
           const p = findPatientByKey(patients, cath.PatientKey);
           const pName = removeVietnameseTones(String(p?.PatientName || '')).toLowerCase();
           const postD = removeVietnameseTones(String(cath.PostDiagnosisID || '')).toLowerCase();
           return pName.includes(lowerSearch) || postD.includes(lowerSearch);
        });
     }
     list.sort((a, b) => {
        const da = new Date(a.CathDate || '1970-01-01').getTime();
        const db = new Date(b.CathDate || '1970-01-01').getTime();
        return sortAsc ? da - db : db - da;
     });
     return list;
  }, [cathlabs, patients, searchTerm, sortAsc]);

  const [selectedPending, setSelectedPending] = useState<{c: Consult, p: Patient} | null>(null);
  const [selectedDone, setSelectedDone] = useState<{p: Patient, cath: CathLab} | null>(null);
  const [isAdHocModalOpen, setIsAdHocModalOpen] = useState(false);
  const [hisImporting, setHisImporting] = useState(false);
  const [hisImportStatus, setHisImportStatus] = useState('');
  const hisImportInputRef = useRef<HTMLInputElement>(null);

  // Form State
  const [formData, setFormData] = useState<Partial<CathLab>>(INIT_CATHLAB);
  const [callNote, setCallNote] = useState('');

  // AdHoc State
  const [adHocPatientMode, setAdHocPatientMode] = useState<'existing' | 'new'>('existing');
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

  const loggedInStaffId = localStorage.getItem('CurrentStaffKey') || '';
  const loggedInStaff = staffList.find(s => s.StaffKey === loggedInStaffId);
  const loggedInStaffNameShort = loggedInStaff ? (['bs', 'bs.', 'pgs', 'gs', 'th.s', 'ths', 'pgs.ts', 'gs.ts'].includes(loggedInStaff.StaffName.split(' ')[0].toLowerCase()) ? loggedInStaff.StaffName : `BS. ${loggedInStaff.StaffName.split(' ').pop()}`) : '';
  
  const openPendingForm = (c: Consult, p: Patient) => {
    setSelectedPending({c, p});
    setFormData({
      ...INIT_CATHLAB,
      CathDate: new Date().toISOString().split('T')[0],
      PostDiagnosisID: c.DiagnosisID || '',
      PostDiagnosis: c.DetailDiagnosis || '',
      CathMethod: parseCathMethods(c.CathMethod),
      _1stInterventionist: c.Scheduled1stInterventionist || '',
      _2ndInterventionist: c.Scheduled2ndInterventionist || loggedInStaffNameShort || '',
      _3rdInterventionist: c.Scheduled3rdInterventionist || ''
    });
    setCallNote('');
  };

  const openDoneForm = (cath: CathLab) => {
    const p = findPatientByKey(patients, cath.PatientKey);
    
    if(p) {
      setSelectedDone({p, cath});
      try {
        setFormData({
          ...cath,
          CathMethod: parseCathMethods(cath.CathMethod)
        });
      } catch (err) {
        console.error("Error setting form data:", err);
      }
    }
  };

  const closeModal = () => {
    setSelectedPending(null);
    setSelectedDone(null);
    setIsAdHocModalOpen(false);
  };

  const openAdHocForm = () => {
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
    setIsAdHocModalOpen(true);
  };

  const findPatientByHisId = (patientId: string, patientList: Patient[] = patients): Patient | undefined => {
    const normalizedId = normalizeHisKey(patientId);
    if (!normalizedId) return undefined;
    return patientList.find(patient => {
      const id1 = normalizeHisKey(patient.PatientID1);
      const id2Values = String(patient.PatientID2 || '')
        .split('-')
        .map(part => normalizeHisKey(part))
        .filter(Boolean);
      return id1 === normalizedId || id2Values.includes(normalizedId);
    });
  };

  const findBestConsultForHisCath = (patientKey: string, cathDate: string): Consult | undefined => {
    const normalizedPatient = normalizePatientKey(patientKey);
    const cathTime = new Date(`${parseHisDateOnly(cathDate)}T00:00:00`).getTime();
    if (!normalizedPatient || Number.isNaN(cathTime)) return undefined;

    const cathConsultKeys = new Set(cathlabs.map(cath => String(cath.ConsultKey || '').trim()).filter(Boolean));
    const eligibleResultSet = new Set(SCHEDULING_ELIGIBLE_RESULTS.map(item => item.toLowerCase()));

    const scored = consults
      .filter(consult => normalizePatientKey(consult.PatientKey) === normalizedPatient)
      .filter(consult => !cathConsultKeys.has(String(consult.ConsultKey || '').trim()))
      .map(consult => {
        const consultTime = consult.ConsultDate ? new Date(`${parseHisDateOnly(consult.ConsultDate)}T00:00:00`).getTime() : 0;
        const plannedDistance = consult.PlannedCathLabDate ? getDateDistanceDays(consult.PlannedCathLabDate, cathDate) : Number.POSITIVE_INFINITY;
        const consultDistance = consultTime > 0 ? Math.abs(cathTime - consultTime) / (1000 * 60 * 60 * 24) : Number.POSITIVE_INFINITY;
        const result = String(consult.ConsultResultID || '').trim().toLowerCase();
        const resultEligible = eligibleResultSet.has(result);
        const isPendingResult = !hasConsultResult(consult);
        const beforeOrSameCath = consultTime > 0 && consultTime <= cathTime;
        const score =
          (resultEligible ? 500 : 0) +
          (isPendingResult ? 180 : 0) +
          (isTransferredToCathLab(consult) ? 220 : 0) +
          (consult.PlannedCathLabDate ? 220 : 0) +
          (plannedDistance <= 7 ? 220 : plannedDistance <= 30 ? 120 : 0) +
          (beforeOrSameCath ? 120 : -300) -
          Math.min(consultDistance, 365);

        return { consult, score, plannedDistance, consultDistance, beforeOrSameCath, resultEligible, isPendingResult };
      })
      .filter(item => item.beforeOrSameCath || item.plannedDistance <= 7)
      .filter(item => item.resultEligible || item.isPendingResult || item.plannedDistance <= 7)
      .sort((a, b) => b.score - a.score || a.plannedDistance - b.plannedDistance || a.consultDistance - b.consultDistance);

    return scored[0]?.consult;
  };

  const buildCathImportKey = (patientId: string, cathDate: string, cathMethod: string) =>
    `${normalizeHisKey(patientId)}|${cathDate}|${removeVietnameseTones(cathMethod).toLowerCase().trim()}`;

  const buildExistingCathImportKeys = (patientList: Patient[] = patients, cathList: CathLab[] = cathlabs) => {
    const keys = new Set<string>();
    cathList.forEach(cath => {
      const patient = findPatientByKey(patientList, cath.PatientKey);
      const patientIds = [
        patient?.PatientID1,
        ...(String(patient?.PatientID2 || '').split('-'))
      ].map(id => normalizeHisText(id)).filter(Boolean);
      const cathMethods = parseCathMethods(cath.CathMethod).length > 0 ? parseCathMethods(cath.CathMethod) : [String(cath.CathMethod || '')];
      patientIds.forEach(patientId => {
        cathMethods.forEach(method => {
          if (patientId && cath.CathDate && method) {
            keys.add(buildCathImportKey(patientId, parseHisDateOnly(cath.CathDate), method));
          }
        });
      });
    });
    return keys;
  };

  const resolveResponsibleStaffForHisStage = (consult: Consult, stage: HisWorkflowStage, cathPayload: CathLab): Staff | undefined => {
    if (stage === 'missing_staff_result') {
      return resolveStaffByNameOrKey(consult.RequestBy, staffList)
        || resolveStaffByNameOrKey(consult.ConsultCreateBy, staffList);
    }
    if (stage === 'scheduler_missing_transfer') {
      return resolveStaffByNameOrKey(consult.CheckDeviceBy, staffList)
        || resolveStaffByNameOrKey(consult.CheckDeviceUpdatedBy, staffList)
        || resolveStaffByNameOrKey(consult.Scheduled2ndInterventionist, staffList)
        || staffList.find(staff => String(staff.StaffRolePreset || '').includes('dieu-phoi'))
        || resolveStaffByNameOrKey(consult.RequestBy, staffList);
    }
    return resolveStaffByNameOrKey(cathPayload._1stInterventionist, staffList)
      || resolveStaffByNameOrKey(cathPayload._2ndInterventionist, staffList)
      || resolveStaffByNameOrKey(consult.Scheduled1stInterventionist, staffList)
      || resolveStaffByNameOrKey(consult.Scheduled2ndInterventionist, staffList)
      || resolveStaffByNameOrKey(consult.RequestBy, staffList);
  };

  const createHisWorkflowNotificationAndMark = async (
    consult: Consult,
    patient: Patient,
    cathPayload: CathLab,
    stage: HisWorkflowStage
  ) => {
    const postWorkflowRecord = async (endpoint: string, payload: Record<string, any>) => {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!response.ok) {
        const text = await response.text().catch(() => '');
        throw new Error(text || `Không thể ghi ${endpoint}`);
      }
    };

    const responsible = resolveResponsibleStaffForHisStage(consult, stage, cathPayload);
    const adminStaff = staffList.filter(staff => String(staff.Role || '').toLowerCase() === 'admin');
    const recipients = new Map<string, Staff>();
    if (responsible) recipients.set(responsible.StaffKey, responsible);
    adminStaff.forEach(staff => recipients.set(staff.StaffKey, staff));

    const baseDedup = `his-auto-close:${consult.ConsultKey}:${cathPayload.CathDate}:${stage}`;
    const title = 'HIS import tự hoàn tất ca treo';
    const message = `${patient.PatientName || patient.PatientID1} đã có kết quả thông tim thực tế ngày ${formatVNTime(cathPayload.CathDate)} từ HIS. Workflow treo "${getHisStageLabel(stage)}" đã được tự động đóng.`;

    await Promise.all([
      ...Array.from(recipients.values()).map(staff => {
        const notification = {
          NotificationKey: `notif_${baseDedup}:${staff.StaffKey}`.replace(/[^a-zA-Z0-9_-]/g, '_'),
          StaffKey: staff.StaffKey,
          StaffName: staff.StaffName,
          Title: title,
          Message: message,
          Severity: stage === 'missing_cath_result' ? 'critical' : 'warning',
          RelatedEntityType: 'Consult',
          RelatedEntityKey: consult.ConsultKey,
          PatientKey: patient.PatientKey,
          PatientID: patient.PatientID1,
          PatientName: patient.PatientName,
          DedupKey: `${baseDedup}:notify:${staff.StaffKey}`,
          IsRead: false,
          CreatedTime: new Date().toISOString(),
          ReadTime: ''
        };
        return postWorkflowRecord('/api/notifications', notification);
      }),
      responsible ? postWorkflowRecord(
        '/api/doctor-performance-marks',
        {
          MarkKey: `mark_${baseDedup}:${responsible.StaffKey}`.replace(/[^a-zA-Z0-9_-]/g, '_'),
          StaffKey: responsible.StaffKey,
          StaffName: responsible.StaffName,
          MarkType: stage,
          Score: stage === 'missing_cath_result' ? 2 : 1,
          Label: getHisStageLabel(stage),
          Reason: message,
          RelatedEntityType: 'Consult',
          RelatedEntityKey: consult.ConsultKey,
          PatientKey: patient.PatientKey,
          PatientID: patient.PatientID1,
          PatientName: patient.PatientName,
          DedupKey: `${baseDedup}:mark:${responsible.StaffKey}`,
          CreatedBy: loggedInStaffId || 'HIS_IMPORT',
          CreatedTime: new Date().toISOString()
        }
      ) : Promise.resolve()
    ]);
  };

  const buildHisAutoCloseConsultPatch = (consult: Consult, cathPayload: CathLab, stage: HisWorkflowStage): Partial<Consult> => {
    const logLine = `[HIS import ${new Date().toISOString()}] Đã tự hoàn tất workflow "${getHisStageLabel(stage)}" vì HIS ghi nhận ca thông tim thực tế ngày ${formatVNTime(cathPayload.CathDate)}. CathKey=${cathPayload.CathKey}`;
    const resultPatch = hasConsultResult(consult)
      ? {}
      : {
          ConsultResultID: 'Can thiệp thông tim' as Consult['ConsultResultID'],
          DetailConsultResult: String(consult.DetailConsultResult || '').trim() || 'Đã thực hiện thông tim thực tế theo HIS',
          ConsultResultUpdatedBy: loggedInStaffId || 'HIS_IMPORT',
          ConsultResultUpdatedTime: new Date().toISOString()
        };

    return {
      ...resultPatch,
      CallStatus: 'Đã can thiệp/mổ',
      PlannedCathLabDate: cathPayload.CathDate,
      TransferredToCathLab: true,
      CathMethod: Array.isArray(cathPayload.CathMethod) ? cathPayload.CathMethod.join(' + ') : String(cathPayload.CathMethod || ''),
      PostCathDepart: consult.PostCathDepart || 'Tim Mạch',
      ConsultNote: consult.ConsultNote ? `${consult.ConsultNote}\n${logLine}` : logLine
    };
  };

  const handleHisImportFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setHisImporting(true);
    setHisImportStatus('Đang đọc file HIS...');

    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1, raw: true });
      const headerRowIndex = rows.findIndex(row => {
        const normalized = row.map(normalizeHisHeader);
        return normalized.includes('manb') && normalized.includes('tendichvu');
      });

      if (headerRowIndex === -1) {
        throw new Error('Không tìm thấy dòng tiêu đề có cột "Mã NB" và "Tên dịch vụ".');
      }

      const headerMap = new Map<string, number>();
      rows[headerRowIndex].forEach((header, index) => {
        const normalized = normalizeHisHeader(header);
        if (normalized) headerMap.set(normalized, index);
      });

      const currentPatients = [...patients];
      const patientsToCreate: Patient[] = [];
      const cathlabsToCreate: CathLab[] = [];
      const consultsToAutoClose: Array<{ consult: Consult; patient: Patient; cath: CathLab; stage: HisWorkflowStage; patch: Partial<Consult> }> = [];
      const importedSummaries: string[] = [];
      const existingCathKeys = buildExistingCathImportKeys(currentPatients, cathlabs);
      const importedKeys = new Set<string>();
      let skippedExisting = 0;
      let skippedInvalid = 0;

      rows.slice(headerRowIndex + 1).forEach((row, index) => {
        const patientId = getHisCell(row, headerMap, ['manb']);
        const patientName = getHisCell(row, headerMap, ['hovatennb', 'hotennb', 'hovatenbn']);
        const cathMethod = getHisCell(row, headerMap, ['tendichvu']);
        const cathDate = parseHisDateOnly(getHisCell(row, headerMap, ['thoigianbatdaupttt']));
        const preDiagnosis = getHisCell(row, headerMap, ['chandoantruocttt']);
        const postDiagnosis = getHisCell(row, headerMap, ['chandoansaupttt']) || preDiagnosis;

        if (!patientId || !cathMethod || !cathDate) {
          skippedInvalid++;
          return;
        }

        const importKey = buildCathImportKey(patientId, cathDate, cathMethod);
        if (existingCathKeys.has(importKey) || importedKeys.has(importKey)) {
          skippedExisting++;
          return;
        }

        let patient = findPatientByHisId(patientId, currentPatients);
        if (!patient) {
          patient = {
            PatientKey: `pat_his_${Date.now()}_${index}`,
            PatientID1: patientId,
            PatientID2: '',
            PatientName: patientName || patientId,
            OtherPatientName: '',
            PatientDOB: parseHisDateOnly(getHisCell(row, headerMap, ['ngaysinh'])),
            PatientSex: normalizeHisSex(getHisCell(row, headerMap, ['gioitinh'])),
            PatientAddress: DEFAULT_HIS_PATIENT_ADDRESS,
            PatientPhone1: '',
            PatientPhone2: '',
            PatientCreateBy: loggedInStaffId || 'HIS_IMPORT',
            PatientCreateTime: new Date().toISOString(),
            Outcome: 'Đã thông',
            PatientAddressDefaultWarning: HIS_ADDRESS_WARNING
          };
          currentPatients.push(patient);
          patientsToCreate.push(patient);
        }

        const matchedConsult = findBestConsultForHisCath(patient.PatientKey, cathDate);
        const autoDiagnosisID = normalizeDiagnosisID(
          matchedConsult?.DiagnosisID || classifyDiagnosisText(postDiagnosis, preDiagnosis)
        );
        const cathPayload: CathLab = {
          CathKey: `cath_his_${Date.now()}_${index}`,
          PatientKey: patient.PatientKey,
          ConsultKey: matchedConsult?.ConsultKey || '',
          CathDate: cathDate,
          DiagnosisID: autoDiagnosisID,
          PostDiagnosisID: autoDiagnosisID,
          PostDiagnosis: postDiagnosis,
          CathResultID: 'Thành công',
          CathMethod: cathMethod as any,
          CathPlan: 'Tái khám thường',
          CathNote: matchedConsult
            ? `Import từ file thủ thuật HIS; đối soát ConsultKey=${matchedConsult.ConsultKey}`
            : 'Import từ file thủ thuật HIS; chưa tìm thấy hội chẩn phù hợp để đối soát',
          _1stInterventionist: normalizeHisDoctor(getHisCell(row, headerMap, ['ptvchinh'])),
          _2ndInterventionist: normalizeHisDoctor(getHisCell(row, headerMap, ['ptv1'])),
          _3rdInterventionist: normalizeHisDoctor(getHisCell(row, headerMap, ['ptv2'])),
          _4thInterventionist: '',
          PlannedFollowUpDate: '',
          CathUpdatedBy: loggedInStaffId,
          CathUpdatedTime: new Date().toISOString()
        };

        cathlabsToCreate.push(cathPayload);
        if (matchedConsult) {
          const stage = getHisWorkflowStage(matchedConsult);
          consultsToAutoClose.push({
            consult: matchedConsult,
            patient,
            cath: cathPayload,
            stage,
            patch: buildHisAutoCloseConsultPatch(matchedConsult, cathPayload, stage)
          });
        }
        importedSummaries.push(`${patient.PatientName || patientName || patientId} - ${autoDiagnosisID || 'Chưa mã hóa ICD'} - ${postDiagnosis || 'Không có chẩn đoán'} - ${cathMethod} - ${formatVNTime(cathDate)}`);
        importedKeys.add(importKey);
      });

      if (patientsToCreate.length === 0 && cathlabsToCreate.length === 0) {
        setHisImportStatus(`Không có ca mới. Bỏ qua ${skippedExisting} ca đã có.`);
        alert(`Không có ca mới để import.\nĐã bỏ qua: ${skippedExisting}\nDòng thiếu dữ liệu: ${skippedInvalid}`);
        return;
      }

      setHisImportStatus(`Đang lưu ${cathlabsToCreate.length} ca HIS...`);
      patientsToCreate.forEach(patient => onAddPatient?.(patient));
      cathlabsToCreate.forEach(cath => onAddCathlab?.(cath));

      for (const patient of patientsToCreate) {
        const response = await fetch('/api/patients', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(patient)
        });
        if (!response.ok) throw new Error(`Không thể tạo BN ${patient.PatientID1}`);
      }

      for (const cath of cathlabsToCreate) {
        const response = await fetch('/api/cathlabs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(cath)
        });
        if (!response.ok) throw new Error(`Không thể import CathLab ${cath.CathKey}`);
      }

      let autoClosedCount = 0;
      for (const item of consultsToAutoClose) {
        onPatchConsult?.(item.consult.ConsultKey, item.patch);
        const response = await fetch(`/api/consults/${encodeURIComponent(item.consult.ConsultKey)}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(item.patch)
        });
        if (!response.ok) throw new Error(`Không thể tự đóng workflow Consult ${item.consult.ConsultKey}`);
        await createHisWorkflowNotificationAndMark(item.consult, item.patient, item.cath, item.stage);
        autoClosedCount++;
      }

      setActiveTab('done');
      const summaryText = importedSummaries.slice(0, 20).map((summary, idx) => `${idx + 1}. ${summary}`).join('\n');
      const truncatedNote = importedSummaries.length > 20 ? `\n... và ${importedSummaries.length - 20} ca khác` : '';
      setHisImportStatus(`Đã import ${cathlabsToCreate.length} ca. Tự đóng ${autoClosedCount} workflow treo. Tạo mới ${patientsToCreate.length} BN. ${importedSummaries.slice(0, 3).join(' | ')}${importedSummaries.length > 3 ? '...' : ''}`);
      alert(`Import HIS hoàn tất.\nCa CathLab mới: ${cathlabsToCreate.length}\nWorkflow tự đóng: ${autoClosedCount}\nBN mới: ${patientsToCreate.length}\nBỏ qua ca đã có: ${skippedExisting}\nDòng thiếu dữ liệu: ${skippedInvalid}\n\nCác ca bổ sung:\n${summaryText}${truncatedNote}`);
      onRefreshData();
    } catch (error) {
      console.error(error);
      const message = error instanceof Error ? error.message : 'Không thể import file HIS';
      setHisImportStatus(message);
      alert(message);
      onRefreshData();
    } finally {
      setHisImporting(false);
      event.target.value = '';
    }
  };

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

    fetch(`/api/consults/${consult.ConsultKey}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
      .then(res => {
        if (!res.ok) throw new Error('Không thể cập nhật trạng thái chuyển phòng thông tim');
        onRefreshData();
      })
      .catch(err => {
        console.error(err);
        alert(err instanceof Error ? err.message : 'Không thể chuyển phòng thông tim. Vui lòng thử lại.');
        onRefreshData();
      });
  };

  const handleAdHocPatientSelect = (patient: Patient) => {
    const waitlistConsult = getSchedulingWaitlistConsult(patient.PatientKey, consults, patients);
    if (waitlistConsult) {
      triggerConfirm(
        'BN này đang chờ trong view Xếp lịch. Bạn có muốn tiếp tục chuyển phòng thông tim?',
        () => {
          activateEmergencyTransferFromScheduling(waitlistConsult, patient).catch((err) => {
            console.error(err);
            alert(err.message || 'Không thể chuyển phòng thông tim. Vui lòng thử lại.');
          });
        },
        'Chuyển phòng thông tim'
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
        alert("Vui lòng điền đầy đủ các thông tin bắt buộc (*)");
        return;
     }
     
     if (adHocPatientMode === 'existing' && !adHocSelectedPatientKey) {
        alert("Vui lòng chọn bệnh nhân.");
        return;
     }

     if (adHocPatientMode === 'existing' && adHocSelectedPatientKey) {
        const waitlistConsult = getSchedulingWaitlistConsult(adHocSelectedPatientKey, consults, patients);
        const patient = findPatientByKey(patients, adHocSelectedPatientKey);
        if (waitlistConsult && patient) {
          triggerConfirm(
            'BN này đang chờ trong view Xếp lịch. Bạn có muốn tiếp tục chuyển phòng thông tim?',
            () => {
              activateEmergencyTransferFromScheduling(waitlistConsult, patient).catch((err) => {
                console.error(err);
                alert(err.message || 'Không thể chuyển phòng thông tim. Vui lòng thử lại.');
              });
            },
            'Chuyển phòng thông tim'
          );
          return;
        }
     }

     if (adHocPatientMode === 'new' && (!adHocPatientID1 || !adHocPatientName || !adHocPatientDOB || !adHocPatientAddress)) {
        alert("Vui lòng điền đầy đủ thông tin hành chính bệnh nhân.");
        return;
     }

     const cathKey = `cath_${Date.now()}`;
     const consultKey = `consult_${Date.now()}`;
     const patientKey = adHocPatientMode === 'existing' ? adHocSelectedPatientKey : `pat_${Date.now()}`;

     let pName = adHocPatientName;
     // If existing patient, grab the name from existing pat
     if (adHocPatientMode === 'existing') {
        const pat = findPatientByKey(patients, patientKey);
        if (pat) pName = pat.PatientName;
     }

     const cathPayload: CathLab = {
       ...formData,
       CathKey: cathKey,
       ConsultKey: consultKey,
       PatientKey: patientKey,
       CathMethod: safeCathMethod.join(' + ')
     } as CathLab;

     const consultPayload: Consult = {
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
       DetailConsultResult: 'Cấp cứu thông tim',
       PriorityOrder: 'Cấp cứu',
       PlannedCathLabDate: formData.CathDate,
       TransferredToCathLab: true,
       Scheduled1stInterventionist: formData._1stInterventionist,
       Scheduled2ndInterventionist: formData._2ndInterventionist,
       Scheduled3rdInterventionist: formData._3rdInterventionist
     } as Consult;

     if (adHocPatientMode === 'new') {
       onAddPatient?.({
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
       } as Patient);
     }
     onAddConsult?.(consultPayload);
     onAddCathlab?.(cathPayload);
     closeModal();

     const persist = async () => {
       if (adHocPatientMode === 'new') {
         const patRes = await fetch('/api/patients', {
           method: 'POST',
           headers: { 'Content-Type': 'application/json' },
           body: JSON.stringify({
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
             PatientCreateTime: new Date().toISOString()
           })
         });
         if (!patRes.ok) throw new Error('Không thể tạo bệnh nhi mới');
       }
       const conRes = await fetch('/api/consults', {
         method: 'POST',
         headers: { 'Content-Type': 'application/json' },
         body: JSON.stringify(consultPayload)
       });
       if (!conRes.ok) throw new Error('Không thể tạo hội chẩn cấp cứu');
       const cathRes = await fetch('/api/cathlabs', {
         method: 'POST',
         headers: { 'Content-Type': 'application/json' },
         body: JSON.stringify(cathPayload)
       });
       if (!cathRes.ok) throw new Error('Không thể lưu kết quả thông tim');
       onRefreshData();
     };

     persist().catch(e => {
       console.error(e);
       alert(e instanceof Error ? e.message : 'Không thể lưu ca cấp cứu thông tim');
       onRefreshData();
     });
  };

  // Logic: Auto fill CathPlan based on CathMethod
  useEffect(() => {
    if (Array.isArray(formData.CathMethod) && formData.CathMethod.length > 0) {
      const hasSpecial = formData.CathMethod.some(m => CATH_METHODS_SPECIAL.includes(m));
      if (hasSpecial) {
        setFormData(prev => ({ ...prev, CathPlan: 'Theo dõi sát' }));
      } else {
        setFormData(prev => ({ ...prev, CathPlan: 'Tái khám thường' }));
      }
    }
  }, [formData.CathMethod]);

  const handleCathMethodToggle = (method: string) => {
     setFormData(prev => {
        const methods = parseCathMethods(prev.CathMethod);
        if (methods.includes(method)) {
           return { ...prev, CathMethod: methods.filter(m => m !== method) };
        } else {
           return { ...prev, CathMethod: [...methods, method] };
        }
     });
  };

  const saveCathLab = async (isEdit: boolean) => {
     const safeCathMethod = parseCathMethods(formData.CathMethod);
     if (!formData.CathDate || !formData.PostDiagnosisID || !formData.CathResultID || safeCathMethod.length === 0 || !formData.CathPlan || !formData._1stInterventionist || !formData._2ndInterventionist) {
        alert("Vui lòng điền đầy đủ các thông tin bắt buộc (*)");
        return;
     }

     const method = isEdit ? 'PUT' : 'POST';
     const url = isEdit ? `/api/cathlabs/${formData.CathKey}` : '/api/cathlabs';
     
     const consultKey = isEdit ? selectedDone?.cath.ConsultKey : selectedPending?.c.ConsultKey;
     const patientKey = isEdit ? selectedDone?.p.PatientKey : selectedPending?.p.PatientKey;

     const payload = {
       ...formData,
       ConsultKey: consultKey,
       PatientKey: patientKey,
       CathMethod: safeCathMethod.join(' + ')
     };

     if (isEdit && formData.CathKey) {
       onPatchCathlab?.(formData.CathKey, payload);
     } else {
       onAddCathlab?.(payload as CathLab);
     }
     closeModal();

     fetch(url, {
       method,
       headers: { 'Content-Type': 'application/json' },
       body: JSON.stringify(payload)
     })
       .then(res => {
         if (!res.ok) throw new Error('Không thể lưu kết quả thông tim');
         onRefreshData();
       })
       .catch(e => {
         console.error(e);
         alert(e instanceof Error ? e.message : 'Không thể lưu kết quả thông tim');
         onRefreshData();
       });
  };

  const handlePostpone = (action: 'return' | 'remove') => {
     if(!selectedPending) return;
     if(!callNote) {
       alert("Vui lòng điền ghi chú (Call Note) lý do trạng thái hoãn");
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
       closeModal();

       fetch(`/api/consults/${selectedPending.c.ConsultKey}`, {
         method: 'PUT',
         headers: { 'Content-Type': 'application/json' },
         body: JSON.stringify(payload)
       })
         .then(res => {
           if (!res.ok) throw new Error('Không thể cập nhật trạng thái ca');
           onRefreshData();
         })
         .catch(err => {
           console.error(err);
           alert(err instanceof Error ? err.message : 'Không thể cập nhật trạng thái ca');
           onRefreshData();
         });
     });
  };

  return (
    <div className="flex-1 flex flex-col p-4 w-full h-full overflow-hidden bg-slate-50">
       <div className="flex flex-wrap items-center gap-3 mb-4 shrink-0">
          <button 
            onClick={() => setActiveTab('pending')}
            className={`font-extrabold text-[13px] px-5 py-2.5 rounded-2xl transition flex items-center gap-2 ${activeTab === 'pending' ? 'bg-indigo-600 text-white shadow-md' : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50 shadow-sm'}`}
          >
             <CalendarDays className="w-4 h-4"/>
             Danh sách chờ thông tim
             <span className={`px-2 py-0.5 rounded-full text-[11px] font-black ${activeTab==='pending'?'bg-indigo-500 text-white':'bg-slate-100 text-slate-500'}`}>{pendingConsults.length}</span>
          </button>
          
          <button 
            onClick={() => setActiveTab('done')}
            className={`font-extrabold text-[13px] px-5 py-2.5 rounded-2xl transition flex items-center gap-2 ${activeTab === 'done' ? 'bg-indigo-600 text-white shadow-md' : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50 shadow-sm'}`}
          >
             <Activity className="w-4 h-4"/>
             Danh sách đã thông tim
             <span className={`px-2 py-0.5 rounded-full text-[11px] font-black ${activeTab==='done'?'bg-indigo-500 text-white':'bg-slate-100 text-slate-500'}`}>{doneCathlabs.length}</span>
          </button>

          <div className="ml-auto flex items-center gap-2">
             <div className="flex items-center gap-2 bg-white rounded-2xl shadow-sm border border-slate-200 px-4 py-2.5">
                <Search className="w-4 h-4 text-slate-400" />
                <input 
                   type="text" 
                   placeholder="Tìm tên, mã ICD..."
                   value={searchTerm}
                   onChange={e => setSearchTerm(e.target.value)}
                   className="bg-transparent border-none outline-none text-[13px] text-slate-700 w-56 font-bold placeholder:font-medium placeholder:text-slate-400"
                />
             </div>
             <button
                onClick={() => hisImportInputRef.current?.click()}
                disabled={hisImporting}
                className="font-extrabold text-[13px] px-4 py-2.5 rounded-2xl transition flex items-center gap-2 bg-white text-rose-700 border border-rose-200 shadow-sm hover:bg-rose-50 disabled:opacity-50 disabled:cursor-not-allowed"
             >
                <Upload className="w-4 h-4" />
                {hisImporting ? 'Đang import HIS...' : 'Import HIS'}
             </button>
             <input
                ref={hisImportInputRef}
                type="file"
                accept=".xlsx,.xls"
                className="hidden"
                onChange={handleHisImportFile}
             />
             <button
                onClick={openAdHocForm}
                className="font-extrabold text-[13px] px-5 py-2.5 rounded-2xl transition flex items-center gap-2 bg-rose-600 text-white shadow-md hover:bg-rose-700 ml-2"
             >
                <Plus className="w-4 h-4" />
                Nhập TT cấp cứu
             </button>
          </div>
       </div>
       {hisImportStatus && (
         <div className="text-[11px] font-bold text-rose-700 bg-rose-50 border border-rose-100 rounded-2xl px-3 py-2">
           {hisImportStatus}
         </div>
       )}

       {activeTab === 'pending' && (
         <div className="flex-1 overflow-hidden bg-white rounded-3xl shadow-sm border border-slate-200 flex flex-col">
            <div className="flex-1 overflow-auto custom-scrollbar">
              <table className="w-full text-left text-xs border-collapse min-w-[800px]">
                <thead className="sticky top-0 z-10">
                  <tr className="bg-slate-50 text-slate-600 border-b border-slate-200 text-[10px] uppercase font-black tracking-wider font-mono">
                    <th className="py-3 px-4 w-12 text-center shadow-sm relative"><div className="resize-x overflow-hidden w-full h-full min-w-8">STT</div></th>
                    <th className="py-3 px-4 shadow-sm min-w-[250px] w-72 relative"><div className="resize-x overflow-hidden w-full h-full min-w-[150px]">Họ tên Bệnh Nhi</div></th>
                    <th className="py-3 px-4 w-32 text-center shadow-sm relative"><div className="resize-x overflow-hidden w-full h-full min-w-[100px]">Ngày sinh</div></th>
                    <th className="py-3 px-4 w-32 text-center shadow-sm relative"><div className="resize-x overflow-hidden w-full h-full min-w-[100px]">Mã bệnh (ICD)</div></th>
                    <th className="py-3 px-4 w-40 text-center shadow-sm cursor-pointer group relative" onClick={() => setSortAsc(!sortAsc)}>
                      <div className="flex items-center justify-center gap-1 resize-x overflow-hidden w-full h-full min-w-[120px]">
                        Ngày TT dự kiến
                        <ArrowUpDown className="w-3 h-3 text-slate-400 group-hover:text-indigo-600 inline" />
                      </div>
                    </th>
                    <th className="py-3 px-4 w-48 text-center shadow-sm relative"><div className="resize-x overflow-hidden w-full h-full min-w-[150px]">PTV Phụ 1</div></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-semibold text-slate-700">
                   {pendingConsults.length === 0 && (
                     <tr>
                       <td colSpan={6} className="p-8 text-center text-slate-400 italic font-semibold">Chưa có ca chờ thông tim</td>
                     </tr>
                   )}
                   {pendingConsults.map((c, i) => {
                      const p = findPatientByKey(patients, c.PatientKey);
                      if (!p) return null;
                      return (
                        <tr key={c.ConsultKey} onClick={() => openPendingForm(c, p)} className="hover:bg-slate-50 cursor-pointer transition">
                          <td className="py-4 px-4 text-center text-slate-400 font-bold">{i+1}</td>
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
                    <th className="py-3 px-4 w-12 text-center shadow-sm relative"><div className="resize-x overflow-hidden w-full h-full min-w-8">STT</div></th>
                    <th className="py-3 px-4 shadow-sm min-w-[250px] w-72 relative"><div className="resize-x overflow-hidden w-full h-full min-w-[150px]">Họ tên Bệnh Nhi</div></th>
                    <th className="py-3 px-4 w-32 text-center shadow-sm relative"><div className="resize-x overflow-hidden w-full h-full min-w-[100px]">Ngày sinh</div></th>
                    <th className="py-3 px-4 w-32 text-center shadow-sm relative"><div className="resize-x overflow-hidden w-full h-full min-w-[100px]">ICD (Sau TT)</div></th>
                    <th className="py-3 px-4 shadow-sm min-w-[250px] w-64 relative"><div className="resize-x overflow-hidden w-full h-full min-w-[150px]">Chẩn đoán sau TT</div></th>
                    <th className="py-3 px-4 shadow-sm min-w-[250px] w-64 relative"><div className="resize-x overflow-hidden w-full h-full min-w-[150px]">PP Can thiệp</div></th>
                    <th className="py-3 px-4 w-40 text-center shadow-sm relative"><div className="resize-x overflow-hidden w-full h-full min-w-[120px]">Ngày thực hiện</div></th>
                    <th className="py-3 px-4 w-48 text-center shadow-sm relative"><div className="resize-x overflow-hidden w-full h-full min-w-[150px]">PTV Phụ 1</div></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-semibold text-slate-700">
                   {doneCathlabs.length === 0 && (
                     <tr>
                       <td colSpan={8} className="p-8 text-center text-slate-400 italic font-semibold">Chưa có ca đã thông tim</td>
                     </tr>
                   )}
                   {doneCathlabs.map((cath, i) => {
                      const p = findPatientByKey(patients, cath.PatientKey);
                      if (!p) return null;
                      return (
                        <tr key={cath.CathKey} onClick={() => openDoneForm(cath)} className="hover:bg-slate-50 cursor-pointer transition">
                          <td className="py-4 px-4 text-center text-slate-400 font-bold">{i+1}</td>
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
            <div className="bg-slate-50 border-t border-slate-200 p-4 flex flex-col sm:flex-row items-center justify-between gap-4 shrink-0">
              <div className="text-[11px] text-slate-500 font-semibold font-mono uppercase">
                TỔNG SỐ ĐÃ THÔNG TIM: {doneCathlabs.length} CA 
              </div>
            </div>
         </div>
       )}

       {/* ===================== FORM MODAL ===================== */}
       {(selectedPending || selectedDone || isAdHocModalOpen) && (
         <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
           <div className="bg-white rounded-3xl max-w-4xl w-full max-h-[96vh] md:max-h-[90vh] shadow-2xl border border-slate-200 flex flex-col text-sm font-medium overflow-hidden">
              <div className="bg-[#1e293b] text-white px-5 py-3 flex justify-between items-center shrink-0 z-10">
                <h3 className="font-extrabold uppercase tracking-wide flex items-center gap-2">
                   <Stethoscope /> 
                   {isAdHocModalOpen ? 'NHẬP TT CẤP CỨU' : (selectedDone ? 'HỒ SƠ THÔNG TIM (SỬA)' : 'NHẬP KẾT QUẢ THÔNG TIM')}
                </h3>
                <button onClick={closeModal} className="p-2 hover:bg-slate-700 rounded-lg transition"><Undo2 className="w-4 h-4"/></button>
              </div>

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
                                        className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 font-bold text-slate-800 font-mono text-center"
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
                                        options={SOURCE_PROVINCE}
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
                  </div>

                  {formData.CathResultID !== 'Hoãn' ? (
                    <>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-xs font-semibold">
                      <div>
                        <label className="block text-slate-500 font-bold text-[10px] uppercase mb-1">Ngày thông tim <span className="text-rose-500">*</span></label>
                        <VNDateInput
                          value={formData.CathDate || ''} 
                          onChange={(val: string) => setFormData({...formData, CathDate: val})}
                          className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-bold text-slate-800 font-mono focus:outline-none focus:ring-1 focus:ring-indigo-500 text-center"
                        />
                      </div>
                      
                      <div>
                        <label className="block text-slate-500 font-bold text-[10px] uppercase mb-1">ICD Sau TT <span className="text-rose-500">*</span></label>
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

                      <div>
                        <label className="block text-slate-500 font-bold text-[10px] uppercase mb-1">Kế hoạch (Sau TT) <span className="text-rose-500">*</span></label>
                        <select 
                          value={formData.CathPlan} 
                          onChange={e => setFormData({...formData, CathPlan: e.target.value})}
                          className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-bold text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                        >
                           <option value="Tái khám thường">Tái khám thường</option>
                           <option value="Theo dõi sát">Theo dõi sát</option>
                           <option value="Cần thông tim can thiệp lại">Cần thông tim can thiệp lại</option>
                           <option value="Đăng ký staff nội-ngoại khoa">Đăng ký staff nội-ngoại khoa</option>
                           <option value="Mổ khẩn">Mổ khẩn</option>
                        </select>
                      </div>
                    </div>

                    <div className="space-y-4 pt-2">
                       <div>
                         <label className="block text-slate-500 font-bold text-[10px] uppercase mb-1">Phương pháp can thiệp <span className="text-rose-500">*</span></label>
                         <SearchableEnumSelect
                           multiple
                           required
                           options={SOURCE_CATH_METHOD}
                           values={parseCathMethods(formData.CathMethod)}
                           onMultiChange={(methods) => setFormData({...formData, CathMethod: methods})}
                           placeholder="Chọn phương pháp..."
                           searchPlaceholder="Gõ phương pháp để tìm..."
                           direction="up"
                         />
                       </div>

                       {formData.CathPlan === 'Theo dõi sát' && (
                          <div className="bg-amber-50 border border-amber-200 p-4 rounded-xl animate-in slide-in-from-top-1">
                             <label className="block text-amber-800 font-bold text-[10px] uppercase mb-1 flex items-center gap-1">
                               <CalendarDays className="w-3 h-3"/> Ngày hẹn tái khám <span className="text-rose-500">*</span>
                             </label>
                             <VNDateInput
                               value={formData.PlannedFollowUpDate || ''} 
                               onChange={(val: string) => setFormData({...formData, PlannedFollowUpDate: val})}
                               className="w-full max-w-[250px] bg-white border border-amber-300 rounded-xl px-3 py-2 font-bold text-slate-800 font-mono focus:outline-none focus:ring-1 focus:ring-amber-500"
                             />
                          </div>
                       )}

                       <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                         <div>
                           <label className="block text-slate-500 font-bold text-[10px] uppercase mb-1">Chẩn đoán chi tiết sau TT <span className="text-[9px] font-normal italic lowercase opacity-80">[Điền Nếu có khác biệt lớn]</span></label>
                           <textarea 
                             rows={2}
                             value={formData.PostDiagnosis} 
                             onChange={e => setFormData({...formData, PostDiagnosis: e.target.value})}
                             className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500 resize-y"
                           />
                         </div>
                         <div>
                           <label className="block text-slate-500 font-bold text-[10px] uppercase mb-1">Ghi chú</label>
                           <textarea 
                             rows={2}
                             value={formData.CathNote} 
                             onChange={e => setFormData({...formData, CathNote: e.target.value})}
                             className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500 resize-y"
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
                            closeModal();
                            onViewPatientRecord(selectedDone.p);
                          }}
                          className="mr-auto px-6 py-2 bg-slate-200 text-slate-800 hover:bg-slate-300 rounded-xl font-black text-xs transition"
                        >Xem hồ sơ</button>
                      )}
                      
                      <button 
                        onClick={() => saveCathLab(!!selectedDone)}
                        className="px-6 py-2 bg-indigo-600 text-white hover:bg-indigo-700 rounded-xl font-black text-xs transition flex items-center gap-2"
                      ><Save className="w-4 h-4"/> Lưu hồ sơ TDTT</button>
                    </>
                 )}
              </div>
           </div>
         </div>
       )}

    </div>
  );
}
