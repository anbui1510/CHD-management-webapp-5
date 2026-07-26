/** Tiêu đề modal alert/confirm chuẩn trong app */
export const MODAL_TITLE = {
  notify: 'Thông báo',
  confirm: 'Xác nhận',
  saveError: 'Lỗi lưu',
  missingInfo: 'Thiếu thông tin',
  warning: 'Cảnh báo',
} as const;

export type ModalTitle = (typeof MODAL_TITLE)[keyof typeof MODAL_TITLE];
