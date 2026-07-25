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

export function extractSheetsSync(data: unknown): SheetsSyncMeta | undefined {
  if (!data || typeof data !== 'object') return undefined;
  const sync = (data as { _sheetsSync?: SheetsSyncMeta })._sheetsSync;
  if (!sync || typeof sync !== 'object') return undefined;
  return sync;
}

export function appendSheetsSyncToSaveMessage(
  base: string,
  data: unknown
): { message: string; isWarning: boolean } {
  const sync = extractSheetsSync(data);
  if (!sync) {
    return {
      message: `${base} (đã lưu trên máy chủ app — chưa xác nhận Google Sheets)`,
      isWarning: false
    };
  }
  if (!sync.configured) {
    return { message: `${base}. ${sync.message}`, isWarning: false };
  }
  if (sync.ok) {
    return { message: `${base} ✓ ${sync.message}`, isWarning: false };
  }
  return { message: `${base} ⚠ ${sync.message}`, isWarning: true };
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
      title: 'Chưa cấu hình URL Apps Script — dữ liệu chỉ lưu trên máy chủ app'
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
