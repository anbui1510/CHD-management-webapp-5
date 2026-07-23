import React, { useEffect, useMemo, useState } from 'react';
import { PatientAdminEditButton } from './PatientAdminEditButton';
import { AnimatePresence } from 'motion/react';
import { ClipboardList, Stethoscope } from 'lucide-react';
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
  layout = 'modal',
  autoEdit = false
}: ResultStaffDrawerProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState<ResultFormState | null>(null);
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
    setFormData(buildFormState(consult));
    setIsEditing(autoEdit);
  }, [consultKey, consult?.ConsultKey, autoEdit]);

  const isFormEditing = autoEdit || isEditing;

  const handleClose = () => {
    setIsEditing(false);
    onClose();
  };

  const submitResultUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!consultKey || !formData || !consult) return;

    if (!formData.DiagnosisID) {
      triggerAlert('Vui lòng chọn ICD (DiagnosisID)!', 'Thiếu thông tin');
      return;
    }
    if (!formData.ConsultResultID) {
      triggerAlert('Vui lòng chọn Kết luận chính (ConsultResultID)!', 'Thiếu thông tin');
      return;
    }
    if (!formData.ConsultMember || !formData.ConsultMember.trim()) {
      triggerAlert('Vui lòng nhập Thành viên duyệt hội chẩn!', 'Thiếu thông tin');
      return;
    }

    const finalData = {
      ...formData,
      ConsultResultUpdatedBy: currentStaff?.StaffKey || '01378',
      ConsultResultUpdatedTime: new Date().toISOString()
    };

    onPatchConsult(consultKey, finalData);
    if (!autoEdit) setIsEditing(false);
    handleClose();
    onSaveSuccess?.('Đã cập nhật chỉ định kết quả hội chẩn và đồng bộ trạng thái bệnh nhi thành công!');

    let automaticOutcome: OutcomeType = '';
    if (formData.ConsultResultID === 'Can thiệp thông tim') {
      automaticOutcome = 'Đã thông';
    } else if (formData.ConsultResultID === 'Phẫu thuật tim hở' || formData.ConsultResultID === 'Mổ tim') {
      automaticOutcome = 'Đã mổ';
    }

    try {
      const response = await fetch(`/api/consults/${consultKey}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(finalData)
      });
      if (!response.ok) {
        const d = await response.json().catch(() => ({}));
        throw new Error(d.error || 'Không thể lưu kết quả hội chẩn');
      }

      if (consult.PatientKey && automaticOutcome) {
        onPatchPatient(consult.PatientKey, { Outcome: automaticOutcome });
        await fetch(`/api/patients/${consult.PatientKey}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ Outcome: automaticOutcome })
        });
      }
      onRefreshData();
    } catch (err) {
      console.error(err);
      triggerAlert(err instanceof Error ? err.message : 'Không thể lưu kết quả hội chẩn', 'Lỗi lưu');
      onRefreshData();
    }
  };

  if (!consultKey || !consult || !patient || !formData) return null;

  const drawerHeader = (
    <div className="bg-[#d2145a] text-white px-4 md:px-6 py-3.5 md:py-4 flex items-center justify-between shadow-sm shrink-0">
      <h3 className="font-extrabold text-sm uppercase tracking-wider flex items-center gap-1.5 font-sans min-w-0">
        <Stethoscope className="w-5 h-5 text-white shrink-0" />
        <span className="truncate">Điền kết quả staff — {patient.PatientName}</span>
      </h3>
      <button
        type="button"
        onClick={() => {
          handleClose();
          setIsEditing(false);
        }}
        className="text-white hover:bg-white/10 p-1.5 rounded-full transition-colors font-bold text-lg leading-none shrink-0"
      >
        ✕
      </button>
    </div>
  );

  const drawerForm = (
              <form 
                onSubmit={submitResultUpdate} 
                className="flex flex-col flex-1 min-h-0 overflow-hidden text-xs text-slate-700 leading-relaxed font-sans"
              >
                <div className="flex-1 overflow-y-auto overscroll-contain min-h-0 p-4 md:p-6">
                <div className="space-y-6">
                      
                      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch animate-in fade-in duration-300">
                        
                        {/* Khung 1: Bệnh nhi đang hội chẩn (Hành chính) */}
                        <div className="lg:col-span-3 flex flex-col">
                          <div className="bg-slate-50 border border-slate-200 rounded-3xl p-3 md:p-4.5 space-y-1 md:space-y-3 relative shadow-sm h-full flex flex-col justify-between">
                            <div>
                              <div className="hidden md:flex items-center border-b border-slate-100 pb-2">
                                <span className="text-[9px] uppercase tracking-wide font-mono font-bold text-slate-400">Bệnh nhi đang hội chẩn</span>
                              </div>
                              
                              <div className="flex items-start justify-between gap-2 mt-0 md:mt-3">
                                <div className="min-w-0 flex-1">
                                  <h4 className="text-sm font-black text-[#d2145a] uppercase leading-tight">{patient.PatientName}</h4>
                                  {patient.OtherPatientName && (
                                    <p className="text-[10px] text-slate-400 font-medium italic mt-0.5 md:mt-1">Tên khác: {patient.OtherPatientName}</p>
                                  )}
                                </div>
                                <PatientAdminEditButton
                                  className="md:hidden shrink-0"
                                  onClick={() => {
                                    onEditPatientAdmin(patient);
                                    handleClose();
                                  }}
                                />
                              </div>
                              
                              <div className="grid grid-cols-1 gap-y-1 md:gap-y-1.5 text-[11px] text-slate-600 font-medium pt-1.5 mt-1.5 md:pt-3 md:mt-3 border-t border-slate-100">
                                <p><span className="text-slate-400">Mã BN 1:</span> <span className="font-bold text-slate-800 font-mono">{patient.PatientID1 || ''}</span></p>
                                {patient.PatientID2 && <p><span className="text-slate-400">Mã BN 2:</span> <span className="font-bold text-slate-800 font-mono">{patient.PatientID2}</span></p>}
                                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0 md:contents">
                                  <p><span className="text-slate-400">Ngày sinh:</span> <span className="font-bold text-slate-800 font-mono">{formatVNTime(patient.PatientDOB)}</span></p>
                                  <p><span className="text-slate-400">Tuổi:</span> <span className="font-bold text-rose-600 font-mono">{getExcelAgeHelper(patient.PatientDOB)}</span></p>
                                </div>
                                <p><span className="text-slate-400">Giới tính:</span> <span className="font-bold text-slate-800">{patient.PatientSex}</span></p>
                                {patient.PatientAddress && <p className="col-span-1"><span className="text-slate-400">Địa chỉ:</span> <span className="font-bold text-slate-800 leading-tight">{patient.PatientAddress}</span></p>}
                                {patient.PatientPhone1 && <p><span className="text-slate-400">Số ĐT 1:</span> <span className="font-bold text-slate-800 font-mono">{patient.PatientPhone1}</span></p>}
                                {patient.PatientPhone2 && <p><span className="text-slate-400">Số ĐT 2:</span> <span className="font-bold text-slate-800 font-mono">{patient.PatientPhone2}</span></p>}
                              </div>
                            </div>

                            <div className="space-y-2 md:space-y-4">
                               <div className="grid grid-cols-2 gap-2 mt-2 pt-2 md:mt-4 md:pt-4 border-t border-slate-100">
                                  {!isFormEditing ? (
                                    <>
                                      {formData.PatientHeight && <p className="text-[11px]"><span className="text-slate-400 block mb-0.5">Chiều cao:</span> <span className="font-bold text-slate-800 font-mono">{formData.PatientHeight} cm</span></p>}
                                      {formData.PatientWeight && <p className="text-[11px]"><span className="text-slate-400 block mb-0.5">Cân nặng:</span> <span className="font-bold text-slate-800 font-mono">{formData.PatientWeight} kg</span></p>}
                                    </>
                                  ) : (
                                    <>
                                      <div>
                                        <label className="block text-slate-500 font-bold text-[10px] mb-1">Chiều cao (cm)</label>
                                        <input
                                          type="text"
                                          placeholder="vd: 110"
                                          value={formData.PatientHeight}
                                          onChange={(e) => setFormData(prev => ({ ...prev, PatientHeight: e.target.value }))}
                                          className="w-full bg-white border border-slate-200 rounded-xl px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-teal-500 text-xs font-medium"
                                        />
                                      </div>
                                      <div>
                                        <label className="block text-slate-500 font-bold text-[10px] mb-1">Cân nặng (kg)</label>
                                        <input
                                          type="text"
                                          placeholder="vd: 12"
                                          value={formData.PatientWeight}
                                          onChange={(e) => setFormData(prev => ({ ...prev, PatientWeight: e.target.value }))}
                                          className="w-full bg-white border border-slate-200 rounded-xl px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-teal-500 text-xs font-medium"
                                        />
                                      </div>
                                    </>
                                  )}
                               </div>

                              <PatientAdminEditButton
                                className="hidden md:flex mx-auto"
                                onClick={() => {
                                  onEditPatientAdmin(patient);
                                  handleClose();
                                }}
                              />
                            </div>
                          </div>
                        </div>

                        {/* Khung 2: Thông tin hội chẩn */}
                        <div className="lg:col-span-3 flex flex-col">
                          <div className="bg-slate-50 border border-slate-200 rounded-3xl p-4.5 space-y-3 shadow-sm h-full flex flex-col justify-start">
                            <span className="hidden md:block text-[9px] uppercase tracking-wide font-mono font-bold text-teal-600 border-b border-slate-100 pb-2 shrink-0">Thông tin hội chẩn</span>
                            
                            {!isFormEditing ? (
                              <div className="grid grid-cols-1 gap-y-1.5 text-[11px] text-slate-600 font-medium pt-1">
                                <p><span className="text-slate-400">Ngày hội chẩn:</span> <span className="font-bold text-slate-800 font-mono">{formatVNTime(formData.ConsultDate)}</span></p>
                                <p><span className="text-slate-400">Kiểu staff:</span> <span className="font-bold text-[#d2145a]">{formData.ConsultType || ''}</span></p>
                                <p><span className="text-slate-400">BS đăng ký:</span> <span className="font-bold text-slate-800">{formData.RequestBy || ''}</span></p>
                                {formData.ConsultMember && String(formData.ConsultMember).trim() && (
                                  <p>
                                    <span className="text-slate-400">Thành viên duyệt HC:</span>{' '}
                                    <span className="font-bold text-slate-800">
                                      {String(formData.ConsultMember)}
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
                                    value={formData.ConsultDate}
                                    onChange={(val) => setFormData(prev => ({ ...prev, ConsultDate: val }))}
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
                                
                                <div>
                                  <label className="block text-slate-500 font-bold text-[10px] mb-1">BS đăng ký</label>
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

                                <div className="pb-2">
                                  <label className="block text-slate-500 font-bold text-[10px] mb-1">Thành viên duyệt hội chẩn <span className="text-red-500">*</span></label>
                                  <input
                                    type="text"
                                    required
                                    value={formData.ConsultMember || ''}
                                    onChange={(e) => setFormData(prev => ({ ...prev, ConsultMember: e.target.value }))}
                                    placeholder="Ví dụ: BS. Tài, BS. Ân, BS. Phụng"
                                    className="w-full bg-white border border-slate-200 rounded-xl px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-teal-500 text-xs font-semibold"
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
                            
                            {!isFormEditing ? (
                              <div className="space-y-3 text-[11px] text-slate-600 font-medium pt-1">
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
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                                  <div>
                                    <label className="block text-slate-500 font-bold text-[10px] mb-1">ICD <span className="text-red-500">*</span></label>
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
                                  <div>
                                    <label className="block md:mb-1 text-slate-500 font-bold text-[10px] mb-1 font-sans">
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

                                <div>
                                  <label className="block text-slate-500 font-bold text-[10px] mb-1">Ưu tiên</label>
                                  <div className="flex gap-2">
                                    {PRIORITY_OPTIONS.map((opt) => {
                                      const isSel = formData.PriorityOrder === opt;
                                      return (
                                        <button
                                          key={opt}
                                          type="button"
                                          onClick={() => setFormData(prev => ({ ...prev, PriorityOrder: opt }))}
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
                                    value={formData.DetailDiagnosis}
                                    onChange={(e) => setFormData(prev => ({ ...prev, DetailDiagnosis: e.target.value }))}
                                    className="w-full bg-white border border-slate-200 rounded-xl px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-500 text-xs italic font-semibold leading-relaxed"
                                  />
                                </div>

                                <div>
                                  <label className="block text-slate-500 font-bold text-[10px] mb-1">Kết luận hội chẩn chi tiết</label>
                                  <textarea
                                    rows={2}
                                    required
                                    placeholder="vd: Thống nhất chỉ định mổ tim hở..."
                                    value={formData.DetailConsultResult}
                                    onChange={(e) => setFormData(prev => ({ ...prev, DetailConsultResult: e.target.value }))}
                                    className="w-full bg-white border border-slate-200 rounded-xl px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-500 text-xs font-bold leading-relaxed"
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
                                  textareaClassName="w-full bg-white border border-slate-200 rounded-xl px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-500 text-xs font-semibold leading-relaxed"
                                />

                                <div>
                                  <label className="block text-slate-500 font-bold text-[10px] mb-1">Số tiền dự kiến (VND / text)</label>
                                  <input
                                    type="text"
                                    placeholder="vd: 45.000.000đ"
                                    value={formData.PlannedPrice}
                                    onChange={(e) => setFormData(prev => ({ ...prev, PlannedPrice: e.target.value }))}
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

                </div>
                </div>

                      {/* Action buttons area — sticky footer */}
                      <div className="pt-2 border-t border-slate-100 flex justify-end gap-3 shrink-0 px-4 md:px-6 pb-[max(0.75rem,env(safe-area-inset-bottom))] md:pb-4 bg-white">
                        {!autoEdit && !isFormEditing ? (
                          <div className="w-full flex justify-end">
                            <button
                              type="button"
                              onClick={() => setIsEditing(true)}
                              className="bg-[#d2145a] hover:bg-pink-700 text-white font-extrabold uppercase py-3 px-6 rounded-2xl shadow-md transition-transform hover:scale-[1.02] cursor-pointer text-xs flex items-center justify-center gap-1.5 font-sans"
                            >
                              <ClipboardList className="w-4 h-4" />
                              {consult.ConsultResultID ? "Sửa kết quả hội chẩn" : "Điền kết quả hội chẩn"}
                            </button>
                          </div>
                        ) : (
                          <div className="w-full grid grid-cols-2 lg:flex lg:justify-end gap-3">
                            <button
                              type="button"
                              onClick={() => {
                                setFormData(buildFormState(consult));
                                setIsEditing(false);
                                if (autoEdit) handleClose();
                              }}
                              className="bg-slate-200 hover:bg-slate-300 text-slate-700 font-extrabold uppercase py-3 px-4 md:px-6 rounded-2xl transition cursor-pointer text-xs font-sans text-center lg:w-48"
                            >
                              {autoEdit ? 'Đóng' : 'Hủy'}
                            </button>
                            <button
                              type="submit"
                              className="bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold uppercase py-3 px-4 md:px-6 rounded-2xl shadow-md transition cursor-pointer text-xs font-sans text-center font-bold lg:w-48"
                            >
                              ✓ Lưu kết quả
                            </button>
                          </div>
                        )}
                      </div>

              </form>
  );

  if (layout === 'panel') {
    return (
      <div className="flex flex-col h-full min-h-0 bg-white border border-slate-200 rounded-3xl shadow-sm overflow-hidden">
        {drawerHeader}
        {drawerForm}
      </div>
    );
  }

  return (
    <AnimatePresence>
      {consultKey && (
          <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-3 md:p-4 pb-[calc(4rem+env(safe-area-inset-bottom))] md:pb-4 animate-in fade-in duration-200">
            <div 
              className="absolute inset-0" 
              onClick={() => {
                handleClose();
                setIsEditing(false);
              }}
            ></div>
            <div className="relative bg-white w-full max-w-6xl rounded-3xl shadow-2xl flex flex-col z-50 animate-in zoom-in-95 duration-200 overflow-hidden max-h-[min(88dvh,calc(100dvh-4.5rem-env(safe-area-inset-bottom)))] md:max-h-[96vh]">
              {drawerHeader}
              {drawerForm}
            </div>
          </div>
        )}
    </AnimatePresence>
  );
}
