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

  // Prefer longest province name contained in full OCR address (e.g. "... Can Tho").
  let best = '';
  let bestLen = 0;
  for (const p of provinceOptions) {
    const pn = removeDiacritics(p).toLowerCase().trim();
    if (!pn) continue;
    const bare = pn.replace(/^(tp|tinh|thanh pho)\s+/i, '').trim();
    const hit = norm.includes(pn) || (bare.length >= 4 && norm.includes(bare));
    if (hit && bare.length >= bestLen) {
      best = p;
      bestLen = bare.length;
    }
  }
  if (best) return { value: best, unmatched: false };

  const contains = provinceOptions.find(p => {
    const pn = removeDiacritics(p).toLowerCase();
    return pn.includes(norm);
  });
  if (contains) return { value: contains, unmatched: false };

  return { value: '', unmatched: true };
}

/** Reject RIS/TE/barcode-like tokens; prefer numeric Mã NB for PatientID1. */
export function isLikelyGarbagePatientId(value: string): boolean {
  const v = String(value || '').trim();
  if (!v) return true;
  // TE1929… / PID… / QR tokens — not Mã NB
  if (/^(te|pid|ris|qr|id)[a-z0-9_-]*\d+/i.test(v)) return true;
  if (/[a-zA-Z]/.test(v) && !/^(bn|mbn|hs)[-_]?\d+$/i.test(v)) return true;
  if (v.length > 16) return true;
  return false;
}

/** Prefer Mã NB / numeric BN for PatientID1; keep HS-like ids in PatientID2. */
export function normalizePatientIds(opts: {
  PatientID1?: string;
  PatientID2?: string;
}): { PatientID1: string; PatientID2: string } {
  let id1 = String(opts.PatientID1 || '').trim();
  let id2 = String(opts.PatientID2 || '').trim();

  if (isLikelyGarbagePatientId(id1)) id1 = '';
  if (isLikelyGarbagePatientId(id2) && !/^\d{8,14}$/.test(id2)) id2 = '';

  // Strip BN-/HS- prefixes
  id1 = id1.replace(/^(bn|mbn|ma\s*bn)[-_:\s]*/i, '').trim();
  id2 = id2.replace(/^(hs|ma\s*hs|ma\s*ho\s*so)[-_:\s]*/i, '').trim();

  const looksLikeHs = (v: string) => /hs|ma\s*hs|hoso/i.test(v);
  const looksNumericNb = (v: string) => /^\d{8,14}$/.test(v);

  if (!id1 && looksNumericNb(id2) && !looksLikeHs(String(opts.PatientID2 || ''))) {
    id1 = id2;
    id2 = '';
  }
  if (id1 && id2 && looksLikeHs(id1) && looksNumericNb(id2)) {
    const swap = id1;
    id1 = id2;
    id2 = swap;
  }
  // Prefer pure numeric as PatientID1 when both present and id1 is garbage-ish
  if (!looksNumericNb(id1) && looksNumericNb(id2)) {
    id1 = id2;
    id2 = '';
  }
  return { PatientID1: id1, PatientID2: id2 };
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
  const ids = normalizePatientIds({
    PatientID1: extract.PatientID1,
    PatientID2: extract.PatientID2,
  });
  const detailFromTte =
    extract.DetailDiagnosis ||
    extract.tteConclusion ||
    (extract.tteFindings || []).filter(Boolean).join('\n') ||
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
      PatientID1: ids.PatientID1,
      PatientID2: ids.PatientID2,
      PatientName: String(extract.PatientName || '').trim(),
      OtherPatientName: String(extract.OtherPatientName || '').trim(),
      PatientDOB: normalizeVnDate(extract.PatientDOB),
      PatientSex: normalizePatientSex(extract.PatientSex),
      // Do not invent a province (old default TP Hà Nội caused wrong address).
      PatientAddress: addressMatch.value || '',
      PatientPhone1: String(extract.PatientPhone || '').trim().replace(/[^\d]/g, ''),
      PatientPhone2: '',
      Outcome: '' as const,
    },
    addressUnmatched: Boolean(addressMatch.unmatched || (!addressMatch.value && extract.PatientAddress)),
    ocrAddressRaw: String(extract.PatientAddress || '').trim(),
  };
}
