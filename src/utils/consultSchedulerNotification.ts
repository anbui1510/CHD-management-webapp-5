import type { Consult, Notification, Patient, Staff } from '../types';
import { getDefaultSchedulerStaff } from './repeatInterventionConsult';
import {
  buildSchedulerNewConsultNotificationMessage,
  SCHEDULER_NEW_CONSULT_NOTIFY_TITLE,
} from './workflowMessages';

/** Kết luận staff đủ điều kiện vào view Xếp lịch & Dụng cụ (waitlist). */
export const SCHEDULER_ELIGIBLE_CONSULT_RESULTS = [
  'Can thiệp thông tim',
  'Chụp chẩn đoán +/- can thiệp',
  'Chụp chẩn đoán-Đo kháng lực',
  'Chụp chẩn đoán/Đo kháng lực',
  'Tiền Glenn',
  'Tiền Fontan',
  'Điện sinh lý',
] as const;

export function isConsultRemovedForScheduler(consult: Consult): boolean {
  return consult.Removed === true
    || String(consult.Removed).toUpperCase() === 'TRUE'
    || String(consult.Removed).toLowerCase() === 'có'
    || String(consult.Removed).toLowerCase() === 'yes';
}

export function hasConsultStaffResult(consult: Consult | undefined | null): boolean {
  if (!consult) return false;
  const result = String(consult.ConsultResultID || '').trim().toLowerCase();
  return !!result && !['nodata', 'no data', '-', '—'].includes(result);
}

export function isSchedulerEligibleConsultResult(consultResultID: string | undefined | null): boolean {
  const resID = String(consultResultID || '').trim();
  if (!resID) return false;
  if ((SCHEDULER_ELIGIBLE_CONSULT_RESULTS as readonly string[]).includes(resID)) return true;
  const normalized = SCHEDULER_ELIGIBLE_CONSULT_RESULTS.map(item => item.trim().toLowerCase());
  return normalized.includes(resID.toLowerCase());
}

export function shouldNotifySchedulerAboutConsult(
  previous: Consult | undefined | null,
  updated: Consult
): boolean {
  if (isConsultRemovedForScheduler(updated)) return false;
  if (!isSchedulerEligibleConsultResult(updated.ConsultResultID)) return false;
  if (!previous) return true;
  if (!hasConsultStaffResult(previous)) return true;
  if (!isSchedulerEligibleConsultResult(previous.ConsultResultID)) return true;
  return false;
}

export function buildSchedulerConsultNotification(input: {
  consult: Consult;
  patient?: Patient;
  scheduler: Staff;
}): Notification {
  const patientName = input.patient?.PatientName || input.patient?.OtherPatientName || '';
  const patientId = input.patient?.PatientID1 || '';

  return {
    NotificationKey: `notif_sched_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    StaffKey: input.scheduler.StaffKey,
    StaffName: input.scheduler.StaffName || input.scheduler.Name || '',
    Title: SCHEDULER_NEW_CONSULT_NOTIFY_TITLE,
    Message: buildSchedulerNewConsultNotificationMessage({
      patientName,
      diagnosisID: String(input.consult.DiagnosisID || ''),
      consultResultID: String(input.consult.ConsultResultID || ''),
    }),
    Severity: 'info',
    RelatedEntityType: 'Consult',
    RelatedEntityKey: input.consult.ConsultKey,
    PatientKey: input.consult.PatientKey,
    PatientID: patientId,
    PatientName: patientName,
    DedupKey: `notif:scheduler-new-consult:${input.consult.ConsultKey}`,
    IsRead: false,
    CreatedTime: new Date().toISOString(),
    ReadTime: '',
  };
}

export function resolveSchedulerConsultNotification(input: {
  previous?: Consult | null;
  updated: Consult;
  staffList: Staff[];
  patients: Patient[];
}): Notification | null {
  if (!shouldNotifySchedulerAboutConsult(input.previous, input.updated)) return null;

  const scheduler = getDefaultSchedulerStaff(input.staffList);
  if (!scheduler?.StaffKey) return null;

  const patient = input.patients.find(
    item => String(item.PatientKey || '') === String(input.updated.PatientKey || '')
  );

  return buildSchedulerConsultNotification({
    consult: input.updated,
    patient,
    scheduler,
  });
}
