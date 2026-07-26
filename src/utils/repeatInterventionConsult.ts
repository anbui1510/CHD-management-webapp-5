import { Consult, Patient, Staff, normalizePatientKey } from '../types';
import { resolveStaffByNameOrKey } from './staffNameMatch';
import { buildSyncContext, persistWithSheetsSync, withSyncContext } from './sheetsSyncMutation';
import {
  REPEAT_INTERVENTION_DEFAULT_DETAIL_CONSULT_RESULT,
  REPEAT_INTERVENTION_NOTIFY_TITLE,
  REPEAT_INTERVENTION_WARNING,
  buildRepeatInterventionNotificationMessage,
} from './workflowMessages';

export const REPEAT_INTERVENTION_PLAN = 'Cần thông tim can thiệp lại';

export { REPEAT_INTERVENTION_WARNING };

const DEFAULT_SCHEDULER_STAFF_KEY = '01541';
const FALLBACK_SCHEDULER_STAFF_KEY = '77777';

export const isRepeatInterventionPlan = (cathPlan: string | undefined | null): boolean =>
  String(cathPlan || '').trim() === REPEAT_INTERVENTION_PLAN;

export function getLatestPatientConsult(patientKey: string, consults: Consult[]): Consult | undefined {
  const normalized = normalizePatientKey(patientKey);
  if (!normalized) return undefined;

  const patientConsults = consults.filter(c => {
    if (normalizePatientKey(c.PatientKey) !== normalized) return false;
    const isRemoved = c.Removed === true
      || String(c.Removed).toUpperCase() === 'TRUE'
      || String(c.Removed).toLowerCase() === 'có'
      || String(c.Removed).toLowerCase() === 'yes';
    return !isRemoved;
  });

  if (patientConsults.length === 0) return undefined;

  return [...patientConsults].sort((a, b) => {
    const dateCmp = String(b.ConsultDate || '').localeCompare(String(a.ConsultDate || ''));
    if (dateCmp !== 0) return dateCmp;
    return String(b.ConsultCreateTime || '').localeCompare(String(a.ConsultCreateTime || ''));
  })[0];
}

export function getDefaultSchedulerStaff(staffList: Staff[]): Staff | undefined {
  return staffList.find(staff => String(staff.StaffKey) === DEFAULT_SCHEDULER_STAFF_KEY)
    || staffList.find(staff => String(staff.StaffKey) === FALLBACK_SCHEDULER_STAFF_KEY)
    || resolveStaffByNameOrKey('BS. Hiếu', staffList);
}

export function buildRepeatInterventionConsult(input: {
  patientKey: string;
  cathDate: string;
  postDiagnosisID: string;
  postDiagnosis: string;
  cathNote: string;
  requestBy: string;
  loggedInStaffId: string;
  latestConsult?: Consult;
}): Consult {
  const detailDiagnosis = String(input.postDiagnosis || '').trim()
    || String(input.latestConsult?.DetailDiagnosis || '').trim()
    || '';

  const createdTime = new Date().toISOString();

  return {
    ConsultKey: `consult_repeat_${Date.now()}`,
    PatientKey: input.patientKey,
    ConsultType: 'Staff thông',
    PatientWeight: input.latestConsult?.PatientWeight || '',
    ConsultDate: input.cathDate,
    RequestBy: input.requestBy,
    DiagnosisID: input.postDiagnosisID,
    DetailDiagnosis: detailDiagnosis,
    Department: '',
    ConsultCreateBy: input.loggedInStaffId,
    ConsultCreateTime: createdTime,
    ConsultResultID: 'Can thiệp thông tim',
    DetailConsultResult: String(input.cathNote || '').trim() || REPEAT_INTERVENTION_DEFAULT_DETAIL_CONSULT_RESULT,
    ConsultNote: '',
    PlannedDevice: '',
    PlannedPrice: '',
    PriorityOrder: 'Chương trình',
    RiskFactor: '',
    CheckDevice: '',
    TransferredToCathLab: false,
    Removed: false,
  } as Consult;
}

const delay = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

export async function createRepeatInterventionWorkflow(input: {
  patientKey: string;
  patient?: Patient;
  cathDate: string;
  postDiagnosisID: string;
  postDiagnosis: string;
  cathNote: string;
  requestBy: string;
  loggedInStaffId: string;
  consults: Consult[];
  /** Consult vừa lưu trong cùng phiên (vd. chương trình vượt HC) — dùng để lấy PatientWeight/DetailDiagnosis */
  recentlySavedConsults?: Consult[];
  staffList: Staff[];
  reportMutationResponse: (data: unknown, options?: { baseMessage?: string }) => void;
  onSaveSuccess?: (message: string) => void;
  onAddConsult?: (consult: Consult) => void;
}): Promise<void> {
  const consultPool = input.recentlySavedConsults?.length
    ? [...input.consults, ...input.recentlySavedConsults]
    : input.consults;
  const latestConsult = getLatestPatientConsult(input.patientKey, consultPool);
  const newConsult = buildRepeatInterventionConsult({
    patientKey: input.patientKey,
    cathDate: input.cathDate,
    postDiagnosisID: input.postDiagnosisID,
    postDiagnosis: input.postDiagnosis,
    cathNote: input.cathNote,
    requestBy: input.requestBy,
    loggedInStaffId: input.loggedInStaffId,
    latestConsult,
  });

  const patientName = input.patient?.PatientName || '';
  const patientId = input.patient?.PatientID1 || '';
  const syncContext = buildSyncContext('schedule-tt', {
    patientName,
    patientKey: input.patientKey,
    viewLabel: 'Xếp lịch & Dụng cụ',
  });

  input.onSaveSuccess?.('Lưu bản ghi vào Google Sheets CathLab thành công');
  await delay(900);
  input.onSaveSuccess?.('Đang tạo bản ghi trong Google Sheets Consult (View "Xếp lịch & Dụng cụ")');

  input.onAddConsult?.(newConsult);

  await persistWithSheetsSync(
    input.reportMutationResponse,
    '/api/consults',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${localStorage.getItem('CHD_AUTH_TOKEN') || ''}`,
      },
      body: JSON.stringify(withSyncContext(newConsult, syncContext)),
    },
    syncContext,
    { baseMessage: 'Đã tạo bản ghi Xếp lịch & Dụng cụ' }
  );

  const scheduler = getDefaultSchedulerStaff(input.staffList);
  if (scheduler) {
    const notification = {
      NotificationKey: `notif_repeat_tt_${Date.now()}`,
      StaffKey: scheduler.StaffKey,
      StaffName: scheduler.StaffName || scheduler.Name || '',
      Title: REPEAT_INTERVENTION_NOTIFY_TITLE,
      Message: buildRepeatInterventionNotificationMessage({
        patientName,
        postDiagnosisID: input.postDiagnosisID,
      }),
      Severity: 'info',
      RelatedEntityType: 'Consult',
      RelatedEntityKey: newConsult.ConsultKey,
      PatientKey: input.patientKey,
      PatientID: patientId,
      PatientName: patientName,
      DedupKey: `repeat_intervention:${newConsult.ConsultKey}`,
      IsRead: false,
      CreatedTime: new Date().toISOString(),
      ReadTime: '',
    };

    await persistWithSheetsSync(
      input.reportMutationResponse,
      '/api/notifications',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${localStorage.getItem('CHD_AUTH_TOKEN') || ''}`,
        },
        body: JSON.stringify(notification),
      },
      syncContext,
      { baseMessage: 'Đã gửi thông báo cho người phụ trách Xếp lịch & Dụng cụ' }
    );
  }

  await delay(400);
  input.onSaveSuccess?.('Đã lưu và tạo bản ghi thành công.');
}
