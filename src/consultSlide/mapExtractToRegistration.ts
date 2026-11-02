import { removeDiacritics } from '../types';
import type { ConsultSlideExtract } from './types';

/** Match OCR address to province enum; empty if no close match. */
export function matchProvinceAddress(
  ocrAddress: string | undefined,
  provinceOptions: string[]
): { value: string; unmatched: boolean } {
  const raw = String(ocrAddress || '').trim();
  if (!raw) return { value: '', unmatched: false };

  const exact = provinceOptions.find(p => p === raw);
  if (exact) return { value: exact, unmatched: false };

  const norm = removeDiacritics(raw).toLowerCase();
  const caseInsensitive = provinceOptions.find(
    p => removeDiacritics(p).toLowerCase() === norm
  );
  if (caseInsensitive) return { value: caseInsensitive, unmatched: false };

  const contains = provinceOptions.find(p => {
    const pn = removeDiacritics(p).toLowerCase();
    return pn.includes(norm) || norm.includes(pn);
  });
  if (contains) return { value: contains, unmatched: false };

  return { value: '', unmatched: true };
}

export function normalizePatientSex(value?: string): 'Nam' | 'Nữ' {
  const s = removeDiacritics(String(value || '')).toLowerCase().trim();
  if (s === 'nu' || s === 'female' || s === 'f' || s.includes('nu')) return 'Nữ';
  return 'Nam';
}

/** Prefer dd/mm/yyyy for VNDateInput; accept ISO. */
export function normalizeVnDate(value?: string): string {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const vn = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (vn) {
    return `${vn[1].padStart(2, '0')}/${vn[2].padStart(2, '0')}/${vn[3]}`;
  }
  const iso = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) {
    return `${iso[3].padStart(2, '0')}/${iso[2].padStart(2, '0')}/${iso[1]}`;
  }
  return raw;
}

export function findPatientById1<T extends { PatientKey: string; PatientID1?: string; PatientID2?: string; PatientName?: string }>(
  patients: T[],
  patientId1?: string
): T | null {
  const id = String(patientId1 || '').trim().toLowerCase();
  if (!id) return null;
  return (
    patients.find(p => String(p.PatientID1 || '').trim().toLowerCase() === id) ||
    patients.find(p => {
      const id2 = String(p.PatientID2 || '')
        .split(/[-,/|]/)
        .map(s => s.trim().toLowerCase())
        .filter(Boolean);
      return id2.includes(id);
    }) ||
    null
  );
}

export function buildRegistrationDraftFromExtract(opts: {
  extract: ConsultSlideExtract;
  provinceOptions: string[];
  consultType: string;
  consultDate: string;
  requestBy: string;
}) {
  const { extract, provinceOptions, consultType, consultDate, requestBy } = opts;
  const addressMatch = matchProvinceAddress(extract.PatientAddress, provinceOptions);
  const detailFromTte =
    extract.DetailDiagnosis ||
    [extract.tteConclusion, ...(extract.tteFindings || [])].filter(Boolean).join('\n') ||
    extract.clinicalSummary ||
    '';

  return {
    consult: {
      ConsultType: consultType,
      ConsultDate: normalizeVnDate(consultDate) || consultDate,
      RequestBy: requestBy,
      PatientWeight: String(extract.PatientWeight || '').trim(),
      PatientHeight: String(extract.PatientHeight || '').trim(),
      DetailDiagnosis: String(detailFromTte).trim(),
    },
    patientDraft: {
      PatientID1: String(extract.PatientID1 || '').trim(),
      PatientID2: String(extract.PatientID2 || '').trim(),
      PatientName: String(extract.PatientName || '').trim(),
      OtherPatientName: String(extract.OtherPatientName || '').trim(),
      PatientDOB: normalizeVnDate(extract.PatientDOB),
      PatientSex: normalizePatientSex(extract.PatientSex),
      PatientAddress: addressMatch.value || 'TP Hà Nội',
      PatientPhone1: String(extract.PatientPhone || '').trim(),
      PatientPhone2: '',
      Outcome: '' as const,
    },
    addressUnmatched: addressMatch.unmatched,
    ocrAddressRaw: String(extract.PatientAddress || '').trim(),
  };
}
