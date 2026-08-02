/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface Staff {
  id: string;
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
  id: string;
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
  id: string;
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
  id: string;
  PatientKey: string;
  Status?: string;
  ConsultType: ConsultTypeEnum;
  ConsultMember?: string[];
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
}

export interface Operation {
  id?: string;
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
  id?: string;
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
  id: string;
  RolePresetLabel: string;
  RolePresetDescription?: string;
  Permissions: string;
  SortOrder?: string | number;
  IsSystem?: string | boolean;
}

export type NotificationSeverity = 'info' | 'warning' | 'critical';

export interface Notification {
  id: string;
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

export type DoctorPerformanceMarkType =
  | 'missing_staff_result'
  | 'requester_overdue_staff_result'
  | 'scheduler_missing_transfer'
  | 'missing_cath_result';

export interface DoctorPerformanceMark {
  id: string;
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
    const pk = normalizePatientKey(p.id);
    const pid1 = String(p.PatientID1 || '').trim().toLowerCase();
    return pk === keyStr || (pid1 && pid1 === keyStr);
  });
}

