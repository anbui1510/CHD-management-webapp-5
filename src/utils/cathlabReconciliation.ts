import type { CathLab, Consult, Patient } from '../types';
import { normalizePatientKey } from '../types';

const ELIGIBLE_CATH_RESULTS = [
  'can thiệp thông tim',
  'chụp chẩn đoán +/- can thiệp',
  'chụp chẩn đoán-đo kháng lực',
  'chụp chẩn đoán/đo kháng lực',
  'tiền glenn',
  'tiền fontan',
  'điện sinh lý'
];

export type ReconciliationStatus = 'confident' | 'review' | 'unmatched' | 'already-linked';

export type ReconciliationItem = {
  status: ReconciliationStatus;
  cath: CathLab;
  patient?: Patient;
  matchedConsult?: Consult;
  score: number;
  reason: string;
  candidates: Array<{
    consult: Consult;
    score: number;
    reason: string;
  }>;
};

const normalizeRefKey = (value: unknown) => String(value ?? '').trim().toLowerCase();

const parseDateTime = (value?: string) => {
  const raw = String(value || '').trim();
  if (!raw) return Number.NaN;
  const dateOnly = raw.includes('T') ? raw.split('T')[0] : raw.split(/\s+/)[0];
  return new Date(`${dateOnly}T00:00:00`).getTime();
};

const dateDistanceDays = (a?: string, b?: string) => {
  const timeA = parseDateTime(a);
  const timeB = parseDateTime(b);
  if (Number.isNaN(timeA) || Number.isNaN(timeB)) return Number.POSITIVE_INFINITY;
  return Math.abs(timeA - timeB) / (1000 * 60 * 60 * 24);
};

const isConsultBeforeCath = (consult: Consult, cath: CathLab) => {
  const consultTime = parseDateTime(consult.ConsultDate);
  const cathTime = parseDateTime(cath.CathDate);
  if (Number.isNaN(consultTime) || Number.isNaN(cathTime)) return false;
  return consultTime <= cathTime;
};

const isEligibleCathConsult = (consult: Consult) => {
  const result = String(consult.ConsultResultID || '').trim().toLowerCase();
  if (!result) return false;
  return ELIGIBLE_CATH_RESULTS.includes(result);
};

const isTransferred = (consult: Consult) => {
  const value = String(consult.TransferredToCathLab || '').trim().toLowerCase();
  return consult.TransferredToCathLab === true || value === 'true' || value === 'yes' || value === 'có';
};

const resolvePatient = (cath: CathLab, patients: Patient[]) => {
  const cathPatientKey = normalizePatientKey(cath.PatientKey);
  if (!cathPatientKey) return undefined;
  return patients.find(patient => {
    const patientKey = normalizePatientKey(patient.id);
    const id1 = normalizeRefKey(patient.PatientID1);
    const id2s = String(patient.PatientID2 || '')
      .split('-')
      .map(normalizeRefKey)
      .filter(Boolean);
    return patientKey === cathPatientKey || id1 === cathPatientKey || id2s.includes(cathPatientKey);
  });
};

const cathNeedsReconciliation = (
  cath: CathLab,
  consultByKey: Map<string, Consult>
) => {
  const cathConsultKey = normalizeRefKey(cath.ConsultKey);
  if (!cathConsultKey) return true;
  const linkedConsult = consultByKey.get(cathConsultKey);
  if (!linkedConsult) return true;
  return normalizePatientKey(linkedConsult.PatientKey) !== normalizePatientKey(cath.PatientKey);
};

export function buildCathlabReconciliation(
  patients: Patient[],
  consults: Consult[],
  cathlabs: CathLab[]
): ReconciliationItem[] {
  const consultByKey = new Map(consults.map(consult => [normalizeRefKey(consult.id), consult]));
  const cathConsultKeys = new Set(
    cathlabs
      .map(cath => normalizeRefKey(cath.ConsultKey))
      .filter(Boolean)
  );

  return cathlabs.map(cath => {
    const cathConsultKey = normalizeRefKey(cath.ConsultKey);
    if (cathConsultKey && !cathNeedsReconciliation(cath, consultByKey)) {
      return {
        status: 'already-linked',
        cath,
        patient: resolvePatient(cath, patients),
        matchedConsult: consultByKey.get(cathConsultKey),
        score: 999,
        reason: 'CathLab đã có ConsultKey hợp lệ.',
        candidates: []
      };
    }

    const patient = resolvePatient(cath, patients);
    const normalizedPatientKey = normalizePatientKey(patient?.id || cath.PatientKey);
    const patientConsults = consults.filter(consult =>
      normalizePatientKey(consult.PatientKey) === normalizedPatientKey &&
      normalizeRefKey(consult.id) !== cathConsultKey &&
      !cathConsultKeys.has(normalizeRefKey(consult.id))
    );

    const candidates = patientConsults
      .map(consult => {
        const plannedDistance = dateDistanceDays(consult.PlannedCathLabDate, cath.CathDate);
        const consultDistance = dateDistanceDays(consult.ConsultDate, cath.CathDate);
        const beforeCath = isConsultBeforeCath(consult, cath);
        const eligible = isEligibleCathConsult(consult);
        const onlyConsultBonus = patientConsults.length === 1 ? 90 : 0;
        const score =
          (eligible ? 220 : 0) +
          (isTransferred(consult) ? 140 : 0) +
          (beforeCath ? 100 : -220) +
          (plannedDistance <= 3 ? 220 : plannedDistance <= 14 ? 150 : plannedDistance <= 60 ? 70 : 0) +
          (consultDistance <= 30 ? 120 : consultDistance <= 180 ? 60 : 0) +
          onlyConsultBonus -
          Math.min(consultDistance, 365) * 0.15;

        const reasons = [
          eligible ? 'kết luận thuộc nhóm thông tim' : 'kết luận không rõ nhóm thông tim',
          beforeCath ? 'ngày hội chẩn trước/ngang ngày CathLab' : 'ngày hội chẩn sau CathLab',
          Number.isFinite(plannedDistance) ? `lệch lịch dự kiến ${Math.round(plannedDistance)} ngày` : 'không có ngày dự kiến',
          isTransferred(consult) ? 'đã chuyển phòng TT' : ''
        ].filter(Boolean);

        return { consult, score, reason: reasons.join(', ') };
      })
      .filter(candidate => candidate.score > 0)
      .sort((a, b) => b.score - a.score);

    const best = candidates[0];
    const second = candidates[1];
    if (!best) {
      return {
        status: 'unmatched',
        cath,
        patient,
        score: 0,
        reason: patient ? 'Không tìm thấy consult phù hợp cho bệnh nhân.' : 'Không tìm thấy bệnh nhân tương ứng.',
        candidates: []
      };
    }

    const gap = second ? best.score - second.score : Number.POSITIVE_INFINITY;
    const confident = best.score >= 260 && gap >= 40;
    return {
      status: confident ? 'confident' : 'review',
      cath,
      patient,
      matchedConsult: best.consult,
      score: Math.round(best.score),
      reason: confident ? `Match chắc: ${best.reason}` : `Cần kiểm tra: ${best.reason}`,
      candidates: candidates.slice(0, 3).map(candidate => ({
        ...candidate,
        score: Math.round(candidate.score)
      }))
    };
  });
}

export function buildReconciliationPatchOperations(items: ReconciliationItem[]) {
  const now = new Date().toISOString();
  return items
    .filter(item => item.status === 'confident' && item.matchedConsult)
    .flatMap(item => {
      const cathNote = String(item.cath.CathNote || '').trim();
      const consultNote = String(item.matchedConsult?.ConsultNote || '').trim();
      const logLine = `[Đối soát CathLab lịch sử ${now}] Tự gắn id=${item.matchedConsult?.id} cho id=${item.cath.id}.`;
      const hasResult = String(item.matchedConsult?.ConsultResultID || '').trim();
      return [
        {
          endpoint: 'cathlabs',
          method: 'PUT' as const,
          key: item.cath.id,
          data: {
            id: item.matchedConsult?.id || '',
            CathNote: cathNote ? `${cathNote}\n${logLine}` : logLine,
            CathUpdatedBy: 'RECONCILE',
            CathUpdatedTime: now
          }
        },
        {
          endpoint: 'consults',
          method: 'PUT' as const,
          key: item.matchedConsult?.id || '',
          data: {
            TransferredToCathLab: true,
            CallStatus: 'Đã can thiệp/mổ',
            PlannedCathLabDate: item.matchedConsult?.PlannedCathLabDate || item.cath.CathDate,
            ConsultResultID: hasResult ? item.matchedConsult?.ConsultResultID : 'Can thiệp thông tim',
            DetailConsultResult: String(item.matchedConsult?.DetailConsultResult || '').trim() || 'Đã thực hiện thông tim thực tế theo đối soát CathLab lịch sử',
            ConsultResultUpdatedBy: 'RECONCILE',
            ConsultResultUpdatedTime: now,
            ConsultNote: consultNote ? `${consultNote}\n${logLine}` : logLine
          }
        }
      ];
    });
}

