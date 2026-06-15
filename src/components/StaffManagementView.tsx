import React, { useMemo, useState } from 'react';
import {
  Copy,
  Search,
  Shield,
  UserCog,
  Save,
  Lock,
  UserX,
  UserCheck,
  ChevronRight,
  AlertTriangle,
  CheckCircle2,
} from 'lucide-react';
import type { Staff, RolePreset } from '../types';
import { removeDiacritics } from '../types';
import RolePresetMatrixPanel from './RolePresetMatrixPanel';
import {
  ALL_APP_MODULES,
  AppModule,
  AppModuleDefinition,
  canManageStaff,
  getPresetById,
  getRuntimeRolePresets,
  getStaffPermissions,
  inferPresetFromPermissions,
  isAdminStaff,
  modulesByGroup,
  parsePermissions,
  serializePermissions,
} from '../auth/permissions';

interface StaffManagementViewProps {
  staffList: Staff[];
  currentStaff: Staff | null;
  rolePresetRecords: RolePreset[];
  onRefreshData: () => void;
  onRefreshRolePresets: () => void;
  onPatchStaff?: (staffKey: string, patch: Partial<Staff>) => void;
  triggerAlert?: (message: string, title?: string) => void;
  triggerConfirm?: (message: string, onConfirm: () => void, title?: string) => void;
}

type StaffDraft = Partial<Staff> & { moduleSet: Set<AppModule> };

const emptyDraft = (): StaffDraft => ({
  StaffKey: '',
  StaffName: '',
  Name: '',
  Department: '',
  Career: '',
  Email: '',
  StaffPhone: '',
  Password: '',
  Role: 'User',
  FireDate: '',
  StaffRolePreset: 'dang-ky',
  Permissions: '',
  moduleSet: new Set<AppModule>(['home', 'workspace']),
});

export default function StaffManagementView({
  staffList,
  currentStaff,
  rolePresetRecords,
  onRefreshData,
  onRefreshRolePresets,
  onPatchStaff,
  triggerAlert,
  triggerConfirm,
}: StaffManagementViewProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [copyFromKey, setCopyFromKey] = useState('');
  const [draft, setDraft] = useState<StaffDraft>(emptyDraft());
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<'edit' | 'matrix'>('edit');

  const rolePresets = getRuntimeRolePresets();
  const groupedModules = useMemo(() => modulesByGroup(), []);

  const filteredStaff = useMemo(() => {
    let list = [...staffList];
    if (!showInactive) {
      list = list.filter(staff => !String(staff.FireDate || '').trim());
    }
    if (searchQuery.trim()) {
      const q = removeDiacritics(searchQuery).toLowerCase().trim();
      list = list.filter(staff => {
        const haystack = [
          staff.StaffKey,
          staff.StaffName,
          staff.Name,
          staff.Department,
          staff.Career,
          staff.Email,
          staff.Role,
          staff.StaffRolePreset,
        ]
          .map(value => removeDiacritics(String(value || '')).toLowerCase())
          .join(' ');
        return haystack.includes(q);
      });
    }
    return list.sort((a, b) => String(a.StaffName || '').localeCompare(String(b.StaffName || ''), 'vi'));
  }, [staffList, searchQuery, showInactive]);

  const selectedStaff = useMemo(
    () => staffList.find(staff => staff.StaffKey === selectedKey) || null,
    [staffList, selectedKey]
  );

  const loadDraftFromStaff = (staff: Staff) => {
    const modules = isAdminStaff(staff)
      ? new Set(ALL_APP_MODULES)
      : getStaffPermissions(staff);
    const presetId = staff.StaffRolePreset || inferPresetFromPermissions([...modules], rolePresets);

    setDraft({
      StaffKey: staff.StaffKey,
      StaffName: staff.StaffName || '',
      Name: staff.Name || '',
      Department: staff.Department || '',
      Career: staff.Career || '',
      Email: staff.Email || '',
      StaffPhone: staff.StaffPhone || '',
      Password: staff.Password || '',
      Role: staff.Role || 'User',
      FireDate: staff.FireDate || '',
      StaffRolePreset: presetId,
      Permissions: staff.Permissions || serializePermissions(modules),
      moduleSet: modules,
    });
  };

  const handleSelectStaff = (staff: Staff) => {
    setSelectedKey(staff.StaffKey);
    loadDraftFromStaff(staff);
    setActiveTab('edit');
  };

  const applyPreset = (presetId: string) => {
    const preset = getPresetById(presetId, rolePresets);
    if (!preset) return;
    setDraft(prev => ({
      ...prev,
      StaffRolePreset: presetId,
      moduleSet: new Set(preset.modules),
      Permissions: serializePermissions(preset.modules),
      Role: presetId === 'admin-khoa' ? 'Admin' : prev.Role === 'Admin' ? 'User' : prev.Role,
    }));
  };

  const handleCopyPermissions = () => {
    if (!copyFromKey || !draft.StaffKey) return;
    const source = staffList.find(staff => staff.StaffKey === copyFromKey);
    if (!source) {
      triggerAlert?.('Không tìm thấy nhân viên nguồn.', 'Lỗi');
      return;
    }
    const modules = isAdminStaff(source) ? new Set(ALL_APP_MODULES) : getStaffPermissions(source);
    setDraft(prev => ({
      ...prev,
      StaffRolePreset: source.StaffRolePreset || inferPresetFromPermissions([...modules], rolePresets),
      Permissions: serializePermissions(modules),
      moduleSet: modules,
    }));
    triggerAlert?.(`Đã sao chép quyền từ ${source.StaffName}. Bấm Lưu để áp dụng.`, 'Sao chép quyền');
  };

  const toggleModule = (module: AppModule) => {
    setDraft(prev => {
      const next = new Set<AppModule>(prev.moduleSet);
      if (next.has(module)) {
        if (module === 'home' || module === 'workspace') return prev;
        next.delete(module);
      } else {
        next.add(module);
      }
      const permissions = serializePermissions(next);
      return {
        ...prev,
        StaffRolePreset: 'tuy-chinh',
        moduleSet: next,
        Permissions: permissions,
      };
    });
  };

  const handleSave = async () => {
    if (!selectedStaff || !draft.StaffKey) return;
    if (!draft.StaffName?.trim()) {
      triggerAlert?.('Vui lòng nhập Họ tên hiển thị (StaffName)!', 'Thiếu thông tin');
      return;
    }
    if (!draft.Password?.trim()) {
      triggerAlert?.('Mật khẩu không được để trống!', 'Thiếu thông tin');
      return;
    }

    setSaving(true);

    const payload: Partial<Staff> = {
      StaffName: draft.StaffName?.trim(),
      Name: draft.Name?.trim() || '',
      Department: draft.Department?.trim() || '',
      Career: draft.Career?.trim() || '',
      Email: draft.Email?.trim() || '',
      StaffPhone: draft.StaffPhone?.trim() || '',
      Password: draft.Password,
      Role: draft.Role || 'User',
      FireDate: draft.FireDate || '',
      StaffRolePreset: isAdminStaff({ ...selectedStaff, Role: draft.Role }) ? 'admin-khoa' : draft.StaffRolePreset,
      Permissions: isAdminStaff({ ...selectedStaff, Role: draft.Role })
        ? serializePermissions(ALL_APP_MODULES)
        : serializePermissions(draft.moduleSet),
    };

    onPatchStaff?.(draft.StaffKey, payload);
    triggerAlert?.('Đã cập nhật nhân sự và phân quyền thành công!', 'Lưu thành công');

    fetch(`/api/staff/${encodeURIComponent(draft.StaffKey)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
      .then(async response => {
        if (!response.ok) {
          const err = await response.json().catch(() => ({}));
          throw new Error(err.error || 'Không thể lưu nhân sự');
        }
        onRefreshData();
      })
      .catch(error => {
        console.error(error);
        triggerAlert?.(error instanceof Error ? error.message : 'Lỗi khi lưu nhân sự', 'Lỗi');
        onRefreshData();
      })
      .finally(() => setSaving(false));
  };

  const handleToggleActive = () => {
    if (!selectedStaff) return;
    const isInactive = Boolean(String(draft.FireDate || '').trim());
    const proceed = () => {
      setDraft(prev => ({
        ...prev,
        FireDate: isInactive ? '' : new Date().toISOString().slice(0, 10),
      }));
    };
    if (triggerConfirm) {
      triggerConfirm(
        isInactive
          ? 'Kích hoạt lại tài khoản này? Nhân viên sẽ đăng nhập được trở lại.'
          : 'Vô hiệu hóa tài khoản này? Nhân viên sẽ không đăng nhập được (FireDate được ghi nhận).',
        proceed,
        isInactive ? 'Kích hoạt tài khoản' : 'Vô hiệu hóa tài khoản'
      );
    } else {
      proceed();
    }
  };

  if (!canManageStaff(currentStaff)) {
    return (
      <div className="h-full flex items-center justify-center p-8">
        <div className="max-w-md text-center bg-white border border-red-100 rounded-3xl p-8 shadow-sm">
          <div className="w-14 h-14 bg-red-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Lock className="w-7 h-7 text-red-500" />
          </div>
          <h2 className="text-lg font-extrabold text-slate-800 mb-2">Không có quyền truy cập</h2>
          <p className="text-sm text-slate-500 leading-relaxed">
            Module <strong>Quản lý nhân sự</strong> chỉ dành cho Admin hoặc tài khoản được cấp quyền{' '}
            <code className="text-[11px] bg-slate-100 px-1 rounded">staff-mgmt</code>.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col min-h-0 animate-in fade-in duration-300">
      <div className="shrink-0 mb-4 flex flex-col lg:flex-row lg:items-end justify-between gap-3">
        <div>
          <p className="text-[10px] font-black uppercase tracking-wider text-[#d2145a] mb-1 flex items-center gap-1.5">
            <Shield className="w-3.5 h-3.5" /> Module 6 · Quản lý nhân sự
          </p>
          <h2 className="text-xl font-extrabold text-slate-900">Phân quyền module & tài khoản</h2>
          <p className="text-xs text-slate-500 mt-1 max-w-2xl">
            Gán vai trò mẫu hoặc chọn từng module. Sidebar, Không gian làm việc và Truy cập nhanh (Home) sẽ ẩn/hiện theo quyền đã lưu.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setActiveTab('edit')}
            className={`px-3 py-1.5 rounded-xl text-[11px] font-bold border transition ${
              activeTab === 'edit'
                ? 'bg-[#d2145a] text-white border-[#d2145a]'
                : 'bg-white text-slate-600 border-slate-200 hover:border-pink-200'
            }`}
          >
            Chỉnh sửa nhân sự
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('matrix')}
            className={`px-3 py-1.5 rounded-xl text-[11px] font-bold border transition ${
              activeTab === 'matrix'
                ? 'bg-[#d2145a] text-white border-[#d2145a]'
                : 'bg-white text-slate-600 border-slate-200 hover:border-pink-200'
            }`}
          >
            Ma trận vai trò mẫu
          </button>
        </div>
      </div>

      {activeTab === 'matrix' ? (
        <RolePresetMatrixPanel
          rolePresetRecords={rolePresetRecords}
          onRefresh={onRefreshRolePresets}
          triggerAlert={triggerAlert}
          triggerConfirm={triggerConfirm}
        />
      ) : (
        <div className="flex-1 min-h-0 grid grid-cols-1 xl:grid-cols-12 gap-4">
          {/* Staff list */}
          <div className="xl:col-span-4 flex flex-col min-h-0 bg-white border border-slate-200 rounded-3xl overflow-hidden">
            <div className="p-4 border-b border-slate-100 space-y-3 shrink-0">
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Tìm mã NV, tên, khoa..."
                  className="w-full pl-9 pr-3 py-2 text-xs border border-slate-200 rounded-xl focus:outline-none focus:border-pink-300"
                />
              </div>
              <label className="flex items-center gap-2 text-[11px] font-semibold text-slate-600 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showInactive}
                  onChange={(e) => setShowInactive(e.target.checked)}
                  className="rounded border-slate-300 text-[#d2145a] focus:ring-pink-300"
                />
                Hiện cả tài khoản đã nghỉ (FireDate)
              </label>
            </div>
            <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
              {filteredStaff.length === 0 ? (
                <p className="p-6 text-center text-xs text-slate-400 font-semibold">Không có nhân sự khớp bộ lọc</p>
              ) : (
                filteredStaff.map(staff => {
                  const inactive = Boolean(String(staff.FireDate || '').trim());
                  const permCount = getStaffPermissions(staff).size;
                  const isSelected = staff.StaffKey === selectedKey;
                  return (
                    <button
                      key={staff.StaffKey}
                      type="button"
                      onClick={() => handleSelectStaff(staff)}
                      className={`w-full text-left p-3.5 transition flex items-center gap-3 ${
                        isSelected ? 'bg-pink-50 border-l-4 border-[#d2145a]' : 'hover:bg-slate-50 border-l-4 border-transparent'
                      }`}
                    >
                      <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 text-[11px] font-black ${
                        isAdminStaff(staff) ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-600'
                      }`}>
                        {(staff.Name || staff.StaffName || '?').slice(0, 2).toUpperCase()}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-extrabold text-xs text-slate-800 truncate">{staff.StaffName}</p>
                        <p className="text-[10px] text-slate-400 font-mono truncate">
                          {staff.StaffKey} · {staff.Role || 'User'}
                          {inactive ? ' · Đã nghỉ' : ''}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-[10px] font-bold text-[#d2145a]">{permCount} module</p>
                        <ChevronRight className="w-4 h-4 text-slate-300 ml-auto" />
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          {/* Edit panel */}
          <div className="xl:col-span-8 flex flex-col min-h-0 bg-white border border-slate-200 rounded-3xl overflow-hidden">
            {!selectedStaff ? (
              <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
                <UserCog className="w-12 h-12 text-slate-200 mb-3" />
                <p className="text-sm font-bold text-slate-500">Chọn một nhân viên bên trái để chỉnh sửa</p>
              </div>
            ) : (
              <>
                <div className="p-4 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3 shrink-0">
                  <div>
                    <h3 className="font-extrabold text-base text-slate-900">{draft.StaffName}</h3>
                    <p className="text-[11px] text-slate-500 font-mono">StaffKey: {draft.StaffKey}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleToggleActive}
                      className={`text-[11px] font-bold px-3 py-1.5 rounded-xl border flex items-center gap-1.5 transition ${
                        draft.FireDate
                          ? 'border-emerald-200 text-emerald-700 hover:bg-emerald-50'
                          : 'border-amber-200 text-amber-700 hover:bg-amber-50'
                      }`}
                    >
                      {draft.FireDate ? <UserCheck className="w-3.5 h-3.5" /> : <UserX className="w-3.5 h-3.5" />}
                      {draft.FireDate ? 'Kích hoạt lại' : 'Vô hiệu hóa'}
                    </button>
                    <button
                      type="button"
                      onClick={handleSave}
                      disabled={saving}
                      className="text-[11px] font-bold px-4 py-1.5 rounded-xl bg-[#d2145a] hover:bg-[#b8124e] text-white flex items-center gap-1.5 disabled:opacity-60 transition"
                    >
                      <Save className="w-3.5 h-3.5" />
                      {saving ? 'Đang lưu...' : 'Lưu thay đổi'}
                    </button>
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-5">
                  {draft.FireDate && (
                    <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-2xl p-3 text-[11px] text-amber-800">
                      <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                      <span>Tài khoản đã vô hiệu hóa từ {draft.FireDate}. Lưu để áp dụng.</span>
                    </div>
                  )}

                  <section className="bg-indigo-50/60 border border-indigo-100 rounded-2xl p-3">
                    <p className="text-[10px] font-black uppercase text-indigo-500 mb-2 flex items-center gap-1">
                      <Copy className="w-3 h-3" /> Sao chép quyền từ nhân viên khác
                    </p>
                    <div className="flex flex-col sm:flex-row gap-2">
                      <select
                        value={copyFromKey}
                        onChange={(e) => setCopyFromKey(e.target.value)}
                        className="flex-1 border border-indigo-100 rounded-xl px-3 py-2 text-xs font-semibold bg-white"
                      >
                        <option value="">Chọn nhân viên nguồn...</option>
                        {staffList
                          .filter(staff => staff.StaffKey !== draft.StaffKey && !String(staff.FireDate || '').trim())
                          .map(staff => (
                            <option key={staff.StaffKey} value={staff.StaffKey}>
                              {staff.StaffName} ({staff.StaffKey}) — {getStaffPermissions(staff).size} module
                            </option>
                          ))}
                      </select>
                      <button
                        type="button"
                        onClick={handleCopyPermissions}
                        disabled={!copyFromKey}
                        className="text-[11px] font-bold px-4 py-2 rounded-xl border border-indigo-200 text-indigo-700 hover:bg-indigo-100 disabled:opacity-40 shrink-0"
                      >
                        Sao chép
                      </button>
                    </div>
                  </section>

                  <section className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <label className="block">
                      <span className="text-[10px] font-bold uppercase text-slate-400">StaffName (hiển thị)</span>
                      <input
                        value={draft.StaffName || ''}
                        onChange={(e) => setDraft(prev => ({ ...prev, StaffName: e.target.value }))}
                        className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold"
                      />
                    </label>
                    <label className="block">
                      <span className="text-[10px] font-bold uppercase text-slate-400">Name (tên ngắn)</span>
                      <input
                        value={draft.Name || ''}
                        onChange={(e) => setDraft(prev => ({ ...prev, Name: e.target.value }))}
                        className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold"
                      />
                    </label>
                    <label className="block">
                      <span className="text-[10px] font-bold uppercase text-slate-400">Department</span>
                      <input
                        value={draft.Department || ''}
                        onChange={(e) => setDraft(prev => ({ ...prev, Department: e.target.value }))}
                        className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold"
                      />
                    </label>
                    <label className="block">
                      <span className="text-[10px] font-bold uppercase text-slate-400">Career</span>
                      <input
                        value={draft.Career || ''}
                        onChange={(e) => setDraft(prev => ({ ...prev, Career: e.target.value }))}
                        className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold"
                      />
                    </label>
                    <label className="block">
                      <span className="text-[10px] font-bold uppercase text-slate-400">Email</span>
                      <input
                        value={draft.Email || ''}
                        onChange={(e) => setDraft(prev => ({ ...prev, Email: e.target.value }))}
                        className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold"
                      />
                    </label>
                    <label className="block">
                      <span className="text-[10px] font-bold uppercase text-slate-400">StaffPhone</span>
                      <input
                        value={draft.StaffPhone || ''}
                        onChange={(e) => setDraft(prev => ({ ...prev, StaffPhone: e.target.value }))}
                        className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold"
                      />
                    </label>
                    <label className="block">
                      <span className="text-[10px] font-bold uppercase text-slate-400">Role (legacy)</span>
                      <select
                        value={draft.Role || 'User'}
                        onChange={(e) => {
                          const role = e.target.value;
                          setDraft(prev => {
                            const next = { ...prev, Role: role };
                            if (role === 'Admin') {
                              next.StaffRolePreset = 'admin-khoa';
                              next.moduleSet = new Set(ALL_APP_MODULES);
                              next.Permissions = serializePermissions(ALL_APP_MODULES);
                            }
                            return next;
                          });
                        }}
                        className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold bg-white"
                      >
                        <option value="User">User</option>
                        <option value="Admin">Admin</option>
                      </select>
                    </label>
                    <label className="block">
                      <span className="text-[10px] font-bold uppercase text-slate-400">Password</span>
                      <input
                        type="text"
                        value={draft.Password || ''}
                        onChange={(e) => setDraft(prev => ({ ...prev, Password: e.target.value }))}
                        className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2 text-xs font-mono"
                      />
                    </label>
                  </section>

                  <section>
                    <h4 className="text-[11px] font-black uppercase text-slate-500 mb-2">Vai trò mẫu (Preset)</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      {rolePresets.map(preset => {
                        const active = draft.StaffRolePreset === preset.id;
                        return (
                          <button
                            key={preset.id}
                            type="button"
                            onClick={() => applyPreset(preset.id)}
                            disabled={draft.Role === 'Admin' && preset.id !== 'admin-khoa'}
                            className={`text-left p-3 rounded-2xl border transition ${
                              active
                                ? 'border-[#d2145a] bg-pink-50 ring-1 ring-pink-200'
                                : 'border-slate-200 hover:border-pink-200 bg-white'
                            } disabled:opacity-40`}
                          >
                            <p className="font-extrabold text-xs text-slate-800 flex items-center gap-1.5">
                              {active && <CheckCircle2 className="w-3.5 h-3.5 text-[#d2145a]" />}
                              {preset.label}
                            </p>
                            <p className="text-[10px] text-slate-500 mt-0.5 line-clamp-2">{preset.description}</p>
                          </button>
                        );
                      })}
                    </div>
                  </section>

                  <section>
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="text-[11px] font-black uppercase text-slate-500">Module được phép</h4>
                      <span className="text-[10px] font-mono text-slate-400">{draft.moduleSet.size} / {ALL_APP_MODULES.length}</span>
                    </div>
                    {draft.Role === 'Admin' ? (
                      <p className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl p-3 font-semibold">
                        Role Admin → tự động có toàn bộ module.
                      </p>
                    ) : (
                      <div className="space-y-4">
                        {(Object.entries(groupedModules) as [string, AppModuleDefinition[]][]).map(([group, modules]) => (
                          <div key={group}>
                            <p className="text-[10px] font-bold text-slate-400 uppercase mb-2">{group}</p>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                              {modules.map(module => {
                                const checked = draft.moduleSet.has(module.id);
                                const locked = module.id === 'home' || module.id === 'workspace';
                                return (
                                  <label
                                    key={module.id}
                                    className={`flex items-start gap-2 p-2.5 rounded-xl border cursor-pointer transition ${
                                      checked ? 'border-pink-200 bg-pink-50/50' : 'border-slate-150 bg-slate-50/40'
                                    } ${locked ? 'opacity-80' : ''}`}
                                  >
                                    <input
                                      type="checkbox"
                                      checked={checked}
                                      disabled={locked || draft.Role === 'Admin'}
                                      onChange={() => toggleModule(module.id)}
                                      className="mt-0.5 rounded border-slate-300 text-[#d2145a]"
                                    />
                                    <span className="min-w-0">
                                      <span className="block text-[11px] font-bold text-slate-800">{module.label}</span>
                                      <span className="block text-[10px] text-slate-500">{module.description}</span>
                                      <span className="block text-[9px] font-mono text-slate-400 mt-0.5">{module.id}</span>
                                    </span>
                                  </label>
                                );
                              })}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </section>

                  <section className="bg-slate-50 border border-slate-150 rounded-2xl p-3">
                    <p className="text-[10px] font-bold uppercase text-slate-400 mb-1">Permissions (lưu DB)</p>
                    <code className="text-[10px] text-slate-600 break-all font-mono">
                      {draft.Role === 'Admin' ? serializePermissions(ALL_APP_MODULES) : draft.Permissions}
                    </code>
                  </section>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
