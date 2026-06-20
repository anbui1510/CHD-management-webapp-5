import { Patient, CathLab, normalizePatientKey, removeDiacritics } from '../types';

export function normalizeCathDateKey(value: unknown): string {
  const trimmed = String(value ?? '').trim().split('T')[0];
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  const parts = trimmed.includes('/') ? trimmed.split('/') : trimmed.split('-');
  if (parts.length === 3 && parts[2].length === 4) {
    return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
  }
  if (parts.length === 3 && parts[0].length === 4) {
    return `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
  }
  return trimmed;
}

export function normalizeHisPatientId(value: unknown): string {
  return String(value ?? '').trim().toLowerCase();
}

export function buildCathImportDateKey(patientId: string, cathDate: string): string {
  return `${normalizeHisPatientId(patientId)}|${normalizeCathDateKey(cathDate)}`;
}

export function parseCathMethods(methodStr: unknown): string[] {
  if (Array.isArray(methodStr)) return methodStr.map(String).filter(Boolean);
  if (typeof methodStr !== 'string' || !methodStr.trim()) return [];
  if (methodStr.includes('+')) {
    return methodStr.split('+').map(s => s.trim()).filter(Boolean);
  }
  return [methodStr.trim()];
}

export function isHisImportedCath(cath: CathLab): boolean {
  return (
    String(cath.CathNote || '').includes('Import từ file thủ thuật HIS') ||
    String(cath.CathKey || '').startsWith('cath_his_')
  );
}

export function shouldSkipDuplicateHisImport(existing: CathLab, cathMethod: string): boolean {
  if (!isHisImportedCath(existing)) return false;
  const methods = parseCathMethods(existing.CathMethod);
  if (methods.length === 0) return false;
  const normalizedNew = removeDiacritics(cathMethod).toLowerCase().trim();
  return methods.some(m => removeDiacritics(String(m)).toLowerCase().trim() === normalizedNew);
}

export function findExistingCathForHisMerge(
  patientKey: string,
  cathDate: string,
  cathlabs: CathLab[]
): CathLab | undefined {
  const pk = normalizePatientKey(patientKey);
  const dateKey = normalizeCathDateKey(cathDate);
  const matches = cathlabs.filter(
    cath =>
      normalizePatientKey(cath.PatientKey) === pk && normalizeCathDateKey(cath.CathDate) === dateKey
  );
  if (matches.length === 0) return undefined;
  return matches.find(cath => !isHisImportedCath(cath)) || matches[0];
}

export function buildHisImportNoteLine(consultKey?: string): string {
  return consultKey
    ? `Import từ file thủ thuật HIS; đối soát ConsultKey=${consultKey}`
    : 'Import từ file thủ thuật HIS; chưa tìm thấy hội chẩn phù hợp để đối soát';
}

export function mergeHisIntoExistingCath(
  existing: CathLab,
  hisFields: Partial<CathLab>,
  consultKey?: string
): CathLab {
  const manualNote = String(existing.CathNote || '').trim();
  const resolvedConsultKey = consultKey || hisFields.ConsultKey || '';
  const hisNoteLine = buildHisImportNoteLine(resolvedConsultKey || undefined);
  const hasManualNote = manualNote && !manualNote.includes('Import từ file thủ thuật HIS');

  let cathNote: string;
  if (hasManualNote) {
    cathNote = manualNote.includes(hisNoteLine) ? manualNote : `${manualNote}\n${hisNoteLine}`;
  } else {
    cathNote = manualNote || hisNoteLine;
  }

  const hisMethod = parseCathMethods(hisFields.CathMethod);
  const mergedMethod = hisMethod.length > 0 ? hisFields.CathMethod : existing.CathMethod;

  return {
    ...existing,
    ConsultKey: existing.ConsultKey || hisFields.ConsultKey || resolvedConsultKey || '',
    CathMethod: mergedMethod ?? existing.CathMethod,
    PostDiagnosis: String(hisFields.PostDiagnosis || '').trim() || existing.PostDiagnosis,
    PostDiagnosisID: hisFields.PostDiagnosisID || existing.PostDiagnosisID || existing.DiagnosisID,
    DiagnosisID: existing.DiagnosisID || hisFields.DiagnosisID || '',
    CathResultID: existing.CathResultID || hisFields.CathResultID || 'Thành công',
    CathPlan: existing.CathPlan || hisFields.CathPlan || '',
    _1stInterventionist: existing._1stInterventionist || hisFields._1stInterventionist || '',
    _2ndInterventionist: existing._2ndInterventionist || hisFields._2ndInterventionist || '',
    _3rdInterventionist: existing._3rdInterventionist || hisFields._3rdInterventionist || '',
    _4thInterventionist: existing._4thInterventionist || hisFields._4thInterventionist || '',
    CathNote: cathNote,
    CathUpdatedTime: hisFields.CathUpdatedTime ?? existing.CathUpdatedTime,
    CathUpdatedBy: hisFields.CathUpdatedBy ?? existing.CathUpdatedBy,
  };
}

export function collectPatientHisIds(patient: Patient): string[] {
  return [patient.PatientID1, ...(String(patient.PatientID2 || '').split('-'))]
    .map(id => normalizeHisPatientId(id))
    .filter(Boolean);
}
