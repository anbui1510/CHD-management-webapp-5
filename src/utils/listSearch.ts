import { removeDiacritics } from '../types';

/** Chuẩn hóa chuỗi tìm kiếm (bỏ dấu, lower, trim). */
export function normalizeListSearchQuery(raw: string): string {
  return removeDiacritics(String(raw || '')).toLowerCase().trim();
}

/**
 * Lọc giống Hồ sơ bệnh án: mỗi từ trong query phải xuất hiện trong ít nhất một field.
 * Ví dụ "Bùi tuấn ân" khớp "BUI VAN TUAN AN".
 */
export function matchesListSearchQuery(
  rawQuery: string,
  fields: Array<string | undefined | null | number>
): boolean {
  const q = normalizeListSearchQuery(rawQuery);
  if (!q) return true;
  const tokens = q.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return true;
  const hay = fields
    .map((f) => normalizeListSearchQuery(String(f ?? '')))
    .filter(Boolean)
    .join(' ');
  if (!hay) return false;
  return tokens.every((token) => hay.includes(token));
}
