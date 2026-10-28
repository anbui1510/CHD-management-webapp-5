import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Copy,
  Search,
  Shield,
  UserCog,
  Award,
  Save,
  Lock,
  UserX,
  UserCheck,
  ChevronRight,
  AlertTriangle,
  CheckCircle2,
  HelpCircle,
  Layers,
  Info,
} from 'lucide-react';
import type { DoctorPerformanceMark, Staff, RolePreset, Source } from '../types';
import { formatVNTime, removeDiacritics } from '../types';
import RolePresetMatrixPanel from './RolePresetMatrixPanel';
import CategorySettingsPanel from './CategorySettingsPanel';
import {
  ALL_APP_MODULES,
  AppModule,
  AppModuleDefinition,
  canManageStaff,
  getPresetById,
  getRuntimeRolePresets,
  getStaffPermissions,
  canAccessStaffManagementTab,
  getOrderedModulesByGroup,
  inferPresetFromPermissions,
  isAdminStaff,
  parsePermissions,
  serializePermissions,
} from '../auth/permissions';
import { useModuleSubheader } from '../hooks/useModuleSubheader';
import { SearchTextInput } from './SearchTextInput';
import { useSheetsSyncFeedback } from '../context/SheetsSyncFeedbackContext';
import { buildSyncContext, persistWithSheetsSync } from '../utils/sheetsSyncMutation';
import { MODAL_TITLE } from '../utils/modalTitles';

interface StaffManagementViewProps {
  staffList: Staff[];
  currentStaff: Staff | null;
  rolePresetRecords: RolePreset[];
  doctorPerformanceMarks?: DoctorPerformanceMark[];
  sources?: Source[];
  initialTab?: 'edit' | 'matrix' | 'marks' | 'settings' | 'guide';
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
  doctorPerformanceMarks = [],
  sources = [],
  initialTab = 'edit',
  onRefreshData,
  onRefreshRolePresets,
  onPatchStaff,
  triggerAlert,
  triggerConfirm,
}: StaffManagementViewProps) {
  const { reportMutationResponse } = useSheetsSyncFeedback();
  const [searchQuery, setSearchQuery] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [copyFromKey, setCopyFromKey] = useState('');
  const [draft, setDraft] = useState<StaffDraft>(emptyDraft());
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<'edit' | 'matrix' | 'marks' | 'settings' | 'guide'>(initialTab);

  const rolePresets = getRuntimeRolePresets();
  const groupedModules = useMemo(() => getOrderedModulesByGroup(), []);

  const staffTabs = useMemo(() => {
    const tabs: Array<{ id: 'edit' | 'matrix' | 'marks' | 'settings' | 'guide'; label: string }> = [
      { id: 'edit', label: 'Chỉnh sửa nhân sự' },
      { id: 'matrix', label: 'Ma trận vai trò mẫu' },
      { id: 'marks', label: 'Thống kê sẹo' },
      { id: 'settings', label: 'Cài đặt danh mục' },
      { id: 'guide', label: 'Hướng dẫn sử dụng' },
    ];
    return tabs.filter(tab => canAccessStaffManagementTab(currentStaff, tab.id));
  }, [currentStaff]);

  useEffect(() => {
    if (!staffTabs.some(tab => tab.id === activeTab)) {
      setActiveTab(staffTabs[0]?.id || 'edit');
    }
  }, [activeTab, staffTabs]);

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

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

  const markStats = useMemo(() => {
    const staffMap = new Map(staffList.map(staff => [String(staff.StaffKey || ''), staff]));
    const grouped = new Map<string, {
      staff: Staff | null;
      totalScore: number;
      count: number;
      latestTime: string;
      marks: DoctorPerformanceMark[];
    }>();

    doctorPerformanceMarks.forEach(mark => {
      const staffKey = String(mark.StaffKey || '').trim();
      if (!staffKey) return;
      const current = grouped.get(staffKey) || {
        staff: staffMap.get(staffKey) || null,
        totalScore: 0,
        count: 0,
        latestTime: '',
        marks: [],
      };
      current.totalScore += Number(mark.Score || 1);
      current.count += 1;
      current.latestTime = String(mark.CreatedTime || '') > current.latestTime ? String(mark.CreatedTime || '') : current.latestTime;
      current.marks.push(mark);
      grouped.set(staffKey, current);
    });

    const rows = Array.from(grouped.entries())
      .map(([staffKey, value]) => ({
        staffKey,
        staffName: value.staff?.StaffName || value.marks[0]?.StaffName || staffKey,
        shortName: value.staff?.Name || value.marks[0]?.StaffName || '',
        totalScore: value.totalScore,
        count: value.count,
        latestTime: value.latestTime,
        marks: value.marks.sort((a, b) => String(b.CreatedTime || '').localeCompare(String(a.CreatedTime || ''))),
      }))
      .sort((a, b) => b.totalScore - a.totalScore || b.count - a.count || a.staffName.localeCompare(b.staffName, 'vi'));

    const recentMarks = [...doctorPerformanceMarks].sort((a, b) => String(b.CreatedTime || '').localeCompare(String(a.CreatedTime || ''))).slice(0, 20);

    return {
      totalScore: rows.reduce((sum, row) => sum + row.totalScore, 0),
      totalEvents: doctorPerformanceMarks.length,
      affectedStaff: rows.length,
      rows,
      recentMarks,
    };
  }, [doctorPerformanceMarks, staffList]);

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
      triggerAlert?.('Không tìm thấy nhân viên nguồn.', MODAL_TITLE.notify);
      return;
    }
    const modules = isAdminStaff(source) ? new Set(ALL_APP_MODULES) : getStaffPermissions(source);
    setDraft(prev => ({
      ...prev,
      StaffRolePreset: source.StaffRolePreset || inferPresetFromPermissions([...modules], rolePresets),
      Permissions: serializePermissions(modules),
      moduleSet: modules,
    }));
    triggerAlert?.(`Đã sao chép quyền từ ${source.StaffName}. Bấm Lưu để áp dụng.`, MODAL_TITLE.notify);
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
      triggerAlert?.('Vui lòng nhập Họ tên hiển thị (StaffName)!', MODAL_TITLE.missingInfo);
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
      Role: draft.Role || 'User',
      FireDate: draft.FireDate || '',
      StaffRolePreset: isAdminStaff({ ...selectedStaff, Role: draft.Role }) ? 'admin-khoa' : draft.StaffRolePreset,
      Permissions: isAdminStaff({ ...selectedStaff, Role: draft.Role })
        ? serializePermissions(ALL_APP_MODULES)
        : serializePermissions(draft.moduleSet),
    };

    if (draft.Password && draft.Password.trim() !== '') {
      payload.Password = draft.Password.trim();
    }

    onPatchStaff?.(draft.StaffKey, payload);

    persistWithSheetsSync(
      reportMutationResponse,
      `/api/staff/${encodeURIComponent(draft.StaffKey)}`,
      { method: 'PUT', body: JSON.stringify(payload) },
      buildSyncContext('staff-mgmt', { viewLabel: 'Quản lý nhân sự' }),
      { baseMessage: 'Đã cập nhật nhân sự và phân quyền' }
    )
      .then(() => onRefreshData())
      .catch(error => {
        console.error(error);
        triggerAlert?.(error instanceof Error ? error.message : 'Lỗi khi lưu nhân sự', MODAL_TITLE.saveError);
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
        <div className="max-w-md text-center bg-white border border-red-100 rounded-xl p-8 shadow-sm">
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

  const handleSubheaderSearch = useCallback((value: string) => {
    setSearchQuery(value);
  }, []);

  useModuleSubheader('staff-mgmt', {
    icon: <UserCog className="w-4 h-4" />,
    searchValue: searchQuery,
    onSearchChange: handleSubheaderSearch,
    searchPlaceholder: 'Tìm mã NV, tên, khoa...',
  });

  return (
    <div className="h-full flex flex-col min-h-0 animate-in fade-in duration-300 p-6 md:p-8 bg-slate-50 overflow-hidden">
      <div className="shrink-0 mb-4 md:hidden flex flex-col gap-3">
        <div>
          <p className="text-[10px] font-black uppercase tracking-wider text-primary mb-1 flex items-center gap-1.5">
            <Shield className="w-3.5 h-3.5" /> Module 6 · Quản lý nhân sự
          </p>
          <h2 className="text-xl font-extrabold text-slate-900">Phân quyền module & tài khoản</h2>
          <p className="text-xs text-slate-500 mt-1 max-w-2xl">
            Gán vai trò mẫu hoặc chọn từng module. Sidebar, Không gian làm việc và Truy cập nhanh (Home) sẽ ẩn/hiện theo quyền đã lưu.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {staffTabs.map(tab => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`px-3 py-1.5 rounded-xl text-[11px] font-bold border transition ${
                activeTab === tab.id
                  ? 'bg-primary text-white border-primary'
                  : 'bg-white text-slate-600 border-slate-200 hover:border-pink-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {activeTab === 'matrix' ? (
        <RolePresetMatrixPanel
          rolePresetRecords={rolePresetRecords}
          onRefresh={onRefreshRolePresets}
          triggerAlert={triggerAlert}
          triggerConfirm={triggerConfirm}
        />
      ) : activeTab === 'settings' ? (
        <CategorySettingsPanel
          sources={sources}
          onRefreshData={onRefreshData}
          triggerAlert={triggerAlert}
          triggerConfirm={triggerConfirm}
        />
      ) : activeTab === 'guide' ? (
        <div className="flex-1 min-h-0 overflow-y-auto space-y-6 animate-in fade-in duration-200 pr-1 select-text">
          {/* Card 1: Workflow */}
          <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
            <h3 className="text-sm font-extrabold text-slate-900 flex items-center gap-2 mb-3">
              <span className="w-8 h-8 rounded-xl bg-indigo-50 flex items-center justify-center text-indigo-650 shrink-0">
                <Layers className="w-4 h-4" />
              </span>
              1. Quy trình Nghiệp vụ Chuẩn (Core System Workflow)
            </h3>
            <p className="text-xs text-slate-500 mb-4 leading-relaxed">
              Quy trình chuẩn của một bệnh nhi từ lúc tiếp nhận phòng khám đến khi thực hiện thủ thuật/phẫu thuật diễn ra qua 4 bước khép kín dưới đây:
            </p>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3 relative">
              <div className="bg-slate-50 rounded-2xl p-3 border border-slate-100 flex flex-col justify-between">
                <div>
                  <span className="inline-block text-[9px] font-black uppercase text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full mb-2">Bước 1</span>
                  <h4 className="text-xs font-bold text-slate-800 mb-1">Đăng ký Hội chẩn</h4>
                  <p className="text-[11px] text-slate-500 leading-snug">Bác sĩ điều trị tạo phiếu hội chẩn (Staff mổ/Staff thông). Ca bệnh hiển thị trong Chờ hội chẩn.</p>
                </div>
              </div>
              <div className="bg-slate-50 rounded-2xl p-3 border border-slate-100 flex flex-col justify-between">
                <div>
                  <span className="inline-block text-[9px] font-black uppercase text-pink-600 bg-pink-50 px-2 py-0.5 rounded-full mb-2">Bước 2</span>
                  <h4 className="text-xs font-bold text-slate-800 mb-1">Hội chẩn & Kết luận</h4>
                  <p className="text-[11px] text-slate-500 leading-snug">Hội đồng họp, BS thư ký hội chẩn nhập kết luận chính, dự kiến dụng cụ và giá tiền.</p>
                </div>
              </div>
              <div className="bg-slate-50 rounded-2xl p-3 border border-slate-100 flex flex-col justify-between">
                <div>
                  <span className="inline-block text-[9px] font-black uppercase text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full mb-2">Bước 3</span>
                  <h4 className="text-xs font-bold text-slate-800 mb-1">Xếp lịch & Duyệt dụng cụ</h4>
                  <p className="text-[11px] text-slate-500 leading-snug">Check dụng cụ, BS xếp lịch chọn ngày can thiệp dự kiến, phân công kíp mổ/can thiệp và chuyển phòng.</p>
                </div>
              </div>
              <div className="bg-slate-50 rounded-2xl p-3 border border-slate-100 flex flex-col justify-between">
                <div>
                  <span className="inline-block text-[9px] font-black uppercase text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full mb-2">Bước 4</span>
                  <h4 className="text-xs font-bold text-slate-800 mb-1">Cập nhật Kết quả</h4>
                  <p className="text-[11px] text-slate-500 leading-snug">Sau can thiệp, kíp can thiệp cập nhật chẩn đoán/kết quả thực tế của bệnh nhân.</p>
                </div>
              </div>
            </div>
          </div>

          {/* Card 2: Scar Regulations */}
          <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
            <h3 className="text-sm font-extrabold text-slate-900 flex items-center gap-2 mb-3">
              <span className="w-8 h-8 rounded-xl bg-red-50 flex items-center justify-center text-red-650 shrink-0">
                <Award className="w-4 h-4" />
              </span>
              2. Cơ chế giám sát tự động & Quy định phạt sẹo (Workflow Scars)
            </h3>
            <p className="text-xs text-slate-500 mb-4 leading-relaxed">
              Hệ thống tự động quét dữ liệu và chấm điểm phạt sẹo workflow đối với các bác sĩ/nhân sự vi phạm quy trình làm treo hoặc trễ dữ liệu:
            </p>
            <div className="space-y-3">
              <div className="flex items-start gap-3 p-3 bg-red-50/30 rounded-2xl border border-red-100">
                <span className="shrink-0 text-red-700 bg-red-100 rounded-full px-2 py-0.5 text-[10px] font-black font-mono mt-0.5">-1 Sẹo</span>
                <div>
                  <h4 className="text-xs font-bold text-slate-800">Trễ điền kết quả hội chẩn (`missing_staff_result`)</h4>
                  <p className="text-[11px] text-slate-600 mt-0.5 leading-relaxed">
                    <strong>Điều kiện phạt:</strong> Ca chương trình thực hiện thông tim thực tế (ghi nhận từ HIS) hoặc bị vượt quyền xếp lịch, nhưng kết quả hội chẩn vẫn để trống.
                  </p>
                  <p className="text-[10px] text-slate-400 mt-1"><strong>Người chịu trách nhiệm:</strong> Bác sĩ thư ký hội chẩn (BS. Tài) hoặc Bác sĩ đăng ký ca.</p>
                </div>
              </div>

              <div className="flex items-start gap-3 p-3 bg-red-50/30 rounded-2xl border border-red-100">
                <span className="shrink-0 text-red-700 bg-red-100 rounded-full px-2 py-0.5 text-[10px] font-black font-mono mt-0.5">-1 Sẹo</span>
                <div>
                  <h4 className="text-xs font-bold text-slate-800">Chậm chuyển phòng / Bỏ qua hội chẩn (`scheduler_missing_transfer`)</h4>
                  <p className="text-[11px] text-slate-600 mt-0.5 leading-relaxed">
                    <strong>Điều kiện phạt:</strong> Bệnh nhi đã có kết quả chỉ định thông tim chương trình nhưng BS xếp lịch không thao tác chuyển phòng đúng hạn, hoặc ca chương trình được đưa thẳng vào CathLab mà không đi qua hội chẩn hệ thống.
                  </p>
                  <p className="text-[10px] text-slate-400 mt-1"><strong>Người chịu trách nhiệm:</strong> Bác sĩ điều phối / Bác sĩ xếp lịch (BS. Hiếu) hoặc người kiểm dụng cụ.</p>
                </div>
              </div>

              <div className="flex items-start gap-3 p-3 bg-red-50/30 rounded-2xl border border-red-100">
                <span className="shrink-0 text-red-750 bg-red-200 rounded-full px-2 py-0.5 text-[10px] font-black font-mono mt-0.5">-2 Sẹo</span>
                <div>
                  <h4 className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                    Chưa nhập kết quả thông tim thực tế (`missing_cath_result`)
                    <span className="text-[9px] font-bold text-red-700 bg-red-100 px-1.5 py-0.2 rounded uppercase">Nghiêm trọng</span>
                  </h4>
                  <p className="text-[11px] text-slate-600 mt-0.5 leading-relaxed">
                    <strong>Điều kiện phạt:</strong> Ca bệnh đã hoàn tất can thiệp thực tế theo số liệu từ HIS, nhưng kíp can thiệp chưa điền chi tiết kết luận, phương pháp và hướng điều trị tiếp theo của ca thông tim đó trên ứng dụng.
                  </p>
                  <p className="text-[10px] text-slate-400 mt-1"><strong>Người chịu trách nhiệm:</strong> Phẫu thuật viên/Bác sĩ can thiệp chính (PTV chính / `_1stInterventionist`).</p>
                </div>
              </div>
            </div>
          </div>

          {/* Card 3: Override and Exemptions */}
          <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
            <h3 className="text-sm font-extrabold text-slate-900 flex items-center gap-2 mb-3">
              <span className="w-8 h-8 rounded-xl bg-amber-50 flex items-center justify-center text-amber-600 shrink-0">
                <AlertTriangle className="w-4 h-4" />
              </span>
              3. Cơ chế Vượt quyền (Override) & Miễn trừ Cấp cứu (Exemptions)
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-amber-50/40 rounded-2xl p-4 border border-amber-100">
                <h4 className="text-xs font-bold text-amber-800 flex items-center gap-1.5 mb-1.5">
                  <Lock className="w-3.5 h-3.5" /> Vượt quyền xếp lịch bổ sung
                </h4>
                <p className="text-[11px] text-slate-600 leading-relaxed">
                  Khi đến hạn xếp lịch cho bệnh nhi mà BS thư ký hội chẩn chưa nhập kết quả staff, BS điều phối được cấp quyền <strong>"Vượt quyền kích hoạt"</strong> để tiếp tục xếp lịch.
                </p>
                <p className="text-[11px] text-red-700 font-bold mt-2">
                  ⚠️ Hậu quả: Hệ thống tự động phạt 1 sẹo đối với BS thư ký vì trễ việc điền thông tin và gửi thông báo cảnh báo.
                </p>
              </div>

              <div className="bg-emerald-50/40 rounded-2xl p-4 border border-emerald-100">
                <h4 className="text-xs font-bold text-emerald-800 flex items-center gap-1.5 mb-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Miễn trừ đối với ca Cấp cứu
                </h4>
                <p className="text-[11px] text-slate-600 leading-relaxed">
                  Các ca có trạng thái ưu tiên là <strong>Cấp cứu (Emergency)</strong> hoặc <strong>Làm sớm (Ưu tiên)</strong> được phép bypass các bước đăng ký/hội chẩn trước để đẩy thẳng vào CathLab nhằm xử trí kịp thời.
                </p>
                <p className="text-[11px] text-emerald-700 font-bold mt-2">
                  ✅ Miễn trừ: Hệ thống sẽ tự động miễn phạt sẹo cho kíp điều phối trong trường hợp vượt quyền cấp cứu này.
                </p>
              </div>
            </div>
          </div>

          {/* Card 4: Address Warning */}
          <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
            <h3 className="text-sm font-extrabold text-slate-900 flex items-center gap-2 mb-3">
              <span className="w-8 h-8 rounded-xl bg-rose-50 flex items-center justify-center text-rose-600 shrink-0">
                <Info className="w-4 h-4" />
              </span>
              4. Cảnh báo hành chính & Địa chỉ mặc định
            </h3>
            <div className="flex flex-col md:flex-row gap-4 items-start">
              <div className="flex-1">
                <p className="text-xs text-slate-600 leading-relaxed mb-3">
                  Khi dữ liệu bệnh nhân được import tự động từ cổng HIS bệnh viện mà chưa có thông tin địa chỉ thật, hệ thống sẽ tự động gán địa chỉ tạm kèm chuỗi cảnh báo đặc biệt:
                </p>
                <div className="bg-amber-50 border border-amber-200 text-amber-900 rounded-2xl p-3 text-[11px] font-bold flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <span>Cảnh báo: Bệnh nhân import tự động từ HIS chưa có địa chỉ thật. Vui lòng hỏi và cập nhật địa chỉ chính xác.</span>
                </div>
              </div>
              <div className="md:w-64 bg-slate-50 border border-slate-100 rounded-2xl p-3 shrink-0">
                <h4 className="text-[10px] font-black uppercase text-slate-400 mb-1">Hướng xử lý dành cho nhân viên</h4>
                <p className="text-[11px] text-slate-500 leading-snug">
                  Khi mở Hồ sơ bệnh nhi, nếu thấy cảnh báo này xuất hiện, vui lòng cập nhật lại địa chỉ đúng bằng cách nhấn nút "Sửa hành chính", chọn tỉnh thành đúng và bấm Lưu để xóa cảnh báo.
                </p>
              </div>
            </div>
          </div>

          {/* Card 5: Role Matrix */}
          <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
            <h3 className="text-sm font-extrabold text-slate-900 flex items-center gap-2 mb-3">
              <span className="w-8 h-8 rounded-xl bg-emerald-50 flex items-center justify-center text-emerald-650 shrink-0">
                <Shield className="w-4 h-4" />
              </span>
              5. Tóm tắt phân quyền theo vai trò mẫu (Role Presets)
            </h3>
            <p className="text-xs text-slate-500 mb-4 leading-relaxed">
              Các vai trò mẫu giúp gán nhanh tổ hợp quyền của các module chức năng. Dưới đây là tóm tắt phạm vi quyền hạn của các vị trí chủ chốt:
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="bg-slate-50 border border-slate-100 rounded-2xl p-3">
                <h4 className="text-xs font-black text-primary mb-1">Admin khoa tim mạch</h4>
                <p className="text-[10px] text-slate-500 leading-relaxed">
                  Có toàn quyền truy cập mọi module, quản lý nhân viên y tế, gán vai trò, cấu hình danh mục và chỉnh sửa các tham số nghiệp vụ.
                </p>
              </div>
              <div className="bg-slate-50 border border-slate-100 rounded-2xl p-3">
                <h4 className="text-xs font-black text-indigo-700 mb-1">Bác sĩ hội chẩn</h4>
                <p className="text-[10px] text-slate-500 leading-relaxed">
                  Quyền xem hồ sơ bệnh nhân, tham gia hội chẩn, tạo các phiếu chỉ định điều trị và theo dõi tiến trình ca bệnh.
                </p>
              </div>
              <div className="bg-slate-50 border border-slate-100 rounded-2xl p-3">
                <h4 className="text-xs font-black text-amber-700 mb-1">Bác sĩ thư ký staff</h4>
                <p className="text-[10px] text-slate-500 leading-relaxed">
                  Có thêm quyền ghi biên bản hội chẩn, nhập kết luận chính, chọn dụng cụ dự kiến và chịu trách nhiệm nhập dữ liệu kết quả staff.
                </p>
              </div>
              <div className="bg-slate-50 border border-slate-100 rounded-2xl p-3">
                <h4 className="text-xs font-black text-emerald-700 mb-1">Điều phối & Xếp lịch</h4>
                <p className="text-[10px] text-slate-500 leading-relaxed">
                  Quản lý sắp lịch phòng thông tim/mổ, kiểm tra dụng cụ và chuyển phòng các ca bệnh đã đủ điều kiện can thiệp.
                </p>
              </div>
            </div>
          </div>
        </div>
      ) : activeTab === 'marks' ? (
        <div className="flex-1 min-h-0 grid grid-cols-1 xl:grid-cols-12 gap-4">
          <div className="xl:col-span-4 grid grid-cols-1 sm:grid-cols-3 xl:grid-cols-1 gap-3 h-fit">
            <div className="bg-white border border-red-100 rounded-xl p-4 shadow-sm">
              <p className="text-[10px] font-black uppercase tracking-wider text-red-400">Tổng sẹo</p>
              <p className="text-4xl font-black font-mono text-red-700 mt-2">{markStats.totalScore}</p>
              <p className="text-[11px] font-bold text-slate-400 mt-1">{markStats.totalEvents} sự kiện được ghi nhận</p>
            </div>
            <div className="bg-white border border-amber-100 rounded-xl p-4 shadow-sm">
              <p className="text-[10px] font-black uppercase tracking-wider text-amber-500">Nhân sự có sẹo</p>
              <p className="text-4xl font-black font-mono text-amber-700 mt-2">{markStats.affectedStaff}</p>
              <p className="text-[11px] font-bold text-slate-400 mt-1">Tính trên toàn bộ dữ liệu hiện có</p>
            </div>
            <div className="bg-white border border-slate-150 rounded-xl p-4 shadow-sm">
              <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Cập nhật mới nhất</p>
              <p className="text-lg font-black text-slate-800 mt-2">
                {markStats.recentMarks[0]?.CreatedTime ? formatVNTime(markStats.recentMarks[0].CreatedTime) : '—'}
              </p>
              <p className="text-[11px] font-bold text-slate-400 mt-1">Theo bảng DoctorPerformanceMark</p>
            </div>
          </div>

          <div className="xl:col-span-8 flex flex-col min-h-0 gap-4">
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
              <div className="p-4 border-b border-slate-100 flex items-center justify-between gap-3">
                <div>
                  <h3 className="font-extrabold text-sm text-slate-900 flex items-center gap-2">
                    <Award className="w-4 h-4 text-red-500" />
                    Bảng xếp hạng sẹo theo nhân sự
                  </h3>
                  <p className="text-[11px] font-semibold text-slate-400 mt-0.5">Sắp xếp theo tổng điểm sẹo giảm dần.</p>
                </div>
              </div>
              <div className="max-h-[330px] overflow-y-auto">
                {markStats.rows.length === 0 ? (
                  <div className="p-8 text-center text-xs font-bold text-slate-400">Chưa có sẹo workflow nào được ghi nhận.</div>
                ) : (
                  <table className="w-full text-left text-xs">
                    <thead className="sticky top-0 bg-slate-50 border-b border-slate-100 z-10">
                      <tr className="text-[10px] uppercase text-slate-400 font-black">
                        <th className="px-4 py-2">Nhân sự</th>
                        <th className="px-3 py-2 text-center">Tổng sẹo</th>
                        <th className="px-3 py-2 text-center">Sự kiện</th>
                        <th className="px-3 py-2">Gần nhất</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {markStats.rows.map(row => (
                        <tr key={row.staffKey} className="hover:bg-red-50/30">
                          <td className="px-4 py-3">
                            <p className="font-extrabold text-slate-800">{row.staffName}</p>
                            <p className="text-[10px] font-mono text-slate-400">{row.staffKey}{row.shortName ? ` · ${row.shortName}` : ''}</p>
                          </td>
                          <td className="px-3 py-3 text-center">
                            <span className="inline-flex min-w-9 justify-center rounded-full bg-red-50 text-red-700 px-2 py-1 font-black font-mono">
                              {row.totalScore}
                            </span>
                          </td>
                          <td className="px-3 py-3 text-center font-bold text-slate-600">{row.count}</td>
                          <td className="px-3 py-3 font-mono text-[10px] text-slate-500">{row.latestTime ? formatVNTime(row.latestTime) : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm flex-1 min-h-0">
              <div className="p-4 border-b border-slate-100">
                <h3 className="font-extrabold text-sm text-slate-900 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-500" />
                  Sự kiện sẹo gần đây
                </h3>
              </div>
              <div className="max-h-[360px] overflow-y-auto divide-y divide-slate-100">
                {markStats.recentMarks.length === 0 ? (
                  <div className="p-8 text-center text-xs font-bold text-slate-400">Chưa có sự kiện để hiển thị.</div>
                ) : (
                  markStats.recentMarks.map(mark => (
                    <div key={mark.MarkKey} className="p-3.5 hover:bg-slate-50 transition">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-extrabold text-xs text-slate-850">{mark.StaffName || mark.StaffKey} · {mark.Label}</p>
                          <p className="text-[11px] font-semibold text-slate-600 mt-1 leading-snug">{mark.Reason}</p>
                          <p className="text-[10px] font-mono text-slate-400 mt-1">
                            {formatVNTime(mark.CreatedTime)}{mark.PatientID ? ` · ${mark.PatientID}` : ''}{mark.PatientName ? ` · ${mark.PatientName}` : ''}
                          </p>
                        </div>
                        <span className="shrink-0 rounded-full bg-red-50 text-red-700 px-2 py-1 text-[10px] font-black font-mono">
                          -{Number(mark.Score || 1)}
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex-1 min-h-0 grid grid-cols-1 xl:grid-cols-12 gap-4">
          {/* Staff list */}
          <div className="xl:col-span-4 flex flex-col min-h-0 bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="p-4 border-b border-slate-100 space-y-3 shrink-0">
              <div className="relative md:hidden">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <SearchTextInput
                  value={searchQuery}
                  onChange={setSearchQuery}
                  placeholder="Tìm mã NV, tên, khoa..."
                  className="w-full pl-9 pr-3 py-2 text-xs border border-slate-200 rounded-xl focus:outline-none focus:border-pink-300"
                />
              </div>
              <label className="flex items-center gap-2 text-[11px] font-semibold text-slate-600 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showInactive}
                  onChange={(e) => setShowInactive(e.target.checked)}
                  className="rounded border-slate-300 text-primary focus:ring-pink-300"
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
                        isSelected ? 'bg-pink-50 border-l-4 border-primary' : 'hover:bg-slate-50 border-l-4 border-transparent'
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
                        <p className="text-[10px] font-bold text-primary">{permCount} module</p>
                        <ChevronRight className="w-4 h-4 text-slate-300 ml-auto" />
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          {/* Edit panel */}
          <div className="xl:col-span-8 flex flex-col min-h-0 bg-white border border-slate-200 rounded-xl overflow-hidden">
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
                      className="text-[11px] font-bold px-4 py-1.5 rounded-xl bg-primary hover:bg-[#b8124e] text-white flex items-center gap-1.5 disabled:opacity-60 transition"
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
                        placeholder="Để trống để giữ nguyên mật khẩu cũ"
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
                                ? 'border-primary bg-pink-50 ring-1 ring-pink-200'
                                : 'border-slate-200 hover:border-pink-200 bg-white'
                            } disabled:opacity-40`}
                          >
                            <p className="font-extrabold text-xs text-slate-800 flex items-center gap-1.5">
                              {active && <CheckCircle2 className="w-3.5 h-3.5 text-primary" />}
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
                                    className={`flex items-start gap-2 p-2.5 rounded-xl border cursor-pointer transition ${
                                      checked ? 'border-pink-200 bg-pink-50/50' : 'border-slate-150 bg-slate-50/40'
                                    } ${locked ? 'opacity-80' : ''}`}
                                  >
                                    <input
                                      type="checkbox"
                                      checked={checked}
                                      disabled={locked || draft.Role === 'Admin'}
                                      onChange={() => toggleModule(module.id)}
                                      className="mt-0.5 rounded border-slate-300 text-primary"
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
