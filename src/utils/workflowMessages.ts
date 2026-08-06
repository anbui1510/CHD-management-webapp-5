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
export const SCHEDULER_NEW_CONSULT_NOTIFY_TITLE = 'Ca mới cần xếp lịch';

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

export const SCHEDULE_DELAY_REMINDER_NOTIFY_TITLE = 'Cảnh báo trễ xếp lịch';

export function buildScheduleDelayReminderMessage(input: {
  patientName: string;
  patientId: string;
  delayLabel: string;
  missedDays: number;
}): string {
  const name = input.patientName || 'không rõ tên';
  const id = input.patientId || 'không rõ mã';
  return `Bệnh nhi ${name} (ID1: ${id}) ${input.delayLabel.toLowerCase()} (${input.missedDays} ngày) chưa xếp lịch thông tim dự kiến. Mời bạn xem lại và xếp lịch.`;
}

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

export function buildSchedulerNewConsultNotificationMessage(input: {
  patientName: string;
  patientId: string;
  consultResultID: string;
  diagnosisID: string;
}): string {
  const name = input.patientName || 'không rõ tên';
  const id = input.patientId || 'không rõ mã';
  const result = input.consultResultID || 'chỉ định can thiệp';
  const dx = input.diagnosisID ? ` (${input.diagnosisID})` : '';
  return `Bệnh nhi ${name} (ID1: ${id})${dx} có kết luận "${result}" — cần xếp lịch trong "Xếp lịch & Dụng cụ".`;
}

export function buildSchedulingSummaryHeader(patientNameWithPtvUpper: string): string {
  return `📋 *THÔNG TIN TÓM TẮT XẾP LỊCH: ${patientNameWithPtvUpper}* 📋`;
}

const LEGACY_PENALTY_TITLE_PATTERN = /phạt\s*sẹo/gi;
const LEGACY_PENALTY_SENTENCE_PATTERN =
  /\s*(?:[;.]\s*)?Bạn\s+(?:đã\s+)?bị\s+phạt[^.!?]*[.!?]?\s*$/gi;
const LEGACY_PENALTY_INLINE_PATTERN = /\bphạt\s+\d+\s*sẹo\b/gi;
const LEGACY_SCAR_WORD_PATTERN = /\bsẹo\b/gi;
const LEGACY_PENALTY_WORD_PATTERN = /\bphạt\b/gi;

type NotificationLike = {
  Title?: string;
  Message?: string;
};

/** Chuẩn hóa tiêu đề thông báo cũ — bỏ thuật ngữ "phạt/sẹo", chỉ giữ "cảnh báo". */
export function sanitizeNotificationTitle(title: string): string {
  const raw = String(title || '').trim();
  if (!raw) return raw;

  if (LEGACY_PENALTY_TITLE_PATTERN.test(raw)) {
    return raw
      .replace(LEGACY_PENALTY_TITLE_PATTERN, 'Cảnh báo')
      .replace(/\s{2,}/g, ' ')
      .trim();
  }

  if (/(?:phạt|sẹo)/i.test(raw)) {
    const cleaned = raw
      .replace(LEGACY_SCAR_WORD_PATTERN, '')
      .replace(LEGACY_PENALTY_WORD_PATTERN, '')
      .replace(/\s{2,}/g, ' ')
      .trim();
    return cleaned || WORKFLOW_REMINDER_NOTIFY_TITLE;
  }

  return raw;
}

/** Chuẩn hóa nội dung thông báo cũ — bỏ câu/cụm "phạt sẹo". */
export function sanitizeNotificationMessage(message: string): string {
  let text = String(message || '').trim();
  if (!text) return text;

  text = text.replace(LEGACY_PENALTY_SENTENCE_PATTERN, '');
  text = text.replace(/\s*Bạn\s+bị\s+phạt\s+\d+\s*sẹo\.?\s*/gi, '');
  text = text.replace(/\s*\([^)]*\bphạt\b[^)]*\bsẹo\b[^)]*\)\s*/gi, ' ');
  text = text.replace(LEGACY_PENALTY_INLINE_PATTERN, '');
  text = text.replace(LEGACY_SCAR_WORD_PATTERN, '');
  text = text.replace(LEGACY_PENALTY_WORD_PATTERN, '');

  text = text.replace(
    /đã thông tim chương trình nhưng kết quả hội chẩn bị treo chưa điền/gi,
    'đã thông tim chương trình; hồ sơ hội chẩn vẫn còn treo chưa có kết quả staff'
  );

  return text
    .replace(/\s+([,.;!?])/g, '$1')
    .replace(/([,.;!?])\s*([,.;!?])+/g, '$1')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

export function sanitizeNotificationFields(input: {
  Title?: string;
  Message?: string;
}): { Title: string; Message: string } {
  return {
    Title: sanitizeNotificationTitle(input.Title || ''),
    Message: sanitizeNotificationMessage(input.Message || ''),
  };
}

export function notificationNeedsLegacyWordingCleanup(
  notification: Pick<NotificationLike, 'Title' | 'Message'>
): boolean {
  const title = String(notification.Title || '');
  const message = String(notification.Message || '');
  return /(?:phạt|sẹo)/i.test(title) || /(?:phạt|sẹo)/i.test(message);
}
