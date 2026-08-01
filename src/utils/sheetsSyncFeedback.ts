export type SheetsSyncMeta = {
  configured: boolean;
  ok: boolean;
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
};

export const SHEETS_SUCCESS_MESSAGE = 'Đã ghi lên Google Sheets';

export function extractSheetsSync(data: unknown): SheetsSyncMeta | undefined {
  if (!data || typeof data !== 'object') return undefined;
  const sync = (data as { _sheetsSync?: SheetsSyncMeta })._sheetsSync;
  if (!sync || typeof sync !== 'object') return undefined;
  return sync;
}

export function evaluateSheetsSync(data: unknown): {
  kind: 'success' | 'failure' | 'local_only' | 'none';
  message: string;
} {
  const sync = extractSheetsSync(data);
  if (!sync) {
    return { kind: 'none', message: '' };
  }
  if (!sync.configured) {
    return { kind: 'local_only', message: sync.message };
  }
  if (sync.ok) {
    return { kind: 'success', message: SHEETS_SUCCESS_MESSAGE };
  }
  return { kind: 'failure', message: sync.message };
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
  if (evaluation.kind === 'failure') {
    return { message: `${base} — ${evaluation.message}`, isWarning: true };
  }
  if (evaluation.kind === 'local_only') {
    return { message: `${base}. ${evaluation.message}`, isWarning: false };
  }
  return {
    message: `${base} (đã lưu trên máy chủ app — chưa xác nhận Google Sheets)`,
    isWarning: false
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
