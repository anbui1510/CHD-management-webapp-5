/**
 * Centralized workflow warning and scheduling notification message templates.
 *
 * Tone rules:
 * - Informational (past event): cath/HIS/override already happened — state facts only.
 * - Reminder (overdue): deadline passed, action still pending — may use "Mời bạn...".
 */

export const WORKFLOW_INFO_NOTIFY_TITLE = 'Thông báo';
export const WORKFLOW_REMINDER_NOTIFY_TITLE = 'Cảnh báo';
/** @deprecated Use WORKFLOW_INFO_NOTIFY_TITLE or WORKFLOW_REMINDER_NOTIFY_TITLE */
export const SCAR_WORKFLOW_NOTIFY_TITLE = WORKFLOW_INFO_NOTIFY_TITLE;

export const HIS_IMPORT_AUTO_CLOSE_NOTIFY_TITLE = 'HIS import tự hoàn tất ca treo';
export const REPEAT_INTERVENTION_NOTIFY_TITLE = 'Chỉ định can thiệp lại';

export const REPEAT_INTERVENTION_WARNING =
  'Bệnh nhân này sẽ tự động chuyển vào view "Xếp lịch & Dụng cụ". Hãy thông báo cho người phụ trách nhận thông tin';

export const REPEAT_INTERVENTION_DEFAULT_DETAIL_CONSULT_RESULT =
  'Chỉ định can thiệp thông tim lại sau lần TT vừa rồi';

export type HisWorkflowStage =
  | 'missing_staff_result'
  | 'scheduler_missing_transfer'
  | 'missing_cath_result';

export const HIS_STAGE_LABELS: Record<HisWorkflowStage, string> = {
  missing_staff_result: 'Chưa hoàn tất kết quả staff',
  scheduler_missing_transfer: 'Chưa hoàn tất xếp lịch/chuyển phòng TT',
  missing_cath_result: 'Chưa nhập kết quả thông tim',
};

export const EMERG_PROG_LABEL_SKIP_CONSULT = 'Thông tim CT bỏ qua hội chẩn';
export const EMERG_PROG_LABEL_LATE_STAFF_RESULT = 'Trễ điền kết quả hội chẩn';
export const EMERG_PROG_LABEL_PENDING_TRANSFER = 'Treo ca chờ hội chẩn';
export const EMERG_PROG_LABEL_SLOW_TRANSFER = 'Chậm chuyển phòng thông tim';

export const SCHEDULING_SUMMARY_UPDATE_SECTION_HEADER = '📅 *THÔNG TIN CẬP NHẬT XẾP LỊCH:*';

export function getHisStageLabel(stage: HisWorkflowStage): string {
  return HIS_STAGE_LABELS[stage];
}

export function getHisImportNotificationSeverity(stage: HisWorkflowStage): 'warning' | 'critical' {
  return stage === 'missing_cath_result' ? 'critical' : 'warning';
}

export function getHisImportMarkScore(stage: HisWorkflowStage): number {
  return stage === 'missing_cath_result' ? 2 : 1;
}

export function buildHisImportNotificationMessage(input: {
  patientName: string;
  patientId?: string;
  cathDateFormatted: string;
  stage: HisWorkflowStage;
}): string {
  const displayName = input.patientName || input.patientId || '';
  return `${displayName} đã có kết quả thông tim thực tế ngày ${input.cathDateFormatted} từ HIS. Workflow treo "${getHisStageLabel(input.stage)}" đã được tự động đóng.`;
}

export function buildHisAutoCloseConsultLogLine(input: {
  isoTimestamp: string;
  stage: HisWorkflowStage;
  cathDateFormatted: string;
  cathKey: string;
}): string {
  return `[HIS import ${input.isoTimestamp}] Đã tự hoàn tất workflow "${getHisStageLabel(input.stage)}" vì HIS ghi nhận ca thông tim thực tế ngày ${input.cathDateFormatted}. CathKey=${input.cathKey}`;
}

/** Ca CT đã TT khi chưa đăng ký HC — thông báo sự việc đã xảy ra. */
export function buildEmergProgCaseAScar(input: { patientName: string; patientId: string }) {
  const text = `Bệnh nhi ${input.patientName} (ID1: ${input.patientId}) đã thông tim chương trình khi chưa được đăng ký hội chẩn.`;
  return {
    label: EMERG_PROG_LABEL_SKIP_CONSULT,
    reason: text,
    message: text,
  };
}

/** Ca CT đã TT, HC vẫn treo chưa KQ staff — thông báo sự việc đã xảy ra. */
export function buildEmergProgCaseBTaiScar(input: { patientName: string }) {
  const text = `Bệnh nhi ${input.patientName} đã thông tim chương trình; hồ sơ hội chẩn vẫn còn treo chưa có kết quả staff.`;
  return {
    label: EMERG_PROG_LABEL_LATE_STAFF_RESULT,
    reason: text,
    message: text,
  };
}

/** Ca CT đã TT, vẫn còn trên DS HC chưa chuyển phòng — thông báo sự việc đã xảy ra. */
export function buildEmergProgCaseBHieuScar(input: { patientName: string }) {
  const text = `Bệnh nhi ${input.patientName} đã thông tim chương trình; ca vẫn còn trên danh sách hội chẩn chưa chuyển phòng.`;
  return {
    label: EMERG_PROG_LABEL_PENDING_TRANSFER,
    reason: text,
    message: text,
  };
}

/** Ca CT đã TT khi HC chưa chuyển phòng đúng quy trình — thông báo sự việc đã xảy ra. */
export function buildEmergProgCaseCScar(input: { patientName: string }) {
  const text = `Bệnh nhi ${input.patientName} đã thông tim chương trình khi hồ sơ hội chẩn chưa được chuyển phòng.`;
  return {
    label: EMERG_PROG_LABEL_SLOW_TRANSFER,
    reason: text,
    message: text,
  };
}

/** Vượt quyền xếp lịch đã kích hoạt — thông báo sự việc đã xảy ra. */
export function buildOverrideSchedulingScar(input: { patientName: string; patientId: string }) {
  const text = `BS xếp lịch đã vượt quyền kích hoạt xếp lịch bổ sung cho bệnh nhi ${input.patientName} (ID1: ${input.patientId}); kết quả hội chẩn của ca này chưa được điền đúng hạn.`;
  return {
    label: EMERG_PROG_LABEL_LATE_STAFF_RESULT,
    reason: text,
    message: text,
  };
}

export function buildOverrideSchedulingConsultNote(staffName: string, isoTimestamp: string): string {
  return `[Kích hoạt xếp lịch bổ sung - ${staffName} ${isoTimestamp}]`;
}

export function buildRepeatInterventionNotificationMessage(input: {
  patientName: string;
  postDiagnosisID: string;
}): string {
  return `Bệnh nhân ${input.patientName} chẩn đoán ${input.postDiagnosisID} có chỉ định can thiệp lại đã được lưu trong "Xếp lịch & Dụng cụ".`;
}

export function buildSchedulingSummaryHeader(patientNameWithPtvUpper: string): string {
  return `📋 *THÔNG TIN TÓM TẮT XẾP LỊCH: ${patientNameWithPtvUpper}* 📋`;
}
