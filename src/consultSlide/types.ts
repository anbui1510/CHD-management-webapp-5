export type ConsultSlideAttachmentKind = 'admin' | 'tte' | 'ecg' | 'cxr' | 'pdf';

export interface ConsultSlideAttachment {
  kind: ConsultSlideAttachmentKind;
  /** MIME type, e.g. image/jpeg, application/pdf */
  mimeType: string;
  /** Raw base64 without data-URL prefix */
  base64: string;
  fileName?: string;
}

export interface ConsultSlidePatientContext {
  PatientName?: string;
  OtherPatientName?: string;
  PatientID1?: string;
  PatientID2?: string;
  PatientSex?: string;
  PatientDOB?: string;
  PatientAddress?: string;
  PatientPhone1?: string;
  PatientPhone2?: string;
}

export interface ConsultSlideConsultContext {
  ConsultKey?: string;
  ConsultType?: string;
  ConsultDate?: string;
  RequestBy?: string;
  DiagnosisID?: string;
  DetailDiagnosis?: string;
  PatientWeight?: string;
  PatientHeight?: string;
  ConsultResultID?: string;
  DetailConsultResult?: string;
  ConsultNote?: string;
  PlannedDevice?: string;
  PlannedCathLabDate?: string;
}

export interface ConsultSlideExtract {
  PatientName?: string;
  OtherPatientName?: string;
  PatientID1?: string;
  PatientID2?: string;
  PatientSex?: string;
  PatientDOB?: string;
  PatientAddress?: string;
  PatientPhone?: string;
  PatientWeight?: string;
  PatientHeight?: string;
  ageLabel?: string;
  clinicalSummary?: string;
  DetailDiagnosis?: string;
  historySummary?: string;
  tteDate?: string;
  tteFindings: string[];
  tteConclusion?: string;
  ecgNote?: string;
  cxrNote?: string;
  surgNote?: string;
  /** Nội dung ghi chú thông tim (body). Không dùng cho tiêu đề slide. */
  cathNote?: string;
  /** Ngày thông tim cho tiêu đề CathLab Note (dd/mm/yyyy hoặc ISO). */
  CathDate?: string;
}

export interface ConsultSlideGenerateRequest {
  patient: ConsultSlidePatientContext;
  consult: ConsultSlideConsultContext;
  attachments: ConsultSlideAttachment[];
  /** When true, OCR values override non-empty app fields. Default: only fill blanks. */
  preferOcr?: boolean;
}

export interface ConsultSlideGenerateResponse {
  success: boolean;
  extract?: ConsultSlideExtract;
  error?: string;
}

export interface StaffSlideDriveTarget {
  rootFolderId: string;
  yearFolderName: string;
  monthFolderName: string;
  year: number;
  month: number;
}
