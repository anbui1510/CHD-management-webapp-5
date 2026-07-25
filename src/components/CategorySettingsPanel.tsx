import React, { useMemo, useState } from 'react';
import {
  Plus,
  Trash2,
  Edit3,
  Search,
  Check,
  X,
  Save,
  RotateCcw,
  Settings,
  HelpCircle,
} from 'lucide-react';
import type { Source } from '../types';
import {
  getSourceProvinceOptions,
  getSourceCathMethodOptions,
  getSourceConsultResultOptions,
  getSourceDiagnosisOptions,
} from '../data/source';
import { useSheetsSyncFeedback } from '../context/SheetsSyncFeedbackContext';
import { buildSyncContext, persistWithSheetsSync } from '../utils/sheetsSyncMutation';

interface CategorySettingsPanelProps {
  sources: Source[];
  onRefreshData: () => void;
  triggerAlert?: (message: string, title?: string) => void;
  triggerConfirm?: (message: string, onConfirm: () => void, title?: string) => void;
}

interface RenameTrack {
  oldVal: string;
  newVal: string;
}

export default function CategorySettingsPanel({
  sources,
  onRefreshData,
  triggerAlert,
  triggerConfirm,
}: CategorySettingsPanelProps) {
  const { reportMutationResponse } = useSheetsSyncFeedback();
  // 1. Initial State from sources
  const initialProvinces = useMemo(() => getSourceProvinceOptions(sources), [sources]);
  const initialDiagnoses = useMemo(() => getSourceDiagnosisOptions(sources), [sources]);
  const initialConsultResults = useMemo(() => getSourceConsultResultOptions(sources), [sources]);
  const initialCathMethods = useMemo(() => getSourceCathMethodOptions(sources), [sources]);

  // 2. Working states
  const [provinces, setProvinces] = useState<string[]>(initialProvinces);
  const [diagnoses, setDiagnoses] = useState<string[]>(initialDiagnoses);
  const [consultResults, setConsultResults] = useState<string[]>(initialConsultResults);
  const [cathMethods, setCathMethods] = useState<string[]>(initialCathMethods);

  // Track renames for DiagnosisID cascading updates
  const [diagnosisRenames, setDiagnosisRenames] = useState<RenameTrack[]>([]);

  // Search filter states
  const [searchProvince, setSearchProvince] = useState('');
  const [searchDiagnosis, setSearchDiagnosis] = useState('');
  const [searchConsultResult, setSearchConsultResult] = useState('');
  const [searchCathMethod, setSearchCathMethod] = useState('');

  // Add inputs
  const [newProvince, setNewProvince] = useState('');
  const [newDiagnosis, setNewDiagnosis] = useState('');
  const [newConsultResult, setNewConsultResult] = useState('');
  const [newCathMethod, setNewCathMethod] = useState('');

  // Inline editing states
  const [editingType, setEditingType] = useState<'province' | 'diagnosis' | 'consultResult' | 'cathMethod' | null>(null);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editingValue, setEditingValue] = useState('');

  // Saving state
  const [saving, setSaving] = useState(false);

  // 3. Handlers for adding items
  const handleAddItem = (
    type: 'province' | 'diagnosis' | 'consultResult' | 'cathMethod',
    value: string,
    setValue: (val: string) => void,
    list: string[],
    setList: (val: string[]) => void
  ) => {
    const trimmed = value.trim();
    if (!trimmed) return;

    if (list.some((item) => item.toLowerCase() === trimmed.toLowerCase())) {
      triggerAlert?.(`Giá trị "${trimmed}" đã tồn tại trong danh sách!`, 'Trùng lặp');
      return;
    }

    setList([...list, trimmed].sort((a, b) => a.localeCompare(b, 'vi')));
    setValue('');
  };

  // Handlers for deleting items
  const handleDeleteItem = (
    type: 'province' | 'diagnosis' | 'consultResult' | 'cathMethod',
    value: string,
    list: string[],
    setList: (val: string[]) => void
  ) => {
    const performDelete = () => {
      setList(list.filter((item) => item !== value));
      // If we are deleting a diagnosis that was in rename list, remove it from rename tracking
      if (type === 'diagnosis') {
        setDiagnosisRenames((prev) => prev.filter((r) => r.newVal !== value));
      }
    };

    triggerConfirm?.(
      `Bạn có chắc chắn muốn xóa "${value}" khỏi danh mục không? Lưu ý: Việc xóa ở đây không tự động xóa dữ liệu lịch sử ở các hồ sơ cũ.`,
      performDelete,
      'Xác nhận xóa'
    );
  };

  // Handlers for starting inline edit
  const startEdit = (
    type: 'province' | 'diagnosis' | 'consultResult' | 'cathMethod',
    index: number,
    value: string
  ) => {
    setEditingType(type);
    setEditingIndex(index);
    setEditingValue(value);
  };

  const cancelEdit = () => {
    setEditingType(null);
    setEditingIndex(null);
    setEditingValue('');
  };

  // Handlers for saving inline edit
  const saveEdit = (
    type: 'province' | 'diagnosis' | 'consultResult' | 'cathMethod',
    originalValue: string,
    list: string[],
    setList: (val: string[]) => void
  ) => {
    const trimmed = editingValue.trim();
    if (!trimmed || trimmed === originalValue) {
      cancelEdit();
      return;
    }

    if (list.some((item) => item.toLowerCase() === trimmed.toLowerCase() && item !== originalValue)) {
      triggerAlert?.(`Giá trị "${trimmed}" đã tồn tại trong danh sách!`, 'Trùng lặp');
      return;
    }

    setList(list.map((item) => (item === originalValue ? trimmed : item)).sort((a, b) => a.localeCompare(b, 'vi')));

    // Track renames for DiagnosisID to perform cascading updates
    if (type === 'diagnosis') {
      setDiagnosisRenames((prev) => {
        const existing = prev.find((r) => r.newVal === originalValue);
        if (existing) {
          // If A -> B and now B -> C, then A -> C
          return prev.map((r) => (r.newVal === originalValue ? { ...r, newVal: trimmed } : r));
        } else {
          return [...prev, { oldVal: originalValue, newVal: trimmed }];
        }
      });
    }

    cancelEdit();
  };

  // Reset to initial
  const handleReset = () => {
    triggerConfirm?.(
      'Bạn có chắc muốn hủy các thay đổi chưa lưu và khôi phục về cấu hình hiện tại từ máy chủ không?',
      () => {
        setProvinces(initialProvinces);
        setDiagnoses(initialDiagnoses);
        setConsultResults(initialConsultResults);
        setCathMethods(initialCathMethods);
        setDiagnosisRenames([]);
        cancelEdit();
      },
      'Hủy thay đổi'
    );
  };

  // Save to backend
  const handleSaveAll = async () => {
    setSaving(true);
    try {
      await persistWithSheetsSync(
        reportMutationResponse,
        '/api/sources/update-all',
        {
          method: 'POST',
          body: JSON.stringify({
            PatientAddress: provinces,
            DiagnosisID: diagnoses,
            ResultConsultID: consultResults,
            CathMethod: cathMethods,
            diagnosisRenames,
          })
        },
        buildSyncContext('staff-mgmt', { viewLabel: 'Cài đặt danh mục' }),
        { baseMessage: 'Đã lưu danh mục cấu hình' }
      );

      setDiagnosisRenames([]);
      onRefreshData();
    } catch (err) {
      console.error(err);
      triggerAlert?.(err instanceof Error ? err.message : 'Không thể lưu cấu hình', 'Lỗi lưu trữ');
    } finally {
      setSaving(false);
    }
  };

  // Render a single category list card
  const renderCategoryCard = (
    title: string,
    subtitle: string,
    items: string[],
    setList: (val: string[]) => void,
    type: 'province' | 'diagnosis' | 'consultResult' | 'cathMethod',
    searchText: string,
    setSearchText: (val: string) => void,
    addText: string,
    setAddText: (val: string) => void,
    placeholder: string
  ) => {
    const filtered = items.filter((item) =>
      item.toLowerCase().includes(searchText.toLowerCase())
    );

    return (
      <div className="bg-white border border-slate-200 rounded-3xl p-5 shadow-xs flex flex-col h-[520px] transition-all hover:shadow-md">
        <div className="mb-3">
          <h3 className="text-sm font-extrabold text-slate-800 uppercase tracking-wider flex items-center justify-between">
            <span>{title}</span>
            <span className="text-[10px] bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded-full font-bold">
              {items.length} mục
            </span>
          </h3>
          <p className="text-[10px] text-slate-400 font-medium mt-0.5">{subtitle}</p>
        </div>

        {/* Search */}
        <div className="relative mb-3">
          <Search className="absolute left-3 top-2.5 w-3.5 h-3.5 text-slate-450" />
          <input
            type="text"
            placeholder="Tìm kiếm..."
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-3 py-1.5 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500 font-semibold"
          />
        </div>

        {/* Scrollable list */}
        <div className="flex-1 overflow-y-auto min-h-0 border border-slate-100 rounded-2xl bg-slate-50 p-2 space-y-1">
          {filtered.length === 0 ? (
            <p className="text-center text-slate-400 text-[10px] font-bold py-8">
              Không tìm thấy mục nào
            </p>
          ) : (
            filtered.map((item, idx) => {
              const globalIndex = items.indexOf(item);
              const isEditingThis = editingType === type && editingIndex === globalIndex;

              return (
                <div
                  key={globalIndex}
                  className="flex items-center justify-between bg-white border border-slate-100 rounded-xl p-2 transition-all hover:border-pink-200 group text-xs font-semibold text-slate-700 shadow-2xs"
                >
                  {isEditingThis ? (
                    <div className="flex items-center gap-1.5 w-full">
                      <input
                        type="text"
                        value={editingValue}
                        onChange={(e) => setEditingValue(e.target.value)}
                        className="flex-1 bg-slate-50 border border-slate-350 rounded-lg px-2 py-1 text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-pink-500"
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') saveEdit(type, item, items, setList);
                          if (e.key === 'Escape') cancelEdit();
                        }}
                      />
                      <button
                        onClick={() => saveEdit(type, item, items, setList)}
                        className="p-1 rounded-md text-emerald-600 hover:bg-emerald-50 cursor-pointer"
                        title="Lưu"
                      >
                        <Check className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={cancelEdit}
                        className="p-1 rounded-md text-slate-400 hover:bg-slate-100 cursor-pointer"
                        title="Hủy"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ) : (
                    <>
                      <span className="truncate pr-2 select-all leading-normal" title={item}>
                        {item}
                      </span>
                      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-all">
                        <button
                          onClick={() => startEdit(type, globalIndex, item)}
                          className="p-1 rounded-md text-indigo-500 hover:bg-indigo-50 cursor-pointer"
                          title="Sửa tên"
                        >
                          <Edit3 className="w-3 h-3" />
                        </button>
                        <button
                          onClick={() => handleDeleteItem(type, item, items, setList)}
                          className="p-1 rounded-md text-red-500 hover:bg-red-50 cursor-pointer"
                          title="Xóa mục"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Add Input */}
        <div className="mt-4 pt-3 border-t border-slate-100 flex gap-2">
          <input
            type="text"
            placeholder={placeholder}
            value={addText}
            onChange={(e) => setAddText(e.target.value)}
            className="flex-1 bg-white border border-slate-200 rounded-xl px-2.5 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-550 font-semibold"
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                handleAddItem(type, addText, setAddText, items, setList);
              }
            }}
          />
          <button
            type="button"
            onClick={() => handleAddItem(type, addText, setAddText, items, setList)}
            className="bg-indigo-650 hover:bg-indigo-750 text-white p-2 rounded-xl transition flex items-center justify-center cursor-pointer shadow-sm"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Help banner info */}
      <div className="mb-4 bg-indigo-50/50 border border-indigo-100 rounded-2xl p-3 flex gap-3 text-xs text-indigo-900 leading-normal font-semibold">
        <HelpCircle className="w-4 h-4 text-indigo-500 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p>
            Các giá trị trong danh mục sẽ được sử dụng làm tùy chọn trong các dropdown chọn (tỉnh thành, chẩn đoán, phương pháp can thiệp, kết quả hội chẩn).
          </p>
          {diagnosisRenames.length > 0 && (
            <p className="text-pink-650 font-bold">
              ⚠️ Có {diagnosisRenames.length} mã chẩn đoán đã thay đổi tên. Khi lưu, toàn bộ các hồ sơ liên quan (Hội chẩn, Thông tim, CMR, gợi ý dụng cụ) có mã chẩn đoán tương ứng sẽ tự động cập nhật theo mã mới.
            </p>
          )}
        </div>
      </div>

      {/* Grid of lists */}
      <div className="flex-1 overflow-y-auto min-h-0 pr-1 pb-4">
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          {renderCategoryCard(
            'Mã bệnh (DiagnosisID)',
            'Dùng cho Chẩn đoán chính, PostDiagnosisID...',
            diagnoses,
            setDiagnoses,
            'diagnosis',
            searchDiagnosis,
            setSearchDiagnosis,
            newDiagnosis,
            setNewDiagnosis,
            'Thêm mã bệnh mới...'
          )}

          {renderCategoryCard(
            'Tỉnh thành (PatientAddress)',
            'Dùng cho Địa chỉ của bệnh nhân',
            provinces,
            setProvinces,
            'province',
            searchProvince,
            setSearchProvince,
            newProvince,
            setNewProvince,
            'Thêm tỉnh thành mới...'
          )}

          {renderCategoryCard(
            'Kết luận chính (ResultConsultID)',
            'Dùng cho Kết luận staff hội chẩn',
            consultResults,
            setConsultResults,
            'consultResult',
            searchConsultResult,
            setSearchConsultResult,
            newConsultResult,
            setNewConsultResult,
            'Thêm kết luận mới...'
          )}

          {renderCategoryCard(
            'Phương pháp can thiệp (CathMethod)',
            'Dùng cho Phương pháp can thiệp thông tim',
            cathMethods,
            setCathMethods,
            'cathMethod',
            searchCathMethod,
            setSearchCathMethod,
            newCathMethod,
            setNewCathMethod,
            'Thêm phương pháp mới...'
          )}
        </div>
      </div>

      {/* Control Buttons */}
      <div className="shrink-0 pt-4 border-t border-slate-100 flex items-center justify-end gap-3 bg-slate-50 p-4 -mx-6 -mb-6 md:-mx-8 md:-mb-8 md:rounded-b-3xl">
        <button
          type="button"
          onClick={handleReset}
          className="bg-white hover:bg-slate-50 border border-slate-200 text-slate-600 rounded-xl px-4 py-2 text-xs font-bold transition flex items-center gap-1.5 cursor-pointer"
        >
          <RotateCcw className="w-3.5 h-3.5" /> Hủy thay đổi
        </button>
        <button
          type="button"
          onClick={handleSaveAll}
          disabled={saving}
          className="bg-[#d2145a] hover:bg-pink-700 text-white rounded-xl px-5 py-2 text-xs font-extrabold transition shadow-md shadow-pink-900/10 flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
        >
          <Save className="w-3.5 h-3.5" /> {saving ? 'Đang lưu đồng bộ...' : 'Lưu & Đồng bộ lên Sheets'}
        </button>
      </div>
    </div>
  );
}
