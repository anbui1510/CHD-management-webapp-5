import type { CMR, Patient } from '../types';
import { normalizePatientKey } from '../types';

/** Chuẩn hóa ngày để so sánh (yyyy-mm-dd) */
export function getFormattedDateKey(str?: string): string {
  if (!str) return '';
  const trimmed = String(str).trim().split('T')[0];
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;

  const slashParts = trimmed.split('/');
  if (slashParts.length === 3) {
    if (slashParts[2].length === 4) {
      return `${slashParts[2]}-${slashParts[1].padStart(2, '0')}-${slashParts[0].padStart(2, '0')}`;
    }
    if (slashParts[0].length === 4) {
      return `${slashParts[0]}-${slashParts[1].padStart(2, '0')}-${slashParts[2].padStart(2, '0')}`;
    }
  }
  const dashParts = trimmed.split('-');
  if (dashParts.length === 3 && dashParts[2].length === 4) {
    return `${dashParts[2]}-${dashParts[1].padStart(2, '0')}-${dashParts[0].padStart(2, '0')}`;
  }

  return trimmed;
}

export const PATIENT_VALIDATION_MSG = {
  missingIdAndName: 'Vui lòng nhập Mã bệnh nhi (ID1) và Họ tên bệnh nhi!',
  selectExistingOrCreate: 'Vui lòng tìm và chọn bệnh nhi sẵn có hoặc đổi sang chế độ tạo mới!',
  duplicateIdSuggestSelect: (patientName: string) =>
    `Mã bệnh nhân này đã tồn tại trong hệ thống (Họ tên: ${patientName}). Đề nghị chọn bệnh nhi sẵn có hoặc kiểm tra lại thông tin!`,
  duplicateIdSuggestUpdate: (patientName: string) =>
    `Mã bệnh nhân này đã tồn tại trong hệ thống (Họ tên: ${patientName}). Đề nghị cập nhật lại thông tin!`,
  duplicateIdShort: (patientName: string) =>
    `Mã bệnh nhân này đã tồn tại trong hệ thống (Họ tên: ${patientName}).`,
  pendingMriBlock:
    'Bệnh nhi này đã có lượt đăng ký MRI đang chờ (chưa xếp lịch và chưa chụp). Không thể đăng ký thêm cho đến khi hoàn tất lượt hiện tại!',
  pendingMriBlockShort:
    'Bệnh nhi này đã có lượt đăng ký MRI đang chờ (chưa xếp lịch và chưa chụp).',
  pendingMriUiHint: 'Bệnh nhi đã có lượt đăng ký MRI đang chờ (chưa xếp lịch và chưa chụp).',
} as const;

export function findDuplicatePatientById1(
  patients: Patient[],
  patientId1: string,
  excludePatientKey?: string
): Patient | undefined {
  const normalizedId = String(patientId1 || '').trim().toLowerCase();
  if (!normalizedId) return undefined;
  const excludeKey = excludePatientKey ? normalizePatientKey(excludePatientKey) : '';
  return patients.find(p => {
    if (excludeKey && normalizePatientKey(p.PatientKey) === excludeKey) return false;
    return String(p.PatientID1 || '').trim().toLowerCase() === normalizedId;
  });
}

/** CMR đang chờ: chưa có ngày xếp lịch và chưa chụp */
export function findBlockingPendingCmr(cmrs: CMR[], patientKey: string): CMR | undefined {
  const normalized = normalizePatientKey(patientKey);
  if (!normalized) return undefined;
  return cmrs.find(
    cmr =>
      normalizePatientKey(cmr.PatientKey) === normalized &&
      !getFormattedDateKey(cmr.CMRScheduledDate) &&
      !getFormattedDateKey(cmr.CMRDate)
  );
}

export function formatFetchErrorMessage(message: string, fallback: string): string {
  return message.includes('Failed to fetch')
    ? 'Không kết nối được server. Vui lòng kiểm tra kết nối và thử lại.'
    : message || fallback;
}
