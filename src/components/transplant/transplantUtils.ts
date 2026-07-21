import type { Patient, Transplant } from '../../types';
import { findPatientByKey, removeDiacritics } from '../../types';
import type { TransplantFilterField } from '../../data/transplantDefaults';
import { TRANS_STATUS_NOT_READY, TRANS_STATUS_READY } from '../../data/transplantDefaults';

export type EnrichedTransplant = Transplant & { __patient?: Patient };

export type TransplantSortField =
  | 'name'
  | 'patientId'
  | 'sex'
  | 'dob'
  | 'address'
  | 'TransDiagID'
  | 'detailDiag'
  | 'BloodType'
  | 'Gens'
  | 'MRI'
  | 'Holter'
  | 'TransStatus'
  | 'TransWeight'
  | 'TransDate';

export type TransplantColumnKey =
  | 'name'
  | 'patientId'
  | 'sex'
  | 'dob'
  | 'address'
  | 'TransDiagID'
  | 'detailDiag'
  | 'BloodType'
  | 'Gens'
  | 'MRI'
  | 'Holter'
  | 'TransStatus'
  | 'TransWeight'
  | 'TransDate';

export const DEFAULT_VISIBLE_COLUMNS: Record<TransplantColumnKey, boolean> = {
  name: true,
  patientId: true,
  sex: true,
  dob: true,
  address: true,
  TransDiagID: true,
  detailDiag: true,
  BloodType: true,
  Gens: true,
  MRI: false,
  Holter: false,
  TransStatus: true,
  TransWeight: true,
  TransDate: false,
};

export const COLUMN_LABELS: Record<TransplantColumnKey, string> = {
  name: 'Họ tên',
  patientId: 'Mã người bệnh',
  sex: 'Giới tính',
  dob: 'Ngày sinh',
  address: 'Địa chỉ',
  TransDiagID: 'Mã chẩn đoán',
  detailDiag: 'Chẩn đoán',
  BloodType: 'Nhóm máu',
  Gens: 'XN gen',
  MRI: 'MRI',
  Holter: 'Holter',
  TransStatus: 'Trạng thái',
  TransWeight: 'Cân nặng',
  TransDate: 'Ngày ghép tim',
};

export function enrichTransplants(transplants: Transplant[], patients: Patient[]): EnrichedTransplant[] {
  return transplants.map(t => ({
    ...t,
    __patient: findPatientByKey(patients, t.PatientKey),
  }));
}

export function matchesTransplantSearch(item: EnrichedTransplant, query: string): boolean {
  const q = removeDiacritics(query).toLowerCase().trim();
  if (!q) return true;
  const pat = item.__patient;
  return (
    removeDiacritics(String(pat?.PatientName || '')).toLowerCase().includes(q) ||
    removeDiacritics(String(pat?.PatientID1 || '')).toLowerCase().includes(q) ||
    removeDiacritics(String(pat?.PatientID2 || '')).toLowerCase().includes(q) ||
    removeDiacritics(String(item.TransDiagID || '')).toLowerCase().includes(q)
  );
}

export function isNotReadyStatus(status?: string): boolean {
  return !isReadyStatus(status);
}

export function isReadyStatus(status?: string): boolean {
  return String(status || '').trim() === TRANS_STATUS_READY;
}

export function sortTransplants(
  items: EnrichedTransplant[],
  field: TransplantSortField,
  order: 'asc' | 'desc'
): EnrichedTransplant[] {
  const dir = order === 'asc' ? 1 : -1;
  return [...items].sort((a, b) => {
    const patA = a.__patient;
    const patB = b.__patient;
    let valA = '';
    let valB = '';
    switch (field) {
      case 'name':
        valA = removeDiacritics(String(patA?.PatientName || '')).toLowerCase();
        valB = removeDiacritics(String(patB?.PatientName || '')).toLowerCase();
        break;
      case 'patientId':
        valA = String(patA?.PatientID1 || '');
        valB = String(patB?.PatientID1 || '');
        break;
      case 'sex':
        valA = String(patA?.PatientSex || '');
        valB = String(patB?.PatientSex || '');
        break;
      case 'dob':
        valA = String(patA?.PatientDOB || '');
        valB = String(patB?.PatientDOB || '');
        break;
      case 'address':
        valA = String(patA?.PatientAddress || '');
        valB = String(patB?.PatientAddress || '');
        break;
      case 'detailDiag':
        valA = String(a.DetailTransDiag || '');
        valB = String(b.DetailTransDiag || '');
        break;
      default:
        valA = String((a as Record<string, unknown>)[field] || '');
        valB = String((b as Record<string, unknown>)[field] || '');
    }
    return valA.localeCompare(valB, 'vi') * dir;
  });
}

export function getUniqueFilterValues(
  items: EnrichedTransplant[],
  field: TransplantFilterField
): string[] {
  const set = new Set<string>();
  items.forEach(item => {
    const val = String(item[field] || '').trim();
    if (val) set.add(val);
  });
  return Array.from(set).sort((a, b) => a.localeCompare(b, 'vi'));
}

export function applySidebarFilters(
  items: EnrichedTransplant[],
  activeFields: TransplantFilterField[],
  selectedValues: Record<string, string[]>
): EnrichedTransplant[] {
  if (activeFields.length === 0) return items;
  return items.filter(item => {
    return activeFields.every(field => {
      const selected = selectedValues[field];
      if (!selected || selected.length === 0) return true;
      const val = String(item[field] || '').trim();
      return selected.includes(val);
    });
  });
}

export const MAX_TRANSPLANT_FILE_BYTES = 1024 * 1024;

export async function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Không đọc được file'));
    reader.readAsDataURL(file);
  });
}

export function openTransplantFile(url?: string) {
  const val = String(url || '').trim();
  if (!val) return;
  window.open(val, '_blank', 'noopener,noreferrer');
}
