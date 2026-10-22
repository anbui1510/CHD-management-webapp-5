import type { CathLab, CMR, Consult, DeviceTemplate, DoctorPerformanceMark, Notification, Operation, Patient, RolePreset, Source, Staff, Transplant } from '../types';
import {
  ensureSyncConfigHydrated,
  getInMemoryAllData,
  peekPersistedAllData
} from './appsScriptFetch';
import type { SheetsSyncStatus } from '../utils/sheetsSyncFeedback';

import { AuthRequiredError } from '../auth/authErrors';

export { AuthRequiredError };

export type MedicalDataBundle = {
  patients: Patient[];
  consults: Consult[];
  staff: Staff[];
  cathlabs: CathLab[];
  operations: Operation[];
  cmrs: CMR[];
  transplants: Transplant[];
  sources: Source[];
  deviceTemplates: DeviceTemplate[];
  rolePresets: RolePreset[];
  notifications: Notification[];
  doctorPerformanceMarks: DoctorPerformanceMark[];
  _syncStatus?: SheetsSyncStatus;
};

export type RefreshScope = 'full' | 'clinical' | 'consult' | 'staff' | 'mri' | 'transplant';

const EMPTY_BUNDLE: MedicalDataBundle = {
  patients: [],
  consults: [],
  staff: [],
  cathlabs: [],
  operations: [],
  cmrs: [],
  transplants: [],
  sources: [],
  deviceTemplates: [],
  rolePresets: [],
  notifications: [],
  doctorPerformanceMarks: []
};

/** Get the stored auth token from localStorage */
function getAuthToken(): string {
  return localStorage.getItem('CHD_AUTH_TOKEN') || '';
}

const isLikelyMobileDevice = (): boolean => {
  if (typeof navigator === 'undefined' || typeof window === 'undefined') return false;
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
    || (navigator.maxTouchPoints > 1 && window.innerWidth < 1024);
};

export const getMedicalDataFetchTimeout = (force: boolean): number => {
  const desktopTimeout = force ? 60000 : 20000;
  if (!isLikelyMobileDevice()) return desktopTimeout;
  return force ? 120000 : 45000;
};

/** Build fetch headers with optional Authorization */
function authHeaders(token?: string): HeadersInit {
  const t = token || getAuthToken();
  return t ? { 'Authorization': `Bearer ${t}` } : {};
}

function sheetDataToBundle(data: {
  patients?: unknown;
  consults?: unknown;
  staff?: unknown;
  cathlabs?: unknown;
  operations?: unknown;
  cmrs?: unknown;
  transplants?: unknown;
  sources?: unknown;
  deviceTemplates?: unknown;
  rolePresets?: unknown;
  notifications?: unknown;
  doctorPerformanceMarks?: unknown;
}): MedicalDataBundle {
  return {
    patients: Array.isArray(data.patients) ? data.patients as Patient[] : EMPTY_BUNDLE.patients,
    consults: Array.isArray(data.consults) ? data.consults as Consult[] : EMPTY_BUNDLE.consults,
    staff: Array.isArray(data.staff) ? data.staff as Staff[] : EMPTY_BUNDLE.staff,
    cathlabs: Array.isArray(data.cathlabs) ? data.cathlabs as CathLab[] : EMPTY_BUNDLE.cathlabs,
    operations: Array.isArray(data.operations) ? data.operations as Operation[] : EMPTY_BUNDLE.operations,
    cmrs: Array.isArray(data.cmrs) ? data.cmrs as CMR[] : EMPTY_BUNDLE.cmrs,
    transplants: Array.isArray(data.transplants) ? data.transplants as Transplant[] : EMPTY_BUNDLE.transplants,
    sources: Array.isArray(data.sources) ? data.sources as Source[] : EMPTY_BUNDLE.sources,
    deviceTemplates: Array.isArray(data.deviceTemplates) ? data.deviceTemplates as DeviceTemplate[] : EMPTY_BUNDLE.deviceTemplates,
    rolePresets: Array.isArray(data.rolePresets) ? data.rolePresets as RolePreset[] : EMPTY_BUNDLE.rolePresets,
    notifications: Array.isArray(data.notifications) ? data.notifications as Notification[] : EMPTY_BUNDLE.notifications,
    doctorPerformanceMarks: Array.isArray(data.doctorPerformanceMarks)
      ? data.doctorPerformanceMarks as DoctorPerformanceMark[]
      : EMPTY_BUNDLE.doctorPerformanceMarks
  };
}

/** Fast local hydrate — IndexedDB/memory only. */
export async function peekCachedMedicalDataBundle(): Promise<MedicalDataBundle | null> {
  try {
    const data = await peekPersistedAllData();
    if (!data) return null;
    const bundle = sheetDataToBundle(data);
    if (bundle.patients.length === 0 && bundle.consults.length === 0) return null;
    return bundle;
  } catch {
    return null;
  }
}

/** Apply bridge in-memory cache after background refresh event (no network). */
export function peekInMemoryMedicalDataBundle(): MedicalDataBundle | null {
  try {
    const data = getInMemoryAllData();
    if (!data) return null;
    const bundle = sheetDataToBundle(data);
    if (bundle.patients.length === 0 && bundle.consults.length === 0) return null;
    return bundle;
  } catch {
    return null;
  }
}

export async function fetchMedicalDataBundle(force = false): Promise<MedicalDataBundle> {
  const token = getAuthToken();

  // If no token, only fetch public staff list (for login dropdown)
  // This avoids exposing any patient data before authentication
  if (!token) {
    try {
      const res = await fetch('/api/staff/public');
      if (!res.ok) return EMPTY_BUNDLE;
      const publicStaff = await res.json();
      return {
        ...EMPTY_BUNDLE,
        staff: Array.isArray(publicStaff) ? publicStaff : []
      };
    } catch {
      return EMPTY_BUNDLE;
    }
  }

  await ensureSyncConfigHydrated();

  const url = force ? '/api/all?force=true' : '/api/all';
  const fetchTimeoutMs = getMedicalDataFetchTimeout(force);
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), fetchTimeoutMs);
  let res: Response;
  try {
    res = await fetch(url, {
      headers: authHeaders(token),
      signal: controller.signal
    });
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error(`Không tải được dữ liệu sau ${Math.round(fetchTimeoutMs / 1000)} giây — kiểm tra mạng hoặc bấm Đồng bộ lại.`);
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
  if (res.status === 401) {
    localStorage.removeItem('CHD_AUTH_TOKEN');
    throw new AuthRequiredError();
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { error?: string; _syncWarning?: string };
    throw new Error(err._syncWarning || err.error || `Không thể tải dữ liệu (HTTP ${res.status})`);
  }
  const data = await res.json() as MedicalDataBundle & { _syncWarning?: string; _syncStatus?: SheetsSyncStatus };
  const bundle = sheetDataToBundle(data);
  const hasClinicalData = bundle.patients.length > 0 || bundle.consults.length > 0;
  if (data._syncWarning && !hasClinicalData) {
    throw new Error(data._syncWarning);
  }
  return {
    ...bundle,
    _syncStatus: data._syncStatus
  };
}


export type MedicalDataSetters = {
  setPatients: (value: Patient[]) => void;
  setConsults: (value: Consult[]) => void;
  setStaffList: (value: Staff[]) => void;
  setCathlabs: (value: CathLab[]) => void;
  setOperations: (value: Operation[]) => void;
  setCmrs: (value: CMR[]) => void;
  setTransplants: (value: Transplant[]) => void;
  setSources: (value: Source[]) => void;
  setDeviceTemplates: (value: DeviceTemplate[]) => void;
  setRolePresetRecords: (value: RolePreset[]) => void;
  setRuntimeRolePresets: (value: RolePreset[]) => void;
  setNotifications: (value: Notification[]) => void;
  setDoctorPerformanceMarks: (value: DoctorPerformanceMark[]) => void;
};

export function applyMedicalDataBundle(
  bundle: MedicalDataBundle,
  scope: RefreshScope,
  setters: MedicalDataSetters,
  options?: { allowEmpty?: boolean }
) {
  const allowEmpty = options?.allowEmpty ?? false;
  const isClinicalEmpty = bundle.patients.length === 0 && bundle.consults.length === 0;

  if (scope === 'staff') {
    if (bundle.staff.length > 0 || allowEmpty) {
      setters.setStaffList(bundle.staff);
    }
    return;
  }

  if (!allowEmpty && isClinicalEmpty) {
    return;
  }

  setters.setPatients(bundle.patients);
  setters.setConsults(bundle.consults);
  setters.setNotifications(bundle.notifications);
  setters.setDoctorPerformanceMarks(bundle.doctorPerformanceMarks);

  if (scope === 'consult') {
    setters.setSources(bundle.sources);
    setters.setDeviceTemplates(bundle.deviceTemplates);
    return;
  }

  if (scope === 'mri') {
    setters.setCmrs(bundle.cmrs);
    setters.setSources(bundle.sources);
    return;
  }

  if (scope === 'transplant') {
    setters.setTransplants(bundle.transplants);
    setters.setSources(bundle.sources);
    return;
  }

  setters.setCathlabs(bundle.cathlabs);
  setters.setSources(bundle.sources);
  setters.setDeviceTemplates(bundle.deviceTemplates);

  if (scope === 'full') {
    setters.setOperations(bundle.operations);
    setters.setCmrs(bundle.cmrs);
    setters.setTransplants(bundle.transplants);
    setters.setStaffList(bundle.staff);
    setters.setRolePresetRecords(bundle.rolePresets);
    setters.setRuntimeRolePresets(bundle.rolePresets);
  }
}
