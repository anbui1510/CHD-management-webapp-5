import React, { useMemo, useState } from 'react';
import { Plus, Save, Trash2, Pencil, X } from 'lucide-react';
import type { RolePreset } from '../types';
import {
  ALL_APP_MODULES,
  AppModule,
  AppModuleDefinition,
  getModuleLabel,
  getRuntimeRolePresets,
  isSystemRolePresetId,
  getOrderedModulesByGroup,
  parsePermissions,
  serializePermissions,
} from '../auth/permissions';
import { useSheetsSyncFeedback } from '../context/SheetsSyncFeedbackContext';
import { buildSyncContext, persistWithSheetsSync } from '../utils/sheetsSyncMutation';
import { MODAL_TITLE } from '../utils/modalTitles';

interface RolePresetMatrixPanelProps {
  rolePresetRecords: RolePreset[];
  onRefresh: () => void;
  triggerAlert?: (message: string, title?: string) => void;
  triggerConfirm?: (message: string, onConfirm: () => void, title?: string) => void;
}

type PresetDraft = {
  RolePresetID: string;
  RolePresetLabel: string;
  RolePresetDescription: string;
  moduleSet: Set<AppModule>;
  SortOrder: number;
  isNew?: boolean;
};

const emptyDraft = (): PresetDraft => ({
  RolePresetID: '',
  RolePresetLabel: '',
  RolePresetDescription: '',
  moduleSet: new Set<AppModule>(['home', 'workspace']),
  SortOrder: 50,
  isNew: true,
});

export default function RolePresetMatrixPanel({
  rolePresetRecords,
  onRefresh,
  triggerAlert,
  triggerConfirm,
}: RolePresetMatrixPanelProps) {
  const { reportMutationResponse } = useSheetsSyncFeedback();
  const groupedModules = useMemo(() => getOrderedModulesByGroup(), []);
  const runtimePresets = getRuntimeRolePresets();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<PresetDraft | null>(null);
  const [saving, setSaving] = useState(false);

  const startCreate = () => {
    setEditingId('__new__');
    setDraft(emptyDraft());
  };

  const startEdit = (record: RolePreset) => {
    setEditingId(record.RolePresetID);
    setDraft({
      RolePresetID: record.RolePresetID,
      RolePresetLabel: record.RolePresetLabel,
      RolePresetDescription: record.RolePresetDescription || '',
      moduleSet: new Set(parsePermissions(record.Permissions)),
      SortOrder: Number(record.SortOrder ?? 50),
      isNew: false,
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setDraft(null);
  };

  const toggleModule = (module: AppModule) => {
    if (!draft) return;
    setDraft(prev => {
      if (!prev) return prev;
      const next = new Set<AppModule>(prev.moduleSet);
      if (next.has(module)) {
        if (module === 'home' || module === 'workspace') return prev;
        next.delete(module);
      } else {
        next.add(module);
      }
      return { ...prev, moduleSet: next };
    });
  };

  const handleSave = async () => {
    if (!draft) return;
    if (!draft.RolePresetLabel.trim()) {
      triggerAlert?.('Vui lòng nhập tên vai trò mẫu!', MODAL_TITLE.missingInfo);
      return;
    }

    setSaving(true);
    try {
      const payload = {
        RolePresetID: draft.RolePresetID || undefined,
        RolePresetLabel: draft.RolePresetLabel.trim(),
        RolePresetDescription: draft.RolePresetDescription.trim(),
        Permissions:
          draft.RolePresetID === 'admin-khoa'
            ? serializePermissions(ALL_APP_MODULES)
            : serializePermissions(draft.moduleSet),
        SortOrder: draft.SortOrder,
      };

      const url = draft.isNew
        ? '/api/role-presets'
        : `/api/role-presets/${encodeURIComponent(draft.RolePresetID)}`;
      const method = draft.isNew ? 'POST' : 'PUT';

      await persistWithSheetsSync(
        reportMutationResponse,
        url,
        { method, body: JSON.stringify(payload) },
        buildSyncContext('staff-mgmt', { viewLabel: 'Ma trận vai trò mẫu' }),
        { baseMessage: 'Đã lưu vai trò mẫu' }
      );

      cancelEdit();
      onRefresh();
    } catch (error) {
      triggerAlert?.(error instanceof Error ? error.message : 'Lỗi lưu preset', MODAL_TITLE.saveError);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (record: RolePreset) => {
    if (isSystemRolePresetId(record.RolePresetID)) {
      triggerAlert?.('Không thể xóa preset hệ thống.', MODAL_TITLE.warning);
      return;
    }

    const proceed = async () => {
      try {
        await persistWithSheetsSync(
          reportMutationResponse,
          `/api/role-presets/${encodeURIComponent(record.RolePresetID)}`,
          { method: 'DELETE', body: JSON.stringify({}) },
          buildSyncContext('staff-mgmt', { viewLabel: 'Ma trận vai trò mẫu' }),
          { baseMessage: 'Đã xóa vai trò mẫu' }
        );
        triggerAlert?.('Đã xóa vai trò mẫu.', MODAL_TITLE.notify);
        if (editingId === record.RolePresetID) cancelEdit();
        onRefresh();
      } catch (error) {
        triggerAlert?.(error instanceof Error ? error.message : 'Không thể xóa preset', MODAL_TITLE.saveError);
      }
    };

    if (triggerConfirm) {
      triggerConfirm(`Xóa vai trò mẫu "${record.RolePresetLabel}"?`, proceed, MODAL_TITLE.confirm);
    } else {
      proceed();
    }
  };

  return (
    <div className="flex-1 min-h-0 flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2 shrink-0">
        <p className="text-xs text-slate-500 max-w-2xl">
          Chỉnh ma trận vai trò mẫu tại đây hoặc trên sheet <strong>RolePreset</strong> (Virtual Google Sheets).
          Lưu xong — preset mới dùng ngay khi gán nhân sự.
        </p>
        <button
          type="button"
          onClick={startCreate}
          className="text-[11px] font-bold px-3 py-1.5 rounded-xl bg-primary text-white flex items-center gap-1.5 hover:bg-[#b8124e] transition"
        >
          <Plus className="w-3.5 h-3.5" /> Thêm vai trò mẫu
        </button>
      </div>

      <div className="flex-1 min-h-0 grid grid-cols-1 xl:grid-cols-12 gap-4">
        <div className="xl:col-span-5 flex flex-col min-h-0 bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="p-3 border-b border-slate-100 text-[10px] font-black uppercase text-slate-400">
            Danh sách preset ({rolePresetRecords.length})
          </div>
          <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
            {rolePresetRecords.map(record => {
              const preset = runtimePresets.find(item => item.id === record.RolePresetID);
              const active = editingId === record.RolePresetID;
              return (
                <div
                  key={record.RolePresetID}
                  className={`p-3 flex items-start gap-2 ${active ? 'bg-pink-50' : 'hover:bg-slate-50'}`}
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-extrabold text-xs text-primary truncate">{record.RolePresetLabel}</p>
                    <p className="text-[10px] text-slate-500 line-clamp-2 mt-0.5">{record.RolePresetDescription}</p>
                    <p className="text-[9px] font-mono text-slate-400 mt-1">
                      {record.RolePresetID} · {preset?.modules.length ?? 0} module
                      {isSystemRolePresetId(record.RolePresetID) ? ' · hệ thống' : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => startEdit(record)}
                      className="p-1.5 rounded-lg border border-slate-200 hover:border-pink-200 text-slate-500 hover:text-primary"
                      title="Sửa"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    {!isSystemRolePresetId(record.RolePresetID) && (
                      <button
                        type="button"
                        onClick={() => handleDelete(record)}
                        className="p-1.5 rounded-lg border border-slate-200 hover:border-red-200 text-slate-500 hover:text-red-600"
                        title="Xóa"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="xl:col-span-7 flex flex-col min-h-0 bg-white border border-slate-200 rounded-xl overflow-hidden">
          {!draft ? (
            <div className="flex-1 flex items-center justify-center p-8 text-center text-sm text-slate-400 font-semibold">
              Chọn preset để sửa hoặc bấm &quot;Thêm vai trò mẫu&quot;
            </div>
          ) : (
            <>
              <div className="p-4 border-b border-slate-100 flex items-center justify-between gap-2 shrink-0">
                <h3 className="font-extrabold text-sm text-slate-800">
                  {draft.isNew ? 'Tạo vai trò mẫu mới' : `Sửa: ${draft.RolePresetLabel}`}
                </h3>
                <div className="flex gap-2">
                  <button type="button" onClick={cancelEdit} className="p-1.5 rounded-lg border border-slate-200 text-slate-500">
                    <X className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={handleSave}
                    disabled={saving}
                    className="text-[11px] font-bold px-3 py-1.5 rounded-xl bg-primary text-white flex items-center gap-1 disabled:opacity-50"
                  >
                    <Save className="w-3.5 h-3.5" /> {saving ? 'Đang lưu...' : 'Lưu preset'}
                  </button>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <label className="block md:col-span-2">
                    <span className="text-[10px] font-bold uppercase text-slate-400">Tên vai trò (RolePresetLabel)</span>
                    <input
                      value={draft.RolePresetLabel}
                      onChange={(e) => setDraft(prev => prev && ({ ...prev, RolePresetLabel: e.target.value }))}
                      className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold"
                    />
                  </label>
                  <label className="block md:col-span-2">
                    <span className="text-[10px] font-bold uppercase text-slate-400">Mô tả</span>
                    <textarea
                      rows={2}
                      value={draft.RolePresetDescription}
                      onChange={(e) => setDraft(prev => prev && ({ ...prev, RolePresetDescription: e.target.value }))}
                      className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold resize-y"
                    />
                  </label>
                  <label className="block">
                    <span className="text-[10px] font-bold uppercase text-slate-400">Thứ tự (SortOrder)</span>
                    <input
                      type="number"
                      value={draft.SortOrder}
                      onChange={(e) => setDraft(prev => prev && ({ ...prev, SortOrder: Number(e.target.value) || 50 }))}
                      className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold"
                    />
                  </label>
                  {!draft.isNew && (
                    <label className="block">
                      <span className="text-[10px] font-bold uppercase text-slate-400">Mã (RolePresetID)</span>
                      <input
                        value={draft.RolePresetID}
                        readOnly
                        className="mt-1 w-full border border-slate-100 bg-slate-50 rounded-xl px-3 py-2 text-xs font-mono text-slate-500"
                      />
                    </label>
                  )}
                </div>

                {draft.RolePresetID === 'admin-khoa' ? (
                  <p className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl p-3 font-semibold">
                    Admin khoa luôn có toàn bộ module — không chỉnh danh sách module tại đây.
                  </p>
                ) : (
                  <div className="space-y-4">
                    <p className="text-[11px] font-black uppercase text-slate-500">
                      Module trong preset ({draft.moduleSet.size}/{ALL_APP_MODULES.length})
                    </p>
                    {groupedModules.map(({ group, modules }) => (
                      <div key={group}>
                        <p className="text-[10px] font-bold text-slate-400 uppercase mb-2">{group}</p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {modules.map(module => {
                            const checked = draft.moduleSet.has(module.id);
                            const locked = module.id === 'home' || module.id === 'workspace';
                            return (
                              <label
                                key={module.id}
                                className={`flex items-start gap-2 p-2 rounded-xl border cursor-pointer ${
                                  checked ? 'border-pink-200 bg-pink-50/50' : 'border-slate-150'
                                }`}
                              >
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  disabled={locked}
                                  onChange={() => toggleModule(module.id)}
                                  className="mt-0.5 rounded border-slate-300 text-primary"
                                />
                                <span className="text-[11px] font-bold text-slate-700">{getModuleLabel(module.id)}</span>
                              </label>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <div className="bg-slate-50 border border-slate-150 rounded-2xl p-3">
                  <p className="text-[10px] font-bold uppercase text-slate-400 mb-1">Permissions (lưu DB / Sheet)</p>
                  <code className="text-[10px] text-slate-600 break-all font-mono">
                    {draft.RolePresetID === 'admin-khoa'
                      ? serializePermissions(ALL_APP_MODULES)
                      : serializePermissions(draft.moduleSet)}
                  </code>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
