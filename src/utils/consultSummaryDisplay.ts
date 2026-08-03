/** Shared display helpers for consult scheduling summary cards/modals. */

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
