import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardList,
  ExternalLink,
  Plus,
  Save,
  Search,
  Upload,
  X,
} from 'lucide-react';
import {
  Patient,
  Source,
  Staff,
  Transplant,
  findPatientByKey,
  removeDiacritics,
} from '../types';
import { SearchableEnumSelect } from './SearchableEnumSelect';
import { MobileAutoExpandTextarea } from './MobileAutoExpandTextarea';
import { VNDateInput } from './VNDateInput';
import { getSourceDiagnosisOptions, normalizeDiagnosisID } from '../data/source';
import {
  BLOOD_TYPE_OPTIONS,
  TRANSPLANT_STATUS_OPTIONS,
  TRANSPLANT_YES_NO_OPTIONS,
  TRANS_STATUS_NOT_READY,
} from '../data/transplantDefaults';
import {
  MAX_TRANSPLANT_FILE_BYTES,
  openTransplantFile,
  readFileAsDataUrl,
} from './transplant/transplantUtils';
import { useSheetsSyncFeedback } from '../context/SheetsSyncFeedbackContext';
import { buildSyncContext, persistWithSheetsSync } from '../utils/sheetsSyncMutation';
import { MODAL_TITLE } from '../utils/modalTitles';

const ADDRESS_OPTIONS = [
  'TP Hồ Chí Minh', 'TP Hà Nội', 'Gia Lai', 'Đắk Lắk', 'Khánh Hoà', 'An Giang',
];

export interface TransplantRegisterModalProps {
  patients: Patient[];
  sources?: Source[];
  currentStaff?: Staff | null;
  onClose: () => void;
  onAddPatient?: (patient: Patient) => Promise<Patient | void> | Patient | void;
  onAddTransplant: (record: Transplant) => Promise<void> | void;
  triggerAlert?: (msg: string, title?: string) => void;
}

function emptyForm(): Partial<Transplant> {
  return {
    BloodType: 'Chưa xác định',
    Gens: 'Không',
    MRI: 'Không',
    Holter: 'Không',
    TransStatus: TRANS_STATUS_NOT_READY,
    TTE: '',
    DetailTransDiag: '',
    Treatment: '',
    TransNote: '',
    TransWeight: '',
    TransHeight: '',
    TransDiagID: '',
  };
}

function FileField({
  label,
  value,
  onChange,
  onAlert,
}: {
  label: string;
  value?: string;
  onChange: (val: string) => void;
  onAlert?: (msg: string, title?: string) => void;
}) {
  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_TRANSPLANT_FILE_BYTES) {
      onAlert?.('File quá lớn. Vui lòng chọn file dưới 1MB.', MODAL_TITLE.warning);
      e.target.value = '';
      return;
    }
    try {
      onChange(await readFileAsDataUrl(file));
    } catch {
      onAlert?.('Không đọc được file.', MODAL_TITLE.saveError);
    }
    e.target.value = '';
  };

  return (
    <div className="space-y-1">
      <label className="block text-slate-500 font-bold text-[9px] uppercase">{label}</label>
      <div className="flex flex-wrap items-center gap-2">
        <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 bg-white text-[11px] font-bold text-slate-700 cursor-pointer hover:bg-slate-50">
          <Upload className="w-3.5 h-3.5" /> Chọn file
          <input type="file" accept=".pdf,image/*" className="hidden" onChange={handleFile} />
        </label>
        {value && (
          <button type="button" onClick={() => openTransplantFile(value)} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl border border-indigo-200 bg-indigo-50 text-indigo-700 text-[11px] font-bold">
            <ExternalLink className="w-3.5 h-3.5" /> Mở file
          </button>
        )}
        {value && (
          <button type="button" onClick={() => onChange('')} className="text-[10px] font-bold text-rose-600">Xóa file</button>
        )}
      </div>
    </div>
  );
}

export default function TransplantRegisterModal({
  patients,
  sources = [],
  currentStaff,
  onClose,
  onAddPatient,
  onAddTransplant,
  triggerAlert,
}: TransplantRegisterModalProps) {
  const { reportMutationResponse } = useSheetsSyncFeedback();
  const [patientMode, setPatientMode] = useState<'select' | 'create'>('select');
  const [searchPatQuery, setSearchPatQuery] = useState('');
  const [selectedPatKey, setSelectedPatKey] = useState('');
  const [newPatient, setNewPatient] = useState({
    PatientID1: '',
    PatientName: '',
    PatientDOB: '',
    PatientSex: 'Nam',
    PatientAddress: 'TP Hồ Chí Minh',
    PatientPhone1: '',
  });
  const [form, setForm] = useState<Partial<Transplant>>(emptyForm());
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const diagnosisOptions = useMemo(() => getSourceDiagnosisOptions(sources), [sources]);
  const filteredPatients = useMemo(() => {
    const q = removeDiacritics(searchPatQuery).toLowerCase().trim();
    if (!q) return patients.slice(0, 30);
    return patients.filter(p =>
      removeDiacritics(String(p.PatientName || '')).toLowerCase().includes(q) ||
      removeDiacritics(String(p.PatientID1 || '')).toLowerCase().includes(q)
    ).slice(0, 30);
  }, [patients, searchPatQuery]);

  const selectedPatient = findPatientByKey(patients, selectedPatKey);

  const validate = (): string | null => {
    if (patientMode === 'select' && !selectedPatKey) return 'Vui lòng chọn bệnh nhi.';
    if (patientMode === 'create') {
      if (!newPatient.PatientID1.trim()) return 'Vui lòng nhập mã bệnh nhân.';
      if (!newPatient.PatientName.trim()) return 'Vui lòng nhập họ tên.';
      if (!newPatient.PatientDOB.trim()) return 'Vui lòng nhập ngày sinh.';
    }
    if (!String(form.TransWeight || '').trim()) return 'Vui lòng nhập cân nặng.';
    if (!String(form.TTE || '').trim()) return 'Vui lòng nhập siêu âm tim.';
    if (!String(form.TransDiagID || '').trim()) return 'Vui lòng chọn mã chẩn đoán.';
    if (!String(form.DetailTransDiag || '').trim()) return 'Vui lòng nhập chẩn đoán chi tiết.';
    if (!String(form.Treatment || '').trim()) return 'Vui lòng nhập điều trị hiện tại.';
    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    const err = validate();
    if (err) {
      setErrorMsg(err);
      return;
    }
    setSaving(true);
    try {
      let patientKey = selectedPatKey;
      let patientName = selectedPatient?.PatientName;
      if (patientMode === 'create') {
        const createdPat = await persistWithSheetsSync<Patient>(
          reportMutationResponse,
          '/api/patients',
          {
            method: 'POST',
            body: JSON.stringify({
              PatientID1: newPatient.PatientID1.trim(),
              PatientName: newPatient.PatientName.trim(),
              PatientDOB: newPatient.PatientDOB.trim(),
              PatientSex: newPatient.PatientSex,
              PatientAddress: newPatient.PatientAddress,
              PatientPhone1: newPatient.PatientPhone1.trim(),
              PatientID2: '',
              OtherPatientName: '',
              PatientPhone2: '',
              PatientCreateBy: currentStaff?.StaffKey || '',
              PatientCreateTime: new Date().toISOString(),
              Outcome: '',
            })
          },
          buildSyncContext('heart-transplant', { patientName: newPatient.PatientName.trim() }),
          { baseMessage: 'Đã tạo bệnh nhi mới' }
        );
        patientKey = createdPat.PatientKey || '';
        patientName = createdPat.PatientName;
        onAddPatient?.(createdPat);
      }
      if (!patientKey) throw new Error('Không xác định được bệnh nhi.');
      const now = new Date().toISOString();
      const payload: Transplant = {
        ...form,
        PatientKey: patientKey,
        TransDiagID: normalizeDiagnosisID(form.TransDiagID),
        TransCreatedTime: now,
        TransUpdateTime: now,
        TransUpdateBy: currentStaff?.StaffKey || '',
        TransStatus: form.TransStatus || TRANS_STATUS_NOT_READY,
      };
      const saved = await persistWithSheetsSync<Transplant>(
        reportMutationResponse,
        '/api/transplants',
        { method: 'POST', body: JSON.stringify(payload) },
        buildSyncContext('heart-transplant', { patientName, patientKey }),
        { baseMessage: 'Đã lưu đăng ký ghép tim' }
      );
      await onAddTransplant(saved);
      setSuccessMsg('Đã lưu đăng ký ghép tim!');
      setTimeout(onClose, 900);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Lưu thất bại.';
      setErrorMsg(msg);
      triggerAlert?.(msg, MODAL_TITLE.saveError);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-3">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden">
        <div className="px-5 py-4 border-b flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ClipboardList className="w-5 h-5 text-[#d2145a]" />
            <h2 className="text-sm font-black uppercase text-[#d2145a]">Đăng ký ghép tim</h2>
          </div>
          <button type="button" onClick={onClose}><X className="w-5 h-5 text-slate-500" /></button>
        </div>
        <form onSubmit={handleSubmit} className="flex-1 flex flex-col min-h-0 overflow-hidden">
          {successMsg && <div className="bg-emerald-500 text-white py-2 px-5 text-xs font-bold flex items-center gap-2"><CheckCircle2 className="w-4 h-4" />{successMsg}</div>}
          {errorMsg && <div className="bg-rose-50 text-rose-800 py-2 px-5 text-[11px] font-semibold flex items-center gap-2"><AlertTriangle className="w-4 h-4" />{errorMsg}</div>}
          <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50/60">
            <div className="bg-white border rounded-2xl p-3 space-y-2">
              <div className="flex justify-between items-center">
                <label className="text-[10px] font-black uppercase text-slate-500">Chọn bệnh nhi *</label>
                <button type="button" onClick={() => setPatientMode('create')} className="text-[10px] font-bold px-2 py-1 rounded-lg bg-pink-50 text-[#d2145a]"><Plus className="w-3 h-3 inline" /> Mới</button>
              </div>
              <div className="flex gap-2 p-1 bg-slate-100 rounded-xl">
                <button type="button" onClick={() => setPatientMode('select')} className={`flex-1 py-1 text-xs font-bold rounded-lg ${patientMode === 'select' ? 'bg-indigo-600 text-white' : ''}`}>Chọn có sẵn</button>
                <button type="button" onClick={() => setPatientMode('create')} className={`flex-1 py-1 text-xs font-bold rounded-lg ${patientMode === 'create' ? 'bg-indigo-600 text-white' : ''}`}>Tạo mới</button>
              </div>
              {patientMode === 'select' ? (
                <>
                  <div className="relative">
                    <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                    <input type="text" placeholder="Nhập tên hoặc mã ID1..." value={searchPatQuery} onChange={e => setSearchPatQuery(e.target.value)} className="w-full pl-9 pr-3 py-2 border rounded-xl text-sm" />
                  </div>
                  <div className="max-h-36 overflow-y-auto border rounded-xl divide-y">
                    {filteredPatients.map(p => (
                      <button key={p.PatientKey} type="button" onClick={() => setSelectedPatKey(p.PatientKey)} className={`w-full text-left px-3 py-2 text-xs ${selectedPatKey === p.PatientKey ? 'bg-indigo-50' : ''}`}>
                        <div className="font-bold uppercase">{p.PatientName}</div>
                        <div className="text-slate-400 font-mono">ID1: {p.PatientID1}</div>
                      </button>
                    ))}
                  </div>
                  {selectedPatient && <p className="text-[11px] text-emerald-700 font-semibold">Đã chọn: {selectedPatient.PatientName}</p>}
                </>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  <input placeholder="Mã BN *" value={newPatient.PatientID1} onChange={e => setNewPatient(p => ({ ...p, PatientID1: e.target.value }))} className="border rounded-xl px-3 py-2 text-sm" />
                  <input placeholder="Họ tên *" value={newPatient.PatientName} onChange={e => setNewPatient(p => ({ ...p, PatientName: e.target.value }))} className="border rounded-xl px-3 py-2 text-sm" />
                  <VNDateInput value={newPatient.PatientDOB} onChange={v => setNewPatient(p => ({ ...p, PatientDOB: v }))} className="border rounded-xl px-3 py-2 text-sm w-full" />
                  <select value={newPatient.PatientSex} onChange={e => setNewPatient(p => ({ ...p, PatientSex: e.target.value }))} className="border rounded-xl px-3 py-2 text-sm"><option>Nam</option><option>Nữ</option></select>
                  <div>
                    <label className="block text-slate-500 font-bold text-[9px] uppercase mb-0.5">SĐT gia đình</label>
                    <input
                      type="text"
                      placeholder="Số ĐT..."
                      value={newPatient.PatientPhone1}
                      onChange={e => setNewPatient(p => ({ ...p, PatientPhone1: e.target.value }))}
                      className="w-full border rounded-xl px-3 py-2 text-sm font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-500 font-bold text-[9px] uppercase mb-0.5">Địa chỉ *</label>
                    <select
                      value={newPatient.PatientAddress}
                      onChange={e => setNewPatient(p => ({ ...p, PatientAddress: e.target.value }))}
                      className="w-full border rounded-xl px-3 py-2 text-sm font-bold text-slate-800"
                    >
                      {ADDRESS_OPTIONS.map(addr => <option key={addr} value={addr}>{addr}</option>)}
                    </select>
                  </div>
                </div>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="text-[9px] font-bold uppercase text-slate-500">Cân nặng (kg) *</label><input value={form.TransWeight || ''} onChange={e => setForm(f => ({ ...f, TransWeight: e.target.value }))} className="w-full border rounded-xl px-3 py-2 text-sm mt-1" /></div>
              <div><label className="text-[9px] font-bold uppercase text-slate-500">Chiều cao (cm)</label><input value={form.TransHeight || ''} onChange={e => setForm(f => ({ ...f, TransHeight: e.target.value }))} className="w-full border rounded-xl px-3 py-2 text-sm mt-1" /></div>
              <div><label className="text-[9px] font-bold uppercase text-slate-500">Nhóm máu *</label><select value={form.BloodType || ''} onChange={e => setForm(f => ({ ...f, BloodType: e.target.value }))} className="w-full border rounded-xl px-3 py-2 text-sm mt-1">{BLOOD_TYPE_OPTIONS.map(o => <option key={o}>{o}</option>)}</select></div>
              <div><label className="text-[9px] font-bold uppercase text-slate-500">Trạng thái</label><select value={form.TransStatus || TRANS_STATUS_NOT_READY} onChange={e => setForm(f => ({ ...f, TransStatus: e.target.value }))} className="w-full border rounded-xl px-3 py-2 text-sm mt-1">{TRANSPLANT_STATUS_OPTIONS.map(o => <option key={o}>{o}</option>)}</select></div>
              {(['Gens', 'MRI', 'Holter'] as const).map(field => (
                <div key={field}><label className="text-[9px] font-bold uppercase text-slate-500">{field === 'Gens' ? 'XN gen' : field} *</label><select value={form[field] || 'Không'} onChange={e => setForm(f => ({ ...f, [field]: e.target.value }))} className="w-full border rounded-xl px-3 py-2 text-sm mt-1">{TRANSPLANT_YES_NO_OPTIONS.map(o => <option key={o}>{o}</option>)}</select></div>
              ))}
              <div className="col-span-2"><label className="text-[9px] font-bold uppercase text-slate-500">Mã chẩn đoán *</label><SearchableEnumSelect value={form.TransDiagID || ''} onChange={v => setForm(f => ({ ...f, TransDiagID: v }))} options={diagnosisOptions} placeholder="Chọn mã ICD..." /></div>
              <div className="col-span-2"><label className="text-[9px] font-bold uppercase text-slate-500">Chẩn đoán chi tiết *</label><MobileAutoExpandTextarea minRows={3} value={form.DetailTransDiag || ''} onChange={e => setForm(f => ({ ...f, DetailTransDiag: e.target.value }))} className="w-full border rounded-xl px-3 py-2 text-sm mt-1" /></div>
              <div className="col-span-2"><label className="text-[9px] font-bold uppercase text-slate-500">Siêu âm tim *</label><MobileAutoExpandTextarea minRows={3} value={form.TTE || ''} onChange={e => setForm(f => ({ ...f, TTE: e.target.value }))} className="w-full border rounded-xl px-3 py-2 text-sm mt-1" /></div>
              <div className="col-span-2"><label className="text-[9px] font-bold uppercase text-slate-500">Điều trị hiện tại *</label><MobileAutoExpandTextarea minRows={3} value={form.Treatment || ''} onChange={e => setForm(f => ({ ...f, Treatment: e.target.value }))} className="w-full border rounded-xl px-3 py-2 text-sm mt-1" /></div>
              <div className="col-span-2"><label className="text-[9px] font-bold uppercase text-slate-500">Ghi chú</label><MobileAutoExpandTextarea minRows={2} value={form.TransNote || ''} onChange={e => setForm(f => ({ ...f, TransNote: e.target.value }))} className="w-full border rounded-xl px-3 py-2 text-sm mt-1" /></div>
              <div><label className="text-[9px] font-bold uppercase text-slate-500">Ngày ghép tim</label><VNDateInput value={form.TransDate || ''} onChange={v => setForm(f => ({ ...f, TransDate: v }))} className="w-full border rounded-xl px-3 py-2 text-sm mt-1" /></div>
            </div>
            <div className="grid grid-cols-2 gap-3 bg-white border rounded-2xl p-3">
              {form.Gens === 'Có' && <FileField label="File XN gen" value={form.GensFile} onChange={v => setForm(f => ({ ...f, GensFile: v }))} onAlert={triggerAlert} />}
              {form.MRI === 'Có' && <FileField label="File MRI" value={form.MRIFile} onChange={v => setForm(f => ({ ...f, MRIFile: v }))} onAlert={triggerAlert} />}
              {form.Holter === 'Có' && <FileField label="File Holter" value={form.HolterFile} onChange={v => setForm(f => ({ ...f, HolterFile: v }))} onAlert={triggerAlert} />}
              <FileField label="File TTE" value={form.TTEFile} onChange={v => setForm(f => ({ ...f, TTEFile: v }))} onAlert={triggerAlert} />
            </div>
          </div>
          <div className="px-4 py-3 border-t flex gap-2">
            <button type="button" onClick={onClose} className="flex-1 py-2.5 rounded-2xl border font-bold text-sm">Hủy</button>
            <button type="submit" disabled={saving} className="flex-1 py-2.5 rounded-2xl bg-[#d2145a] text-white font-bold text-sm flex items-center justify-center gap-2"><Save className="w-4 h-4" />{saving ? 'Đang lưu...' : 'Lưu đăng ký'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
