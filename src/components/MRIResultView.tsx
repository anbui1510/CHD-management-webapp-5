import React, { useMemo, useRef, useState } from 'react';
import {
  ArrowUpDown,
  FileText,
  Pencil,
  Save,
  Search,
  UserCog,
  X
} from 'lucide-react';
import {
  CMR,
  Consult,
  Patient,
  Staff,
  formatVNTime,
  removeDiacritics
} from '../types';
import { PatientAdminEditButton } from './PatientAdminEditButton';
import { VNDateInput } from './VNDateInput';
import { useSheetsSyncFeedback } from '../context/SheetsSyncFeedbackContext';
import { buildSyncContext, persistWithSheetsSync } from '../utils/sheetsSyncMutation';
import { formatFetchErrorMessage } from '../utils/patientFormValidation';
import { MODAL_TITLE } from '../utils/modalTitles';

interface MRIResultViewProps {
  patients: Patient[];
  consults: Consult[];
  cmrs: CMR[];
  staffList?: Staff[];
  currentStaff?: Staff | null;
  onRefreshData: () => void;
  onPatchCmr?: (cmrKey: string, patch: Partial<CMR>) => void;
  onEditPatientAdmin?: (patient: Patient) => void;
  triggerAlert?: (message: string, title?: string) => void;
}

type ResultTab = 'pending' | 'done';

type MRIResultItem = CMR & { __patient?: Patient };

const getFormattedDateKey = (str?: string): string => {
  if (!str) return '';
  const trimmed = String(str).trim().split('T')[0];
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;

  const slashParts = trimmed.split('/');
  if (slashParts.length === 3) {
    if (slashParts[2].length === 4) {
      return `${slashParts[2]}-${slashParts[1].padStart(2, '0')}-${slashParts[0].padStart(2, '0')}`;
    }
    if (slashParts[0].length === 4) {
      return `${slashParts[0]}-${slashParts[1].padStart(2, '0')}-${slashParts[2].padStart(2, '0')}`;
    }
  }

  const dashParts = trimmed.split('-');
  if (dashParts.length === 3 && dashParts[2].length === 4) {
    return `${dashParts[2]}-${dashParts[1].padStart(2, '0')}-${dashParts[0].padStart(2, '0')}`;
  }

  return trimmed;
};

export default function MRIResultView({
  patients,
  cmrs,
  onRefreshData,
  onPatchCmr,
  onEditPatientAdmin,
  triggerAlert
}: MRIResultViewProps) {
  const { reportMutationResponse } = useSheetsSyncFeedback();
  const [activeTab, setActiveTab] = useState<ResultTab>('pending');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc');

  const [selectedItem, setSelectedItem] = useState<MRIResultItem | null>(null);
  const [form, setForm] = useState<Partial<CMR>>({});
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  // Done cases open in read-only view; user clicks "Sửa kết quả" to edit.
  const [editMode, setEditMode] = useState(false);
  // Timestamp of when the form became editable, used to ignore stray/phantom
  // submits that can fire right after opening/entering edit (no auto-save).
  const openedAtRef = useRef(0);

  const patientsByKey = useMemo(() => {
    const map = new Map<string, Patient>();
    patients.forEach(patient => {
      if (patient.PatientKey) map.set(String(patient.PatientKey).trim().toLowerCase(), patient);
      if (patient.PatientID1) map.set(String(patient.PatientID1).trim().toLowerCase(), patient);
    });
    return map;
  }, [patients]);

  // Only scheduled cases (CMRScheduledDate has value) are eligible for result entry
  const allItems = useMemo<MRIResultItem[]>(() => {
    return cmrs
      .map((cmr, index) => {
        const key = cmr.CMRKey || cmr.CMRkey || `cmr_no_key_${index}`;
        const patient =
          patientsByKey.get(String(cmr.PatientKey || '').trim().toLowerCase()) ||
          patientsByKey.get(String(cmr.MBN || '').trim().toLowerCase());
        return { ...cmr, CMRKey: key, __patient: patient };
      })
      .filter(item => !!getFormattedDateKey(item.CMRScheduledDate));
  }, [cmrs, patientsByKey]);

  const segmented = useMemo(() => {
    const pending = allItems.filter(item => !String(item.CMRResult || '').trim());
    const done = allItems.filter(item => !!String(item.CMRResult || '').trim());
    return { pending, done };
  }, [allItems]);

  const displayItems = useMemo(() => {
    const source = activeTab === 'pending' ? segmented.pending : segmented.done;
    const q = removeDiacritics(searchQuery).toLowerCase().trim();
    const filtered = !q
      ? source
      : source.filter(item => {
          const patient = item.__patient;
          return [
            patient?.PatientName,
            patient?.PatientID1,
            item['Họ và tên'],
            item.MBN,
            item.CMRDiagnosisID,
            item.CMRDiagnosis,
            item.CMRResult,
            item.ConcludedResult
          ].some(value => removeDiacritics(String(value || '')).toLowerCase().includes(q));
        });

    return [...filtered].sort((a, b) => {
      const da = getFormattedDateKey(a.CMRScheduledDate);
      const db = getFormattedDateKey(b.CMRScheduledDate);
      return sortOrder === 'asc' ? da.localeCompare(db) : db.localeCompare(da);
    });
  }, [activeTab, segmented, searchQuery, sortOrder]);

  const openItem = (item: MRIResultItem) => {
    const isDone = !!String(item.CMRResult || '').trim();
    openedAtRef.current = Date.now();
    setSelectedItem(item);
    // Done cases start read-only; pending cases open straight into editing.
    setEditMode(!isDone);
    setMessage('');
    setForm({
      CMRDate: getFormattedDateKey(item.CMRDate),
      CMRResult: item.CMRResult || '',
      CMRNote: item.CMRNote || '',
      ConcludedResult: item.ConcludedResult || '',
      PDFResult: item.PDFResult || '',
      NextPlan: item.NextPlan || ''
    });
  };

  const enterEdit = () => {
    openedAtRef.current = Date.now();
    setEditMode(true);
    setMessage('');
  };

  const closeItem = () => {
    setSelectedItem(null);
    setEditMode(false);
    setForm({});
    setMessage('');
  };

  const handleEditAdmin = () => {
    const patient = selectedItem?.__patient;
    if (patient && onEditPatientAdmin) {
      closeItem();
      onEditPatientAdmin(patient);
    }
  };

  const handleSave = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!selectedItem) return;
    // Ignore submits that fire within 350ms of opening (accidental/phantom).
    if (Date.now() - openedAtRef.current < 350) return;
    if (saving) return;
    if (!String(form.CMRResult || '').trim()) {
      setMessage('Vui lòng nhập Kết quả CMR!');
      return;
    }
    const key = selectedItem.CMRKey || selectedItem.CMRkey;
    if (!key) {
      setMessage('Không xác định được mã CMR để cập nhật!');
      return;
    }

    const payload: CMR = {
      ...selectedItem,
      CMRDate: getFormattedDateKey(form.CMRDate),
      CMRResult: String(form.CMRResult || ''),
      CMRNote: String(form.CMRNote || ''),
      ConcludedResult: String(form.ConcludedResult || ''),
      PDFResult: String(form.PDFResult || ''),
      NextPlan: String(form.NextPlan || ''),
      UpdateTime: new Date().toISOString()
    };
    delete (payload as any).__patient;

    onPatchCmr?.(key, payload);
    closeItem();

    persistWithSheetsSync(
      reportMutationResponse,
      `/api/cmrs/${encodeURIComponent(key)}`,
      { method: 'PUT', body: JSON.stringify(payload) },
      buildSyncContext('mri-result', {
        patientName: selectedItem.__patient?.PatientName,
        patientKey: selectedItem.PatientKey
      }),
      { baseMessage: 'Đã lưu kết quả MRI' }
    )
      .then(() => onRefreshData())
      .catch((err: any) => {
        console.error(err);
        const msg = err?.message || '';
        triggerAlert?.(
          formatFetchErrorMessage(msg, 'Có lỗi khi lưu kết quả MRI.'),
          MODAL_TITLE.saveError
        );
        onRefreshData();
      });
  };

  const isDoneSelected = selectedItem ? !!String(selectedItem.CMRResult || '').trim() : false;

  return (
    <div className="flex-1 h-full flex flex-col gap-4 animate-in fade-in duration-200 font-sans min-h-0 p-4 lg:p-6 bg-slate-50">

      {/* Title */}
      <div className="shrink-0 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 sm:p-5 border border-slate-200 rounded-3xl shadow-sm">
        <div>
          <h2 className="text-base font-extrabold tracking-tight flex items-center gap-2 uppercase text-[#d2145a]">
            <FileText className="w-5 h-5 text-[#d2145a]" /> Danh sách chờ điền kết quả MRI tim
          </h2>
          <p className="text-xs text-slate-500 mt-0.5 font-medium">Điền và theo dõi kết quả chụp MRI tim cho các ca đã xếp lịch.</p>
        </div>
      </div>

      {/* Tabs + search */}
      <div className="shrink-0 bg-white border border-slate-200 rounded-3xl shadow-sm p-4 space-y-3">
        <div className="flex items-center bg-white border border-slate-200 rounded-xl p-1 text-xs font-semibold text-slate-600">
          <button
            onClick={() => setActiveTab('pending')}
            className={`flex-1 text-center py-2 rounded-lg transition-colors cursor-pointer ${
              activeTab === 'pending' ? 'bg-[#d2145a] text-white font-bold' : 'text-[#d2145a] hover:bg-pink-50'
            }`}
          >
            Chờ điền KQ <span className="text-[10px] opacity-75 font-mono">({segmented.pending.length})</span>
          </button>
          <button
            onClick={() => setActiveTab('done')}
            className={`flex-1 text-center py-2 rounded-lg transition-colors cursor-pointer ${
              activeTab === 'done' ? 'bg-emerald-600 text-white font-bold' : 'text-emerald-700 hover:bg-emerald-50'
            }`}
          >
            Đã điền KQ <span className="text-[10px] opacity-75 font-mono">({segmented.done.length})</span>
          </button>
        </div>

        <div className="flex gap-2">
          <div className="relative flex-1">
            <span className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
              <Search className="h-4 w-4 text-slate-400" />
            </span>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Tìm họ tên, ID, chẩn đoán, kết quả MRI..."
              className="w-full pl-9 pr-8 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-pink-400 focus:border-pink-400 shadow-sm"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute inset-y-0 right-0 flex items-center pr-2.5 text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          <button
            onClick={() => setSortOrder(prev => (prev === 'desc' ? 'asc' : 'desc'))}
            className="bg-white border border-slate-200 text-slate-600 px-3 rounded-xl flex items-center justify-center hover:bg-slate-50 transition-colors shrink-0 shadow-sm cursor-pointer"
            title="Sắp xếp theo ngày chụp dự kiến"
          >
            <ArrowUpDown className={`w-4 h-4 transition-transform duration-300 ${sortOrder === 'asc' ? 'rotate-180' : ''}`} />
          </button>
        </div>
      </div>

      {/* List table */}
      <div className="flex-1 min-h-0 bg-white border border-slate-200 rounded-3xl shadow-sm overflow-hidden flex flex-col">
        <div className="flex-1 overflow-x-auto overflow-y-auto">
          <table className="w-full min-w-[760px] border-separate border-spacing-0 text-left text-xs font-medium text-slate-700">
            <thead className="bg-slate-50/70 text-slate-500 sticky top-0 uppercase text-[9px] font-extrabold tracking-wider z-10 shadow-xs">
              <tr>
                <th className="py-3 px-3 border-b border-slate-200 w-12 text-center">STT</th>
                <th className="py-3 px-3 border-b border-slate-200 min-w-[200px]">Họ và tên</th>
                <th className="py-3 px-3 border-b border-slate-200 min-w-[220px]">Chẩn đoán</th>
                <th className="py-3 px-3 border-b border-slate-200 w-44">Thời gian chụp dự kiến</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-150">
              {displayItems.map((item, index) => {
                const patient = item.__patient;
                return (
                  <tr
                    key={item.CMRKey || `${item.PatientKey}-${index}`}
                    onClick={() => openItem(item)}
                    className="hover:bg-indigo-50/45 transition cursor-pointer"
                  >
                    <td className="py-3 px-3 text-center font-mono text-slate-500">{index + 1}</td>
                    <td className="py-3 px-3">
                      <span className="font-extrabold uppercase text-slate-900 block truncate max-w-[220px]">
                        {patient?.PatientName || item['Họ và tên'] || '—'}
                      </span>
                      <span className="text-[9px] text-slate-400 font-bold font-mono">
                        {patient?.PatientID1 || item.MBN || '—'}
                      </span>
                    </td>
                    <td className="py-3 px-3">
                      <span className="text-[9px] text-[#d2145a] font-black bg-pink-50 px-1.5 py-0.5 rounded mr-1">
                        {item.CMRDiagnosisID || '—'}
                      </span>
                      <span className="line-clamp-2">{item.CMRDiagnosis || '—'}</span>
                    </td>
                    <td className="py-3 px-3 font-bold font-mono text-emerald-700">
                      {item.CMRScheduledDate ? formatVNTime(item.CMRScheduledDate) : '—'}
                    </td>
                  </tr>
                );
              })}
              {displayItems.length === 0 && (
                <tr>
                  <td colSpan={4} className="p-8 text-center text-slate-400 italic">
                    Không có bệnh nhi nào trong danh sách này.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* RESULT MODAL */}
      {selectedItem && (() => {
        const patient = selectedItem.__patient;
        return (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-3xl max-w-2xl w-full max-h-[94vh] shadow-2xl border border-slate-200 flex flex-col overflow-hidden text-xs text-slate-700 font-semibold leading-relaxed animate-in zoom-in-95 duration-150">

              <div className="flex items-center justify-between border-b border-slate-150 px-6 py-4 bg-indigo-50/50 shrink-0">
                <div className="flex items-center gap-2">
                  <FileText className="w-5 h-5 text-indigo-600" />
                  <div>
                    <h3 className="font-extrabold text-sm uppercase text-indigo-900">
                      {isDoneSelected ? (editMode ? 'Sửa kết quả MRI tim' : 'Kết quả MRI tim') : 'Điền kết quả MRI tim'}
                    </h3>
                    <p className="text-[10px] text-slate-500 normal-case mt-0.5">
                      Ngày chụp dự kiến: {selectedItem.CMRScheduledDate ? formatVNTime(selectedItem.CMRScheduledDate) : '—'}
                      {isDoneSelected && !editMode ? ' (chỉ xem)' : ''}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={closeItem}
                  className="text-slate-400 hover:text-red-600 p-1 bg-white hover:bg-red-50 border border-slate-200 rounded-full transition cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <form onSubmit={(e) => e.preventDefault()} className="flex-1 flex flex-col overflow-hidden min-h-0">
                <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 bg-slate-50/50">

                  {/* Admin info */}
                  <div className="bg-white border border-slate-200 p-3 rounded-2xl shadow-sm">
                    <span className="font-extrabold text-slate-800 text-[10px] uppercase tracking-wider block border-b border-slate-100 pb-1.5 mb-2.5">
                      Thông tin hành chính
                    </span>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                      <div className="col-span-2">
                        <span className="text-slate-400 block font-bold text-[8px] uppercase">Họ và tên:</span>
                        <span className="font-extrabold text-slate-900 uppercase text-[11.5px]">{patient?.PatientName || selectedItem['Họ và tên'] || '—'}</span>
                      </div>
                      <div>
                        <span className="text-slate-400 block font-bold text-[8px] uppercase">Mã NB (ID1):</span>
                        <span className="font-extrabold font-mono text-slate-800 text-[11px]">{patient?.PatientID1 || selectedItem.MBN || '—'}</span>
                      </div>
                      <div>
                        <span className="text-slate-400 block font-bold text-[8px] uppercase">Ngày sinh:</span>
                        <span className="font-bold font-mono text-slate-800">{patient?.PatientDOB ? formatVNTime(patient.PatientDOB) : '—'}</span>
                      </div>
                      <div>
                        <span className="text-slate-400 block font-bold text-[8px] uppercase">Giới tính:</span>
                        <span className="font-bold text-slate-800">{patient?.PatientSex || '—'}</span>
                      </div>
                      <div className="col-span-2">
                        <span className="text-slate-400 block font-bold text-[8px] uppercase">Chẩn đoán MRI:</span>
                        <span className="font-bold text-slate-800">
                          <span className="text-[10px] text-[#d2145a] font-black bg-pink-50 px-1.5 py-0.5 rounded mr-1">{selectedItem.CMRDiagnosisID || '—'}</span>
                          {selectedItem.CMRDiagnosis || ''}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-400 block font-bold text-[8px] uppercase">Điện thoại:</span>
                        <span className="font-extrabold font-mono text-slate-800">{patient?.PatientPhone1 || '—'}</span>
                      </div>
                    </div>
                  </div>

                  {/* Result fields */}
                  <div className="bg-white border border-slate-200 p-3 rounded-2xl shadow-sm space-y-2.5">
                    <span className="font-extrabold text-[#d2145a] text-[10px] uppercase tracking-wider block border-b border-slate-100 pb-1.5">
                      Kết quả MRI tim
                    </span>

                    {editMode ? (
                      <>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                          <div>
                            <label className="block text-slate-500 font-bold text-[9px] uppercase mb-0.5">Ngày chụp thực tế</label>
                            <VNDateInput
                              value={String(form.CMRDate || '')}
                              onChange={(val) => setForm(prev => ({ ...prev, CMRDate: val }))}
                              className="w-full bg-white border border-slate-200 rounded-xl px-2.5 py-1.5 font-semibold font-sans focus:outline-none text-xs"
                            />
                          </div>
                          <div>
                            <label className="block text-slate-500 font-bold text-[9px] uppercase mb-0.5">File PDF kết quả</label>
                            <input
                              type="text"
                              placeholder="Đường dẫn/link PDF..."
                              value={String(form.PDFResult || '')}
                              onChange={(e) => setForm(prev => ({ ...prev, PDFResult: e.target.value }))}
                              className="w-full bg-white border border-slate-200 rounded-xl px-2.5 py-1.5 font-semibold focus:outline-none text-xs"
                            />
                          </div>
                        </div>

                        <div>
                          <label className="block text-slate-500 font-bold text-[9px] uppercase mb-0.5">Kết quả CMR *</label>
                          <textarea
                            required
                            rows={3}
                            value={String(form.CMRResult || '')}
                            onChange={(e) => setForm(prev => ({ ...prev, CMRResult: e.target.value }))}
                            className="w-full bg-white border border-slate-200 rounded-xl px-2.5 py-1.5 text-xs font-semibold focus:outline-none resize-none"
                          />
                        </div>
                        <div>
                          <label className="block text-slate-500 font-bold text-[9px] uppercase mb-0.5">Kết luận MRI</label>
                          <textarea
                            rows={2}
                            value={String(form.ConcludedResult || '')}
                            onChange={(e) => setForm(prev => ({ ...prev, ConcludedResult: e.target.value }))}
                            className="w-full bg-white border border-slate-200 rounded-xl px-2.5 py-1.5 text-xs font-semibold focus:outline-none resize-none"
                          />
                        </div>
                        <div>
                          <label className="block text-slate-500 font-bold text-[9px] uppercase mb-0.5">Ghi chú CMR</label>
                          <textarea
                            rows={2}
                            value={String(form.CMRNote || '')}
                            onChange={(e) => setForm(prev => ({ ...prev, CMRNote: e.target.value }))}
                            className="w-full bg-white border border-slate-200 rounded-xl px-2.5 py-1.5 text-xs font-semibold focus:outline-none resize-none"
                          />
                        </div>
                        <div>
                          <label className="block text-slate-500 font-bold text-[9px] uppercase mb-0.5">Kế hoạch tiếp theo</label>
                          <textarea
                            rows={2}
                            value={String(form.NextPlan || '')}
                            onChange={(e) => setForm(prev => ({ ...prev, NextPlan: e.target.value }))}
                            className="w-full bg-white border border-slate-200 rounded-xl px-2.5 py-1.5 text-xs font-semibold focus:outline-none resize-none"
                          />
                        </div>
                      </>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                        <div>
                          <span className="text-slate-400 block font-bold text-[8px] uppercase">Ngày chụp thực tế:</span>
                          <span className="font-bold font-mono text-slate-800">{form.CMRDate ? formatVNTime(String(form.CMRDate)) : '—'}</span>
                        </div>
                        <div>
                          <span className="text-slate-400 block font-bold text-[8px] uppercase">File PDF kết quả:</span>
                          <span className="font-semibold text-slate-800 break-all">{String(form.PDFResult || '') || '—'}</span>
                        </div>
                        <div className="sm:col-span-2">
                          <span className="text-slate-400 block font-bold text-[8px] uppercase">Kết quả CMR:</span>
                          <span className="font-semibold text-slate-800 whitespace-pre-wrap">{String(form.CMRResult || '') || '—'}</span>
                        </div>
                        <div className="sm:col-span-2">
                          <span className="text-slate-400 block font-bold text-[8px] uppercase">Kết luận MRI:</span>
                          <span className="font-semibold text-slate-800 whitespace-pre-wrap">{String(form.ConcludedResult || '') || '—'}</span>
                        </div>
                        <div className="sm:col-span-2">
                          <span className="text-slate-400 block font-bold text-[8px] uppercase">Ghi chú CMR:</span>
                          <span className="font-semibold text-slate-800 whitespace-pre-wrap">{String(form.CMRNote || '') || '—'}</span>
                        </div>
                        <div className="sm:col-span-2">
                          <span className="text-slate-400 block font-bold text-[8px] uppercase">Kế hoạch tiếp theo:</span>
                          <span className="font-semibold text-slate-800 whitespace-pre-wrap">{String(form.NextPlan || '') || '—'}</span>
                        </div>
                      </div>
                    )}
                  </div>

                  {message && (
                    <div className={`rounded-xl px-3 py-2 text-[11px] font-bold ${message.includes('thành công') ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' : 'bg-rose-50 text-rose-700 border border-rose-100'}`}>
                      {message}
                    </div>
                  )}
                </div>

                <div className="p-4 border-t border-slate-100 bg-slate-50 flex flex-wrap justify-end gap-2 shrink-0">
                  {onEditPatientAdmin && (
                    <PatientAdminEditButton onClick={handleEditAdmin} />
                  )}
                  {isDoneSelected && !editMode ? (
                    <button
                      type="button"
                      onClick={enterEdit}
                      className="bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold px-6 py-2 rounded-2xl shadow-xs text-xs cursor-pointer transition flex items-center gap-2"
                    >
                      <Pencil className="w-4 h-4" /> Sửa kết quả
                    </button>
                  ) : (
                    <>
                      {isDoneSelected && (
                        <button
                          type="button"
                          onClick={() => { setEditMode(false); setMessage(''); }}
                          className="px-4 py-2 text-xs font-bold text-slate-500 hover:text-slate-800 hover:bg-slate-200/50 rounded-2xl cursor-pointer transition"
                        >
                          Quay lại
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => handleSave()}
                        disabled={saving}
                        className="bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold px-6 py-2 rounded-2xl shadow-xs text-xs cursor-pointer transition flex items-center gap-2 disabled:opacity-50"
                      >
                        <Save className="w-4 h-4" />
                        {saving ? 'Đang lưu...' : 'Lưu kết quả'}
                      </button>
                    </>
                  )}
                </div>
              </form>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
