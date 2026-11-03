import type { Consult, Patient } from '../types';
import { formatAgeLabel } from './mergeExtract';
import type { ConsultSlideExtract } from './types';

/** Build slide extract purely from registered patient + consult form fields (no OCR/AI). */
export function buildExtractFromRegistration(
  patient: Pick<
    Patient,
    | 'PatientName'
    | 'OtherPatientName'
    | 'PatientID1'
    | 'PatientID2'
    | 'PatientSex'
    | 'PatientDOB'
    | 'PatientAddress'
    | 'PatientPhone1'
    | 'PatientPhone2'
  >,
  consult: Pick<
    Consult,
    | 'DiagnosisID'
    | 'DetailDiagnosis'
    | 'PatientWeight'
    | 'PatientHeight'
    | 'ConsultResultID'
    | 'DetailConsultResult'
    | 'ConsultNote'
    | 'PlannedDevice'
  >
): ConsultSlideExtract {
  const dob = String(patient.PatientDOB || '').trim();
  const detailDiagnosis =
    [consult.DiagnosisID, consult.DetailDiagnosis].filter(Boolean).join(' — ') ||
    String(consult.DetailDiagnosis || '').trim();

  return {
    PatientName: String(patient.PatientName || '').trim(),
    OtherPatientName: String(patient.OtherPatientName || '').trim(),
    PatientID1: String(patient.PatientID1 || '').trim(),
    PatientID2: String(patient.PatientID2 || '').trim(),
    PatientSex: String(patient.PatientSex || '').trim(),
    PatientDOB: dob,
    PatientAddress: String(patient.PatientAddress || '').trim(),
    PatientPhone: String(patient.PatientPhone1 || patient.PatientPhone2 || '').trim(),
    PatientWeight: String(consult.PatientWeight || '').trim(),
    PatientHeight: String(consult.PatientHeight || '').trim(),
    ageLabel: formatAgeLabel(dob),
    clinicalSummary: '',
    DetailDiagnosis: detailDiagnosis,
    historySummary: '',
    tteDate: '',
    tteFindings: [],
    tteConclusion: '',
    ecgNote: '',
    cxrNote: '',
    surgNote: [consult.ConsultResultID, consult.DetailConsultResult, consult.ConsultNote]
      .filter(Boolean)
      .join('\n'),
    cathNote: [consult.ConsultResultID, consult.DetailConsultResult, consult.PlannedDevice]
      .filter(Boolean)
      .join('\n'),
  };
}
