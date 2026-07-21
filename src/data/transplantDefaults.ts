import type { BloodTypeValue, TransplantStatus, TransplantYesNo } from '../types';

export const BLOOD_TYPE_OPTIONS: BloodTypeValue[] = [
  'Chưa xác định',
  'Nhóm A (+)',
  'Nhóm A (-)',
  'Nhóm B (+)',
  'Nhóm B (-)',
  'Nhóm O (+)',
  'Nhóm O (-)',
  'Nhóm AB (+)',
  'Nhóm AB (-)',
];

export const TRANSPLANT_YES_NO_OPTIONS: TransplantYesNo[] = ['Có', 'Không'];

export const TRANS_STATUS_NOT_READY: TransplantStatus = 'Chưa đủ tiêu chuẩn';
export const TRANS_STATUS_READY: TransplantStatus = 'Đủ tiêu chuẩn ghép tim';

export const TRANSPLANT_STATUS_OPTIONS: TransplantStatus[] = [
  TRANS_STATUS_NOT_READY,
  TRANS_STATUS_READY,
];

export type TransplantFilterField =
  | 'TransDiagID'
  | 'Gens'
  | 'BloodType'
  | 'Holter'
  | 'MRI'
  | 'TransStatus';

export const TRANSPLANT_FILTER_FIELDS: { id: TransplantFilterField; label: string }[] = [
  { id: 'TransDiagID', label: 'Mã chẩn đoán' },
  { id: 'Gens', label: 'XN gen' },
  { id: 'BloodType', label: 'Nhóm máu' },
  { id: 'Holter', label: 'Holter' },
  { id: 'MRI', label: 'MRI' },
  { id: 'TransStatus', label: 'Trạng thái' },
];
