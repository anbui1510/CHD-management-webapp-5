import type { CathLab, CMR, Consult, DeviceTemplate, DoctorPerformanceMark, Notification, Operation, Patient, RolePreset, Source, Staff } from '../types';

export type MedicalDataBundle = {
  patients: Patient[];
  consults: Consult[];
  staff: Staff[];
  cathlabs: CathLab[];
  operations: Operation[];
  cmrs: CMR[];
  sources: Source[];
  deviceTemplates: DeviceTemplate[];
  rolePresets: RolePreset[];
  notifications: Notification[];
  doctorPerformanceMarks: DoctorPerformanceMark[];
};

export type RefreshScope = 'full' | 'clinical' | 'consult' | 'staff' | 'mri';

const EMPTY_BUNDLE: MedicalDataBundle = {
  patients: [],
  consults: [],
  staff: [],
  cathlabs: [],
  operations: [],
  cmrs: [],
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

/** Build fetch headers with optional Authorization */
function authHeaders(token?: string): HeadersInit {
  const t = token || getAuthToken();
  return t ? { 'Authorization': `Bearer ${t}` } : {};
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
      // Map public staff (StaffKey, StaffName only) to Staff type
      return {
        ...EMPTY_BUNDLE,
        staff: Array.isArray(publicStaff) ? publicStaff : []
      };
    } catch {
      return EMPTY_BUNDLE;
    }
  }

  const url = force ? '/api/all?force=true' : '/api/all';
  const res = await fetch(url, { headers: authHeaders(token) });
  if (res.status === 401) {
    // Token expired — clear it
    localStorage.removeItem('CHD_AUTH_TOKEN');
    return EMPTY_BUNDLE;
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Không thể tải dữ liệu (HTTP ${res.status})`);
  }
  const data = await res.json();
  return {
    patients: Array.isArray(data.patients) ? data.patients : EMPTY_BUNDLE.patients,
    consults: Array.isArray(data.consults) ? data.consults : EMPTY_BUNDLE.consults,
    staff: Array.isArray(data.staff) ? data.staff : EMPTY_BUNDLE.staff,
    cathlabs: Array.isArray(data.cathlabs) ? data.cathlabs : EMPTY_BUNDLE.cathlabs,
    operations: Array.isArray(data.operations) ? data.operations : EMPTY_BUNDLE.operations,
    cmrs: Array.isArray(data.cmrs) ? data.cmrs : EMPTY_BUNDLE.cmrs,
    sources: Array.isArray(data.sources) ? data.sources : EMPTY_BUNDLE.sources,
    deviceTemplates: Array.isArray(data.deviceTemplates) ? data.deviceTemplates : EMPTY_BUNDLE.deviceTemplates,
    rolePresets: Array.isArray(data.rolePresets) ? data.rolePresets : EMPTY_BUNDLE.rolePresets,
    notifications: Array.isArray(data.notifications) ? data.notifications : EMPTY_BUNDLE.notifications,
    doctorPerformanceMarks: Array.isArray(data.doctorPerformanceMarks) ? data.doctorPerformanceMarks : EMPTY_BUNDLE.doctorPerformanceMarks
  };
}


export type MedicalDataSetters = {
  setPatients: (value: Patient[]) => void;
  setConsults: (value: Consult[]) => void;
  setStaffList: (value: Staff[]) => void;
  setCathlabs: (value: CathLab[]) => void;
  setOperations: (value: Operation[]) => void;
  setCmrs: (value: CMR[]) => void;
  setSources: (value: Source[]) => void;
  setDeviceTemplates: (value: DeviceTemplate[]) => void;
  setRolePresetRecords: (value: RolePreset[]) => void;
  setRuntimeRolePresets: (value: RolePreset[]) => void;
  setNotifications: (value: Notification[]) => void;
  setDoctorPerformanceMarks: (value: DoctorPerformanceMark[]) => void;
};

export function applyMedicalDataBundle(bundle: MedicalDataBundle, scope: RefreshScope, setters: MedicalDataSetters) {
  if (scope === 'staff') {
    setters.setStaffList(bundle.staff);
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

  setters.setCathlabs(bundle.cathlabs);
  setters.setSources(bundle.sources);
  setters.setDeviceTemplates(bundle.deviceTemplates);

  if (scope === 'full') {
    setters.setOperations(bundle.operations);
    setters.setCmrs(bundle.cmrs);
    setters.setStaffList(bundle.staff);
    setters.setRolePresetRecords(bundle.rolePresets);
    setters.setRuntimeRolePresets(bundle.rolePresets);
  }
}
