export type SheetsSyncMeta = {
  configured: boolean;
  ok: boolean;
  /** Push still running after local save (bridge timeout race). */
  pending?: boolean;
  message: string;
  at?: number;
};

export type SheetsSyncStatus = {
  configured: boolean;
  lastPullAt: number;
  lastPullOk: boolean;
  lastPullMessage: string;
  lastPushAt: number;
  lastPushOk: boolean;
  lastPushMessage: string;
  /** True while a Sheets push is still running after the local save timeout. */
  lastPushPending?: boolean;
};

/** How long the UI waits for Sheets confirmation before showing “đang đồng bộ”. */
export const SHEETS_PUSH_WAIT_SECONDS = 12;

export const SHEETS_SUCCESS_MESSAGE = 'Đã ghi lên Google Sheets';

export const SHEETS_NOT_UPLOADED_TITLE = 'Dữ liệu chưa lên Google Sheets';

export const SHEETS_PENDING_MESSAGE =
  `Đã lưu tạm trên app — đang đồng bộ Google Sheets (thường vài giây, tối đa ~${SHEETS_PUSH_WAIT_SECONDS}s). Badge Sheets sẽ chuyển OK khi xong; máy khác có thể chưa thấy trước đó.`;

export const SHEETS_FAILURE_DEFAULT =
  'Đã lưu tạm trên app nhưng chưa ghi được lên Google Sheets. Máy khác / danh sách chung có thể chưa thấy — bấm Đồng bộ lại hoặc kiểm tra kết nối Sheets.';

export const SHEETS_LOCAL_ONLY_MESSAGE =
  'Chưa liên kết Google Sheets — dữ liệu chỉ lưu trên app, chưa lên Sheet.';

export const SHEETS_UNCONFIRMED_MESSAGE =
  'Đã lưu trên app — chưa xác nhận đã lên Google Sheets.';

export function extractSheetsSync(data: unknown): SheetsSyncMeta | undefined {
  if (!data || typeof data !== 'object') return undefined;
  const sync = (data as { _sheetsSync?: SheetsSyncMeta })._sheetsSync;
  if (!sync || typeof sync !== 'object') return undefined;
  return sync;
}

export function evaluateSheetsSync(data: unknown): {
  kind: 'success' | 'failure' | 'pending' | 'local_only' | 'none';
  message: string;
} {
  const sync = extractSheetsSync(data);
  if (!sync) {
    return { kind: 'none', message: SHEETS_UNCONFIRMED_MESSAGE };
  }
  if (!sync.configured) {
    return {
      kind: 'local_only',
      message: sync.message || SHEETS_LOCAL_ONLY_MESSAGE
    };
  }
  if (sync.pending) {
    return {
      kind: 'pending',
      message: sync.message || SHEETS_PENDING_MESSAGE
    };
  }
  if (sync.ok) {
    return { kind: 'success', message: SHEETS_SUCCESS_MESSAGE };
  }
  return {
    kind: 'failure',
    message: sync.message || SHEETS_FAILURE_DEFAULT
  };
}

export function appendSheetsSyncToSaveMessage(
  base: string,
  data: unknown
): { message: string; isWarning: boolean } {
  const evaluation = evaluateSheetsSync(data);
  if (evaluation.kind === 'success') {
    return {
      message: base ? `${base} — ${SHEETS_SUCCESS_MESSAGE}` : SHEETS_SUCCESS_MESSAGE,
      isWarning: false
    };
  }
  if (evaluation.kind === 'failure' || evaluation.kind === 'pending' || evaluation.kind === 'local_only' || evaluation.kind === 'none') {
    return {
      message: base ? `${base} — ${evaluation.message}` : evaluation.message,
      isWarning: true
    };
  }
  return {
    message: `${base} — ${SHEETS_UNCONFIRMED_MESSAGE}`,
    isWarning: true
  };
}

export function formatSheetsSyncStatusLabel(status: SheetsSyncStatus | null): {
  label: string;
  tone: 'ok' | 'warn' | 'error' | 'muted';
  title: string;
} {
  if (!status) {
    return {
      label: 'Sheets: …',
      tone: 'muted',
      title: 'Đang kiểm tra trạng thái Google Sheets'
    };
  }
  if (!status.configured) {
    return {
      label: 'Sheets: chưa liên kết',
      tone: 'muted',
      title: 'Chưa cấu hình URL Apps Script — dữ liệu chỉ lưu trên app'
    };
  }
  if (!status.lastPullAt && !status.lastPushAt) {
    return {
      label: 'Sheets: …',
      tone: 'muted',
      title: 'Chưa có lần đồng bộ nào trong phiên này'
    };
  }
  if (status.lastPushPending) {
    return {
      label: 'Sheets: đang đẩy',
      tone: 'warn',
      title:
        status.lastPushMessage ||
        `Đang ghi lên Google Sheets — thường vài giây, tối đa ~${SHEETS_PUSH_WAIT_SECONDS}s`
    };
  }
  if (!status.lastPushOk || !status.lastPullOk) {
    const detail = !status.lastPushOk ? status.lastPushMessage : status.lastPullMessage;
    return {
      label: 'Sheets: lỗi',
      tone: 'error',
      title: detail || 'Lần đồng bộ gần nhất với Google Sheets thất bại'
    };
  }
  return {
    label: 'Sheets: OK',
    tone: 'ok',
    title: status.lastPushMessage || status.lastPullMessage || 'Google Sheets đang hoạt động bình thường'
  };
}
