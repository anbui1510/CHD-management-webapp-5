import { parseSpreadsheetId } from '../../logic/sheetStore/parseSpreadsheetId';
import { tenantSpreadsheetId } from '../../config/tenant';

const SHEET_ID_KEY = 'LICHKHOA_SHEET_ID';
const SHEET_URL_KEY = 'LICHKHOA_SHEET_URL';

export function getSpreadsheetId() {
  try {
    const fromUrl = new URLSearchParams(window.location.search).get('sheet');
    if (fromUrl) {
      const id = parseSpreadsheetId(fromUrl);
      if (id) {
        localStorage.setItem(SHEET_ID_KEY, id);
        return id;
      }
    }
    const fromTenant = tenantSpreadsheetId();
    if (fromTenant) return fromTenant;
    return localStorage.getItem(SHEET_ID_KEY) || '';
  } catch {
    return '';
  }
}

export function setSpreadsheetConnection(input) {
  const id = parseSpreadsheetId(input);
  if (!id) throw new Error('Link Google Sheet không hợp lệ.');
  localStorage.setItem(SHEET_ID_KEY, id);
  localStorage.setItem(SHEET_URL_KEY, String(input).trim());
  return id;
}

export function getSpreadsheetUrl() {
  try {
    const stored = localStorage.getItem(SHEET_URL_KEY) || '';
    if (stored) return stored;
    const id = tenantSpreadsheetId();
    if (id) return `https://docs.google.com/spreadsheets/d/${id}/edit`;
    return '';
  } catch {
    return '';
  }
}

export function clearSpreadsheetConnection() {
  localStorage.removeItem(SHEET_ID_KEY);
  localStorage.removeItem(SHEET_URL_KEY);
}

/** F-305: ghi localStorage từ tenant env nếu chưa có (tuỳ chọn gọi lúc boot). */
export function ensureSpreadsheetFromTenant() {
  if (typeof window === 'undefined') return '';
  const fromQuery = new URLSearchParams(window.location.search).get('sheet');
  if (fromQuery) return getSpreadsheetId();
  const tenantId = tenantSpreadsheetId();
  if (!tenantId) return getSpreadsheetId();
  const current = localStorage.getItem(SHEET_ID_KEY);
  if (!current) {
    localStorage.setItem(SHEET_ID_KEY, tenantId);
    localStorage.setItem(
      SHEET_URL_KEY,
      `https://docs.google.com/spreadsheets/d/${tenantId}/edit`
    );
  }
  return getSpreadsheetId();
}

export function tenantHasDefaultSpreadsheet() {
  return Boolean(tenantSpreadsheetId());
}
