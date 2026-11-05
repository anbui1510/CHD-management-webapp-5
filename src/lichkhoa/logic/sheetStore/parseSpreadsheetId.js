/** TC-F304-01 — Google Spreadsheet file id (thường đúng 44 ký tự). */
const GOOGLE_FILE_ID_RE = /^[a-zA-Z0-9_-]{44}$/;

export function normalizeSpreadsheetId(candidate) {
  const s = String(candidate || '').trim();
  if (!s) return null;
  if (GOOGLE_FILE_ID_RE.test(s)) return s;
  // Dán nhầm thêm đuôi (ví dụ dính mã deploy): lấy 44 ký tự đầu nếu hợp lệ.
  if (s.length > 44) {
    const head = s.slice(0, 44);
    if (GOOGLE_FILE_ID_RE.test(head)) return head;
  }
  if (s.length >= 20 && s.length <= 50 && /^[a-zA-Z0-9_-]+$/.test(s)) return s;
  return null;
}

export function parseSpreadsheetId(input) {
  const raw = String(input || '').trim();
  if (!raw) return null;
  const fromUrl = raw.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
  if (fromUrl) return normalizeSpreadsheetId(fromUrl[1]);
  if (!raw.includes('/')) return normalizeSpreadsheetId(raw);
  return null;
}

export function spreadsheetIdValidationMessage(id) {
  const normalized = normalizeSpreadsheetId(id);
  if (!normalized) {
    return 'Spreadsheet ID không hợp lệ. Copy đúng đoạn giữa /d/ và /edit trong URL Google Sheet (thường 44 ký tự).';
  }
  const raw = String(id || '').trim();
  if (raw.length > 44 && normalized === raw.slice(0, 44)) {
    return 'Spreadsheet ID đã được cắt bớt phần thừa ở cuối — hãy kiểm tra lại ID trong URL Sheet.';
  }
  return '';
}
