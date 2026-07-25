import React, { useMemo, useState } from 'react';
import { Search, ArrowUpDown, Undo2, ChevronLeft, ChevronRight } from 'lucide-react';
import { findPatientByKey, formatVNTime, removeDiacritics } from '../types';
import { useSheetsSyncFeedback } from '../context/SheetsSyncFeedbackContext';
import { buildSyncContext, persistWithSheetsSync } from '../utils/sheetsSyncMutation';

type ArchiveTab = 'transferred' | 'archive';

interface ArchiveViewProps {
  consults: any[];
  patients: any[];
  onRefreshData: () => void;
  onPatchConsult?: (consultKey: string, patch: Partial<any>) => void;
  triggerConfirm?: (msg: string, onConfirm: () => void, title?: string) => void;
  initialTab?: ArchiveTab;
}

const itemsPerPage = 7;

export default function ArchiveView({
  consults,
  patients,
  onRefreshData,
  onPatchConsult,
  triggerConfirm,
  initialTab = 'archive'
}: ArchiveViewProps) {
  const { reportMutationResponse } = useSheetsSyncFeedback();
  const [activeTab, setActiveTab] = useState<ArchiveTab>(initialTab);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortOldest, setSortOldest] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);

  const transferredConsults = useMemo(() => {
    return consults.filter((c: any) => {
      const value = String(c.TransferredToCathLab || '').trim().toLowerCase();
      return c.TransferredToCathLab === true || value === 'true' || value === 'yes' || value === 'có';
    });
  }, [consults]);

  const archivedConsults = useMemo(() => {
    return consults.filter((c: any) =>
      ['Loại', 'Đã làm nơi khác', 'Muốn theo dõi nơi khác'].includes(c.CallStatus)
    );
  }, [consults]);

  const sourceList = activeTab === 'transferred' ? transferredConsults : archivedConsults;

  const filteredAndSorted = useMemo(() => {
    let result = [...sourceList];
    if (searchQuery.trim()) {
      const q = removeDiacritics(searchQuery).toLowerCase().trim();
      result = result.filter((c: any) => {
        const p = findPatientByKey(patients, c.PatientKey);
        if (!p) return false;
        return removeDiacritics(String(p.PatientName || '')).toLowerCase().includes(q) ||
          removeDiacritics(String(p.PatientID1 || '')).toLowerCase().includes(q) ||
          removeDiacritics(String(c.DiagnosisID || '')).toLowerCase().includes(q);
      });
    }

    result.sort((a: any, b: any) => {
      const dateA = a.PlannedCathLabDate || '9999-99-99';
      const dateB = b.PlannedCathLabDate || '9999-99-99';
      return sortOldest ? dateA.localeCompare(dateB) : dateB.localeCompare(dateA);
    });
    return result;
  }, [sourceList, searchQuery, sortOldest, patients]);

  const totalPages = Math.ceil(filteredAndSorted.length / itemsPerPage);
  const paginatedData = filteredAndSorted.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  const switchTab = (tab: ArchiveTab) => {
    setActiveTab(tab);
    setSearchQuery('');
    setCurrentPage(1);
  };

  const handleUndoTransferred = (c: any) => {
    if (!triggerConfirm) return;
    triggerConfirm('Bạn có chắc chắn muốn hoàn tác chuyển ca này không?', () => {
      const patch = { TransferredToCathLab: false };
      const patient = findPatientByKey(patients, c.PatientKey);
      onPatchConsult?.(c.ConsultKey, patch);
      persistWithSheetsSync(
        reportMutationResponse,
        `/api/consults/${c.ConsultKey}`,
        { method: 'PUT', body: JSON.stringify(patch) },
        buildSyncContext('archive', { patientName: patient?.PatientName, patientKey: c.PatientKey }),
        { baseMessage: 'Đã hoàn tác chuyển ca' }
      )
        .then(() => onRefreshData())
        .catch(err => {
          console.error(err);
          onRefreshData();
        });
    }, 'Hoàn tác');
  };

  const handleUndoArchive = (c: any) => {
    if (!triggerConfirm) return;
    triggerConfirm('Đưa ca này về lại view "Xếp lịch & Dụng cụ" và xóa trạng thái lưu trữ/xếp lịch?', () => {
      const patch = {
        CallStatus: '',
        CallNote: '',
        CheckDevice: '',
        PlannedCathLabDate: '',
        TransferredToCathLab: false,
        Removed: false
      };
      const patient = findPatientByKey(patients, c.PatientKey);
      onPatchConsult?.(c.ConsultKey, patch);
      persistWithSheetsSync(
        reportMutationResponse,
        `/api/consults/${c.ConsultKey}`,
        { method: 'PUT', body: JSON.stringify(patch) },
        buildSyncContext('archive', { patientName: patient?.PatientName, patientKey: c.PatientKey }),
        { baseMessage: 'Đã hoàn tác lưu trữ' }
      )
        .then(() => onRefreshData())
        .catch(err => {
          console.error(err);
          onRefreshData();
        });
    }, 'Hoàn tác Lưu trữ');
  };

  return (
    <div className="flex-1 min-h-0 h-full flex flex-col animate-in fade-in duration-200 bg-slate-50 p-6">
      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm flex flex-col h-full overflow-hidden">
        <div className="p-4 border-b border-slate-100 bg-slate-50 shrink-0 space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => switchTab('transferred')}
              className={`font-extrabold text-[13px] px-5 py-2.5 rounded-2xl transition flex items-center gap-2 ${activeTab === 'transferred' ? 'bg-indigo-600 text-white shadow-md' : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50 shadow-sm'}`}
            >
              Danh sách đã chuyển phòng TT
              <span className={`px-2 py-0.5 rounded-full text-[11px] font-black ${activeTab === 'transferred' ? 'bg-indigo-500 text-white' : 'bg-slate-100 text-slate-500'}`}>
                {transferredConsults.length}
              </span>
            </button>
            <button
              type="button"
              onClick={() => switchTab('archive')}
              className={`font-extrabold text-[13px] px-5 py-2.5 rounded-2xl transition flex items-center gap-2 ${activeTab === 'archive' ? 'bg-indigo-600 text-white shadow-md' : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50 shadow-sm'}`}
            >
              Lưu trữ
              <span className={`px-2 py-0.5 rounded-full text-[11px] font-black ${activeTab === 'archive' ? 'bg-indigo-500 text-white' : 'bg-slate-100 text-slate-500'}`}>
                {archivedConsults.length}
              </span>
            </button>
          </div>

          <div className="flex flex-col sm:flex-row gap-4 justify-between items-center">
            <div className="relative w-full sm:w-1/2">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
              <input
                type="text"
                placeholder="Tìm kiếm mã hồ sơ, họ tên, chẩn đoán..."
                value={searchQuery}
                onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
                className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:border-cyan-500 transition shadow-sm"
              />
            </div>
            <button
              type="button"
              onClick={() => setSortOldest(prev => !prev)}
              className="flex items-center gap-2 bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-700 px-4 py-2.5 rounded-xl text-xs font-bold transition shadow-sm shrink-0"
            >
              <ArrowUpDown className="w-4 h-4" /> Sắp xếp Ngày ({sortOldest ? 'Cũ -> Mới' : 'Mới -> Cũ'})
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-auto custom-scrollbar">
          <table className="w-full text-left border-collapse min-w-[1000px]">
            <thead className="bg-[#2a303c] text-white text-[10px] uppercase font-black tracking-wider sticky top-0 z-10">
              <tr>
                <th className="p-3 text-center border-b border-[#1f242d] w-12 text-slate-300">STT</th>
                <th className="p-3 text-center border-b border-[#1f242d] w-16 text-slate-300">HOÀN TÁC</th>
                <th className="p-3 border-b border-[#1f242d] w-48 text-slate-300">MÃ NB / HỌ TÊN</th>
                <th className="p-3 border-b border-[#1f242d] w-64 text-slate-300">CHẨN ĐOÁN (ICD)</th>
                <th className="p-3 border-b border-[#1f242d] w-48 text-slate-300">KẾT LUẬN</th>
                <th className="p-3 text-center border-b border-[#1f242d] w-32 text-slate-300">NGÀY DỰ KIẾN TT</th>
                <th className="p-3 text-center border-b border-[#1f242d] w-24 text-slate-300">TT DỤNG CỤ</th>
                <th className="p-3 text-center border-b border-[#1f242d] w-32 text-slate-300">TRẠNG THÁI GỌI</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-[11px] text-slate-700 bg-white">
              {paginatedData.map((c: any, index: number) => {
                const pat: any = findPatientByKey(patients, c.PatientKey) || {};
                return (
                  <tr key={c.ConsultKey} className="hover:bg-cyan-50/30 transition-colors">
                    <td className="p-3 text-center font-black text-slate-400">
                      {(currentPage - 1) * itemsPerPage + index + 1}
                    </td>
                    <td className="p-3 text-center">
                      <button
                        type="button"
                        onClick={() => activeTab === 'transferred' ? handleUndoTransferred(c) : handleUndoArchive(c)}
                        className="w-8 h-8 rounded-full border border-rose-200 text-rose-500 flex items-center justify-center hover:bg-rose-500 hover:text-white transition mx-auto"
                      >
                        <Undo2 className="w-4 h-4" />
                      </button>
                    </td>
                    <td className="p-3 font-semibold text-slate-800">
                      <span className="text-[#d2145a] font-black uppercase text-[12px] block">{pat.PatientName || 'N/A'}</span>
                      <span className="text-slate-500 font-mono text-[10px] mt-0.5">{pat.PatientID1 || '—'}</span>
                    </td>
                    <td className="p-3 font-medium text-slate-600">
                      <span className="font-bold text-slate-400 block text-[9px] mb-0.5">ICD: {c.DiagnosisID || '—'}</span>
                      <span className="leading-relaxed line-clamp-2" title={c.DetailDiagnosis}>{c.DetailDiagnosis || c.DiagnosisID || '—'}</span>
                    </td>
                    <td className="p-3 font-bold text-slate-700">{c.ConsultResultID || '—'}</td>
                    <td className="p-3 text-center font-black text-purple-700">
                      {c.PlannedCathLabDate ? formatVNTime(c.PlannedCathLabDate) : '—'}
                    </td>
                    <td className="p-3 text-center">
                      {c.CheckDevice === 'Đủ' ? (
                        <span className="px-2.5 py-1 bg-emerald-100/50 text-emerald-700 rounded text-[10px] font-black border border-emerald-200/50">Đủ</span>
                      ) : c.CheckDevice === 'Thiếu' ? (
                        <span className="px-2.5 py-1 bg-rose-100/50 text-rose-700 rounded text-[10px] font-black border border-rose-200/50">Thiếu</span>
                      ) : (
                        <span className="px-2.5 py-1 bg-slate-100 text-slate-500 rounded text-[10px] font-bold">Chưa kiểm</span>
                      )}
                    </td>
                    <td className="p-3 text-center">
                      <span
                        className={`px-3 py-1 rounded-lg text-[10px] font-bold border inline-block truncate text-center ${activeTab === 'archive' ? 'bg-rose-50 text-rose-600 border-rose-200 w-32' : 'bg-slate-100 text-slate-600 border-slate-200 w-24'}`}
                        title={c.CallStatus}
                      >
                        {activeTab === 'archive' ? (c.CallStatus || 'Loại') : (c.CallStatus || 'Đồng ý')}
                      </span>
                    </td>
                  </tr>
                );
              })}
              {paginatedData.length === 0 && (
                <tr>
                  <td colSpan={8} className="p-12 text-center text-slate-400 italic">Không có dữ liệu phù hợp.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="p-4 border-t border-slate-100 flex items-center justify-between bg-slate-50 shrink-0">
          <span className="text-xs font-bold text-slate-600">
            Tổng cộng: <span className="text-indigo-600 font-black">{filteredAndSorted.length}</span> ca
          </span>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage <= 1}
              className="w-8 h-8 rounded-lg bg-white border border-slate-200 flex items-center justify-center hover:bg-slate-100 disabled:opacity-50 transition"
            >
              <ChevronLeft className="w-4 h-4 text-slate-600" />
            </button>
            <span className="text-xs font-bold text-slate-800">
              Trang <span className="font-black text-indigo-600">{currentPage}</span> / {totalPages || 1}
            </span>
            <button
              type="button"
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage >= totalPages || totalPages === 0}
              className="w-8 h-8 rounded-lg bg-white border border-slate-200 flex items-center justify-center hover:bg-slate-100 disabled:opacity-50 transition"
            >
              <ChevronRight className="w-4 h-4 text-slate-600" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
