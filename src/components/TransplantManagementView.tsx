import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Download,
  ExternalLink,
  Eye,
  Filter,
  Plus,
  Save,
  Search,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import {
  Patient,
  Source,
  Staff,
  Transplant,
  formatVNTime,
  removeDiacritics,
} from '../types';
import { SearchableEnumSelect } from './SearchableEnumSelect';
import { VNDateInput } from './VNDateInput';
import { PatientAdminEditButton } from './PatientAdminEditButton';
import { getSourceDiagnosisOptions, normalizeDiagnosisID } from '../data/source';
import {
  BLOOD_TYPE_OPTIONS,
  TRANSPLANT_FILTER_FIELDS,
  TRANSPLANT_STATUS_OPTIONS,
  TRANSPLANT_YES_NO_OPTIONS,
  TRANS_STATUS_NOT_READY,
  TRANS_STATUS_READY,
  type TransplantFilterField,
} from '../data/transplantDefaults';
import TransplantRegisterModal from './TransplantRegisterModal';
import { SortColumnIcon } from './SortColumnIcon';
import {
  COLUMN_LABELS,
  DEFAULT_VISIBLE_COLUMNS,
  applySidebarFilters,
  enrichTransplants,
  getUniqueFilterValues,
  isNotReadyStatus,
  isReadyStatus,
  matchesTransplantSearch,
  openTransplantFile,
  readFileAsDataUrl,
  sortTransplants,
  type EnrichedTransplant,
  type TransplantColumnKey,
  type TransplantSortField,
} from './transplant/transplantUtils';
import { exportTransplantExcel } from './transplant/transplantExcelExport';
import { useSheetsSyncFeedback } from '../context/SheetsSyncFeedbackContext';
import { buildSyncContext, persistWithSheetsSync } from '../utils/sheetsSyncMutation';
import { MODAL_TITLE } from '../utils/modalTitles';

interface TransplantManagementViewProps {
  patients: Patient[];
  transplants: Transplant[];
  sources?: Source[];
  staffList?: Staff[];
  currentStaff?: Staff | null;
  onRefreshData: () => void;
  onAddTransplant: (record: Transplant) => Promise<void> | void;
  onPatchTransplant: (key: string, patch: Partial<Transplant>) => Promise<void> | void;
  onDeleteTransplant: (key: string) => Promise<void> | void;
  onAddPatient?: (patient: Patient) => Promise<Patient | void> | Patient | void;
  onEditPatientAdmin?: (patient: Patient) => void;
  triggerAlert?: (msg: string, title?: string) => void;
}

type StatusTab = 'notReady' | 'ready';

export default function TransplantManagementView({
  patients,
  transplants,
  sources = [],
  currentStaff,
  onRefreshData,
  onAddTransplant,
  onPatchTransplant,
  onDeleteTransplant,
  onAddPatient,
  onEditPatientAdmin,
  triggerAlert,
}: TransplantManagementViewProps) {
  const { reportMutationResponse } = useSheetsSyncFeedback();
  const [activeTab, setActiveTab] = useState<StatusTab>('notReady');
  const [searchQuery, setSearchQuery] = useState('');
  const [showRegister, setShowRegister] = useState(false);
  const [selectedKey, setSelectedKey] = useState('');
  const [detailForm, setDetailForm] = useState<Partial<Transplant>>({});
  const [saving, setSaving] = useState(false);
  const [sortField, setSortField] = useState<TransplantSortField>('name');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [visibleColumns, setVisibleColumns] = useState(DEFAULT_VISIBLE_COLUMNS);
  const [showColumnDropdown, setShowColumnDropdown] = useState(false);
  const columnDropdownRef = useRef<HTMLDivElement>(null);
  const [isFilterExpanded, setIsFilterExpanded] = useState(false);
  const [activeFilterFields, setActiveFilterFields] = useState<TransplantFilterField[]>([]);
  const [filterValues, setFilterValues] = useState<Record<string, string[]>>({});
  const [showFilterPicker, setShowFilterPicker] = useState(false);
  const [exportMsg, setExportMsg] = useState('');
  const [deleteConfirmKey, setDeleteConfirmKey] = useState('');

  const enriched = useMemo(() => enrichTransplants(transplants, patients), [transplants, patients]);

  const tabItems = useMemo(() => {
    const base = enriched.filter(item => matchesTransplantSearch(item, searchQuery));
    return {
      notReady: base.filter(item => isNotReadyStatus(item.TransStatus)),
      ready: base.filter(item => isReadyStatus(item.TransStatus)),
    };
  }, [enriched, searchQuery]);

  const sidebarFiltered = useMemo(() => {
    const tabList = tabItems[activeTab];
    return applySidebarFilters(tabList, activeFilterFields, filterValues);
  }, [tabItems, activeTab, activeFilterFields, filterValues]);

  const displayList = useMemo(
    () => sortTransplants(sidebarFiltered, sortField, sortOrder),
    [sidebarFiltered, sortField, sortOrder]
  );

  const selectedItem = useMemo(
    () => displayList.find(item => item.TransKey === selectedKey) || enriched.find(item => item.TransKey === selectedKey),
    [displayList, enriched, selectedKey]
  );

  useEffect(() => {
    if (selectedItem) setDetailForm({ ...selectedItem });
  }, [selectedItem?.TransKey]);

  useEffect(() => {
    void onRefreshData();
  }, [onRefreshData]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (columnDropdownRef.current && !columnDropdownRef.current.contains(e.target as Node)) {
        setShowColumnDropdown(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const toggleSort = (field: TransplantSortField) => {
    if (sortField === field) setSortOrder(prev => (prev === 'asc' ? 'desc' : 'asc'));
    else {
      setSortField(field);
      setSortOrder('asc');
    }
  };

  const handleSaveDetail = async () => {
    if (!selectedItem?.TransKey) return;
    setSaving(true);
    try {
      const payload = {
        ...detailForm,
        TransDiagID: normalizeDiagnosisID(detailForm.TransDiagID),
        TransUpdateTime: new Date().toISOString(),
        TransUpdateBy: currentStaff?.StaffKey || detailForm.TransUpdateBy,
      };
      const syncContext = buildSyncContext('heart-transplant', {
        patientName: selectedItem.__patient?.PatientName,
        patientKey: selectedItem.PatientKey
      });
      const saved = await persistWithSheetsSync<Transplant>(
        reportMutationResponse,
        `/api/transplants/${encodeURIComponent(selectedItem.TransKey)}`,
        { method: 'PUT', body: JSON.stringify(payload) },
        syncContext,
        { baseMessage: 'Đã lưu hồ sơ ghép tim' }
      );
      await onPatchTransplant(selectedItem.TransKey, saved);
      onRefreshData();
    } catch {
      triggerAlert?.('Lưu thất bại.', MODAL_TITLE.saveError);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (key: string) => {
    try {
      const item = enriched.find(r => r.TransKey === key);
      await persistWithSheetsSync(
        reportMutationResponse,
        `/api/transplants/${encodeURIComponent(key)}`,
        {
          method: 'DELETE',
          body: JSON.stringify({})
        },
        buildSyncContext('heart-transplant', {
          patientName: item?.__patient?.PatientName,
          patientKey: item?.PatientKey
        }),
        { baseMessage: 'Đã xóa hồ sơ ghép tim' }
      );
      await onDeleteTransplant(key);
      if (selectedKey === key) setSelectedKey('');
      setDeleteConfirmKey('');
      onRefreshData();
    } catch {
      triggerAlert?.('Xóa thất bại.', MODAL_TITLE.saveError);
    }
  };

  const handleExport = async () => {
    try {
      setExportMsg('');
      await exportTransplantExcel(displayList, currentStaff?.StaffName || 'Admin');
    } catch (e: unknown) {
      setExportMsg(e instanceof Error ? e.message : 'Xuất Excel thất bại');
    }
  };

  const handleFileUpload = async (
    field: 'GensFile' | 'MRIFile' | 'TTEFile' | 'HolterFile',
    file?: File | null
  ) => {
    if (!file) return;
    try {
      const dataUrl = await readFileAsDataUrl(file);
      setDetailForm(prev => ({ ...prev, [field]: dataUrl }));
    } catch {
      triggerAlert?.('Không đọc được file.', MODAL_TITLE.saveError);
    }
  };

  const diagnosisOptions = useMemo(() => getSourceDiagnosisOptions(sources), [sources]);

  const renderHeaderCell = (col: TransplantColumnKey, sortableField?: TransplantSortField) => (
    <th
      key={col}
      onClick={sortableField ? () => toggleSort(sortableField) : undefined}
      className={`py-2 px-2 border-b border-slate-200 bg-slate-50 text-[9px] uppercase font-extrabold ${sortableField ? 'cursor-pointer hover:bg-slate-100' : ''}`}
    >
      <div className="flex items-center gap-1">
        <span>{COLUMN_LABELS[col]}</span>
        {sortableField && <SortColumnIcon active={sortField === sortableField} order={sortOrder} />}
      </div>
    </th>
  );

  const renderCell = (item: EnrichedTransplant, col: TransplantColumnKey) => {
    const pat = item.__patient;
    switch (col) {
      case 'name': return <span className="font-extrabold uppercase">{pat?.PatientName || '—'}</span>;
      case 'patientId': return <span className="font-mono text-[10px]">{pat?.PatientID1 || '—'}</span>;
      case 'sex': return pat?.PatientSex || '—';
      case 'dob': return formatVNTime(pat?.PatientDOB);
      case 'address': return pat?.PatientAddress || '—';
      case 'detailDiag': return <span className="line-clamp-2">{item.DetailTransDiag || '—'}</span>;
      case 'TransWeight': return item.TransWeight ? `${item.TransWeight} kg` : '—';
      case 'TransDate': return formatVNTime(item.TransDate);
      default: return String(item[col as keyof Transplant] || '—');
    }
  };

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="shrink-0 flex flex-wrap items-center gap-2 mb-3">
        <button type="button" onClick={() => setActiveTab('notReady')} className={`px-4 py-2 rounded-full text-xs font-black uppercase ${activeTab === 'notReady' ? 'bg-[#d2145a] text-white' : 'bg-white border border-slate-200 text-slate-600'}`}>
          Chưa đủ tiêu chuẩn ({tabItems.notReady.length})
        </button>
        <button type="button" onClick={() => setActiveTab('ready')} className={`px-4 py-2 rounded-full text-xs font-black uppercase ${activeTab === 'ready' ? 'bg-emerald-600 text-white' : 'bg-white border border-slate-200 text-slate-600'}`}>
          Đủ tiêu chuẩn ({tabItems.ready.length})
        </button>
        <div className="flex-1 min-w-[200px] relative">
          <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
          <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Tìm họ tên, mã người bệnh..." className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-xl text-sm bg-white" />
        </div>
        <button type="button" onClick={() => setShowRegister(true)} className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm flex items-center gap-1">
          <Plus className="w-4 h-4" /> Thêm BN
        </button>
      </div>

      <div className="flex-1 min-h-0 flex gap-3">
        <div className={`flex flex-col min-h-0 bg-white border border-slate-200 rounded-3xl shadow-sm overflow-hidden transition-all ${selectedKey ? 'w-[48%]' : 'flex-1'}`}>
          <div className="overflow-auto flex-1">
            <table className="w-full min-w-[900px] text-left text-xs">
              <thead className="sticky top-0 z-10">
                <tr>
                  <th className="py-2 px-2 border-b bg-slate-50 w-10" />
                  {visibleColumns.name && renderHeaderCell('name', 'name')}
                  {visibleColumns.patientId && renderHeaderCell('patientId', 'patientId')}
                  {visibleColumns.sex && renderHeaderCell('sex', 'sex')}
                  {visibleColumns.dob && renderHeaderCell('dob', 'dob')}
                  {visibleColumns.address && renderHeaderCell('address', 'address')}
                  {visibleColumns.TransDiagID && renderHeaderCell('TransDiagID', 'TransDiagID')}
                  {visibleColumns.detailDiag && renderHeaderCell('detailDiag', 'detailDiag')}
                  {visibleColumns.BloodType && renderHeaderCell('BloodType', 'BloodType')}
                  {visibleColumns.Gens && renderHeaderCell('Gens', 'Gens')}
                  {visibleColumns.MRI && renderHeaderCell('MRI', 'MRI')}
                  {visibleColumns.Holter && renderHeaderCell('Holter', 'Holter')}
                  {visibleColumns.TransStatus && renderHeaderCell('TransStatus', 'TransStatus')}
                  {visibleColumns.TransWeight && renderHeaderCell('TransWeight', 'TransWeight')}
                  {visibleColumns.TransDate && renderHeaderCell('TransDate', 'TransDate')}
                  <th className="py-2 px-2 border-b bg-slate-50 w-10 sticky right-0">
                    <div className="relative" ref={columnDropdownRef}>
                      <button type="button" onClick={() => setShowColumnDropdown(v => !v)} className="p-1 rounded-lg border border-slate-200 hover:bg-slate-100" title="Hiển thị cột">
                        <Eye className="w-3.5 h-3.5" />
                      </button>
                      {showColumnDropdown && (
                        <div className="absolute right-0 mt-1 w-52 bg-white border border-slate-200 rounded-xl shadow-lg z-30 p-2 space-y-1">
                          {(Object.keys(visibleColumns) as TransplantColumnKey[]).map(col => (
                            <label key={col} className="flex items-center gap-2 text-[11px] font-semibold px-2 py-1 hover:bg-slate-50 rounded-lg cursor-pointer">
                              <input type="checkbox" checked={visibleColumns[col]} onChange={() => setVisibleColumns(prev => ({ ...prev, [col]: !prev[col] }))} />
                              {COLUMN_LABELS[col]}
                            </label>
                          ))}
                        </div>
                      )}
                    </div>
                  </th>
                </tr>
              </thead>
              <tbody>
                {displayList.length === 0 ? (
                  <tr><td colSpan={20} className="py-10 text-center text-slate-400 italic">Không có bệnh nhân trong danh sách</td></tr>
                ) : displayList.map(item => (
                  <tr key={item.TransKey} onClick={() => setSelectedKey(item.TransKey || '')} className={`cursor-pointer border-b border-slate-100 hover:bg-indigo-50/40 ${selectedKey === item.TransKey ? 'bg-indigo-50' : ''}`}>
                    <td className="py-2 px-2" onClick={e => e.stopPropagation()}>
                      {deleteConfirmKey === item.TransKey ? (
                        <div className="flex gap-1">
                          <button type="button" onClick={() => handleDelete(item.TransKey!)} className="text-[9px] font-bold text-white bg-rose-600 px-1.5 py-0.5 rounded">OK</button>
                          <button type="button" onClick={() => setDeleteConfirmKey('')} className="text-[9px] font-bold text-slate-500">Hủy</button>
                        </div>
                      ) : (
                        <button type="button" onClick={() => setDeleteConfirmKey(item.TransKey || '')} className="p-1 rounded-lg text-rose-500 hover:bg-rose-50" title="Xóa">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </td>
                    {(Object.keys(visibleColumns) as TransplantColumnKey[]).filter(c => visibleColumns[c]).map(col => (
                      <td key={col} className="py-2 px-2 align-top">{renderCell(item, col)}</td>
                    ))}
                    <td />
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {selectedItem && (
          <div className="flex-1 min-w-0 flex flex-col bg-white border border-slate-200 rounded-3xl shadow-sm overflow-hidden">
            <div className="px-4 py-3 bg-[#b31448] text-white flex items-center justify-between">
              <div>
                <div className="text-[10px] font-bold uppercase opacity-80">Hồ sơ ghép tim</div>
                <div className="text-lg font-black uppercase">{selectedItem.__patient?.PatientName}</div>
              </div>
              <button type="button" onClick={() => setSelectedKey('')} className="p-1 hover:bg-white/10 rounded-lg"><X className="w-4 h-4" /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50/50">
              <div className="bg-white border rounded-2xl p-3 grid grid-cols-2 gap-2 text-xs">
                <div><span className="text-slate-400 font-bold uppercase text-[9px]">Mã BN</span><div className="font-mono font-bold">{selectedItem.__patient?.PatientID1}</div></div>
                <div><span className="text-slate-400 font-bold uppercase text-[9px]">Giới tính</span><div>{selectedItem.__patient?.PatientSex}</div></div>
                <div><span className="text-slate-400 font-bold uppercase text-[9px]">Ngày sinh</span><div>{formatVNTime(selectedItem.__patient?.PatientDOB)}</div></div>
                <div><span className="text-slate-400 font-bold uppercase text-[9px]">Địa chỉ</span><div>{selectedItem.__patient?.PatientAddress}</div></div>
                {selectedItem.__patient && onEditPatientAdmin && (
                  <div className="col-span-2">
                    <PatientAdminEditButton onClick={() => onEditPatientAdmin(selectedItem.__patient!)} />
                  </div>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="text-[9px] font-bold uppercase text-slate-500">Cân nặng (kg)</label><input value={detailForm.TransWeight || ''} onChange={e => setDetailForm(f => ({ ...f, TransWeight: e.target.value }))} className="w-full border rounded-xl px-3 py-2 text-sm mt-1" /></div>
                <div><label className="text-[9px] font-bold uppercase text-slate-500">Chiều cao (cm)</label><input value={detailForm.TransHeight || ''} onChange={e => setDetailForm(f => ({ ...f, TransHeight: e.target.value }))} className="w-full border rounded-xl px-3 py-2 text-sm mt-1" /></div>
                <div><label className="text-[9px] font-bold uppercase text-slate-500">Nhóm máu</label><select value={detailForm.BloodType || ''} onChange={e => setDetailForm(f => ({ ...f, BloodType: e.target.value }))} className="w-full border rounded-xl px-3 py-2 text-sm mt-1">{BLOOD_TYPE_OPTIONS.map(o => <option key={o}>{o}</option>)}</select></div>
                <div><label className="text-[9px] font-bold uppercase text-slate-500">Trạng thái</label><select value={detailForm.TransStatus || TRANS_STATUS_NOT_READY} onChange={e => setDetailForm(f => ({ ...f, TransStatus: e.target.value }))} className="w-full border rounded-xl px-3 py-2 text-sm mt-1">{TRANSPLANT_STATUS_OPTIONS.map(o => <option key={o}>{o}</option>)}</select></div>
                {(['Gens', 'MRI', 'Holter'] as const).map(field => (
                  <div key={field}><label className="text-[9px] font-bold uppercase text-slate-500">{field === 'Gens' ? 'XN gen' : field}</label><select value={detailForm[field] || 'Không'} onChange={e => setDetailForm(f => ({ ...f, [field]: e.target.value }))} className="w-full border rounded-xl px-3 py-2 text-sm mt-1">{TRANSPLANT_YES_NO_OPTIONS.map(o => <option key={o}>{o}</option>)}</select></div>
                ))}
                <div className="col-span-2"><label className="text-[9px] font-bold uppercase text-slate-500">Mã chẩn đoán</label><SearchableEnumSelect value={detailForm.TransDiagID || ''} onChange={v => setDetailForm(f => ({ ...f, TransDiagID: v }))} options={diagnosisOptions} placeholder="Chọn mã ICD..." /></div>
                <div className="col-span-2"><label className="text-[9px] font-bold uppercase text-slate-500">Chẩn đoán chi tiết</label><textarea value={detailForm.DetailTransDiag || ''} onChange={e => setDetailForm(f => ({ ...f, DetailTransDiag: e.target.value }))} rows={3} className="w-full border rounded-xl px-3 py-2 text-sm mt-1" /></div>
                <div className="col-span-2"><label className="text-[9px] font-bold uppercase text-slate-500">Siêu âm tim</label><textarea value={detailForm.TTE || ''} onChange={e => setDetailForm(f => ({ ...f, TTE: e.target.value }))} rows={3} className="w-full border rounded-xl px-3 py-2 text-sm mt-1" /></div>
                <div className="col-span-2"><label className="text-[9px] font-bold uppercase text-slate-500">Điều trị hiện tại</label><textarea value={detailForm.Treatment || ''} onChange={e => setDetailForm(f => ({ ...f, Treatment: e.target.value }))} rows={3} className="w-full border rounded-xl px-3 py-2 text-sm mt-1" /></div>
                <div className="col-span-2"><label className="text-[9px] font-bold uppercase text-slate-500">Ghi chú</label><textarea value={detailForm.TransNote || ''} onChange={e => setDetailForm(f => ({ ...f, TransNote: e.target.value }))} rows={2} className="w-full border rounded-xl px-3 py-2 text-sm mt-1" /></div>
                <div><label className="text-[9px] font-bold uppercase text-slate-500">Ngày ghép tim</label><VNDateInput value={detailForm.TransDate || ''} onChange={v => setDetailForm(f => ({ ...f, TransDate: v }))} className="w-full border rounded-xl px-3 py-2 text-sm mt-1" /></div>
              </div>
              <div className="grid grid-cols-2 gap-3 bg-white border rounded-2xl p-3">
                {detailForm.Gens === 'Có' && (
                  <FileUploadRow label="File XN gen" value={detailForm.GensFile} onUpload={f => handleFileUpload('GensFile', f)} onClear={() => setDetailForm(f => ({ ...f, GensFile: '' }))} />
                )}
                {detailForm.MRI === 'Có' && (
                  <FileUploadRow label="File MRI" value={detailForm.MRIFile} onUpload={f => handleFileUpload('MRIFile', f)} onClear={() => setDetailForm(f => ({ ...f, MRIFile: '' }))} />
                )}
                {detailForm.Holter === 'Có' && (
                  <FileUploadRow label="File Holter" value={detailForm.HolterFile} onUpload={f => handleFileUpload('HolterFile', f)} onClear={() => setDetailForm(f => ({ ...f, HolterFile: '' }))} />
                )}
                <FileUploadRow label="File TTE" value={detailForm.TTEFile} onUpload={f => handleFileUpload('TTEFile', f)} onClear={() => setDetailForm(f => ({ ...f, TTEFile: '' }))} />
              </div>
            </div>
            <div className="px-4 py-3 border-t bg-white flex justify-end">
              <button type="button" onClick={handleSaveDetail} disabled={saving} className="bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold px-6 py-2 rounded-2xl text-xs flex items-center gap-2 disabled:opacity-50">
                <Save className="w-4 h-4" /> {saving ? 'Đang lưu...' : 'Lưu hồ sơ ghép tim'}
              </button>
            </div>
          </div>
        )}

        <div className={`shrink-0 flex flex-col ${isFilterExpanded ? 'w-[320px]' : 'w-[52px]'}`}>
          <div className="bg-white border border-slate-200 rounded-3xl shadow-sm flex flex-col h-full min-h-0">
            {!isFilterExpanded ? (
              <button type="button" onClick={() => setIsFilterExpanded(true)} className="flex flex-col items-center py-5 h-full hover:bg-slate-50 rounded-3xl">
                <Filter className="w-5 h-5 text-slate-500 mb-4" />
                <span className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400" style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}>Bộ lọc</span>
              </button>
            ) : (
              <>
                <div className="p-4 border-b bg-[#b31448] text-white rounded-t-3xl flex justify-between items-center">
                  <h3 className="font-black text-[12px] uppercase flex items-center gap-2"><Filter className="w-4 h-4" /> Bộ lọc ghép tim</h3>
                  <button type="button" onClick={() => setIsFilterExpanded(false)}><X className="w-4 h-4" /></button>
                </div>
                <div className="p-4 flex-1 overflow-y-auto space-y-4">
                  <button type="button" onClick={() => setShowFilterPicker(v => !v)} className="w-full py-2 rounded-xl border border-slate-200 text-xs font-bold hover:bg-slate-50">
                    Chọn tiêu chí lọc
                  </button>
                  {showFilterPicker && (
                    <div className="border border-slate-200 rounded-xl p-2 space-y-1 bg-slate-50">
                      <label className="flex items-center gap-2 text-[11px] font-bold px-2 py-1">
                        <input type="checkbox" checked={activeFilterFields.length === 0} onChange={() => { setActiveFilterFields([]); setFilterValues({}); }} />
                        Tất cả
                      </label>
                      {TRANSPLANT_FILTER_FIELDS.map(field => (
                        <label key={field.id} className="flex items-center gap-2 text-[11px] font-semibold px-2 py-1">
                          <input
                            type="checkbox"
                            checked={activeFilterFields.includes(field.id)}
                            onChange={() => {
                              setActiveFilterFields(prev => prev.includes(field.id) ? prev.filter(f => f !== field.id) : [...prev, field.id]);
                            }}
                          />
                          {field.label}
                        </label>
                      ))}
                    </div>
                  )}
                  {activeFilterFields.map(field => {
                    const options = getUniqueFilterValues(tabItems[activeTab], field);
                    const selected = filterValues[field] || [];
                    return (
                      <div key={field} className="space-y-1">
                        <div className="text-[10px] font-black uppercase text-slate-500">{TRANSPLANT_FILTER_FIELDS.find(f => f.id === field)?.label}</div>
                        <div className="flex flex-wrap gap-1">
                          {options.map(opt => (
                            <button
                              key={opt}
                              type="button"
                              onClick={() => {
                                setFilterValues(prev => {
                                  const cur = prev[field] || [];
                                  const next = cur.includes(opt) ? cur.filter(v => v !== opt) : [...cur, opt];
                                  return { ...prev, [field]: next };
                                });
                              }}
                              className={`text-[10px] font-bold px-2 py-1 rounded-full border ${selected.includes(opt) ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white border-slate-200 text-slate-600'}`}
                            >
                              {opt}
                            </button>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                  <div className="space-y-2">
                    <div className="text-[10px] font-black uppercase text-slate-500">Danh sách sau lọc ({displayList.length})</div>
                    {displayList.slice(0, 20).map(item => (
                      <button key={item.TransKey} type="button" onClick={() => setSelectedKey(item.TransKey || '')} className="w-full text-left p-2 rounded-xl border border-slate-100 hover:bg-indigo-50 text-[11px]">
                        <div className="font-bold uppercase">{item.__patient?.PatientName}</div>
                        <div className="text-slate-400 font-mono">{item.__patient?.PatientID1}</div>
                      </button>
                    ))}
                  </div>
                </div>
                <div className="p-4 border-t space-y-2">
                  {exportMsg && <div className="text-[10px] text-amber-700 bg-amber-50 border border-amber-100 rounded-lg p-2 flex gap-1"><AlertTriangle className="w-3.5 h-3.5 shrink-0" />{exportMsg}</div>}
                  <button type="button" onClick={handleExport} className="w-full py-3 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs uppercase flex items-center justify-center gap-2">
                    <Download className="w-4 h-4" /> Xuất Excel (XLSX)
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {showRegister && (
        <TransplantRegisterModal
          patients={patients}
          sources={sources}
          currentStaff={currentStaff}
          onClose={() => setShowRegister(false)}
          onAddPatient={onAddPatient}
          onAddTransplant={async record => {
            await onAddTransplant(record);
            onRefreshData();
          }}
          triggerAlert={triggerAlert}
        />
      )}
    </div>
  );
}

function FileUploadRow({
  label,
  value,
  onUpload,
  onClear,
}: {
  label: string;
  value?: string;
  onUpload: (file: File) => void;
  onClear: () => void;
}) {
  return (
    <div className="space-y-1">
      <label className="block text-slate-500 font-bold text-[9px] uppercase">{label}</label>
      <div className="flex flex-wrap items-center gap-2">
        <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 bg-white text-[11px] font-bold cursor-pointer hover:bg-slate-50">
          <Upload className="w-3.5 h-3.5" /> Chọn file
          <input type="file" accept=".pdf,image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) onUpload(f); e.target.value = ''; }} />
        </label>
        {value && (
          <>
            <button type="button" onClick={() => openTransplantFile(value)} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl border border-indigo-200 bg-indigo-50 text-indigo-700 text-[11px] font-bold">
              <ExternalLink className="w-3.5 h-3.5" /> Mở file
            </button>
            <button type="button" onClick={onClear} className="text-[10px] font-bold text-rose-600">Xóa</button>
          </>
        )}
      </div>
    </div>
  );
}
