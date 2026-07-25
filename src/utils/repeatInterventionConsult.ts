import { Consult, Patient, Staff, normalizePatientKey } from '../types';
import { resolveStaffByNameOrKey } from './staffNameMatch';
import { buildSyncContext, persistWithSheetsSync, withSyncContext } from './sheetsSyncMutation';

export const REPEAT_INTERVENTION_PLAN = 'Cần thông tim can thiệp lại';

export const REPEAT_INTERVENTION_WARNING =
  'Bệnh nhân này sẽ tự động chuyển vào view "Xếp lịch & Dụng cụ". Hãy thông báo cho người phụ trách nhận thông tin';

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

  return {
    ConsultKey: `consult_${Date.now()}`,
    PatientKey: input.patientKey,
    ConsultType: 'Staff thông',
    PatientWeight: input.latestConsult?.PatientWeight || '',
    ConsultDate: input.cathDate,
    RequestBy: input.requestBy,
    DiagnosisID: input.postDiagnosisID,
    DetailDiagnosis: detailDiagnosis,
    Department: '',
    ConsultCreateBy: input.loggedInStaffId,
    ConsultCreateTime: new Date().toISOString(),
    ConsultResultID: 'Can thiệp thông tim',
    DetailConsultResult: input.cathNote || '',
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
  staffList: Staff[];
  reportMutationResponse: (data: unknown, options?: { baseMessage?: string }) => void;
  onSaveSuccess?: (message: string) => void;
  onAddConsult?: (consult: Consult) => void;
}): Promise<void> {
  const latestConsult = getLatestPatientConsult(input.patientKey, input.consults);
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
      Title: 'Chỉ định can thiệp lại',
      Message: `Bệnh nhân ${patientName} chẩn đoán ${input.postDiagnosisID} có chỉ định can thiệp lại đã được lưu trong "Xếp lịch & Dụng cụ". Mời BS xem lại`,
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
