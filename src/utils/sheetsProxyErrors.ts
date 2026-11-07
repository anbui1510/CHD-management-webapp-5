import { AuthRequiredError } from '../auth/authErrors';
import { formatAppsScriptHttpError } from './appsScriptRetry';

/** Phrases unique to Cloudflare/Express session 401 JSON — keep specific to avoid false matches. */
const APP_AUTH_ERROR_MARKERS = [
  'yêu cầu đăng nhập',
  'phiên đăng nhập',
  'đăng nhập lại',
  'hết hạn hoặc không hợp lệ',
];

function looksLikeAppAuthBody(text: string): boolean {
  const lowered = text.toLowerCase();
  if (!lowered.includes('error')) return false;
  return APP_AUTH_ERROR_MARKERS.some(marker => lowered.includes(marker));
}

function parseJsonErrorMessage(text: string): string | null {
  try {
    const parsed = JSON.parse(text) as { error?: string; message?: string; status?: string };
    if (parsed.status === 'error' && parsed.message) return parsed.message;
    if (parsed.error) return parsed.error;
    return null;
  } catch {
    return null;
  }
}

function throwForFailedProxy(response: Response, text: string): never {
  const jsonMessage = parseJsonErrorMessage(text);

  if (response.status === 401) {
    // Cloudflare/Express session gate always returns Vietnamese JSON with these markers.
    // Check the raw body (includes `"error"`) — not only the extracted message string.
    if (looksLikeAppAuthBody(text)) {
      throw new AuthRequiredError(jsonMessage || undefined);
    }
    // Bare/HTML 401 is typically Google Web app ACL (not Anyone), not app session.
    if (!jsonMessage) {
      throw new Error(formatAppsScriptHttpError(401));
    }
    throw new Error(jsonMessage);
  }

  if (response.status === 403 && jsonMessage) {
    throw new Error(jsonMessage);
  }

  if (jsonMessage) {
    throw new Error(jsonMessage);
  }

  throw new Error(formatAppsScriptHttpError(response.status));
}

/** Throws when Apps Script JSON uses status:error (HTTP may still be 200). */
export function assertAppsScriptJsonOk(parsed: unknown): void {
  if (!parsed || typeof parsed !== 'object') return;
  const record = parsed as { status?: string; message?: string };
  if (record.status !== 'error') return;
  const message = String(record.message || '').trim();
  if (message.toLowerCase().includes('unauthorized') && message.toLowerCase().includes('api key')) {
    throw new Error(
      'Khóa API Google Sheets không khớp với Apps Script. Admin vào mục Google Sheets, nhập lại khóa API và bấm Lưu & Kết nối.'
    );
  }
  throw new Error(message || 'Apps Script trả về lỗi.');
}

/**
 * Reads a sheets proxy body or throws with an actionable message.
 * HTTP 401 from our worker is session expiry — not Google Apps Script auth.
 */
export async function readSheetsProxyText(response: Response): Promise<string> {
  const text = await response.text();
  if (!response.ok) {
    throwForFailedProxy(response, text);
  }
  return text;
}
