/** Shared display helpers for consult scheduling summary cards/modals. */

import type { Consult } from '../types';

/** Kết luận hội chẩn mà tiêu đề tóm tắt có thể kèm PTV phụ (ngoài Staff thông). */
export const CONSULT_RESULTS_WITH_PTV_PHU = [
  'Can thiệp thông tim',
  'Chụp chẩn đoán +/- can thiệp',
  'Chụp chẩn đoán-Đo kháng lực',
  'Điện sinh lý',
  'Tiền Fontan',
  'Tiền Glenn',
] as const;

export const shouldShowPtvPhuInSummary = (consult: Pick<Consult, 'ConsultType' | 'ConsultResultID'>) => {
  if (consult.ConsultType === 'Staff thông') return true;
  const resultId = String(consult.ConsultResultID || '').trim();
  return CONSULT_RESULTS_WITH_PTV_PHU.some(
    id => id.toLowerCase() === resultId.toLowerCase()
  );
};

const CATH_INTERVENTIONIST_DOCTORS = [
  'BS. Phụng',
  'BS. Lợi',
  'BS. Thịnh',
  'BS. Ân',
  'BS. Tài',
  'BS. Hiếu',
  'BS. Hùng',
  'BS. Tĩnh',
];

export const formatPatientWithPtvPhu = (patientName: string, ptvPhu: string) => {
  if (!ptvPhu?.trim()) return patientName;
  return `${patientName} - PTV phụ: ${ptvPhu}`;
};

export const formatSummaryPatientTitle = (
  patientName: string,
  consult: Pick<Consult, 'ConsultType' | 'ConsultResultID'>,
  ptvPhu: string
) => {
  if (!shouldShowPtvPhuInSummary(consult)) return patientName;
  return formatPatientWithPtvPhu(patientName, ptvPhu);
};

export const getAutoScheduled2nd = (requestBy: string) => {
  if (!requestBy) return '';
  const norm = requestBy.trim();
  const found = CATH_INTERVENTIONIST_DOCTORS.find(doc =>
    norm.toLowerCase() === doc.toLowerCase() ||
    norm.toLowerCase().replace('bs.', '').trim() === doc.toLowerCase().replace('bs.', '').trim() ||
    norm.toLowerCase().includes(doc.toLowerCase().replace('bs.', '').trim())
  );
  return found || '';
};

export const resolvePtvPhu1Display = (
  requestBy: string,
  savedScheduled2nd?: string,
  stateScheduled2nd?: string
) => {
  const autoFromRequest = getAutoScheduled2nd(requestBy);
  if (autoFromRequest) return autoFromRequest;
  if (stateScheduled2nd?.trim()) return stateScheduled2nd.trim();
  if (savedScheduled2nd?.trim()) return savedScheduled2nd.trim();
  return '';
};
