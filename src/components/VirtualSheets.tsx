import React, { useState, useEffect, useMemo } from 'react';
import { Patient, Consult, Staff, CathLab } from '../types';
import {
  Database, FileText, Users, Table, Check, ExternalLink,
  Copy, Unlink, RefreshCw, AlertTriangle, CheckCircle2, Loader2, Info, Code,
  ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, GitCompareArrows
} from 'lucide-react';
import {
  buildCathlabReconciliation,
  buildReconciliationPatchOperations,
  type ReconciliationItem
} from '../utils/cathlabReconciliation';

interface VirtualSheetsProps {
  patients: Patient[];
  consults: Consult[];
  staff: Staff[];
  cathlabs?: CathLab[];
  operations?: any[];
  cmrs?: any[];
  sources?: any[];
  deviceTemplates?: any[];
  onRefreshData?: () => void;
}

export default function VirtualSheets({ patients, consults, staff, cathlabs = [], operations = [], cmrs = [], sources = [], deviceTemplates = [], onRefreshData }: VirtualSheetsProps) {
  const [activeTab, setActiveTab] = useState<'Patient' | 'Consult' | 'Staff' | 'CathLab' | 'Operation' | 'CMR' | 'Source' | 'DeviceTemplate'>('Patient');

  // Pagination State
  const [currentPage, setCurrentPage] = useState<number>(1);
  const rowsPerPage = 50;

  useEffect(() => {
    // Reset page to 1 when changing tabs
    setCurrentPage(1);
  }, [activeTab]);

  // UI Action State
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [reconcileResults, setReconcileResults] = useState<ReconciliationItem[] | null>(null);
  const [reconcileLoading, setReconcileLoading] = useState(false);
  const [reconcileApplying, setReconcileApplying] = useState(false);

  const runCathlabReconciliationPreview = () => {
    setActionError(null);
    setActionSuccess(null);
    setReconcileLoading(true);
    window.setTimeout(() => {
      const results = buildCathlabReconciliation(patients, consults, cathlabs);
      setReconcileResults(results);
      setReconcileLoading(false);
      const confident = results.filter(item => item.status === 'confident').length;
      const review = results.filter(item => item.status === 'review').length;
      const unmatched = results.filter(item => item.status === 'unmatched').length;
      setActionSuccess(`Đã preview đối soát: ${confident} match chắc, ${review} cần kiểm tra, ${unmatched} không match.`);
    }, 0);
  };

  const applyConfidentReconciliation = async () => {
    if (!reconcileResults) return;
    const confident = reconcileResults.filter(item => item.status === 'confident');
    if (confident.length === 0) {
      setActionError('Không có match chắc để áp dụng.');
      return;
    }
    if (!window.confirm(`Áp dụng ${confident.length} match chắc? Hệ thống sẽ patch CathLab.ConsultKey và tự đóng workflow Consult liên quan.`)) {
      return;
    }

    setReconcileApplying(true);
    setActionError(null);
    setActionSuccess(null);
    try {
      const operations = buildReconciliationPatchOperations(confident);
      const response = await fetch('/api/batch-write', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ operations })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Không thể áp dụng đối soát.');
      setActionSuccess(`Đã áp dụng ${confident.length} match chắc (${operations.length} bản ghi patch).`);
      setReconcileResults(null);
      onRefreshData?.();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Không thể áp dụng đối soát.');
    } finally {
      setReconcileApplying(false);
    }
  };

  // Pagination Logic Helper
  const currentData = useMemo(() => {
    switch (activeTab) {
      case 'Patient': return patients;
      case 'Consult': return consults;
      case 'Staff': return staff;
      case 'CathLab': return cathlabs;
      case 'Operation': return operations;
      case 'CMR': return cmrs;
      case 'Source': return sources;
      case 'DeviceTemplate': return deviceTemplates;
      default: return [];
    }
  }, [activeTab, patients, consults, staff, cathlabs, operations, cmrs, sources, deviceTemplates]);

  const totalPages = Math.ceil(currentData.length / rowsPerPage) || 1;
  const reconcileStats = reconcileResults
    ? {
      confident: reconcileResults.filter(item => item.status === 'confident').length,
      review: reconcileResults.filter(item => item.status === 'review').length,
      unmatched: reconcileResults.filter(item => item.status === 'unmatched').length,
      alreadyLinked: reconcileResults.filter(item => item.status === 'already-linked').length
    }
    : null;

  const paginatedPatients = useMemo(() => {
    if (activeTab !== 'Patient') return [];
    const startIndex = (currentPage - 1) * rowsPerPage;
    return patients.slice(startIndex, startIndex + rowsPerPage);
  }, [activeTab, patients, currentPage]);

  const paginatedConsults = useMemo(() => {
    if (activeTab !== 'Consult') return [];
    const startIndex = (currentPage - 1) * rowsPerPage;
    return consults.slice(startIndex, startIndex + rowsPerPage);
  }, [activeTab, consults, currentPage]);

  const paginatedStaff = useMemo(() => {
    if (activeTab !== 'Staff') return [];
    const startIndex = (currentPage - 1) * rowsPerPage;
    return staff.slice(startIndex, startIndex + rowsPerPage);
  }, [activeTab, staff, currentPage]);

  const paginatedCathlabs = useMemo(() => {
    if (activeTab !== 'CathLab') return [];
    const startIndex = (currentPage - 1) * rowsPerPage;
    return cathlabs.slice(startIndex, startIndex + rowsPerPage);
  }, [activeTab, cathlabs, currentPage]);

  const paginatedOperations = useMemo(() => {
    if (activeTab !== 'Operation') return [];
    const startIndex = (currentPage - 1) * rowsPerPage;
    return operations.slice(startIndex, startIndex + rowsPerPage);
  }, [activeTab, operations, currentPage]);

  const paginatedCmrs = useMemo(() => {
    if (activeTab !== 'CMR') return [];
    const startIndex = (currentPage - 1) * rowsPerPage;
    return cmrs.slice(startIndex, startIndex + rowsPerPage);
  }, [activeTab, cmrs, currentPage]);

  return (
    <div className="space-y-4 flex flex-col h-full min-h-0 overflow-hidden">
      {/* Global Action Notifications */}
      {(actionError || actionSuccess) && (
        <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between animate-fade-in bg-white rounded-2xl shadow-sm">
          {actionError && (
            <div className="flex items-center gap-2 text-rose-800 text-xs font-semibold bg-rose-50 px-3 py-2 rounded-xl w-full border border-rose-200">
              <AlertTriangle className="w-4 h-4 text-rose-500 shrink-0" />
              <span>{actionError}</span>
            </div>
          )}
          {actionSuccess && (
            <div className="flex items-center gap-2 text-emerald-900 text-xs font-semibold bg-emerald-50 px-3 py-2 rounded-xl w-full border border-emerald-200">
              <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
              <span>{actionSuccess}</span>
            </div>
          )}
        </div>
      )}

      {/* CathLab Reconciliation Panel */}
      <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm px-5 py-4 space-y-3">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="p-2 bg-amber-50 text-amber-700 rounded-xl border border-amber-100">
              <GitCompareArrows className="w-4 h-4" />
            </div>
            <div>
              <h4 className="text-xs font-extrabold uppercase tracking-wider text-slate-800">Đối soát CathLab lịch sử</h4>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Preview các dòng CathLab thiếu/sai ConsultKey, chỉ áp dụng nhóm match chắc sau khi xác nhận.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={runCathlabReconciliationPreview}
              disabled={reconcileLoading || reconcileApplying}
              className="px-3 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"
            >
              {reconcileLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <GitCompareArrows className="w-3.5 h-3.5" />}
              Preview đối soát
            </button>
            <button
              type="button"
              onClick={applyConfidentReconciliation}
              disabled={!reconcileStats?.confident || reconcileApplying}
              className="px-3 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 disabled:opacity-40 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"
            >
              {reconcileApplying ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
              Áp dụng match chắc{reconcileStats ? ` (${reconcileStats.confident})` : ''}
            </button>
          </div>
        </div>

        {reconcileStats && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 text-[11px]">
            <div className="bg-emerald-50 border border-emerald-100 rounded-xl px-3 py-2">
              <p className="text-emerald-700 font-extrabold">Match chắc</p>
              <p className="text-lg font-black text-emerald-950">{reconcileStats.confident}</p>
            </div>
            <div className="bg-amber-50 border border-amber-100 rounded-xl px-3 py-2">
              <p className="text-amber-700 font-extrabold">Cần kiểm tra</p>
              <p className="text-lg font-black text-amber-950">{reconcileStats.review}</p>
            </div>
            <div className="bg-rose-50 border border-rose-100 rounded-xl px-3 py-2">
              <p className="text-rose-700 font-extrabold">Không match</p>
              <p className="text-lg font-black text-rose-950">{reconcileStats.unmatched}</p>
            </div>
            <div className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2">
              <p className="text-slate-600 font-extrabold">Đã gắn đúng</p>
              <p className="text-lg font-black text-slate-900">{reconcileStats.alreadyLinked}</p>
            </div>
          </div>
        )}

        {reconcileResults && (
          <div className="max-h-56 overflow-y-auto border border-slate-200 rounded-xl bg-slate-50 custom-scrollbar">
            <table className="w-full text-left text-[11px]">
              <thead className="sticky top-0 bg-slate-100 text-slate-600 uppercase tracking-wider">
                <tr>
                  <th className="px-3 py-2">Nhóm</th>
                  <th className="px-3 py-2">CathKey</th>
                  <th className="px-3 py-2">Bệnh nhi</th>
                  <th className="px-3 py-2">CathDate</th>
                  <th className="px-3 py-2">Match Consult</th>
                  <th className="px-3 py-2">Điểm</th>
                  <th className="px-3 py-2">Lý do</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 bg-white">
                {reconcileResults
                  .filter(item => item.status !== 'already-linked')
                  .slice(0, 100)
                  .map(item => (
                    <tr key={item.cath.id}>
                      <td className="px-3 py-2 font-bold">
                        {item.status === 'confident' ? 'Match chắc' : item.status === 'review' ? 'Cần kiểm tra' : 'Không match'}
                      </td>
                      <td className="px-3 py-2 font-mono">{item.cath.id}</td>
                      <td className="px-3 py-2">{item.patient?.PatientName || item.cath.PatientKey}</td>
                      <td className="px-3 py-2 font-mono">{item.cath.CathDate}</td>
                      <td className="px-3 py-2 font-mono">{item.matchedConsult?.id || '—'}</td>
                      <td className="px-3 py-2 font-mono">{item.score}</td>
                      <td className="px-3 py-2 text-slate-600">{item.reason}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Spreadsheet Tables Viewer Panel */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm flex-1 flex flex-col min-h-0">
        {/* Title bar mimic Google Sheets database */}
        <div className="bg-slate-50 border-b border-gray-200 px-4 py-2.5 flex items-center justify-between">
          <div className="flex items-center gap-2 text-slate-700">
            <Table className="w-4 h-4 text-emerald-600" />
            <span className="font-bold text-xs uppercase tracking-wider">Trình xem nhanh Cơ sở dữ liệu Supabase</span>
          </div>
          <span className="text-[10px] font-mono text-slate-400 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
            Total records: {patients.length + consults.length + staff.length + cathlabs.length + operations.length + cmrs.length + sources.length + deviceTemplates.length} entries
          </span>
        </div>

        {/* Sheets Sheet-Tabs Menu */}
        <div className="bg-gray-100 border-b border-gray-200 flex items-center overflow-x-auto text-sm">
          <button
            onClick={() => setActiveTab('Patient')}
            className={`flex items-center gap-1.5 px-4 py-2 text-xs font-semibold uppercase tracking-wider border-r border-gray-200 transition-colors ${activeTab === 'Patient'
              ? 'bg-white text-emerald-700 border-t-2 border-t-emerald-600'
              : 'text-gray-600 hover:bg-gray-50'
              }`}
          >
            <Table className="w-3.5 h-3.5" />
            Bảng 1: Patient ({patients.length})
          </button>
          <button
            onClick={() => setActiveTab('Consult')}
            className={`flex items-center gap-1.5 px-4 py-2 text-xs font-semibold uppercase tracking-wider border-r border-gray-200 transition-colors ${activeTab === 'Consult'
              ? 'bg-white text-emerald-700 border-t-2 border-t-emerald-600'
              : 'text-gray-600 hover:bg-gray-50'
              }`}
          >
            <FileText className="w-3.5 h-3.5" />
            Bảng 2: Consult ({consults.length})
          </button>
          <button
            onClick={() => setActiveTab('Staff')}
            className={`flex items-center gap-1.5 px-4 py-2 text-xs font-semibold uppercase tracking-wider border-r border-gray-300 transition-colors ${activeTab === 'Staff'
              ? 'bg-white text-emerald-700 border-t-2 border-t-emerald-600'
              : 'text-gray-600 hover:bg-gray-50'
              }`}
          >
            <Users className="w-3.5 h-3.5" />
            Bảng 3: Staff ({staff.length})
          </button>
          <button
            onClick={() => setActiveTab('CathLab')}
            className={`flex items-center gap-1.5 px-4 py-2 text-xs font-semibold uppercase tracking-wider border-r border-gray-300 transition-colors ${activeTab === 'CathLab'
              ? 'bg-white text-emerald-700 border-t-2 border-t-emerald-600'
              : 'text-gray-600 hover:bg-gray-50'
              }`}
          >
            <Table className="w-3.5 h-3.5" />
            Bảng 4: CathLab ({cathlabs.length})
          </button>
          <button
            onClick={() => setActiveTab('Operation')}
            className={`flex items-center gap-1.5 px-4 py-2 text-xs font-semibold uppercase tracking-wider border-r border-gray-300 transition-colors ${activeTab === 'Operation'
              ? 'bg-white text-emerald-700 border-t-2 border-t-emerald-600'
              : 'text-gray-600 hover:bg-gray-50'
              }`}
          >
            <Table className="w-3.5 h-3.5" />
            Bảng 5: Operation ({operations.length})
          </button>
          <button
            onClick={() => setActiveTab('CMR')}
            className={`flex items-center gap-1.5 px-4 py-2 text-xs font-semibold uppercase tracking-wider border-r border-gray-300 transition-colors ${activeTab === 'CMR'
              ? 'bg-white text-emerald-700 border-t-2 border-t-emerald-600'
              : 'text-gray-600 hover:bg-gray-50'
              }`}
          >
            <Table className="w-3.5 h-3.5" />
            Bảng 6: CMR ({cmrs.length})
          </button>
          <button
            onClick={() => setActiveTab('Source')}
            className={`flex items-center gap-1.5 px-4 py-2 text-xs font-semibold uppercase tracking-wider border-r border-gray-300 transition-colors ${activeTab === 'Source'
              ? 'bg-white text-emerald-700 border-t-2 border-t-emerald-600'
              : 'text-gray-600 hover:bg-gray-50'
              }`}
          >
            <Table className="w-3.5 h-3.5" />
            Bảng 7: Source ({sources.length})
          </button>
          <button
            onClick={() => setActiveTab('DeviceTemplate')}
            className={`flex items-center gap-1.5 px-4 py-2 text-xs font-semibold uppercase tracking-wider border-r border-gray-300 transition-colors ${activeTab === 'DeviceTemplate'
              ? 'bg-white text-emerald-700 border-t-2 border-t-emerald-600'
              : 'text-gray-600 hover:bg-gray-50'
              }`}
          >
            <Table className="w-3.5 h-3.5" />
            Bảng 8: DeviceTemplate ({deviceTemplates.length})
          </button>
        </div>

        {/* Table Grid details */}
        <div className="flex-1 overflow-x-auto overflow-y-auto min-h-0">
          {currentData.length > 0 ? (
            <div className="min-w-max">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200 text-gray-700 font-mono text-[11px] uppercase tracking-wider">
                    {Object.keys(currentData[0]).map((key) => (
                      <th key={key} className="py-2.5 px-3 border-r border-gray-200 whitespace-nowrap">
                        {key}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 font-mono text-[11px]">
                  {currentData.slice((currentPage - 1) * rowsPerPage, currentPage * rowsPerPage).map((row: any, idx) => (
                    <tr key={idx} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}>
                      {Object.keys(currentData[0]).map((key) => {
                        const val = row[key];
                        return (
                          <td key={key} className="py-2 px-3 border-r border-gray-200 whitespace-nowrap">
                            {typeof val === 'object' ? JSON.stringify(val) : String(val || '')}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="p-8 text-center text-gray-500 font-medium">
              Chưa có dữ liệu cho bảng này.
            </div>
          )}
        </div>

        <div className="bg-white px-4 py-3 flex items-center justify-between border-t border-gray-200">
          <div className="text-xs text-slate-500 font-medium">
            Trang <span className="font-bold text-emerald-800">{currentPage}</span> / <span className="font-bold">{totalPages}</span> (Hiển thị {rowsPerPage} dòng mỗi trang)
          </div>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setCurrentPage(1)}
              disabled={currentPage === 1}
              className="p-1 rounded-lg text-slate-500 hover:bg-slate-100 disabled:opacity-30 disabled:hover:bg-transparent transition"
            >
              <ChevronsLeft className="w-4 h-4" />
            </button>
            <button
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="p-1 rounded-lg text-slate-500 hover:bg-slate-100 disabled:opacity-30 disabled:hover:bg-transparent transition"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <div className="px-2 text-xs font-bold text-slate-700 select-none">
              {currentPage}
            </div>
            <button
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="p-1 rounded-lg text-slate-500 hover:bg-slate-100 disabled:opacity-30 disabled:hover:bg-transparent transition"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
            <button
              onClick={() => setCurrentPage(totalPages)}
              disabled={currentPage === totalPages}
              className="p-1 rounded-lg text-slate-500 hover:bg-slate-100 disabled:opacity-30 disabled:hover:bg-transparent transition"
            >
              <ChevronsRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="bg-gray-50 px-4 py-2.5 text-[11px] text-gray-500 flex items-center justify-between border-t border-gray-200 font-medium font-sans">
          <span>Dữ liệu được lưu trữ an toàn trên Supabase</span>
          <span className="text-emerald-700 font-medium flex items-center gap-0.5">
            connected_cloud_synced <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
          </span>
        </div>
      </div>
    </div >
  );
}
