/** TC-F304-01 */
export function parseSpreadsheetId(input) {
  const raw = String(input || '').trim();
  if (!raw) return null;
  if (/^[a-zA-Z0-9_-]{20,}$/.test(raw) && !raw.includes('/')) return raw;
  const m = raw.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
  return m ? m[1] : null;
}
