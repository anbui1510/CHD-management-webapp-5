import type { CathLab, Consult, Operation } from '../types';

export type LatestDiagnosisSource = 'consult' | 'cathlab' | 'operation';

export interface LatestDiagnosis {
  date?: string;
  time: number;
  code?: string;
  detail?: string;
  source: LatestDiagnosisSource;
}

const SOURCE_PRIORITY: Record<LatestDiagnosisSource, number> = {
  operation: 3,
  cathlab: 2,
  consult: 1
};

export const normalizeRecordKey = (value?: string) => String(value || '').trim().toLowerCase();

export function parseMedicalDateTime(dateValue?: string): number {
  if (!dateValue) return 0;
  const trimmed = String(dateValue).trim().split('T')[0];

  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const time = new Date(trimmed).getTime();
    return Number.isNaN(time) ? 0 : time;
  }

  if (/^\d{2}\/\d{2}\/\d{4}$/.test(trimmed)) {
    const [day, month, year] = trimmed.split('/');
    const time = new Date(`${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`).getTime();
    return Number.isNaN(time) ? 0 : time;
  }

  if (/^\d{2}-\d{2}-\d{4}$/.test(trimmed)) {
    const [day, month, year] = trimmed.split('-');
    const time = new Date(`${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`).getTime();
    return Number.isNaN(time) ? 0 : time;
  }

  const time = new Date(trimmed).getTime();
  return Number.isNaN(time) ? 0 : time;
}

const trimText = (value?: string) => String(value || '').trim();

const hasDiagnosisContent = (code?: string, detail?: string) =>
  Boolean(trimText(code) || trimText(detail));

function buildConsultByKey(consults: Consult[]): Map<string, Consult> {
  const map = new Map<string, Consult>();
  for (const consult of consults) {
    const key = normalizeRecordKey(consult.ConsultKey);
    if (key) map.set(key, consult);
  }
  return map;
}

function findConsultDiagnosisFallback(consults: Consult[], beforeOrOnDate?: string): Consult | undefined {
  const cutoff = parseMedicalDateTime(beforeOrOnDate);
  return consults
    .filter(c => {
      const time = parseMedicalDateTime(c.ConsultDate);
      return time > 0 && (!cutoff || time <= cutoff) && hasDiagnosisContent(c.DiagnosisID, c.DetailDiagnosis);
    })
    .sort((a, b) => parseMedicalDateTime(b.ConsultDate) - parseMedicalDateTime(a.ConsultDate))[0];
}

function resolveCathLabDiagnosis(
  cath: CathLab,
  consults: Consult[],
  consultByKey: Map<string, Consult>
): { code: string; detail: string } {
  let code = trimText(cath.PostDiagnosisID) || trimText(cath.DiagnosisID);
  let detail = trimText(cath.PostDiagnosis);

  const linkedConsult = consultByKey.get(normalizeRecordKey(cath.ConsultKey));
  if (linkedConsult) {
    if (!code) code = trimText(linkedConsult.DiagnosisID);
    if (!detail) detail = trimText(linkedConsult.DetailDiagnosis);
  }

  if (!detail || !code) {
    const fallbackConsult = findConsultDiagnosisFallback(consults, cath.CathDate);
    if (fallbackConsult) {
      if (!code) code = trimText(fallbackConsult.DiagnosisID);
      if (!detail) detail = trimText(fallbackConsult.DetailDiagnosis);
    }
  }

  return { code, detail };
}

const hasDetailContent = (detail?: string) => Boolean(trimText(detail));

export function resolveLatestDiagnosis(input: {
  consults: Consult[];
  cathlabs: CathLab[];
  operations?: Operation[];
}): LatestDiagnosis | undefined {
  const consultByKey = buildConsultByKey(input.consults);

  const items: LatestDiagnosis[] = [
    ...input.consults.map(c => ({
      date: c.ConsultDate,
      time: parseMedicalDateTime(c.ConsultDate),
      code: trimText(c.DiagnosisID),
      detail: trimText(c.DetailDiagnosis),
      source: 'consult' as const
    })),
    ...input.cathlabs.map(cath => {
      const diagnosis = resolveCathLabDiagnosis(cath, input.consults, consultByKey);
      return {
        date: cath.CathDate,
        time: parseMedicalDateTime(cath.CathDate),
        code: diagnosis.code,
        detail: diagnosis.detail,
        source: 'cathlab' as const
      };
    }),
    ...(input.operations || []).map(op => ({
      date: op.SurgDate,
      time: parseMedicalDateTime(op.SurgDate),
      code: '',
      detail: trimText(op.PostDiagnosis || op.DetailDiagnosisManual),
      source: 'operation' as const
    }))
  ].filter(item => item.time > 0 && hasDiagnosisContent(item.code, item.detail));

  items.sort((a, b) => {
    if (b.time !== a.time) return b.time - a.time;
    const detailDiff = Number(hasDetailContent(b.detail)) - Number(hasDetailContent(a.detail));
    if (detailDiff !== 0) return detailDiff;
    return SOURCE_PRIORITY[b.source] - SOURCE_PRIORITY[a.source];
  });

  return items[0];
}

export function filterPatientConsults(consults: Consult[], patientKey: string) {
  const normalized = normalizeRecordKey(patientKey);
  return consults.filter(c => normalizeRecordKey(c.PatientKey) === normalized);
}

export function filterPatientCathlabs(cathlabs: CathLab[], patientKey: string, consultKeys: Set<string>) {
  const normalized = normalizeRecordKey(patientKey);
  return cathlabs.filter(
    cath =>
      normalizeRecordKey(cath.PatientKey) === normalized ||
      consultKeys.has(normalizeRecordKey(cath.ConsultKey))
  );
}

export function filterPatientOperations(operations: Operation[], patientKey: string, consultKeys: Set<string>) {
  const normalized = normalizeRecordKey(patientKey);
  return operations.filter(
    op =>
      normalizeRecordKey(op.PatientKey) === normalized ||
      consultKeys.has(normalizeRecordKey(op.ConsultKey))
  );
}
