import type {
  ConsultSlideConsultContext,
  ConsultSlideExtract,
  ConsultSlidePatientContext,
} from './types';

function pick(preferOcr: boolean, appVal?: string, ocrVal?: string): string {
  const app = String(appVal || '').trim();
  const ocr = String(ocrVal || '').trim();
  if (preferOcr) return ocr || app;
  return app || ocr;
}

/** Compute age label from DOB (dd/mm/yyyy or ISO) relative to today. */
export function formatAgeLabel(dob?: string, today = new Date()): string {
  const raw = String(dob || '').trim();
  if (!raw) return '';

  let day = 0;
  let month = 0;
  let year = 0;
  const vn = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (vn) {
    day = Number(vn[1]);
    month = Number(vn[2]);
    year = Number(vn[3]);
  } else {
    const iso = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (iso) {
      year = Number(iso[1]);
      month = Number(iso[2]);
      day = Number(iso[3]);
    }
  }
  if (!year || !month || !day) return '';

  let years = today.getFullYear() - year;
  let months = today.getMonth() + 1 - month;
  if (today.getDate() < day) months -= 1;
  if (months < 0) {
    years -= 1;
    months += 12;
  }
  if (years < 0) return '';
  if (years === 0) return `${months} tháng`;
  if (months === 0) return `${years} tuổi`;
  return `${years} tuổi ${months} tháng`;
}

export function mergeSlideExtract(opts: {
  patient: ConsultSlidePatientContext;
  consult: ConsultSlideConsultContext;
  extract: ConsultSlideExtract;
  preferOcr?: boolean;
}): ConsultSlideExtract {
  const preferOcr = Boolean(opts.preferOcr);
  const { patient, consult, extract } = opts;

  const dob = pick(preferOcr, patient.PatientDOB, extract.PatientDOB);
  const ageLabel = extract.ageLabel?.trim() || formatAgeLabel(dob);

  const detailDiagnosis = pick(preferOcr, consult.DetailDiagnosis, extract.DetailDiagnosis);
  const diagnosisLine = [consult.DiagnosisID, detailDiagnosis].filter(Boolean).join(' — ') || detailDiagnosis;

  return {
    PatientName: pick(preferOcr, patient.PatientName, extract.PatientName),
    OtherPatientName: pick(preferOcr, patient.OtherPatientName, extract.OtherPatientName),
    PatientID1: pick(preferOcr, patient.PatientID1, extract.PatientID1),
    PatientID2: pick(preferOcr, patient.PatientID2, extract.PatientID2),
    PatientSex: pick(preferOcr, patient.PatientSex, extract.PatientSex),
    PatientDOB: dob,
    PatientAddress: pick(preferOcr, patient.PatientAddress, extract.PatientAddress),
    PatientPhone: pick(
      preferOcr,
      patient.PatientPhone1 || patient.PatientPhone2,
      extract.PatientPhone
    ),
    PatientWeight: pick(preferOcr, consult.PatientWeight, extract.PatientWeight),
    PatientHeight: pick(preferOcr, consult.PatientHeight, extract.PatientHeight),
    ageLabel,
    clinicalSummary: extract.clinicalSummary || '',
    DetailDiagnosis: diagnosisLine,
    historySummary: extract.historySummary || '',
    tteDate: extract.tteDate || '',
    tteFindings: Array.isArray(extract.tteFindings) ? extract.tteFindings.filter(Boolean) : [],
    tteConclusion: extract.tteConclusion || '',
    ecgNote: extract.ecgNote || '',
    cxrNote: extract.cxrNote || '',
    surgNote:
      extract.surgNote ||
      [consult.ConsultResultID, consult.DetailConsultResult, consult.ConsultNote]
        .filter(Boolean)
        .join('\n') ||
      '',
    cathNote: extract.cathNote || '',
    CathDate: extract.CathDate || consult.PlannedCathLabDate || '',
  };
}
