import { removeDiacritics } from '../types';

/** Chuẩn hóa chuỗi tìm kiếm (bỏ dấu, lower, trim). */
export function normalizeListSearchQuery(raw: string): string {
  return removeDiacritics(String(raw || '')).toLowerCase().trim();
}

export function getSearchTokens(rawQuery: string): string[] {
  const q = normalizeListSearchQuery(rawQuery);
  if (!q) return [];
  return q.split(/\s+/).filter(Boolean);
}

/** Một token khớp một từ trong họ tên (không khớp "an" trong "tuan"). */
function tokenMatchesWord(word: string, token: string): boolean {
  if (!word || !token) return false;
  if (word === token) return true;
  if (word.startsWith(token)) return true;
  if (token.length >= 3 && word.includes(token)) return true;
  return false;
}

function tokenMatchesNameText(token: string, text: string): boolean {
  const words = normalizeListSearchQuery(text).split(/\s+/).filter(Boolean);
  if (words.length === 0) return false;
  return words.some((word) => tokenMatchesWord(word, token));
}

function tokenMatchesIdText(token: string, id: string): boolean {
  const normalized = normalizeListSearchQuery(id);
  if (!normalized) return false;
  if (token.length <= 1) return normalized.startsWith(token);
  return normalized.includes(token);
}

/**
 * Tìm theo họ tên + mã BN (không lọc qua chẩn đoán / ghi chú — tránh "T" khớp TOF trong CMR).
 */
export function matchesPatientIdentitySearch(
  rawQuery: string,
  fields: {
    PatientName?: string | null;
    PatientID1?: string | null;
    PatientID2?: string | null;
    otherNames?: Array<string | null | undefined>;
  }
): boolean {
  const tokens = getSearchTokens(rawQuery);
  if (tokens.length === 0) return true;

  const nameText = [fields.PatientName, ...(fields.otherNames || [])]
    .map((v) => String(v ?? '').trim())
    .filter(Boolean)
    .join(' ');
  const ids = [fields.PatientID1, fields.PatientID2].map((v) => String(v ?? '').trim()).filter(Boolean);

  return tokens.every((token) => {
    if (nameText && tokenMatchesNameText(token, nameText)) return true;
    return ids.some((id) => tokenMatchesIdText(token, id));
  });
}

/** Điểm ưu tiên: tên trùng khít / chứa cả cụm query lên trước. */
export function scorePatientNameSearch(
  rawQuery: string,
  patientName: string,
  ids: string[] = []
): number {
  const q = normalizeListSearchQuery(rawQuery);
  if (!q) return 0;

  const name = normalizeListSearchQuery(patientName);
  const tokens = getSearchTokens(rawQuery);

  if (name && name === q) return 100_000;
  if (name && name.startsWith(q)) return 80_000;
  if (name && name.includes(q)) return 70_000;

  if (name && tokens.length > 0) {
    const allWordsMatch = tokens.every((t) => tokenMatchesNameText(t, name));
    if (allWordsMatch) {
      let idx = 0;
      let inOrder = true;
      for (const token of tokens) {
        const pos = name.indexOf(token, idx);
        if (pos === -1) {
          inOrder = false;
          break;
        }
        idx = pos + token.length;
      }
      if (inOrder) return 50_000;
      return 30_000;
    }
  }

  const idHay = ids.map((id) => normalizeListSearchQuery(id)).filter(Boolean);
  if (
    idHay.length > 0 &&
    tokens.every((token) => idHay.some((id) => tokenMatchesIdText(token, id)))
  ) {
    return 5_000;
  }

  return matchesPatientIdentitySearch(rawQuery, {
    PatientName: patientName,
    PatientID1: ids[0],
    PatientID2: ids[1],
  })
    ? 1_000
    : 0;
}

export function compareByPatientSearchScore(
  rawQuery: string,
  aName: string,
  bName: string,
  aIds: string[] = [],
  bIds: string[] = []
): number {
  const diff = scorePatientNameSearch(rawQuery, bName, bIds) - scorePatientNameSearch(rawQuery, aName, aIds);
  if (diff !== 0) return diff;
  return normalizeListSearchQuery(aName).localeCompare(normalizeListSearchQuery(bName), 'vi');
}

/**
 * Lọc đa field (hội chẩn: thêm chẩn đoán). Mỗi token phải khớp ít nhất một field theo quy tắc từ.
 */
export function matchesListSearchQuery(
  rawQuery: string,
  fields: Array<string | undefined | null | number>
): boolean {
  const tokens = getSearchTokens(rawQuery);
  if (tokens.length === 0) return true;

  const normalizedFields = fields
    .map((f) => normalizeListSearchQuery(String(f ?? '')))
    .filter(Boolean);

  if (normalizedFields.length === 0) return false;

  return tokens.every((token) =>
    normalizedFields.some((field) => {
      if (tokenMatchesNameText(token, field)) return true;
      if (/^\d/.test(field) || field.length <= 20) {
        return tokenMatchesIdText(token, field);
      }
      return token.length >= 3 && field.includes(token);
    })
  );
}
