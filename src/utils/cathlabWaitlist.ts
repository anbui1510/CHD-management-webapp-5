import type { CathLab, Consult, Patient } from '../types';
import { findPatientByKey, normalizePatientKey } from '../types';

export const CATH_WAITLIST_ELIGIBLE_RESULTS = [
  'Can thiệp thông tim',
  'Chụp chẩn đoán +/- can thiệp',
  'Chụp chẩn đoán-Đo kháng lực',
  'Chụp chẩn đoán/Đo kháng lực',
  'Tiền Glenn',
  'Tiền Fontan',
  'Điện sinh lý',
] as const;

const CATH_WAITLIST_ELIGIBLE_RESULTS_NORMALIZED = CATH_WAITLIST_ELIGIBLE_RESULTS.map(result =>
  result.trim().toLowerCase()
);

export function buildLatestConsultsMap(consults: Consult[]): Map<string, string> {
  const map = new Map<string, string>();
  const sorted = [...consults].sort((a, b) => {
    const aDate = a.ConsultDate || '';
    const bDate = b.ConsultDate || '';
    if (aDate !== bDate) return bDate.localeCompare(aDate);
    return (b.ConsultCreateTime || '').localeCompare(a.ConsultCreateTime || '');
  });

  sorted.forEach(consult => {
    if (!consult.PatientKey) return;
    const patientKey = normalizePatientKey(consult.PatientKey);
    if (!map.has(patientKey)) {
      map.set(patientKey, consult.ConsultKey);
    }
  });

  return map;
}

function isConsultRemoved(consult: Consult): boolean {
  return (
    consult.Removed === true ||
    String(consult.Removed || '').trim().toLowerCase() === 'true' ||
    String(consult.Removed || '').trim().toLowerCase() === 'có' ||
    String(consult.Removed || '').trim().toLowerCase() === 'yes'
  );
}

function isConsultTransferredToCathLab(consult: Consult): boolean {
  const transferred = String(consult.TransferredToCathLab ?? '').trim().toLowerCase();
  return (
    consult.TransferredToCathLab === true ||
    transferred === 'true' ||
    transferred === 'yes' ||
    transferred === 'có'
  );
}

function isEligibleCathWaitlistResult(consultResultId?: string): boolean {
  const resultId = (consultResultId || '').trim();
  if (CATH_WAITLIST_ELIGIBLE_RESULTS.includes(resultId as (typeof CATH_WAITLIST_ELIGIBLE_RESULTS)[number])) {
    return true;
  }
  return CATH_WAITLIST_ELIGIBLE_RESULTS_NORMALIZED.includes(resultId.toLowerCase());
}

function isExcludedCathWaitlistCallStatus(callStatus?: string): boolean {
  const normalized = String(callStatus || '').trim().toLowerCase();
  return (
    normalized === 'đã can thiệp/mổ' ||
    normalized === 'loại' ||
    normalized === 'đã làm nơi khác' ||
    normalized === 'muốn theo dõi nơi khác'
  );
}

/** Ca hội chẩn còn trong hàng chờ xếp lịch thông tim (logic đồng bộ CathLabSchedulerView). */
export function filterEligibleCathWaitlist(
  consults: Consult[],
  patients: Patient[],
  cathlabsByPatientKey: Map<string, CathLab[]>,
  latestConsultsMap: Map<string, string>
): Consult[] {
  return consults.filter(consult => {
    if (!consult.ConsultDate) return false;

    const patientKey = normalizePatientKey(consult.PatientKey);
    if (latestConsultsMap.get(patientKey) !== consult.ConsultKey) return false;
    if (isConsultCathCompleted(consult, cathlabsByPatientKey.get(patientKey))) return false;
    if (isConsultWaitlistExcludedByStatus(consult.Status)) return false;
    if (isConsultRemoved(consult)) return false;
    if (!isEligibleCathWaitlistResult(consult.ConsultResultID)) return false;
    if (isExcludedCathWaitlistCallStatus(consult.CallStatus)) return false;

    const patient = findPatientByKey(patients, consult.PatientKey);
    if (!patient) return false;

    const outcome = String(patient.Outcome || '').toLowerCase().trim();
    if (outcome === 'tử vong' || outcome === 'nặng xin về') return false;
    if (isConsultTransferredToCathLab(consult)) return false;

    return true;
  });
}

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
/** Ngưỡng cảnh báo trễ xếp lịch thông tim (tính từ ConsultDate, chỉ ca chưa có PlannedCathLabDate). */
export const SCHEDULE_DELAY_THRESHOLDS = {
  /** Bắt đầu hiện tam giác vàng */
  WARNING_MIN_DAYS: 14,
  /** Tam giác đỏ viền (4 tuần) */
  RED_OUTLINE_DAYS: 28,
  /** Tam giác đỏ đặc (3 tháng — đồng bộ notification server) */
  RED_FILLED_DAYS: 90,
  /** Tam giác đen đặc (6 tháng) */
  BLACK_FILLED_DAYS: 180,
} as const;

export type ScheduleDelayWarningLevel = 'yellow' | 'red-outline' | 'red-filled' | 'black';

export const SCHEDULE_DELAY_FILTER_TABS: ReadonlyArray<{
  tabId: 'delayYellow' | 'delayRedOutline' | 'delayRedFilled' | 'delayBlack';
  level: ScheduleDelayWarningLevel;
  label: string;
}> = [
  { tabId: 'delayYellow', level: 'yellow', label: 'Trễ 2 tuần' },
  { tabId: 'delayRedOutline', level: 'red-outline', label: 'Trễ 4 tuần' },
  { tabId: 'delayRedFilled', level: 'red-filled', label: 'Trễ 3 tháng' },
  { tabId: 'delayBlack', level: 'black', label: 'Trễ 6 tháng' },
] as const;

export interface ScheduleDelayWarningInfo {
  missedDays: number;
  level: ScheduleDelayWarningLevel;
  titleText: string;
}

export function hasPlannedCathLabDate(consult: Pick<Consult, 'PlannedCathLabDate'>): boolean {
  const value = String(consult.PlannedCathLabDate || '').trim().toLowerCase();
  return !!value && !['', '—', '-', 'nodata', 'no data'].includes(value);
}

export function getMissScheduleDays(
  consultDateStr: string | undefined,
  referenceDate: Date = new Date()
): number {
  const formattedDateKey = getConsultDateKey(consultDateStr);
  if (!formattedDateKey) return 0;

  const parts = formattedDateKey.split('-');
  if (parts.length !== 3) return 0;

  const y = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10) - 1;
  const d = parseInt(parts[2], 10);
  const consultDate = new Date(y, m, d);
  if (isNaN(consultDate.getTime())) return 0;

  const today = new Date(referenceDate);
  today.setHours(0, 0, 0, 0);
  consultDate.setHours(0, 0, 0, 0);

  const diffDays = Math.floor((today.getTime() - consultDate.getTime()) / (1000 * 60 * 60 * 24));
  return diffDays > 0 ? diffDays : 0;
}

export function getScheduleDelayWarningInfo(
  consult: Pick<Consult, 'ConsultDate' | 'PlannedCathLabDate'>,
  referenceDate: Date = new Date()
): ScheduleDelayWarningInfo | null {
  if (hasPlannedCathLabDate(consult)) return null;

  const missedDays = getMissScheduleDays(consult.ConsultDate, referenceDate);
  if (missedDays < SCHEDULE_DELAY_THRESHOLDS.WARNING_MIN_DAYS) return null;

  let level: ScheduleDelayWarningLevel = 'yellow';
  let titleText = `Bệnh nhân đã bị trễ ${missedDays} ngày xếp lịch`;

  if (missedDays >= SCHEDULE_DELAY_THRESHOLDS.BLACK_FILLED_DAYS) {
    level = 'black';
    titleText = `CẢNH BÁO: Bệnh nhân đã trễ quá 6 tháng chưa xếp lịch (${missedDays} ngày)`;
  } else if (missedDays >= SCHEDULE_DELAY_THRESHOLDS.RED_FILLED_DAYS) {
    level = 'red-filled';
    titleText = `CẢNH BÁO: Bệnh nhân đã trễ quá 3 tháng chưa xếp lịch (${missedDays} ngày)`;
  } else if (missedDays >= SCHEDULE_DELAY_THRESHOLDS.RED_OUTLINE_DAYS) {
    level = 'red-outline';
  }

  return { missedDays, level, titleText };
}

export function isConsultInScheduleDelayLevel(
  consult: Pick<Consult, 'ConsultDate' | 'PlannedCathLabDate'>,
  level: ScheduleDelayWarningLevel,
  referenceDate: Date = new Date()
): boolean {
  return getScheduleDelayWarningInfo(consult, referenceDate)?.level === level;
}

export function isConsultUnscheduledForCathLab(
  consult: Pick<Consult, 'PlannedCathLabDate'>
): boolean {
  return !hasPlannedCathLabDate(consult);
}

export function isConsultLateForScheduling(
  consult: Pick<Consult, 'ConsultDate' | 'PlannedCathLabDate'>,
  minDays: number,
  referenceDate: Date = new Date(),
  maxDays?: number
): boolean {
  if (hasPlannedCathLabDate(consult)) return false;
  const missedDays = getMissScheduleDays(consult.ConsultDate, referenceDate);
  if (missedDays < minDays) return false;
  if (maxDays !== undefined && missedDays >= maxDays) return false;
  return true;
}

function isTransferredToCathLabConsult(consult: Consult): boolean {
  return consult.TransferredToCathLab === true
    || String(consult.TransferredToCathLab || '').trim().toLowerCase() === 'true'
    || String(consult.TransferredToCathLab || '').trim().toLowerCase() === 'yes'
    || String(consult.TransferredToCathLab || '').trim().toLowerCase() === 'có';
}

export function isConsultCathCompleted(consult: Consult, patientCathlabs: CathLab[] | undefined): boolean {
  if (!patientCathlabs?.length) return false;

  const consultKey = normalizeRefKey(consult.ConsultKey);
  const plannedDate = getConsultDateKey(consult.PlannedCathLabDate);
  const consultDate = getConsultDateKey(consult.ConsultDate);

  return patientCathlabs.some(cath => {
    const cathConsultKey = normalizeRefKey(cath.ConsultKey);
    if (consultKey && cathConsultKey === consultKey) return true;

    const cathDate = getConsultDateKey(cath.CathDate);
    if (!cathDate) return false;

    if (plannedDate && cathDate === plannedDate) return true;

    // Cath logged without ConsultKey link — only when this consult was actively queued for cath.
    // Repeat-intervention consults are created after cath with the same ConsultDate but must
    // remain visible in Xếp lịch & Dụng cụ for the next procedure.
    if (consultDate && cathDate >= consultDate) {
      return hasPlannedCathLabDate(consult) || isTransferredToCathLabConsult(consult);
    }

    return false;
  });
}
