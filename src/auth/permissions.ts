import type { Staff } from '../types';
import {
  DEFAULT_ROLE_PRESET_RECORDS,
  type RolePresetRecord,
} from './rolePresetDefaults';

/** Menu / workspace module identifiers used for access control. */
export type AppModule =
  | 'home'
  | 'workspace'
  | 'patients'
  | 'consult-list'
  | 'results-staff'
  | 'schedule-tt'
  | 'schedule-view'
  | 'cathlab-room'
  | 'archive'
  | 'mri-register'
  | 'mri-scheduler'
  | 'mri-result'
  | 'mri-calendar'
  | 'surgery-room'
  | 'surgery-scheduler'
  | 'surgery-schedule-view'
  | 'excel-export'
  | 'google-sheets'
  | 'staff-mgmt'
  | 'chd-daily-brief';

export type AppModuleGroup =
  | 'Chung'
  | 'Bệnh nhân & Hội chẩn'
  | 'Thông tim'
  | 'MRI tim'
  | 'Phẫu thuật'
  | 'Quản trị';

export interface AppModuleDefinition {
  id: AppModule;
  label: string;
  group: AppModuleGroup;
  description: string;
}

export const APP_MODULE_DEFINITIONS: AppModuleDefinition[] = [
  { id: 'home', label: 'Home', group: 'Chung', description: 'Trang chủ tổng quan' },
  { id: 'workspace', label: 'Không gian làm việc', group: 'Chung', description: 'Dashboard điều hướng module' },
  { id: 'patients', label: 'Hồ sơ bệnh án', group: 'Bệnh nhân & Hội chẩn', description: 'Quản lý hành chính bệnh nhi' },
  { id: 'consult-list', label: 'Hội chẩn', group: 'Bệnh nhân & Hội chẩn', description: 'Đăng ký staff hội chẩn' },
  { id: 'results-staff', label: 'Nhập kết quả staff', group: 'Bệnh nhân & Hội chẩn', description: 'Nhập kết luận hội chẩn' },
  { id: 'schedule-tt', label: 'Xếp lịch & Dụng cụ', group: 'Thông tim', description: 'Xếp lịch TT, check dụng cụ, gọi bệnh' },
  { id: 'schedule-view', label: 'Lịch thông tim dự kiến', group: 'Thông tim', description: 'Xem lịch cathlab' },
  { id: 'cathlab-room', label: 'Phòng thông tim', group: 'Thông tim', description: 'Nhập kết quả can thiệp TT' },
  { id: 'archive', label: 'Lưu trữ TT', group: 'Thông tim', description: 'Ca đã chuyển phòng / lưu trữ' },
  { id: 'mri-register', label: 'Đăng ký MRI', group: 'MRI tim', description: 'Đăng ký chụp MRI tim' },
  { id: 'mri-scheduler', label: 'Xếp lịch MRI', group: 'MRI tim', description: 'Phân ca chụp MRI' },
  { id: 'mri-result', label: 'Điền KQ MRI', group: 'MRI tim', description: 'Nhập kết quả MRI tim' },
  { id: 'mri-calendar', label: 'Lịch chụp MRI', group: 'MRI tim', description: 'Lịch các ca MRI dự kiến' },
  { id: 'surgery-room', label: 'Phòng phẫu thuật', group: 'Phẫu thuật', description: 'Nhập kết quả mổ tim' },
  { id: 'surgery-scheduler', label: 'Xếp lịch phẫu thuật', group: 'Phẫu thuật', description: 'Phân ca mổ tim' },
  { id: 'surgery-schedule-view', label: 'Lịch mổ dự kiến', group: 'Phẫu thuật', description: 'Xem lịch phòng mổ' },
  { id: 'excel-export', label: 'Bảng Filter_Consult', group: 'Quản trị', description: 'Xuất Excel / filter consult' },
  { id: 'google-sheets', label: 'Virtual Google Sheets', group: 'Quản trị', description: 'Sửa dữ liệu trực tiếp trên sheet ảo' },
  { id: 'staff-mgmt', label: 'Quản lý nhân sự', group: 'Quản trị', description: 'Phân quyền module cho nhân viên' },
  { id: 'chd-daily-brief', label: 'CHD Daily Brief', group: 'Chung', description: 'Bản tin y văn tim mạch nhi mỗi sáng 7h' },
];

export const ALL_APP_MODULES: AppModule[] = APP_MODULE_DEFINITIONS.map(item => item.id);

export interface StaffRolePreset {
  id: string;
  label: string;
  description: string;
  modules: AppModule[];
  isSystem?: boolean;
}

export type { RolePresetRecord };

const SYSTEM_PRESET_IDS = new Set(['admin-khoa', 'tuy-chinh']);

function isTruthy(value: unknown): boolean {
  const normalized = String(value ?? '').trim().toLowerCase();
  return normalized === 'true' || normalized === '1' || normalized === 'yes' || normalized === 'có';
}

function isSystemPresetId(id: string): boolean {
  return SYSTEM_PRESET_IDS.has(id);
}

export function rolePresetRecordsToPresets(records: RolePresetRecord[]): StaffRolePreset[] {
  return [...records]
    .sort((a, b) => Number(a.SortOrder ?? 999) - Number(b.SortOrder ?? 999))
    .flatMap(record => {
      const id = String(record.RolePresetID || '').trim();
      if (!id) return [];

      const modules =
        id === 'admin-khoa'
          ? [...ALL_APP_MODULES]
          : parsePermissions(record.Permissions);

      const preset: StaffRolePreset = {
        id,
        label: String(record.RolePresetLabel || id),
        description: String(record.RolePresetDescription || ''),
        modules:
          modules.length > 0
            ? modules
            : id === 'tuy-chinh'
              ? (['home', 'workspace'] as AppModule[])
              : modules,
        isSystem: isSystemPresetId(id) || isTruthy(record.IsSystem),
      };
      return [preset];
    });
}

export function resolveRolePresetRecords(records: RolePresetRecord[]): RolePresetRecord[] {
  if (!Array.isArray(records) || records.length === 0) {
    return [...DEFAULT_ROLE_PRESET_RECORDS];
  }

  const map = new Map<string, RolePresetRecord>();
  records.forEach(record => {
    const id = String(record.RolePresetID || '').trim();
    if (id) map.set(id, { ...record, RolePresetID: id });
  });

  DEFAULT_ROLE_PRESET_RECORDS.forEach(defaultRecord => {
    if (!map.has(defaultRecord.RolePresetID)) {
      map.set(defaultRecord.RolePresetID, { ...defaultRecord });
    }
  });

  return [...map.values()].sort(
    (a, b) => Number(a.SortOrder ?? 999) - Number(b.SortOrder ?? 999)
  );
}

let runtimeRolePresets: StaffRolePreset[] = rolePresetRecordsToPresets(DEFAULT_ROLE_PRESET_RECORDS);

export function setRuntimeRolePresets(records: RolePresetRecord[]): StaffRolePreset[] {
  const resolved = resolveRolePresetRecords(records);
  runtimeRolePresets = rolePresetRecordsToPresets(resolved);
  if (runtimeRolePresets.length === 0) {
    runtimeRolePresets = rolePresetRecordsToPresets(DEFAULT_ROLE_PRESET_RECORDS);
  }
  return runtimeRolePresets;
}

export function getRuntimeRolePresets(): StaffRolePreset[] {
  return runtimeRolePresets;
}

/** @deprecated Use getRuntimeRolePresets() — kept for imports that expect a static array */
export const STAFF_ROLE_PRESETS: StaffRolePreset[] = new Proxy([] as StaffRolePreset[], {
  get(_target, prop) {
    const presets = getRuntimeRolePresets();
    const value = Reflect.get(presets, prop);
    return typeof value === 'function' ? value.bind(presets) : value;
  },
});

export const DEFAULT_STAFF_ROLE_PRESETS: StaffRolePreset[] = rolePresetRecordsToPresets(
  DEFAULT_ROLE_PRESET_RECORDS
);

const MODULE_LABEL_MAP = Object.fromEntries(
  APP_MODULE_DEFINITIONS.map(item => [item.id, item.label])
) as Record<AppModule, string>;

export function getModuleLabel(module: AppModule): string {
  return MODULE_LABEL_MAP[module] || module;
}

export function isAdminStaff(staff: Staff | null | undefined): boolean {
  return String(staff?.Role || '').trim().toLowerCase() === 'admin';
}

export function parsePermissions(raw: unknown): AppModule[] {
  if (!raw) return [];
  return String(raw)
    .split(/[,;\n]+/)
    .map(value => value.trim())
    .filter((value): value is AppModule => ALL_APP_MODULES.includes(value as AppModule));
}

export function serializePermissions(modules: Iterable<AppModule>): string {
  const seen = new Set<AppModule>();
  const ordered: AppModule[] = [];
  for (const module of modules) {
    if (!seen.has(module)) {
      seen.add(module);
      ordered.push(module);
    }
  }
  return ordered.join(',');
}

export function getPresetById(
  presetId: string | undefined | null,
  presets: StaffRolePreset[] = getRuntimeRolePresets()
): StaffRolePreset | undefined {
  return presets.find(preset => preset.id === presetId);
}

export function inferPresetFromPermissions(
  modules: AppModule[],
  presets: StaffRolePreset[] = getRuntimeRolePresets()
): string {
  const normalized = serializePermissions(modules);
  const matched = presets.find(preset => {
    if (preset.id === 'tuy-chinh' || preset.id === 'admin-khoa') return false;
    return serializePermissions(preset.modules) === normalized;
  });
  return matched?.id || 'tuy-chinh';
}

export function getStaffPermissions(staff: Staff | null | undefined): Set<AppModule> {
  if (!staff) return new Set();

  if (isAdminStaff(staff)) {
    return new Set(ALL_APP_MODULES);
  }

  const presets = getRuntimeRolePresets();
  const preset = getPresetById(staff.StaffRolePreset, presets);
  const parsed = parsePermissions(staff.Permissions);

  if (parsed.length > 0) {
    return new Set(parsed);
  }

  if (preset && preset.id !== 'tuy-chinh') {
    return new Set(preset.modules);
  }

  return new Set(['home', 'workspace']);
}

export function canAccessModule(staff: Staff | null | undefined, module: AppModule): boolean {
  return getStaffPermissions(staff).has(module);
}

export function canManageStaff(staff: Staff | null | undefined): boolean {
  return isAdminStaff(staff) || canAccessModule(staff, 'staff-mgmt');
}

export function isSystemRolePresetId(id: string): boolean {
  return isSystemPresetId(id);
}

export function modulesByGroup(): Record<AppModuleGroup, AppModuleDefinition[]> {
  return APP_MODULE_DEFINITIONS.reduce((acc, item) => {
    if (!acc[item.group]) acc[item.group] = [];
    acc[item.group].push(item);
    return acc;
  }, {} as Record<AppModuleGroup, AppModuleDefinition[]>);
}

export function slugifyRolePresetId(label: string): string {
  return String(label || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || `preset-${Date.now()}`;
}
