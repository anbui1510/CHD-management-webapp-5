/** Detect Worker/Express session 401 vs upstream Google Apps Script HTTP errors. */

export const SHEETS_PROXY_AUTH_ERROR_MESSAGE =
  'Phiên đăng nhập đã hết hạn hoặc cookie đồng bộ bị mất. Vui lòng đăng nhập lại để tiếp tục ghi Google Sheets.';

export class SheetsProxyAuthError extends Error {
  readonly status = 401;

  constructor(message = SHEETS_PROXY_AUTH_ERROR_MESSAGE) {
    super(message);
    this.name = 'SheetsProxyAuthError';
  }
}

const SESSION_AUTH_HINTS = [
  'yêu cầu đăng nhập',
  'phiên đăng nhập',
  'đăng nhập lại',
  'unauthorized',
  'authentication required',
];

export function isSignedSessionToken(token: string | null | undefined): boolean {
  const value = String(token || '').trim();
  if (!value || value === 'cookie-session') return false;
  const parts = value.split('.');
  return parts.length === 2 && parts[0].length > 8 && parts[1].length > 8;
}

/** Best-effort decode of our HMAC session payload (payload.signature). */
export function peekSignedSessionExp(token: string | null | undefined): number | null {
  if (!isSignedSessionToken(token)) return null;
  try {
    const payload = String(token).split('.')[0];
    const padded = payload.replace(/-/g, '+').replace(/_/g, '/');
    const padLength = (4 - (padded.length % 4)) % 4;
    const binary = atob(padded + '='.repeat(padLength));
    const claims = JSON.parse(binary) as { exp?: number };
    return typeof claims.exp === 'number' ? claims.exp : null;
  } catch {
    return null;
  }
}

export function isSessionAuthErrorBody(bodyText: string): boolean {
  const text = String(bodyText || '').trim();
  if (!text) return true;
  if (text.startsWith('<')) return false;
  try {
    const parsed = JSON.parse(text) as { error?: string; message?: string; status?: string };
    const message = String(parsed.error || parsed.message || '').toLowerCase();
    if (!message) return true;
    return SESSION_AUTH_HINTS.some(hint => message.includes(hint));
  } catch {
    const lower = text.toLowerCase();
    return SESSION_AUTH_HINTS.some(hint => lower.includes(hint));
  }
}

export function classifyProxyHttpError(status: number, bodyText: string): Error {
  if (status === 401 && isSessionAuthErrorBody(bodyText)) {
    return new SheetsProxyAuthError();
  }
  if (status === 401) {
    return new Error(
      'Google từ chối truy cập Web app (HTTP 401) — kiểm tra deploy Apps Script (Anyone) và URL /exec hiện tại.'
    );
  }
  if (status === 404) {
    return new Error(
      'Không kết nối được Google Sheets (HTTP 404) — URL Web app có thể sai, chưa deploy, hoặc Google đang lỗi tạm. App vẫn dùng dữ liệu đã lưu; bấm Đồng bộ lại để thử.'
    );
  }
  return new Error(`Apps Script trả về HTTP ${status}`);
}
