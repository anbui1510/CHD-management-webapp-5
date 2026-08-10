import React, { useMemo, useRef, useState } from 'react';
import { Upload, FileSpreadsheet, AlertCircle, CheckCircle2, RefreshCw, Filter } from 'lucide-react';
import { Patient, Consult, CathLab, Staff, formatVNTime } from '../types';
import { useSheetsSyncFeedback } from '../context/SheetsSyncFeedbackContext';
import { buildSyncContext, persistWithSheetsSync } from '../utils/sheetsSyncMutation';
import {
  buildHisImportPlan,
  buildHisWorkflowNotificationAndMarkOperations,
  HIS_IMPORT_ROW_STATUS_LABELS,
  type HisImportRowResult,
  type HisImportRowStatus,
} from '../utils/hisCathImportRunner';
import { HIS_IMPORT_BATCH_SIZE, chunkArray, type BatchWriteOperation } from '../utils/hisCathImportHelpers';
import { HIS_STAGE_LABELS } from '../utils/workflowMessages';
import { MODAL_TITLE } from '../utils/modalTitles';

interface HisCathImportPanelProps {
  patients: Patient[];
  consults: Consult[];
  cathlabs: CathLab[];
  staffList: Staff[];
  loggedInStaffId: string;
  onRefreshData: (force?: boolean) => void;
  onPatchConsult?: (consultKey: string, patch: Partial<Consult>) => void;
  onPatchCathlab?: (cathKey: string, patch: Partial<CathLab>) => void;
  onAddCathlab?: (cath: CathLab) => void;
  onAddPatient?: (patient: Patient) => void;
  triggerAlert?: (message: string, title?: string) => void;
}

interface ImportSessionSummary {
  fileName: string;
  importedAt: string;
  createdCount: number;
  mergedCount: number;
  skippedExisting: number;
  skippedInvalid: number;
  newPatients: number;
  workflowClosed: number;
  workflowWarning?: string;
}

const STATUS_BADGE: Record<HisImportRowStatus, string> = {
  created: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  merged: 'bg-sky-50 text-sky-700 border-sky-200',
  skipped_existing: 'bg-slate-100 text-slate-600 border-slate-200',
  skipped_invalid: 'bg-amber-50 text-amber-800 border-amber-200',
};

const STATUS_FILTER_OPTIONS: Array<{ value: 'all' | HisImportRowStatus; label: string }> = [
  { value: 'all', label: 'Tất cả' },
  { value: 'created', label: HIS_IMPORT_ROW_STATUS_LABELS.created },
  { value: 'merged', label: HIS_IMPORT_ROW_STATUS_LABELS.merged },
  { value: 'skipped_existing', label: HIS_IMPORT_ROW_STATUS_LABELS.skipped_existing },
  { value: 'skipped_invalid', label: HIS_IMPORT_ROW_STATUS_LABELS.skipped_invalid },
];

export default function HisCathImportPanel({
  patients,
  consults,
  cathlabs,
  staffList,
  loggedInStaffId,
  onRefreshData,
  onPatchConsult,
  onPatchCathlab,
  onAddCathlab,
  onAddPatient,
  triggerAlert,
}: HisCathImportPanelProps) {
  const { reportMutationResponse } = useSheetsSyncFeedback();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const [statusText, setStatusText] = useState('');
  const [rows, setRows] = useState<HisImportRowResult[]>([]);
  const [sessionSummary, setSessionSummary] = useState<ImportSessionSummary | null>(null);
  const [statusFilter, setStatusFilter] = useState<'all' | HisImportRowStatus>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const postBatchWrite = async (operations: BatchWriteOperation[]) => {
    if (operations.length === 0) return;
    await persistWithSheetsSync(
      reportMutationResponse,
      '/api/batch-write',
      { method: 'POST', body: JSON.stringify({ operations }) },
      buildSyncContext('cathlab-report', { viewLabel: 'Báo cáo thông tim - Import HIS' }),
      { baseMessage: 'Đã ghi dữ liệu HIS theo lô' }
    );
  };

  const filteredRows = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return rows.filter(row => {
      if (statusFilter !== 'all' && row.status !== statusFilter) return false;
      if (!q) return true;
      const haystack = [
        row.patientId,
        row.patientName,
        row.cathMethod,
        row.diagnosisID,
        row.postDiagnosis,
        row.detail,
        row.ptvMain,
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [rows, statusFilter, searchQuery]);

  const handleImportFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setImporting(true);
    setStatusText('Đang đọc file HIS...');
    setRows([]);
    setSessionSummary(null);

    try {
      const plan = await buildHisImportPlan({
        file,
        patients,
        consults,
        cathlabs,
        loggedInStaffId,
      });

      setRows(plan.rows);

      if (!plan.hasWork) {
        setSessionSummary({
          fileName: file.name,
          importedAt: new Date().toISOString(),
          createdCount: 0,
          mergedCount: 0,
          skippedExisting: plan.skippedExisting,
          skippedInvalid: plan.skippedInvalid,
          newPatients: 0,
          workflowClosed: 0,
        });
        setStatusText(`Không có ca mới. Bỏ qua ${plan.skippedExisting} ca đã có, ${plan.skippedInvalid} dòng thiếu dữ liệu.`);
        return;
      }

      let savedCathCount = 0;
      let updatedCathCount = 0;
      const totalCathCount = plan.cathlabsToCreate.length + plan.cathlabsToUpdate.length;
      setStatusText(`Đang ghi HIS theo lô 0/${totalCathCount} ca...`);

      for (const patientChunk of chunkArray(plan.patientsToCreate, HIS_IMPORT_BATCH_SIZE)) {
        setStatusText(`Đang tạo ${patientChunk.length} BN mới từ HIS...`);
        await postBatchWrite(
          patientChunk.map(patient => ({
            endpoint: 'patients',
            method: 'POST',
            data: patient as unknown as Record<string, unknown>,
          }))
        );
        patientChunk.forEach(patient => onAddPatient?.(patient));
      }

      for (const cathChunk of chunkArray(plan.cathlabsToUpdate, HIS_IMPORT_BATCH_SIZE)) {
        setStatusText(`Đang cập nhật CathLab HIS (gộp)... ${updatedCathCount}/${plan.cathlabsToUpdate.length} ca.`);
        await postBatchWrite(
          cathChunk.map(cath => ({
            endpoint: 'cathlabs',
            method: 'PUT',
            key: cath.CathKey,
            data: cath as unknown as Record<string, unknown>,
          }))
        );
        updatedCathCount += cathChunk.length;
        cathChunk.forEach(cath => onPatchCathlab?.(cath.CathKey, cath));
      }

      for (const cathChunk of chunkArray(plan.cathlabsToCreate, HIS_IMPORT_BATCH_SIZE)) {
        setStatusText(`Đang ghi CathLab HIS... ${savedCathCount}/${totalCathCount} ca.`);
        await postBatchWrite(
          cathChunk.map(cath => ({
            endpoint: 'cathlabs',
            method: 'POST',
            data: cath as unknown as Record<string, unknown>,
          }))
        );
        savedCathCount += cathChunk.length;
        cathChunk.forEach(cath => onAddCathlab?.(cath));
      }

      const workflowNotificationOps: BatchWriteOperation[] = [];
      let autoClosedCount = 0;
      for (const consultChunk of chunkArray(plan.consultsToAutoClose, HIS_IMPORT_BATCH_SIZE)) {
        setStatusText(`Đang tự đóng workflow treo ${autoClosedCount}/${plan.consultsToAutoClose.length}...`);
        await postBatchWrite(
          consultChunk.map(item => ({
            endpoint: 'consults',
            method: 'PUT',
            key: item.consult.ConsultKey,
            data: item.patch as Record<string, unknown>,
          }))
        );
        consultChunk.forEach(item => {
          onPatchConsult?.(item.consult.ConsultKey, item.patch);
          workflowNotificationOps.push(
            ...buildHisWorkflowNotificationAndMarkOperations(
              item.consult,
              item.patient,
              item.cath,
              item.stage,
              staffList,
              loggedInStaffId
            )
          );
        });
        autoClosedCount += consultChunk.length;
      }

      let workflowWarning: string | undefined;
      if (workflowNotificationOps.length > 0) {
        try {
          setStatusText('Đang ghi thông báo workflow...');
          for (const notifyChunk of chunkArray(workflowNotificationOps, HIS_IMPORT_BATCH_SIZE)) {
            await postBatchWrite(notifyChunk);
          }
        } catch (notifyError) {
          console.error('Không thể ghi Notification/DoctorPerformanceMark sau import HIS:', notifyError);
          workflowWarning =
            'CathLab đã import xong nhưng một phần thông báo cảnh báo workflow chưa ghi được.';
        }
      }

      setSessionSummary({
        fileName: file.name,
        importedAt: new Date().toISOString(),
        createdCount: savedCathCount,
        mergedCount: updatedCathCount,
        skippedExisting: plan.skippedExisting,
        skippedInvalid: plan.skippedInvalid,
        newPatients: plan.patientsToCreate.length,
        workflowClosed: autoClosedCount,
        workflowWarning,
      });
      setStatusText(
        `Hoàn tất: ${savedCathCount} ca mới, ${updatedCathCount} ca gộp, ${autoClosedCount} workflow tự đóng, ${plan.patientsToCreate.length} BN mới.`
      );
      onRefreshData(true);
    } catch (error) {
      console.error(error);
      const message = error instanceof Error ? error.message : 'Không thể import file HIS';
      setStatusText(message);
      triggerAlert?.(message, MODAL_TITLE.saveError);
      onRefreshData(true);
    } finally {
      setImporting(false);
      event.target.value = '';
    }
  };

  return (
    <div className="flex-1 flex flex-col gap-4 min-h-0">
      <div className="bg-white border border-slate-200 rounded-3xl p-5 shadow-sm shrink-0 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="w-11 h-11 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center shrink-0">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-black text-slate-900 uppercase tracking-wide">Import danh sách thủ thuật HIS</h3>
              <p className="text-xs text-slate-500 font-medium mt-1 max-w-2xl">
                Tải file Excel xuất từ HIS (cột Mã NB, Tên dịch vụ, Thời gian bắt đầu PTTT...). Kết quả từng dòng hiển thị ở bảng bên dưới.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={importing}
              className="font-extrabold text-[11px] px-4 py-2.5 rounded-xl transition flex items-center gap-2 bg-rose-600 text-white shadow-sm hover:bg-rose-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Upload className="w-4 h-4 shrink-0" />
              {importing ? 'Đang import...' : 'Chọn file & Import'}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              onChange={handleImportFile}
            />
          </div>
        </div>

        {statusText && (
          <div className="text-[11px] font-bold text-rose-700 bg-rose-50 border border-rose-100 rounded-2xl px-3 py-2 flex items-center gap-2">
            {importing ? <RefreshCw className="w-3.5 h-3.5 animate-spin shrink-0" /> : <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />}
            {statusText}
          </div>
        )}

        {sessionSummary && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 text-center">
            {[
              { label: 'Tạo mới', value: sessionSummary.createdCount, tone: 'text-emerald-600' },
              { label: 'Gộp ca', value: sessionSummary.mergedCount, tone: 'text-sky-600' },
              { label: 'BN mới', value: sessionSummary.newPatients, tone: 'text-violet-600' },
              { label: 'WF tự đóng', value: sessionSummary.workflowClosed, tone: 'text-indigo-600' },
              { label: 'Bỏ qua', value: sessionSummary.skippedExisting, tone: 'text-slate-500' },
              { label: 'Thiếu DL', value: sessionSummary.skippedInvalid, tone: 'text-amber-600' },
            ].map(item => (
              <div key={item.label} className="bg-slate-50 border border-slate-100 rounded-2xl px-2 py-2">
                <div className={`text-lg font-black font-mono ${item.tone}`}>{item.value}</div>
                <div className="text-[9px] uppercase font-bold text-slate-400">{item.label}</div>
              </div>
            ))}
          </div>
        )}

        {sessionSummary?.workflowWarning && (
          <div className="text-[11px] font-bold text-amber-800 bg-amber-50 border border-amber-100 rounded-2xl px-3 py-2 flex items-start gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            {sessionSummary.workflowWarning}
          </div>
        )}
      </div>

      <div className="flex-1 min-h-0 bg-white border border-slate-200 rounded-3xl shadow-sm flex flex-col overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-[#d2145a]" />
            <span className="text-xs font-extrabold uppercase text-slate-700">Kết quả import</span>
            <span className="text-[10px] font-bold text-slate-400">({filteredRows.length}/{rows.length} dòng)</span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value as 'all' | HisImportRowStatus)}
              className="bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1.5 text-[11px] font-bold"
            >
              {STATUS_FILTER_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Tìm mã BN, tên, PTV..."
              className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-[11px] font-semibold min-w-[180px]"
            />
          </div>
        </div>

        <div className="flex-1 overflow-auto custom-scrollbar">
          <table className="w-full text-left text-xs border-collapse min-w-[1100px]">
            <thead className="sticky top-0 z-10">
              <tr className="bg-slate-50 text-slate-600 border-b border-slate-200 text-[10px] uppercase font-black tracking-wider">
                <th className="py-3 px-3 w-12 text-center">#</th>
                <th className="py-3 px-3 w-24">Mã BN</th>
                <th className="py-3 px-3 min-w-[160px]">Họ tên</th>
                <th className="py-3 px-3 w-28 text-center">Ngày TT</th>
                <th className="py-3 px-3 min-w-[180px]">Phương pháp</th>
                <th className="py-3 px-3 w-20 text-center">ICD</th>
                <th className="py-3 px-3 w-28">PTV chính</th>
                <th className="py-3 px-3 w-32 text-center">Tình trạng</th>
                <th className="py-3 px-3 min-w-[220px]">Chi tiết</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-semibold text-slate-700">
              {filteredRows.length === 0 && (
                <tr>
                  <td colSpan={9} className="p-10 text-center text-slate-400 italic font-semibold">
                    {rows.length === 0
                      ? 'Chưa có lần import nào trong phiên này. Bấm "Chọn file & Import" để bắt đầu.'
                      : 'Không có dòng nào khớp bộ lọc.'}
                  </td>
                </tr>
              )}
              {filteredRows.map((row, idx) => (
                <tr key={`${row.rowIndex}-${idx}`} className="hover:bg-slate-50/80">
                  <td className="py-3 px-3 text-center text-slate-400 font-mono text-[10px]">{row.rowIndex}</td>
                  <td className="py-3 px-3 font-mono text-[11px]">{row.patientId || '—'}</td>
                  <td className="py-3 px-3 font-extrabold uppercase text-slate-800">
                    {row.patientName || '—'}
                    {row.newPatient && (
                      <span className="ml-1 text-[9px] font-bold text-violet-600 normal-case">(BN mới)</span>
                    )}
                  </td>
                  <td className="py-3 px-3 text-center font-medium">
                    {row.cathDate ? formatVNTime(row.cathDate) : '—'}
                  </td>
                  <td className="py-3 px-3 text-slate-600">{row.cathMethod || '—'}</td>
                  <td className="py-3 px-3 text-center font-extrabold text-[#d2145a]">
                    {row.diagnosisID || '—'}
                  </td>
                  <td className="py-3 px-3 text-indigo-700">{row.ptvMain || '—'}</td>
                  <td className="py-3 px-3 text-center">
                    <span className={`inline-block px-2 py-0.5 rounded-full text-[9px] font-extrabold uppercase border ${STATUS_BADGE[row.status]}`}>
                      {HIS_IMPORT_ROW_STATUS_LABELS[row.status]}
                    </span>
                  </td>
                  <td className="py-3 px-3 text-[11px] text-slate-500 leading-relaxed">
                    <div>{row.detail}</div>
                    {row.workflowClosed && row.workflowStage && (
                      <div className="text-[10px] text-indigo-600 font-bold mt-0.5">
                        WF: {HIS_STAGE_LABELS[row.workflowStage as keyof typeof HIS_STAGE_LABELS] || row.workflowStage}
                      </div>
                    )}
                    {row.cathKey && (
                      <div className="text-[10px] text-slate-400 font-mono mt-0.5">{row.cathKey}</div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {sessionSummary && (
          <div className="border-t border-slate-100 px-4 py-2 text-[10px] text-slate-400 font-semibold shrink-0">
            File: {sessionSummary.fileName} · {new Date(sessionSummary.importedAt).toLocaleString('vi-VN')}
          </div>
        )}
      </div>
    </div>
  );
}
