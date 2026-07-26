import type { CathLab, Consult } from '../types';
import {
  buildCathlabsByPatientKey,
  getMissScheduleDays,
  getScheduleDelayWarningInfo,
  hasPlannedCathLabDate,
  isConsultCathCompleted,
  isConsultWaitlistExcludedByStatus,
  SCHEDULE_DELAY_THRESHOLDS,
  type ScheduleDelayWarningLevel,
} from './cathlabWaitlist';
import {
  buildScheduleDelayReminderMessage,
  SCHEDULE_DELAY_REMINDER_NOTIFY_TITLE,
} from './workflowMessages';

export { SCHEDULE_DELAY_REMINDER_NOTIFY_TITLE, buildScheduleDelayReminderMessage };

export type ScheduleDelayNotificationConfig = {
  level: ScheduleDelayWarningLevel;
  minDays: number;
  label: string;
  dedupSuffix: string;
  severity: 'warning' | 'critical';
};

/** Ngưỡng nhắc BS xếp lịch — đồng bộ UI tam giác và server monitor. */
export const SCHEDULE_DELAY_NOTIFICATION_CONFIG: readonly ScheduleDelayNotificationConfig[] = [
  {
    level: 'yellow',
    minDays: SCHEDULE_DELAY_THRESHOLDS.WARNING_MIN_DAYS,
    label: 'Trễ 2 tuần',
    dedupSuffix: '2w',
    severity: 'warning',
  },
  {
    level: 'red-outline',
    minDays: SCHEDULE_DELAY_THRESHOLDS.RED_OUTLINE_DAYS,
    label: 'Trễ 4 tuần',
    dedupSuffix: '4w',
    severity: 'warning',
  },
  {
    level: 'red-filled',
    minDays: SCHEDULE_DELAY_THRESHOLDS.RED_FILLED_DAYS,
    label: 'Trễ 3 tháng',
    dedupSuffix: '3m',
    severity: 'warning',
  },
  {
    level: 'black',
    minDays: SCHEDULE_DELAY_THRESHOLDS.BLACK_FILLED_DAYS,
    label: 'Trễ 6 tháng',
    dedupSuffix: '6m',
    severity: 'critical',
  },
] as const;

export function isConsultRemoved(consult: Consult): boolean {
  return consult.Removed === true
    || String(consult.Removed).toUpperCase() === 'TRUE'
    || String(consult.Removed).toLowerCase() === 'có'
    || String(consult.Removed).toLowerCase() === 'yes';
}

export function isConsultEligibleForScheduleDelayReminder(
  consult: Consult,
  cathlabsByPatientKey: Map<string, CathLab[]>,
  referenceDate: Date = new Date()
): boolean {
  if (consult.ConsultType !== 'Staff thông') return false;
  if (isConsultRemoved(consult)) return false;
  if (hasPlannedCathLabDate(consult)) return false;
  if (isConsultWaitlistExcludedByStatus(consult.Status)) return false;

  const patientKey = String(consult.PatientKey || '').trim().replace(/_dup_\d+$/i, '').toLowerCase();
  const patientCaths = cathlabsByPatientKey.get(patientKey);
  if (isConsultCathCompleted(consult, patientCaths)) return false;

  return getMissScheduleDays(consult.ConsultDate, referenceDate) >= SCHEDULE_DELAY_THRESHOLDS.WARNING_MIN_DAYS;
}

export function getScheduleDelayNotificationLevelsForConsult(
  consult: Pick<Consult, 'ConsultDate' | 'PlannedCathLabDate'>,
  referenceDate: Date = new Date()
): ScheduleDelayNotificationConfig[] {
  const warning = getScheduleDelayWarningInfo(consult, referenceDate);
  if (!warning) return [];

  return SCHEDULE_DELAY_NOTIFICATION_CONFIG.filter(cfg => warning.missedDays >= cfg.minDays);
}

/** DedupKey 3 tháng giữ legacy để không gửi trùng bản cũ. */
export function buildScheduleDelayReminderDedupKey(consultKey: string, config: ScheduleDelayNotificationConfig): string {
  if (config.dedupSuffix === '3m') {
    return `missed_3m_delay_${consultKey}`;
  }
  return `schedule_delay_${config.dedupSuffix}_${consultKey}`;
}

export { buildCathlabsByPatientKey, getMissScheduleDays };
