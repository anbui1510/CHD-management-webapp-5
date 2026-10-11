import React, { useEffect, useMemo, useRef, useState } from 'react';
import { PatientAdminEditButton } from './PatientAdminEditButton';
import { AnimatePresence } from 'motion/react';
import { AlertTriangle, ClipboardList, Stethoscope, X } from 'lucide-react';
import {
  Consult,
  ConsultResultEnum,
  ConsultTypeEnum,
  OutcomeType,
  Patient,
  PRIORITY_OPTIONS,
  Source,
  DeviceTemplate,
  Staff,
  formatVNTime,
  findPatientByKey,
  normalizePriorityOrder
} from '../types';
import { SearchableEnumSelect } from './SearchableEnumSelect';
import { VNDateInput } from './VNDateInput';
import { getSourceDiagnosisOptions, getSourceConsultResultOptions } from '../data/source';
import { getShortStaffName } from '../utils/staffNameMatch';
import { formatDateTime, getExcelAgeHelper } from '../utils/patientDisplay';
import { PlannedDeviceSuggestBox } from './PlannedDeviceSuggestBox';
import { MobileAutoExpandTextarea } from './MobileAutoExpandTextarea';
import { useSheetsSyncFeedback } from '../context/SheetsSyncFeedbackContext';
import { buildSyncContext, withSyncContext } from '../utils/sheetsSyncMutation';
import { MODAL_TITLE } from '../utils/modalTitles';
import { useIsMobile } from '../hooks/useMediaQuery';
import { useLockBodyScroll, usePreventBackgroundTouchScroll } from '../hooks/useLockBodyScroll';
import { useMobileKeyboardInset } from '../hooks/useMobileKeyboardInset';
import { StaffSummaryExportActions } from './ConsultSummaryModal';

const CONCLUSION_OPTIONS = [
  'Can thiệp thông tim',
  'Chụp chẩn đoán-Đo kháng lực',
  'Chụp chẩn đoán +/- can thiệp',
  'Tiền Glenn',
  'Tiền Fontan',
  'Điện sinh lý',
  'Mổ tim',
  'Thêm CĐHA; vđ khác - Staff lại',
  'Chụp MRI',
  'Chưa có chỉ định - Theo dõi tiếp',
  'Điều trị nội khoa - Hẹn staff lại',
  'Quá chỉ định',
  'Không có thông tin'
];

type ResultFormState = {
  ConsultResultID: ConsultResultEnum | '';
  DetailConsultResult: string;
  PlannedDevice: string;
  PlannedPrice: string;
  CheckDevice: string;
  PatientWeight: string;
  PatientHeight: string;
  ConsultType: ConsultTypeEnum;
  ConsultDate: string;
  RequestBy: string;
  DiagnosisID: string;
  DetailDiagnosis: string;
  ConsultMember: string;
  PriorityOrder: string;
};

const normalizeConsultMembers = (value: Consult['ConsultMember']): string => {
  if (!value) return '';
  if (Array.isArray(value)) return value.join(', ');
  return String(value).trim();
};

const buildFormState = (consult: Consult): ResultFormState => ({
  ConsultResultID: (consult.ConsultResultID || '') as ConsultResultEnum,
  DetailConsultResult: consult.DetailConsultResult || '',
  PlannedDevice: consult.PlannedDevice || '',
  PlannedPrice: consult.PlannedPrice || '',
  CheckDevice: consult.CheckDevice || '',
  PatientWeight: consult.PatientWeight || '',
  PatientHeight: consult.PatientHeight || '',
  ConsultType: consult.ConsultType || 'Staff mổ',
  ConsultDate: consult.ConsultDate || '',
  RequestBy: consult.RequestBy || '',
  DiagnosisID: consult.DiagnosisID || '',
  DetailDiagnosis: consult.DetailDiagnosis || '',
  ConsultMember: normalizeConsultMembers(consult.ConsultMember),
  PriorityOrder: normalizePriorityOrder(consult.PriorityOrder)
});

export interface ResultStaffDrawerProps {
  consultKey: string | null;
  consults: Consult[];
  patients: Patient[];
  staffList: Staff[];
  sources: Source[];
  deviceTemplates?: DeviceTemplate[];
  currentStaff: Staff | null;
  onClose: () => void;
  onPatchConsult: (consultKey: string, patch: Partial<Consult>) => void;
  onPatchPatient: (patientKey: string, patch: Partial<Patient>) => void;
  onRefreshData: () => void;
  onEditPatientAdmin: (patient: Patient) => void;
  createDiagnosisSource: (DiagnosisID: string) => Promise<void>;
  triggerAlert: (message: string, title?: string) => void;
  onSaveSuccess?: (message: string) => void;
  /** Mở Hồ sơ bệnh án (view patients) của bệnh nhi đang hội chẩn. */
  onViewPatientRecord?: (patient: Patient) => void;
  layout?: 'modal' | 'panel';
  autoEdit?: boolean;
}

export default function ResultStaffDrawer({
  consultKey,
  consults,
  patients,
  staffList,
  sources,
  deviceTemplates = [],
  currentStaff,
  onClose,
  onPatchConsult,
  onPatchPatient,
  onRefreshData,
  onEditPatientAdmin,
  createDiagnosisSource,
  triggerAlert,
  onSaveSuccess,
  onViewPatientRecord,
  layout = 'modal',
  autoEdit = false
}: ResultStaffDrawerProps) {
  const isMobile = useIsMobile();
  const isModalOpen = layout === 'modal' && !!consultKey;
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const { keyboardInset, viewportHeight } = useMobileKeyboardInset(isModalOpen);
  const keyboardOpen = isMobile && keyboardInset > 80;
  useLockBodyScroll(isModalOpen);
  usePreventBackgroundTouchScroll(scrollContainerRef, isModalOpen);

  const { reportMutationResponse } = useSheetsSyncFeedback();
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState<ResultFormState | null>(null);
  const [formSnapshot, setFormSnapshot] = useState<ResultFormState | null>(null);
  const [exitConfirmOpen, setExitConfirmOpen] = useState(false);
  const [exitConfirmError, setExitConfirmError] = useState('');
  const [pendingExitAction, setPendingExitAction] = useState<(() => void) | null>(null);
  const [saving, setSaving] = useState(false);
  const diagnosisOptions = useMemo(() => getSourceDiagnosisOptions(sources), [sources]);
  const conclusionOptions = useMemo(() => getSourceConsultResultOptions(sources), [sources]);

  const consult = consultKey ? consults.find(c => c.ConsultKey === consultKey) : undefined;
  const patient = consult ? findPatientByKey(patients, consult.PatientKey) : undefined;

  const doctorOptions = useMemo(() => {
    const fromStaff = staffList.map(s => getShortStaffName(s.StaffName, staffList));
    const extra = Array.from(new Set(consults.map(c => String(c.RequestBy || ''))))
      .filter(d => d && !fromStaff.some(x => x.toLowerCase() === d.toLowerCase()));
    return [...fromStaff, ...extra];
  }, [staffList, consults]);

  useEffect(() => {
    if (!consultKey || !consult) {
      setFormData(null);
      setIsEditing(false);
      return;
    }
    const snapshot = buildFormState(consult);
    setFormData(snapshot);
    setFormSnapshot(snapshot);
    setIsEditing(autoEdit);
    setExitConfirmOpen(false);
    setExitConfirmError('');
    setPendingExitAction(null);
  }, [consultKey, consult?.ConsultKey, autoEdit]);

  const isFormEditing = autoEdit || isEditing;
  const isMobileModal = isMobile && layout === 'modal';
  /** Mobile bottom sheet luôn giãn full chiều cao — tránh vùng xám trống dưới footer. */
  const mobileSheetStretch = isMobileModal;

  const formStatesEqual = (a: ResultFormState, b: ResultFormState) =>
    JSON.stringify(a) === JSON.stringify(b);

  const hasUnsavedChanges = () => {
    if (!isFormEditing || !formData || !formSnapshot) return false;
    return !formStatesEqual(formData, formSnapshot);
  };

  const forceClose = () => {
    setIsEditing(false);
    setExitConfirmOpen(false);
    setExitConfirmError('');
    setPendingExitAction(null);
    setFormSnapshot(null);
    onClose();
  };

  const openExitConfirm = (onConfirm: () => void) => {
    setExitConfirmError('');
    setPendingExitAction(() => onConfirm);
    setExitConfirmOpen(true);
  };

  const requestClose = () => {
    if (isMobileModal && isFormEditing) {
      openExitConfirm(forceClose);
      return;
    }
    if (!hasUnsavedChanges()) {
      forceClose();
      return;
    }
    openExitConfirm(forceClose);
  };

  const requestRevertEdit = () => {
    if (!consult) return;
    const revert = () => {
      setFormData(buildFormState(consult));
      setIsEditing(false);
      if (autoEdit) forceClose();
    };
    if (isMobileModal && isFormEditing) {
      openExitConfirm(revert);
      return;
    }
    if (hasUnsavedChanges()) {
      openExitConfirm(revert);
      return;
    }
    revert();
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
    action?.();
  };

  const executeSave = async (options?: { closeOnSuccess?: boolean }): Promise<boolean> => {
    if (!consultKey || !formData || !consult) return false;

    if (!formData.DiagnosisID) {
      triggerAlert('Vui lòng chọn ICD (DiagnosisID)!', MODAL_TITLE.missingInfo);
      return false;
    }
    if (!formData.ConsultResultID) {
      triggerAlert('Vui lòng chọn Kết luận chính (ConsultResultID)!', MODAL_TITLE.missingInfo);
      return false;
    }
    const finalData = {
      ...formData,
      ConsultResultUpdatedBy: currentStaff?.StaffKey || '01378',
      ConsultResultUpdatedTime: new Date().toISOString()
    };

    onPatchConsult(consultKey, finalData);
    setFormSnapshot({ ...formData });
    if (!autoEdit) setIsEditing(false);

    let automaticOutcome: OutcomeType = '';
    if (formData.ConsultResultID === 'Can thiệp thông tim') {
      automaticOutcome = 'Đã thông';
    } else if (formData.ConsultResultID === 'Phẫu thuật tim hở' || formData.ConsultResultID === 'Mổ tim') {
      automaticOutcome = 'Đã mổ';
    }

    try {
      const syncContext = buildSyncContext('results-staff', {
        patientName: patient?.PatientName || consult.PatientKey,
        patientKey: consult.PatientKey
      });
      const response = await fetch(`/api/consults/${consultKey}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(withSyncContext(finalData, syncContext))
      });
      if (!response.ok) {
        const d = await response.json().catch(() => ({}));
        throw new Error(d.error || 'Không thể lưu kết quả hội chẩn');
      }
      const savedData = await response.json();

      if (consult.PatientKey && automaticOutcome) {
        onPatchPatient(consult.PatientKey, { Outcome: automaticOutcome });
        const patientRes = await fetch(`/api/patients/${consult.PatientKey}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(withSyncContext({ Outcome: automaticOutcome }, buildSyncContext('results-staff', {
            patientName: patient?.PatientName,
            patientKey: consult.PatientKey
          })))
        });
        if (patientRes.ok) {
          reportMutationResponse(await patientRes.json(), { baseMessage: 'Đã cập nhật trạng thái bệnh nhi' });
        }
      }
      onRefreshData();
      reportMutationResponse(savedData, {
        baseMessage: 'Đã cập nhật chỉ định kết quả hội chẩn'
      });
      if (options?.closeOnSuccess !== false) {
        forceClose();
      }
      onSaveSuccess?.('Đã ghi lên Google Sheets');
      return true;
    } catch (err) {
      console.error(err);
      const message = err instanceof Error ? err.message : 'Không thể lưu kết quả hội chẩn';
      triggerAlert(message, MODAL_TITLE.saveError);
      setExitConfirmError(message);
      onRefreshData();
      return false;
    }
  };

  const handleExitSave = async () => {
    setSaving(true);
    setExitConfirmError('');
    const ok = await executeSave({ closeOnSuccess: false });
    setSaving(false);
    if (ok) {
      handleExitDiscard();
    }
  };

  const submitResultUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    await executeSave({ closeOnSuccess: true });
    setSaving(false);
  };

  if (!consultKey || !consult || !patient || !formData) return null;

  const isPanelLayout = layout === 'panel';
  const formScrollPadding = isPanelLayout ? 'p-3 lg:p-4 xl:p-5' : 'max-md:p-3 p-4 md:p-6';
  const formSectionSpacing = isPanelLayout ? 'space-y-4 xl:space-y-5' : 'max-md:space-y-3 space-y-6';
  const mainFormGridClass = isPanelLayout
    ? 'grid grid-cols-1 2xl:grid-cols-12 gap-3 xl:gap-4 items-stretch animate-in fade-in duration-300 min-h-0'
    : 'grid grid-cols-1 lg:grid-cols-12 gap-4 lg:gap-5 items-stretch animate-in fade-in duration-300 min-h-0';
  const leftFormColClass = isPanelLayout
    ? '2xl:col-span-5 flex flex-col gap-3 xl:gap-4 min-h-0'
    : 'lg:col-span-5 flex flex-col gap-4 min-h-0';
  const rightFormColClass = isPanelLayout
    ? '2xl:col-span-7 flex flex-col min-h-0'
    : 'lg:col-span-7 flex flex-col min-h-0';
  const innerCardPadding = isPanelLayout ? 'p-2.5 lg:p-3 xl:p-4' : 'p-3 md:p-4';
  const innerCardRadius = isPanelLayout ? 'rounded-2xl xl:rounded-3xl' : 'rounded-3xl';

  const summaryConsultOverride: Partial<Consult> = {
    ConsultResultID: (formData.ConsultResultID || consult.ConsultResultID) as Consult['ConsultResultID'],
    DetailConsultResult: formData.DetailConsultResult,
    PlannedDevice: formData.PlannedDevice,
    PlannedPrice: formData.PlannedPrice,
    CheckDevice: formData.CheckDevice,
    PatientWeight: formData.PatientWeight,
    PatientHeight: formData.PatientHeight,
    ConsultType: formData.ConsultType,
    ConsultDate: formData.ConsultDate,
    RequestBy: formData.RequestBy,
    DiagnosisID: formData.DiagnosisID,
    DetailDiagnosis: formData.DetailDiagnosis,
    ConsultMember: formData.ConsultMember,
    PriorityOrder: formData.PriorityOrder,
  };

  const drawerHeader = (
    <div className="bg-[#d2145a] text-white px-3 md:px-5 py-2 md:py-2 flex items-center justify-between shadow-sm shrink-0 rounded-t-3xl">
      <h3 className="font-extrabold text-xs md:text-sm uppercase tracking-wider flex items-center gap-1.5 font-sans min-w-0">
        <Stethoscope className="w-4 h-4 text-white shrink-0" />
        <span className="truncate max-md:text-sm md:text-sm">Điền kết quả staff</span>
      </h3>
      <button
        type="button"
        onClick={requestClose}
        className="text-white hover:bg-white/10 p-1.5 rounded-full transition-colors shrink-0"
        aria-label="Đóng"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );

  const drawerForm = (
              <form 
                onSubmit={submitResultUpdate} 
                className={`flex flex-col min-h-0 overflow-hidden max-md:text-sm md:text-xs text-slate-700 leading-relaxed font-sans${mobileSheetStretch || !isMobile ? ' flex-1' : ''}`}
              >
                <div
                  ref={scrollContainerRef}
                  className={`overflow-y-auto overscroll-contain touch-pan-y min-h-0 ${formScrollPadding}${mobileSheetStretch || !isMobile ? ' flex-1' : ''}`}
                  style={{ WebkitOverflowScrolling: 'touch' }}
                >
                <div className={`${formSectionSpacing}${isMobileModal ? ' max-md:flex-1 max-md:flex max-md:flex-col max-md:min-h-0' : ''}`}>
                      
                      <div className={`${mainFormGridClass}${isMobileModal ? ' max-md:flex-1 max-md:min-h-0' : ''}`}>
                        
                        {/* Cột trái: Bệnh nhi (trên) + Thông tin hội chẩn (dưới) */}
                        <div className={leftFormColClass}>
                        {/* Khung 1: Bệnh nhi đang hội chẩn (Hành chính) — phía trên */}
                        <div className="flex flex-col shrink-0">
                          <div className={`bg-slate-50 border border-slate-200 ${innerCardRadius} ${innerCardPadding} space-y-0 relative shadow-sm flex flex-col`}>
                            <div>
                              <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0 flex-1">
                                  <h4 className={`font-black text-[#d2145a] uppercase leading-tight max-md:text-base ${isPanelLayout ? 'md:text-sm xl:text-base 2xl:text-lg' : 'md:text-sm lg:text-lg'}`}>{patient.PatientName}</h4>
                                  {patient.OtherPatientName && (
                                    <p className="max-md:text-[11px] md:text-[10px] text-slate-400 font-medium italic mt-0.5 md:mt-1">Tên khác: {patient.OtherPatientName}</p>
                                  )}
                                </div>
                                <PatientAdminEditButton
                                  className="shrink-0"
                                  onClick={() => {
                                    onEditPatientAdmin(patient);
                                    requestClose();
                                  }}
                                />
                              </div>
                              
                              <div className="grid grid-cols-1 gap-y-0.5 max-md:text-xs md:text-[11px] text-slate-600 font-medium pt-0.5 border-t border-slate-100">
                                <p><span className="text-slate-400">Mã BN 1:</span> <span className="font-bold text-slate-800 font-mono">{patient.PatientID1 || ''}</span></p>
                                {patient.PatientID2 && <p><span className="text-slate-400">Mã BN 2:</span> <span className="font-bold text-slate-800 font-mono">{patient.PatientID2}</span></p>}
                                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0">
                                  <p><span className="text-slate-400">Ngày sinh:</span> <span className="font-bold text-slate-800 font-mono">{formatVNTime(patient.PatientDOB)}</span></p>
                                  <p><span className="text-slate-400">Tuổi:</span> <span className="font-bold text-rose-600 font-mono">{getExcelAgeHelper(patient.PatientDOB)}</span></p>
                                </div>
                                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0">
                                  <p><span className="text-slate-400">Giới tính:</span> <span className="font-bold text-slate-800">{patient.PatientSex}</span></p>
                                  {patient.PatientAddress && <p><span className="text-slate-400">Địa chỉ:</span> <span className="font-bold text-slate-800 leading-tight">{patient.PatientAddress}</span></p>}
                                </div>
                                {(patient.PatientPhone1 || patient.PatientPhone2) && (
                                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0">
                                    {patient.PatientPhone1 && <p><span className="text-slate-400">Số ĐT 1:</span> <span className="font-bold text-slate-800 font-mono">{patient.PatientPhone1}</span></p>}
                                    {patient.PatientPhone2 && <p><span className="text-slate-400">Số ĐT 2:</span> <span className="font-bold text-slate-800 font-mono">{patient.PatientPhone2}</span></p>}
                                  </div>
                                )}
                              </div>
                            </div>

                            <div>
                               <div className="grid grid-cols-2 gap-2 pt-0.5 border-t border-slate-100">
                                  {!isFormEditing ? (
                                    <>
                                      {formData.PatientHeight && <p className="max-md:text-xs md:text-[11px]"><span className="text-slate-400 block mb-0.5">Chiều cao:</span> <span className="font-bold text-slate-800 font-mono">{formData.PatientHeight} cm</span></p>}
                                      {formData.PatientWeight && <p className="max-md:text-xs md:text-[11px]"><span className="text-slate-400 block mb-0.5">Cân nặng:</span> <span className="font-bold text-slate-800 font-mono">{formData.PatientWeight} kg</span></p>}
                                    </>
                                  ) : (
                                    <>
                                      <div>
                                        <label className="block text-slate-500 font-bold max-md:text-[11px] md:text-[10px] mb-1">Chiều cao (cm)</label>
                                        <input
                                          type="text"
                                          placeholder="vd: 110"
                                          value={formData.PatientHeight}
                                          onChange={(e) => setFormData(prev => ({ ...prev, PatientHeight: e.target.value }))}
                                          className="w-full bg-white border border-slate-200 rounded-xl px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-teal-500 max-md:text-sm md:text-xs font-medium"
                                        />
                                      </div>
                                      <div>
                                        <label className="block text-slate-500 font-bold max-md:text-[11px] md:text-[10px] mb-1">Cân nặng (kg)</label>
                                        <input
                                          type="text"
                                          placeholder="vd: 12"
                                          value={formData.PatientWeight}
                                          onChange={(e) => setFormData(prev => ({ ...prev, PatientWeight: e.target.value }))}
                                          className="w-full bg-white border border-slate-200 rounded-xl px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-teal-500 max-md:text-sm md:text-xs font-medium"
                                        />
                                      </div>
                                    </>
                                  )}
                               </div>
                            </div>
                          </div>
                        </div>

                        {/* Khung 2: Thông tin hội chẩn — phía dưới */}
                        <div className="flex flex-col max-md:flex-none flex-1 min-h-0">
                          <div className={`bg-slate-50 border border-slate-200 ${innerCardRadius} ${innerCardPadding} space-y-2.5 xl:space-y-3 shadow-sm max-md:h-auto h-full flex flex-col justify-start min-h-0 overflow-visible md:overflow-y-auto custom-scrollbar`}>
                            {!isFormEditing ? (
                              <div className="grid grid-cols-1 gap-y-1.5 max-md:text-xs md:text-[11px] text-slate-600 font-medium">
                                <div className="flex flex-wrap items-baseline gap-x-2 xl:gap-x-3 gap-y-0">
                                  <p><span className="text-slate-400">Ngày hội chẩn:</span> <span className="font-bold text-slate-800 font-mono">{formatVNTime(formData.ConsultDate)}</span></p>
                                  <p><span className="text-slate-400">BS đăng ký:</span> <span className="font-bold text-slate-800">{formData.RequestBy || ''}</span></p>
                                </div>
                                <p><span className="text-slate-400">Kiểu staff:</span> <span className="font-bold text-[#d2145a]">{formData.ConsultType || ''}</span></p>
                                {formData.ConsultMember && String(formData.ConsultMember).trim() && (
                                  <p>
                                    <span className="text-slate-400">Thành viên hội chẩn:</span>{' '}
                                    <span className="font-bold text-slate-800">
                                      {String(formData.ConsultMember)}
                                    </span>
                                  </p>
                                )}
                              </div>
                            ) : (
                              <div className="space-y-3 flex-1">
                                <div className="grid grid-cols-2 gap-2">
                                  <div>
                                    <label className="block text-slate-500 font-bold max-md:text-[11px] md:text-[10px] mb-1">Ngày hội chẩn</label>
                                    <VNDateInput
                                      required
                                      value={formData.ConsultDate}
                                      onChange={(val) => setFormData(prev => ({ ...prev, ConsultDate: val }))}
                                      className="w-full bg-white border border-slate-200 rounded-xl px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-teal-500 max-md:text-sm md:text-xs font-medium font-sans"
                                    />
                                  </div>
                                  <div>
                                    <label className="block text-slate-500 font-bold max-md:text-[11px] md:text-[10px] mb-1">BS đăng ký</label>
                                    <SearchableEnumSelect
                                      required
                                      options={doctorOptions}
                                      value={formData.RequestBy || ''}
                                      onChange={(val) => setFormData(prev => ({ ...prev, RequestBy: val }))}
                                      allowCreate
                                      createLabel={(val) => `Thêm BS "${val}"`}
                                      placeholder="-- Chọn BS --"
                                      searchPlaceholder="Gõ tên BS..."
                                    />
                                  </div>
                                </div>
                                <div>
                                  <label className="block text-slate-500 font-bold max-md:text-[11px] md:text-[10px] mb-1">Kiểu staff</label>
                                  <div className="grid grid-cols-2 gap-2">
                                    {(['Staff thông', 'Staff mổ'] as ConsultTypeEnum[]).map(type => (
                                      <button
                                        key={type}
                                        type="button"
                                        onClick={() => setFormData(prev => ({ ...prev, ConsultType: type }))}
                                        className={`rounded-xl px-2.5 py-1.5 text-xs font-extrabold border transition ${
                                          formData.ConsultType === type
                                            ? 'bg-[#d2145a] text-white border-[#d2145a] shadow-sm'
                                            : 'bg-white text-slate-600 border-slate-200 hover:border-[#d2145a]/40'
                                        }`}
                                      >
                                        {type}
                                      </button>
                                    ))}
                                  </div>
                                </div>

                                <div className="pb-2">
                                  <label className="block text-slate-500 font-bold max-md:text-[11px] md:text-[10px] mb-1">Thành viên hội chẩn</label>
                                  <MobileAutoExpandTextarea
                                    minRows={2}
                                    value={formData.ConsultMember || ''}
                                    onChange={(e) => setFormData(prev => ({ ...prev, ConsultMember: e.target.value }))}
                                    placeholder="Ví dụ: BS. Tài, BS. Ân, BS. Phụng"
                                    className="w-full bg-white border border-slate-200 rounded-xl px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-teal-500 max-md:text-sm md:text-xs font-semibold"
                                  />
                                </div>

                              </div>
                            )}
                          </div>
                        </div>
                        </div>

                        {/* Cột phải: Kết quả hội chẩn */}
                        <div className={rightFormColClass}>
                          <div className={`bg-indigo-50/20 border border-slate-200 ${innerCardRadius} ${innerCardPadding} space-y-2.5 xl:space-y-3 shadow-sm max-md:flex-1 max-md:min-h-0 h-full flex flex-col min-h-0 overflow-visible md:overflow-y-auto custom-scrollbar`}>
                            <span className="max-md:text-[10px] md:text-[9px] uppercase tracking-wide font-mono font-bold text-indigo-600 block border-b border-slate-100 pb-2 shrink-0">Kết quả hội chẩn</span>
                            
                            {!isFormEditing ? (
                              <div className="space-y-3 max-md:text-xs md:text-[11px] text-slate-600 font-medium pt-1">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 md:gap-3.5">
                                  <p className="flex items-baseline gap-2 flex-wrap">
                                    <span className="text-slate-400 shrink-0">ICD:</span>
                                    {formData.DiagnosisID ? <span className="font-bold text-red-600 bg-red-50 border border-red-200 px-1.5 py-0.5 rounded font-mono">{formData.DiagnosisID}</span> : null}
                                  </p>
                                  <p className="flex items-baseline gap-2 flex-wrap">
                                    <span className="text-slate-400 shrink-0">Kết luận chính:</span>
                                    {formData.ConsultResultID ? <span className="font-extrabold text-[#d2145a]">{formData.ConsultResultID}</span> : null}
                                  </p>
                                </div>

                                <p>
                                  <span className="text-slate-400">Ưu tiên:</span>{' '}
                                  <span className="font-extrabold text-indigo-800 ml-1">{formData.PriorityOrder || 'Chương trình'}</span>
                                </p>
                                
                                <div>
                                  <span className="text-slate-400 block mb-0.5">Chẩn đoán chi tiết:</span>
                                  {formData.DetailDiagnosis ? (
                                    <p className="bg-white border border-slate-100 p-2.5 rounded-xl text-slate-700 italic font-semibold leading-normal">{formData.DetailDiagnosis}</p>
                                  ) : ''}
                                </div>

                                <div>
                                  <span className="text-slate-400 block mb-0.5">Kết luận hội chẩn chi tiết:</span>
                                  {formData.DetailConsultResult ? (
                                    <p className="bg-white border border-slate-100 p-2.5 rounded-xl text-slate-700 font-semibold whitespace-pre-wrap leading-normal">{formData.DetailConsultResult}</p>
                                  ) : ''}
                                </div>

                                <div>
                                  <span className="text-slate-400 block mb-0.5">Dụng cụ dự kiến:</span>
                                  {formData.PlannedDevice ? (
                                    <p className="bg-white border border-slate-100 p-2.5 rounded-xl text-slate-700 font-semibold leading-normal">{formData.PlannedDevice}</p>
                                  ) : ''}
                                </div>

                                <div>
                                  <p><span className="text-slate-400">Số tiền dự kiến:</span> {formData.PlannedPrice ? <span className="font-bold text-emerald-700 font-mono ml-1">{formData.PlannedPrice}</span> : ''}</p>
                                </div>
                              </div>
                            ) : (
                              <div className="space-y-3.5 pt-1">
                                <div className={`grid grid-cols-1 gap-2.5 xl:gap-3.5 ${isPanelLayout ? 'xl:grid-cols-3' : 'md:grid-cols-3'}`}>
                                  <div className={isPanelLayout ? 'xl:col-span-1' : 'md:col-span-1'}>
                                    <label className="block text-slate-500 font-bold max-md:text-[11px] md:text-[10px] mb-1">ICD <span className="text-red-500">*</span></label>
                                    <SearchableEnumSelect
                                      required
                                      options={diagnosisOptions}
                                      value={formData.DiagnosisID}
                                      onChange={(value) => setFormData(prev => ({ ...prev, DiagnosisID: value }))}
                                      allowCreate
                                      createLabel={(value) => `Thêm DiagnosisID "${value}" vào Source`}
                                      onCreateOption={createDiagnosisSource}
                                      placeholder="-- Chọn ICD --"
                                      searchPlaceholder="Gõ ICD để tìm..."
                                    />
                                  </div>
                                  <div className={isPanelLayout ? 'xl:col-span-2' : 'md:col-span-2'}>
                                    <label className="block md:mb-1 text-slate-500 font-bold max-md:text-[11px] md:text-[10px] mb-1 font-sans">
                                      <span className="md:hidden inline mr-1">Kết luận chính</span>
                                      <span className="hidden md:inline">Kết luận chính </span>
                                      <span className="text-red-500">*</span>
                                    </label>
                                    <SearchableEnumSelect
                                      required
                                      options={conclusionOptions}
                                      value={formData.ConsultResultID}
                                      onChange={(value) => setFormData(prev => ({ ...prev, ConsultResultID: value as any }))}
                                      placeholder="-- Chọn Kết luận chính --"
                                      searchPlaceholder="Gõ tìm kết luận..."
                                    />
                                  </div>
                                </div>

                                <div className="flex flex-col gap-1 md:flex-row md:items-center md:gap-3">
                                  <label className="block md:mb-0 text-slate-500 font-bold max-md:text-[11px] md:text-[10px] md:shrink-0">Ưu tiên</label>
                                  <div className="flex gap-2 flex-1 min-w-0">
                                    {PRIORITY_OPTIONS.map((opt) => {
                                      const isSel = formData.PriorityOrder === opt;
                                      return (
                                        <button
                                          key={opt}
                                          type="button"
                                          onClick={() => setFormData(prev => ({ ...prev, PriorityOrder: opt }))}
                                          className={`flex-1 py-1.5 px-2 rounded-xl border max-md:text-xs md:text-[11px] font-bold transition text-center cursor-pointer ${
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
                                  <label className="block text-slate-500 font-bold max-md:text-[11px] md:text-[10px] mb-1">Chẩn đoán chi tiết</label>
                                  <MobileAutoExpandTextarea
                                    minRows={2}
                                    value={formData.DetailDiagnosis}
                                    onChange={(e) => setFormData(prev => ({ ...prev, DetailDiagnosis: e.target.value }))}
                                    className="w-full bg-white border border-slate-200 rounded-xl px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-500 max-md:text-sm md:text-xs italic font-semibold leading-relaxed"
                                  />
                                </div>

                                <div>
                                  <label className="block text-slate-500 font-bold max-md:text-[11px] md:text-[10px] mb-1">Kết luận hội chẩn chi tiết</label>
                                  <MobileAutoExpandTextarea
                                    minRows={2}
                                    required
                                    placeholder="vd: Thống nhất chỉ định mổ tim hở..."
                                    value={formData.DetailConsultResult}
                                    onChange={(e) => setFormData(prev => ({ ...prev, DetailConsultResult: e.target.value }))}
                                    className="w-full bg-white border border-slate-200 rounded-xl px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-500 max-md:text-sm md:text-xs font-bold leading-relaxed"
                                  />
                                </div>

                                <PlannedDeviceSuggestBox
                                  diagnosisID={formData.DiagnosisID}
                                  value={formData.PlannedDevice}
                                  onChange={(nextValue) => setFormData(prev => ({ ...prev, PlannedDevice: nextValue }))}
                                  deviceTemplates={deviceTemplates}
                                  consults={consults}
                                  rows={2}
                                  placeholder="vd: Vá thông liên thất..."
                                  textareaClassName="w-full bg-white border border-slate-200 rounded-xl px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-500 max-md:text-sm md:text-xs font-semibold leading-relaxed"
                                />

                                <div>
                                  <label className="block text-slate-500 font-bold max-md:text-[11px] md:text-[10px] mb-1">Số tiền dự kiến (VND / text)</label>
                                  <MobileAutoExpandTextarea
                                    minRows={2}
                                    placeholder="vd: 45.000.000đ"
                                    value={formData.PlannedPrice}
                                    onChange={(e) => setFormData(prev => ({ ...prev, PlannedPrice: e.target.value }))}
                                    className="w-full bg-white border border-slate-200 rounded-xl px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-500 max-md:text-sm md:text-xs font-bold font-mono"
                                  />
                                </div>
                                <div className="grid grid-cols-2 gap-2 mt-4 pt-4 border-t border-indigo-100">
                                  <div>
                                    <label className="block text-slate-400 font-bold max-md:text-[10px] md:text-[9px] mb-1 uppercase">Người điền KQ</label>
                                    <input
                                      type="text"
                                      disabled
                                      value={(() => {
                                        const editorId = currentStaff?.StaffKey;
                                        return staffList.find(s => s.StaffKey === editorId)?.StaffName || editorId || '01378';
                                      })()}
                                      className="w-full bg-slate-50 text-slate-400 border border-slate-200 rounded-lg px-2 py-1 max-md:text-[11px] md:text-[10px] font-bold"
                                    />
                                  </div>
                                  <div>
                                    <label className="block text-slate-400 font-bold max-md:text-[10px] md:text-[9px] mb-1 uppercase cursor-default" title="ConsultResultUpdatedTime">Điền lúc</label>
                                    <input
                                      type="text"
                                      disabled
                                      value={formatDateTime(new Date().toISOString())}
                                      className="w-full bg-slate-50 text-slate-400 border border-slate-200 rounded-lg px-2 py-1 max-md:text-[11px] md:text-[10px] font-mono cursor-default"
                                    />
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>

                      </div>

                </div>
                </div>

                      {/* Action buttons area — sticky footer */}
                      <div className={`max-md:pt-1.5 pt-2 border-t border-slate-100 shrink-0 pb-[max(0.5rem,env(safe-area-inset-bottom))] md:pb-4 bg-white ${isPanelLayout ? 'px-3 lg:px-4 xl:px-5' : 'max-md:px-3 px-4 md:px-6'}`}>
                        <div className="w-full flex flex-wrap items-center gap-2">
                          <StaffSummaryExportActions
                            patient={patient}
                            consult={{ ...consult, ...summaryConsultOverride }}
                            onError={(msg) => triggerAlert(msg, MODAL_TITLE.warning)}
                            onOpenPatientRecord={
                              onViewPatientRecord
                                ? () => {
                                    onViewPatientRecord(patient);
                                    requestClose();
                                  }
                                : undefined
                            }
                          />
                          {!autoEdit && !isFormEditing ? (
                            <button
                              type="button"
                              onClick={() => setIsEditing(true)}
                              className="ml-auto bg-[#d2145a] hover:bg-pink-700 text-white font-extrabold uppercase py-3 px-4 rounded-2xl shadow-md transition-transform hover:scale-[1.02] cursor-pointer max-md:text-sm md:text-xs flex items-center justify-center gap-1.5 font-sans"
                            >
                              <ClipboardList className="w-4 h-4 shrink-0" />
                              {isMobile
                                ? 'Cập nhật'
                                : consult.ConsultResultID
                                  ? 'Sửa kết quả hội chẩn'
                                  : 'Điền kết quả hội chẩn'}
                            </button>
                          ) : (
                            <div className="ml-auto flex gap-2">
                              <button
                                type="button"
                                onClick={requestRevertEdit}
                                className="bg-slate-200 hover:bg-slate-300 text-slate-700 font-extrabold uppercase py-3 px-3 md:px-4 rounded-2xl transition cursor-pointer max-md:text-xs md:text-[10px] font-sans text-center"
                              >
                                {autoEdit ? 'Đóng' : 'Hủy'}
                              </button>
                              <button
                                type="submit"
                                disabled={saving}
                                className="bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold uppercase py-3 px-3 md:px-4 rounded-2xl shadow-md transition cursor-pointer max-md:text-xs md:text-[10px] font-sans text-center font-bold disabled:opacity-50"
                              >
                                {saving ? 'Đang lưu...' : '✓ Lưu kết quả'}
                              </button>
                            </div>
                          )}
                        </div>
                      </div>

              </form>
  );

  const exitConfirmDialog = exitConfirmOpen ? (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-[75] flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden animate-in zoom-in-95">
        <div className="py-3 px-4 flex items-center gap-2 bg-amber-50 border-b border-amber-100">
          <AlertTriangle className="w-5 h-5 text-amber-600" />
          <h3 className="font-extrabold text-[13px] uppercase tracking-wide text-amber-900">Thay đổi chưa lưu</h3>
        </div>
        <div className="p-5 space-y-3">
          <p className="text-sm font-semibold text-slate-700 leading-relaxed">
            Bạn có thay đổi chưa được lưu. Bạn có muốn lưu kết quả hội chẩn không?
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
  ) : null;

  if (layout === 'panel') {
    return (
      <>
        <div className="flex flex-col h-full min-h-0 bg-white border border-slate-200 rounded-xl xl:rounded-2xl 2xl:rounded-3xl shadow-sm overflow-hidden">
          {drawerHeader}
          {drawerForm}
        </div>
        {exitConfirmDialog}
      </>
    );
  }

  const modalOverlayStyle: React.CSSProperties | undefined = isMobile && keyboardOpen
    ? { paddingBottom: `${keyboardInset}px` }
    : isMobile
      ? { paddingBottom: 'var(--mobile-bottom-nav-offset)' }
      : undefined;

  const mobileSheetMaxHeight = keyboardOpen
    ? `${Math.max(viewportHeight - 8, 320)}px`
    : 'calc(100dvh - env(safe-area-inset-top, 0px) - var(--mobile-bottom-nav-offset))';
  const modalPanelStyle: React.CSSProperties | undefined = isMobileModal
    ? {
        height: mobileSheetMaxHeight,
        maxHeight: mobileSheetMaxHeight,
      }
    : undefined;

  return (
    <AnimatePresence>
      {consultKey && (
          <div
            className={`fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex overflow-hidden overscroll-none animate-in fade-in duration-200 ${
              isMobile ? 'items-end justify-center p-0' : 'items-center justify-center p-4 pb-[var(--mobile-bottom-nav-offset)] md:pb-4'
            }`}
            style={modalOverlayStyle}
          >
            <div 
              className="absolute inset-0" 
              onClick={requestClose}
            ></div>
            <div
              className={`relative bg-white w-full max-w-6xl shadow-2xl flex flex-col z-50 overflow-hidden min-h-0 ${
                isMobileModal
                  ? 'rounded-t-3xl rounded-b-none animate-in slide-in-from-bottom duration-200 max-h-[calc(100dvh-env(safe-area-inset-top,0px)-var(--mobile-bottom-nav-offset))] max-md:min-h-0'
                  : 'rounded-3xl max-h-[96vh] animate-in zoom-in-95 duration-200'
              }`}
              style={modalPanelStyle}
            >
              {drawerHeader}
              {drawerForm}
            </div>
            {exitConfirmDialog}
          </div>
        )}
    </AnimatePresence>
  );
}
