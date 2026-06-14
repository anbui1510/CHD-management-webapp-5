import { CathLab, Consult, normalizePatientKey } from '../types';

const getRecordTime = (dateValue?: string) => {
  if (!dateValue) return 0;
  const time = new Date(String(dateValue).trim().split('T')[0]).getTime();
  return Number.isNaN(time) ? 0 : time;
};

export const getLatestPriorDetailDiagnosis = (
  patientKey: unknown,
  consults: Consult[],
  cathlabs: CathLab[] = [],
  beforeDate?: string
): string => {
  const normalizedKey = normalizePatientKey(patientKey);
  if (!normalizedKey) return '';

  const targetTime = beforeDate ? getRecordTime(beforeDate) : Number.POSITIVE_INFINITY;
  const isBeforeTarget = (dateValue?: string) => {
    if (!beforeDate) return true;
    const recordTime = getRecordTime(dateValue);
    return recordTime > 0 && recordTime <= targetTime;
  };

  const latestConsult = [...consults]
    .filter(c => normalizePatientKey(c.PatientKey) === normalizedKey && String(c.DetailDiagnosis || '').trim())
    .filter(c => isBeforeTarget(c.ConsultDate))
    .sort((a, b) => {
      const dateA = getRecordTime(a.ConsultDate);
      const dateB = getRecordTime(b.ConsultDate);
      if (dateA !== dateB) return dateB - dateA;
      return String(b.ConsultCreateTime || '').localeCompare(String(a.ConsultCreateTime || ''));
    })[0];

  const latestCath = [...cathlabs]
    .filter(c => normalizePatientKey(c.PatientKey) === normalizedKey && String(c.PostDiagnosis || '').trim())
    .filter(c => isBeforeTarget(c.CathDate))
    .sort((a, b) => {
      const dateA = getRecordTime(a.CathDate);
      const dateB = getRecordTime(b.CathDate);
      if (dateA !== dateB) return dateB - dateA;
      return String(b.CathUpdatedTime || '').localeCompare(String(a.CathUpdatedTime || ''));
    })[0];

  const consultTime = latestConsult ? getRecordTime(latestConsult.ConsultDate) : 0;
  const cathTime = latestCath ? getRecordTime(latestCath.CathDate) : 0;

  if (consultTime === 0 && cathTime === 0) return '';
  if (consultTime >= cathTime) return String(latestConsult?.DetailDiagnosis || '').trim();
  return String(latestCath?.PostDiagnosis || '').trim();
};
