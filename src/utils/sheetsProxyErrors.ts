import { AuthRequiredError } from '../auth/authErrors';
import { formatAppsScriptHttpError } from './appsScriptRetry';

const APP_AUTH_ERROR_MARKERS = [
  'yêu cầu đăng nhập',
  'phiên đăng nhập',
  'hết hạn',
  'không hợp lệ',
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
    if (jsonMessage && looksLikeAppAuthBody(jsonMessage)) {
      throw new AuthRequiredError(jsonMessage);
    }
    throw new AuthRequiredError();
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
