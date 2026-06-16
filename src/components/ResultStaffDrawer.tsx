import React, { useEffect, useMemo, useState } from 'react';
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
import { getSourceDiagnosisOptions } from '../data/source';
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
  ConsultMember: string[];
  PriorityOrder: string;
};

const normalizeConsultMembers = (value: Consult['ConsultMember']): string[] => {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  return String(value).split(',').map(s => s.trim()).filter(Boolean);
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
  triggerAlert
}: ResultStaffDrawerProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState<ResultFormState | null>(null);
  const diagnosisOptions = useMemo(() => getSourceDiagnosisOptions(sources), [sources]);

  const consult = consultKey ? consults.find(c => c.ConsultKey === consultKey) : undefined;
  const patient = consult ? findPatientByKey(patients, consult.PatientKey) : undefined;

  useEffect(() => {
    if (!consultKey || !consult) {
      setFormData(null);
      setIsEditing(false);
      return;
    }
    setFormData(buildFormState(consult));
    setIsEditing(false);
  }, [consultKey, consult?.ConsultKey]);

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
    if (!formData.ConsultMember || formData.ConsultMember.length === 0) {
      triggerAlert('Vui lòng chọn ít nhất một Thành viên duyệt hội chẩn!', 'Thiếu thông tin');
      return;
    }

    const finalData = {
      ...formData,
      ConsultResultUpdatedBy: currentStaff?.StaffKey || '01378',
      ConsultResultUpdatedTime: new Date().toISOString()
    };

    onPatchConsult(consultKey, finalData);
    setIsEditing(false);
    handleClose();
    triggerAlert('Đã cập nhật chỉ định kết quả hội chẩn và đồng bộ trạng thái bệnh nhi thành công!', 'Cập nhật thành công');

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

  return (
    <AnimatePresence>
      {consultKey && (
          <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-40 flex items-center justify-center p-4 animate-in fade-in duration-200">
            <div 
              className="absolute inset-0" 
              onClick={() => {
                handleClose();
                setIsEditing(false);
              }}
            ></div>
            <div className="relative bg-white w-full max-w-6xl rounded-3xl shadow-2xl flex flex-col z-50 animate-in zoom-in-95 duration-200 overflow-hidden max-h-[96vh]">
              
              <div className="bg-[#d2145a] text-white px-6 py-4 flex items-center justify-between shadow-sm shrink-0">
                <h3 className="font-extrabold text-sm uppercase tracking-wider flex items-center gap-1.5 font-sans">
                  <Stethoscope className="w-5 h-5 text-white" /> Điền kết quả staff
                </h3>
                <button 
                  onClick={() => {
                    handleClose();
                    setIsEditing(false);
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
                <div className="space-y-6">
                      
                      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch animate-in fade-in duration-300">
                        
                        {/* Khung 1: Bệnh nhi đang hội chẩn (Hành chính) */}
                        <div className="lg:col-span-3 flex flex-col">
                          <div className="bg-slate-50 border border-slate-200 rounded-3xl p-4.5 space-y-3 relative shadow-sm h-full flex flex-col justify-between">
                            <div>
                              <div className="flex items-center border-b border-slate-100 pb-2">
                                <span className="text-[9px] uppercase tracking-wide font-mono font-bold text-slate-400">Bệnh nhi đang hội chẩn</span>
                              </div>
                              
                              <h4 className="text-sm font-black text-[#d2145a] uppercase leading-tight mt-3">{patient.PatientName}</h4>
                              {patient.OtherPatientName && (
                                <p className="text-[10px] text-slate-400 font-medium italic mt-1">Tên khác: {patient.OtherPatientName}</p>
                              )}
                              
                              <div className="grid grid-cols-1 gap-y-1.5 text-[11px] text-slate-600 font-medium pt-3 border-t border-slate-100 mt-3">
                                <p><span className="text-slate-400">Mã BN 1:</span> <span className="font-bold text-slate-800 font-mono">{patient.PatientID1 || ''}</span></p>
                                {patient.PatientID2 && <p><span className="text-slate-400">Mã BN 2:</span> <span className="font-bold text-slate-800 font-mono">{patient.PatientID2}</span></p>}
                                <p><span className="text-slate-400">Ngày sinh:</span> <span className="font-bold text-slate-800 font-mono">{formatVNTime(patient.PatientDOB)}</span></p>
                                <p><span className="text-slate-400">Tuổi:</span> <span className="font-bold text-rose-600 font-mono">{getExcelAgeHelper(patient.PatientDOB)}</span></p>
                                <p><span className="text-slate-400">Giới tính:</span> <span className="font-bold text-slate-800">{patient.PatientSex}</span></p>
                                {patient.PatientAddress && <p className="col-span-1"><span className="text-slate-400">Địa chỉ:</span> <span className="font-bold text-slate-800 leading-tight">{patient.PatientAddress}</span></p>}
                                {patient.PatientPhone1 && <p><span className="text-slate-400">Số ĐT 1:</span> <span className="font-bold text-slate-800 font-mono">{patient.PatientPhone1}</span></p>}
                                {patient.PatientPhone2 && <p><span className="text-slate-400">Số ĐT 2:</span> <span className="font-bold text-slate-800 font-mono">{patient.PatientPhone2}</span></p>}
                              </div>
                            </div>

                            <div className="space-y-4">
                               <div className="grid grid-cols-2 gap-2 mt-4 pt-4 border-t border-slate-100">
                                  {!isEditing ? (
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

                              <button
                                type="button"
                                onClick={() => {
                                  onEditPatientAdmin(patient);
                                  handleClose();
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
                            
                            {!isEditing ? (
                              <div className="grid grid-cols-1 gap-y-1.5 text-[11px] text-slate-600 font-medium pt-1">
                                <p><span className="text-slate-400">Ngày hội chẩn:</span> <span className="font-bold text-slate-800 font-mono">{formatVNTime(formData.ConsultDate)}</span></p>
                                <p><span className="text-slate-400">Kiểu staff:</span> <span className="font-bold text-[#d2145a]">{formData.ConsultType || ''}</span></p>
                                <p><span className="text-slate-400">BS đăng ký:</span> <span className="font-bold text-slate-800">{formData.RequestBy || ''}</span></p>
                                {formData.ConsultMember && (Array.isArray(formData.ConsultMember) ? formData.ConsultMember : [String(formData.ConsultMember)]).length > 0 && (
                                  <p>
                                    <span className="text-slate-400">Thành viên duyệt HC:</span>{' '}
                                    <span className="font-bold text-slate-800">
                                      {(Array.isArray(formData.ConsultMember) 
                                        ? formData.ConsultMember 
                                        : String(formData.ConsultMember).split(',').map(s => s.trim()).filter(Boolean)
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
                                  <select
                                    required
                                    value={formData.RequestBy || ''}
                                    onChange={(e) => setFormData(prev => ({ ...prev, RequestBy: e.target.value }))}
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
                                    values={formData.ConsultMember || []}
                                    onMultiChange={(members) => setFormData(prev => ({ ...prev, ConsultMember: members }))}
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
                            
                            {!isEditing ? (
                              <div className="space-y-3 text-[11px] text-slate-600 font-medium pt-1">
                                <div className="grid grid-cols-2 gap-3.5">
                                  <p><span className="text-slate-400">ICD:</span> {formData.DiagnosisID ? <span className="font-bold text-red-600 bg-red-50 border border-red-200 px-1.5 py-0.5 rounded font-mono ml-1">{formData.DiagnosisID}</span> : ''}</p>
                                  <p><span className="text-slate-400">Kết luận chính:</span> {formData.ConsultResultID ? <span className="font-extrabold text-[#d2145a] ml-1">{formData.ConsultResultID}</span> : ''}</p>
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
                                <div className="grid grid-cols-2 gap-3.5">
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
                                    <label className="block text-slate-500 font-bold text-[10px] mb-1 font-sans">Kết luận chính <span className="text-red-500">*</span></label>
                                    <SearchableEnumSelect
                                      required
                                      options={CONCLUSION_OPTIONS}
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

                      {/* Action buttons area */}
                      <div className="pt-2 border-t border-slate-100 flex justify-end gap-3 shrink-0">
                        {!isEditing ? (
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
              </form>
            </div>
          </div>
        )}
    </AnimatePresence>
  );
}
