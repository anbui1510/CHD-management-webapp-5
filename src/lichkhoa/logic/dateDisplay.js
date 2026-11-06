/** Chuẩn hóa mọi dạng ngày (yyyy-mm-dd, ISO, Date) → yyyy-mm-dd cho input/so sánh. */
export function toDateInputValue(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  const isoDay = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoDay) return `${isoDay[1]}-${isoDay[2]}-${isoDay[3]}`;
  const vn = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (vn) {
    const dd = String(vn[1]).padStart(2, '0');
    const mm = String(vn[2]).padStart(2, '0');
    return `${vn[3]}-${mm}-${dd}`;
  }
  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) {
    const y = parsed.getFullYear();
    const m = String(parsed.getMonth() + 1).padStart(2, '0');
    const d = String(parsed.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  return '';
}

/** Hiển thị dd/mm/yyyy; chuỗi rỗng nếu không parse được. */
export function formatDateVN(value) {
  const day = toDateInputValue(value);
  if (!day) return '';
  const [y, m, d] = day.split('-');
  return `${d}/${m}/${y}`;
}
