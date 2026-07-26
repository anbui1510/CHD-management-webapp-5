/**
 * Centralized scar-warning and scheduling notification message templates.
 * See plan: Danh mục câu mẫu cảnh báo sẹo & thông báo xếp lịch.
 */

export const SCAR_WORKFLOW_NOTIFY_TITLE = 'Phạt sẹo workflow';
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

export function buildEmergProgCaseAScar(input: { patientName: string; patientId: string }) {
  return {
    label: EMERG_PROG_LABEL_SKIP_CONSULT,
    reason: `Bệnh nhi ${input.patientName} (ID1: ${input.patientId}) làm chương trình nhưng chưa được đăng ký hội chẩn. Phạt BS xếp lịch Hiếu không kiểm soát thông tin.`,
    message: `Bệnh nhi ${input.patientName} (ID1: ${input.patientId}) làm chương trình nhưng chưa được đăng ký hội chẩn. Bạn bị phạt 1 sẹo.`,
  };
}

export function buildEmergProgCaseBTaiScar(input: { patientName: string }) {
  return {
    label: EMERG_PROG_LABEL_LATE_STAFF_RESULT,
    reason: `Bệnh nhi ${input.patientName} đã thông tim chương trình nhưng kết quả hội chẩn bị treo chưa điền. Phạt BS thư ký Tài.`,
    message: `Bệnh nhi ${input.patientName} đã thông tim chương trình nhưng kết quả hội chẩn bị treo chưa điền. Bạn bị phạt 1 sẹo.`,
  };
}

export function buildEmergProgCaseBHieuScar(input: { patientName: string }) {
  return {
    label: EMERG_PROG_LABEL_PENDING_TRANSFER,
    reason: `Bệnh nhi ${input.patientName} đã thông tim chương trình nhưng chưa chuyển phòng từ danh sách hội chẩn. Phạt BS xếp lịch Hiếu.`,
    message: `Bệnh nhi ${input.patientName} đã thông tim chương trình nhưng chưa chuyển phòng từ danh sách hội chẩn. Bạn bị phạt 1 sẹo.`,
  };
}

export function buildEmergProgCaseCScar(input: { patientName: string }) {
  return {
    label: EMERG_PROG_LABEL_SLOW_TRANSFER,
    reason: `Bệnh nhi ${input.patientName} đã có chỉ định thông tim nhưng BS xếp lịch Hiếu không chuyển phòng đúng hạn.`,
    message: `Bệnh nhi ${input.patientName} đã có chỉ định thông tim nhưng bạn không chuyển phòng đúng hạn. Bạn bị phạt 1 sẹo.`,
  };
}

export function buildOverrideSchedulingScar(input: { patientName: string; patientId: string }) {
  return {
    label: EMERG_PROG_LABEL_LATE_STAFF_RESULT,
    reason: `BS xếp lịch vượt quyền kích hoạt xếp lịch bổ sung cho bệnh nhi ${input.patientName} (ID1: ${input.patientId}) do BS thư ký Tài chưa điền kết quả hội chẩn đúng hạn.`,
    message: `BS xếp lịch vượt quyền kích hoạt xếp lịch bổ sung cho bệnh nhi ${input.patientName} (ID1: ${input.patientId}) do bạn chưa điền kết quả hội chẩn đúng hạn. Bạn bị phạt 1 sẹo.`,
  };
}

export function buildOverrideSchedulingConsultNote(staffName: string, isoTimestamp: string): string {
  return `[Kích hoạt xếp lịch bổ sung - ${staffName} ${isoTimestamp}]`;
}

export function buildRepeatInterventionNotificationMessage(input: {
  patientName: string;
  postDiagnosisID: string;
}): string {
  return `Bệnh nhân ${input.patientName} chẩn đoán ${input.postDiagnosisID} có chỉ định can thiệp lại đã được lưu trong "Xếp lịch & Dụng cụ". Mời BS xem lại`;
}

export function buildSchedulingSummaryHeader(patientNameWithPtvUpper: string): string {
  return `📋 *THÔNG TIN TÓM TẮT XẾP LỊCH: ${patientNameWithPtvUpper}* 📋`;
}
