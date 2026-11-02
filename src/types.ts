/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface Staff {
  StaffKey: string;
  StaffName: string;
  Name?: string;
  StaffSex?: string;
  Avatar?: string;
  StaffDOB?: string;
  Department?: string;
  Career?: string;
  StaffPhone?: string;
  Password: string;
  Role: 'Admin' | 'User' | string;
  /** Comma-separated AppModule ids, e.g. "patients,consult-list,results-staff" */
  Permissions?: string;
  /** Preset role id from STAFF_ROLE_PRESETS, e.g. "bs-hoi-chan" */
  StaffRolePreset?: string;
  Email: string;
  FireDate: string; // Empty if still active, otherwise "YYYY-MM-DD"
}

export type OutcomeType = 'Tử vong' | 'Nặng xin về' | 'Đã mổ' | 'Đã thông' | '';

export interface Patient {
  PatientKey: string;
  PatientID1: string;
  PatientID2: string;
  PatientName: string;
  OtherPatientName: string;
  PatientDOB: string;
  PatientSex: 'Nam' | 'Nữ';
  PatientAddress: string;
  PatientPhone1: string;
  PatientPhone2: string;
  PatientCreateBy: string; // StaffKey
  PatientCreateTime: string; // DateTime ISO
  Outcome: OutcomeType;
  PatientAddressDefaultWarning?: string;
}

export type ConsultTypeEnum = 'Staff mổ' | 'Staff thông';
export type DepartmentEnum = 
  | 'Ngoại trú'
  | 'Tim Mạch'
  | 'Ngoại LN-TM'
  | 'Hồi Sức Sơ Sinh'
  | 'Hồi Sức Tim'
  | 'HSTC-CĐ'
  | 'Hô hấp'
  | 'Tiêu hóa'
  | 'UBXL-HHLS'
  | 'Ngoại Thần Kinh'
  | 'Nội Thần Kinh';
export type ConsultResultEnum = 
  | 'Can thiệp thông tim'
  | 'Chụp chẩn đoán-Đo kháng lực'
  | 'Chụp chẩn đoán/Đo kháng lực'
  | 'Chụp chẩn đoán +/- can thiệp'
  | 'Tiền Glenn'
  | 'Tiền Fontan'
  | 'Điện sinh lý'
  | 'Mổ tim'
  | 'Thêm CĐHA; vđ khác - Staff lại'
  | 'Chụp MRI'
  | 'Chưa có chỉ định - Theo dõi tiếp'
  | 'Điều trị nội khoa - Hẹn staff lại'
  | 'Quá chỉ định'
  | 'Không có thông tin'
  | '';

export type PriorityOrderEnum = 'Cấp cứu' | 'Làm sớm' | 'Chương trình';

export const PRIORITY_OPTIONS: PriorityOrderEnum[] = ['Cấp cứu', 'Làm sớm', 'Chương trình'];

export const normalizePriorityOrder = (value?: string): PriorityOrderEnum => {
  if (value === 'YC') return 'Làm sớm';
  if (value === 'Ngoại giao') return 'Chương trình';
  if (value === 'Cấp cứu' || value === 'Làm sớm' || value === 'Chương trình') return value;
  return 'Chương trình';
};

export type CathPlanEnum = 'Tái khám thường' | 'Theo dõi sát' | 'Cần thông tim can thiệp lại' | 'Đăng ký staff nội-ngoại khoa' | 'Mổ khẩn';

export interface CathLab {
  CathKey: string;
  PatientKey: string;
  ConsultKey: string;
  CathDate: string;
  DiagnosisID?: string;
  PostDiagnosisID: string;
  PostDiagnosis: string;
  CathResultID: 'Thành công' | 'Không thành công' | 'Hoãn';
  CathMethod: string[];
  CathPlan: CathPlanEnum | string;
  CathNote: string;
  _1stInterventionist: string;
  _2ndInterventionist: string;
  _3rdInterventionist?: string;
  _4thInterventionist?: string;
  CallNote?: string; // used when postponed
  PlannedFollowUpDate?: string;
  CathUpdatedBy?: string;
  CathUpdatedTime?: string;
}

export type RiskFactorEnum = 
  | '1 - Hỗ trợ SHH / NT khó kiểm soát'
  | '2 - Không SHH / NT ổn / HF nhiều'
  | '3 - Không HF, HF độ I-II / có chỉ định mổ'
  | '1 - SpO2 < 65% / Huyết động không ổn định'
  | '2 - SpO2 65-75% dao động không ổn định'
  | '3 -SpO2 > 75% ổn định';

export interface Consult {
  ConsultKey: string;
  PatientKey: string;
  Status?: string;
  ConsultType: ConsultTypeEnum;
  ConsultMember?: string;
  PatientWeight: string;
  PatientHeight?: string;
  ConsultDate: string;
  RequestBy: string; // StaffName/StaffKey
  DiagnosisID: string; // e.g. VSD, ASD, PDA...
  DetailDiagnosis: string;
  Department: string;
  ConsultCreateBy: string; // StaffKey
  ConsultCreateTime: string;
  PDFTrigger?: boolean;
  FilePDFBBHC?: string; // URL / Indicator
  ConsultResultID: ConsultResultEnum;
  DetailConsultResult: string;
  ConsultNote: string;
  PlannedDevice: string;
  PlannedPrice: string;
  ConsultReport?: string;
  PriorityOrder: PriorityOrderEnum;
  RiskFactor: string;
  PlanSurg?: string;
  ConsultSign?: string;
  ConsultResultCreateBy?: string;
  ConsultResultCreateTime?: string;
  ConsultResultUpdatedBy?: string;
  ConsultResultUpdatedTime?: string;
  CheckDevice: 'Đủ' | 'Thiếu' | '';
  OperationFeedback?: string;
  SupplyDepFeedback?: string;
  CallStatus?: string;
  Removed?: boolean;
  CallNote?: string;
  PlannedCathLabDate?: string;
  DayOfWeek?: string;
  FundingRequest?: string;
  CheckDeviceDate?: string;
  CheckDeviceBy?: string;
  CheckDeviceUpdatedTime?: string;
  CheckDeviceUpdatedBy?: string;
  CathMethod?: string;
  PostCathDepart?: string;
  Scheduled1stInterventionist?: string;
  Scheduled2ndInterventionist?: string;
  Scheduled3rdInterventionist?: string;
  TransferredToCathLab?: boolean;
  /** URL Google Drive của slide staff PPTX (AI tạo). */
  FilePPTX?: string;
}

export interface Operation {
  SurgKey?: string;
  PatientKey?: string;
  ConsultKey?: string;
  SurgDate?: string;
  DetailDiagnosisManual?: string;
  PostDiagnosis?: string;
  SurgResultID?: string;
  SurgNote?: string;
  SurgMethod?: string;
  PlannedFollowUpDate?: string;
  "1stSurgeon"?: string;
  "2ndSurgeon"?: string;
  "3rdSurgeon"?: string;
  "4thSurgeon"?: string;
  SurgCreateTime?: string;
  SurgUpdatedBy?: string;
  [key: string]: any;
}

export interface CMR {
  CMRKey?: string;
  CMRkey?: string;
  ConsultKey?: string;
  PatientKey?: string;
  MBN?: string;
  "Họ và tên"?: string;
  "Tình trạng"?: string;
  PatientWeight?: string;
  CMRDiagnosisID?: string;
  CMRDiagnosis?: string;
  CMRRequest?: string;
  RequestBy?: string;
  DepartRequest?: string;
  CMRDate?: string;
  CMRMethod?: string;
  CMRDevice?: string;
  PostDepart?: string;
  Anesthesia?: string;
  CMRScheduledDate?: string;
  DayOfWeek?: string;
  CMRCallStatus?: string;
  CMRCallStatusNote?: string;
  CMRResult?: string;
  CMRNote?: string;
  ConcludedResult?: string;
  PDFResult?: string;
  NextPlan?: string;
  UpdateTime?: string;
  [key: string]: any;
}

export type BloodTypeValue =
  | 'Chưa xác định'
  | 'Nhóm A (+)'
  | 'Nhóm A (-)'
  | 'Nhóm B (+)'
  | 'Nhóm B (-)'
  | 'Nhóm O (+)'
  | 'Nhóm O (-)'
  | 'Nhóm AB (+)'
  | 'Nhóm AB (-)';

export type TransplantYesNo = 'Có' | 'Không';

export type TransplantStatus =
  | 'Chưa đủ tiêu chuẩn'
  | 'Đủ tiêu chuẩn ghép tim';

export interface Transplant {
  TransKey?: string;
  PatientKey?: string;
  TransWeight?: string;
  TransHeight?: string;
  BloodType?: BloodTypeValue | string;
  Gens?: TransplantYesNo | string;
  GensFile?: string;
  MRI?: TransplantYesNo | string;
  MRIFile?: string;
  TTE?: string;
  TTEFile?: string;
  Holter?: TransplantYesNo | string;
  HolterFile?: string;
  TransDiagID?: string;
  DetailTransDiag?: string;
  Treatment?: string;
  TransNote?: string;
  TransStatus?: TransplantStatus | string;
  TransDate?: string;
  TransCreatedTime?: string;
  TransUpdateBy?: string;
  TransUpdateTime?: string;
  [key: string]: any;
}

export interface Source {
  [key: string]: any;
}

export interface DeviceTemplate {
  DiagnosisID: string;
  "PHƯƠNG PHÁP PHẪU THUẬT"?: string;
  DeviceName: string;
  FullDeviceName?: string;
  Size?: string;
  Price?: string;
  bhyt?: string;
  [key: string]: any;
}

export interface RolePreset {
  RolePresetID: string;
  RolePresetLabel: string;
  RolePresetDescription?: string;
  Permissions: string;
  SortOrder?: string | number;
  IsSystem?: string | boolean;
}

export type NotificationSeverity = 'info' | 'warning' | 'critical';

export interface Notification {
  NotificationKey: string;
  StaffKey: string;
  StaffName?: string;
  Title: string;
  Message: string;
  Severity: NotificationSeverity;
  RelatedEntityType?: 'Consult' | 'CathLab' | 'Patient' | 'Workflow';
  RelatedEntityKey?: string;
  PatientKey?: string;
  PatientID?: string;
  PatientName?: string;
  DedupKey: string;
  IsRead: boolean;
  CreatedTime: string;
  ReadTime?: string;
}

/** Client gửi kèm mutation body để server ghi log lỗi đồng bộ Sheets */
export interface SheetsSyncContext {
  viewModule?: string;
  viewLabel?: string;
  patientName?: string;
  patientKey?: string;
  patientID?: string;
}

/** Lỗi ghi Google Sheets chưa thành công — lưu trên server để nhắc lại khi đăng nhập */
export interface SheetsSyncFailure {
  FailureKey: string;
  StaffKey: string;
  EntityType: string;
  EntityKey: string;
  Action: 'insert' | 'update' | 'delete';
  ViewModule: string;
  ViewLabel: string;
  PatientName: string;
  PatientKey?: string;
  PatientID?: string;
  Message: string;
  CreatedTime: string;
  IsAcknowledged: boolean;
}

export type DoctorPerformanceMarkType =
  | 'missing_staff_result'
  | 'requester_overdue_staff_result'
  | 'scheduler_missing_transfer'
  | 'missing_cath_result';

export interface DoctorPerformanceMark {
  MarkKey: string;
  StaffKey: string;
  StaffName?: string;
  MarkType: DoctorPerformanceMarkType;
  Score: number;
  Label: string;
  Reason: string;
  RelatedEntityType?: 'Consult' | 'CathLab' | 'Patient' | 'Workflow';
  RelatedEntityKey?: string;
  PatientKey?: string;
  PatientID?: string;
  PatientName?: string;
  DedupKey: string;
  CreatedBy: string;
  CreatedTime: string;
}

export function formatVNTime(dateArg: any): string {
  if (!dateArg) return '';
  const dateString = String(dateArg);
  const trimmed = dateString.trim().split('T')[0];
  
  // If it's already in format DD/MM/YYYY, return as is
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(trimmed)) return trimmed;
  
  // If in format DD-MM-YYYY, convert to DD/MM/YYYY
  if (/^\d{2}-\d{2}-\d{4}$/.test(trimmed)) {
    return trimmed.replace(/-/g, '/');
  }

  try {
    let parts = trimmed.split('-');
    if (parts.length !== 3) parts = trimmed.split('/');
    
    if (parts.length === 3) {
      const year = parts[0];
      const month = parts[1].padStart(2, '0');
      const day = parts[2].padStart(2, '0');
      
      // Check if parts[0] is year (e.g. 4 chars)
      if (year.length === 4) {
        return `${day}/${month}/${year}`;
      } else {
        // parts[2] could be year
        return `${year.padStart(2, '0')}/${month}/${parts[2]}`;
      }
    }
  } catch (e) {
    // ignore and fallback
  }
  return dateString;
}

export function removeDiacritics(str: any): string {
  if (!str) return '';
  const s = String(str);
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D');
}

export function normalizePatientKey(patientKey: any): string {
  return String(patientKey || '')
    .trim()
    .replace(/_dup_\d+$/i, '')
    .toLowerCase();
}

export function findPatientByKey(patients: Patient[], patientKey: any): Patient | undefined {
  if (!patientKey) return undefined;
  const keyStr = normalizePatientKey(patientKey);
  return patients.find(p => {
    const pk = normalizePatientKey(p.PatientKey);
    const pid1 = String(p.PatientID1 || '').trim().toLowerCase();
    return pk === keyStr || (pid1 && pid1 === keyStr);
  });
}

export function restoreWeightFromDate(val: any): string {
  if (val === undefined || val === null) return '';
  const str = String(val).trim();
  const datePart = str.split('T')[0].split(' ')[0];
  const match = datePart.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (match) {
    const month = parseInt(match[2], 10);
    const day = parseInt(match[3], 10);
    return `${day}.${month}`;
  }
  return str;
}


