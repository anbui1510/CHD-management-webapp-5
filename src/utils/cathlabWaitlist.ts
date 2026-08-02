import type { CathLab, Consult } from '../types';
import { normalizePatientKey } from '../types';

const normalizeRefKey = (value: unknown) => String(value ?? '').trim().toLowerCase();

/** Legacy Consult.Status values that should not appear in cath scheduling waitlist. */
export function isConsultWaitlistExcludedByStatus(status?: string): boolean {
  const normalized = String(status ?? '').trim().toLowerCase();
  if (!normalized) return false;
  if (normalized === 'no data') return true;
  if (normalized.includes('đã thông tim')) return true;
  return false;
}

export const getConsultDateKey = (value?: string): string => {
  if (!value) return '';
  const trimmed = value.trim().split('T')[0];
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;

  const dashParts = trimmed.split('-');
  if (dashParts.length === 3 && dashParts[2].length === 4) {
    return `${dashParts[2]}-${dashParts[1].padStart(2, '0')}-${dashParts[0].padStart(2, '0')}`;
  }

  const slashParts = trimmed.split('/');
  if (slashParts.length === 3) {
    if (slashParts[2].length === 4) {
      return `${slashParts[2]}-${slashParts[1].padStart(2, '0')}-${slashParts[0].padStart(2, '0')}`;
    }
    if (slashParts[0].length === 4) {
      return `${slashParts[0]}-${slashParts[1].padStart(2, '0')}-${slashParts[2].padStart(2, '0')}`;
    }
  }

  return trimmed;
};

export function buildCathlabsByPatientKey(cathlabs: CathLab[]): Map<string, CathLab[]> {
  const map = new Map<string, CathLab[]>();
  for (const cath of cathlabs) {
    const patientKey = normalizePatientKey(cath.PatientKey);
    if (!patientKey) continue;
    const bucket = map.get(patientKey);
    if (bucket) bucket.push(cath);
    else map.set(patientKey, [cath]);
  }
  return map;
}

/**
 * True when this consult should leave the cath scheduling waitlist because cath was already done.
 * - Direct ConsultKey link (normal future workflow)
 * - PlannedCathLabDate matches CathDate (historical imports missing ConsultKey)
 * - CathDate on/after ConsultDate for same patient (cath logged without ConsultKey link)
 */
export function isConsultCathCompleted(consult: Consult, patientCathlabs: CathLab[] | undefined): boolean {
  if (!patientCathlabs?.length) return false;

  const consultKey = normalizeRefKey(consult.id);
  const plannedDate = getConsultDateKey(consult.PlannedCathLabDate);
  const consultDate = getConsultDateKey(consult.ConsultDate);

  return patientCathlabs.some(cath => {
    const cathConsultKey = normalizeRefKey(cath.ConsultKey);
    if (consultKey && cathConsultKey === consultKey) return true;

    const cathDate = getConsultDateKey(cath.CathDate);
    if (!cathDate) return false;

    if (plannedDate && cathDate === plannedDate) return true;

    if (consultDate && cathDate >= consultDate) return true;

    return false;
  });
}
