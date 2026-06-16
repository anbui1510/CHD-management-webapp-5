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

const hasDiagnosisContent = (code?: string, detail?: string) =>
  Boolean(String(code || '').trim() || String(detail || '').trim());

export function resolveLatestDiagnosis(input: {
  consults: Consult[];
  cathlabs: CathLab[];
  operations?: Operation[];
}): LatestDiagnosis | undefined {
  const items: LatestDiagnosis[] = [
    ...input.consults.map(c => ({
      date: c.ConsultDate,
      time: parseMedicalDateTime(c.ConsultDate),
      code: c.DiagnosisID,
      detail: c.DetailDiagnosis,
      source: 'consult' as const
    })),
    ...input.cathlabs.map(cath => ({
      date: cath.CathDate,
      time: parseMedicalDateTime(cath.CathDate),
      code: cath.PostDiagnosisID,
      detail: cath.PostDiagnosis,
      source: 'cathlab' as const
    })),
    ...(input.operations || []).map(op => ({
      date: op.SurgDate,
      time: parseMedicalDateTime(op.SurgDate),
      code: '',
      detail: op.PostDiagnosis || op.DetailDiagnosisManual,
      source: 'operation' as const
    }))
  ].filter(item => item.time > 0 && hasDiagnosisContent(item.code, item.detail));

  items.sort((a, b) => {
    if (b.time !== a.time) return b.time - a.time;
    return SOURCE_PRIORITY[b.source] - SOURCE_PRIORITY[a.source];
  });

  return items[0];
}

export const normalizeRecordKey = (value?: string) => String(value || '').trim().toLowerCase();

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
