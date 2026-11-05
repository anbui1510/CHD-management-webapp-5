/** CHD Staff.ShowInLichKhoa + tab NhanSu.showInLichKhoa — On/Off hiển thị Module 7. */

export function parseShowInLichKhoa(value) {
  if (value === undefined || value === null || String(value).trim() === '') return true;
  const v = String(value).trim().toLowerCase();
  if (['off', 'false', '0', 'không', 'no', 'n'].includes(v)) return false;
  if (['on', 'true', '1', 'có', 'yes', 'y'].includes(v)) return true;
  return true;
}

export function formatShowInLichKhoa(enabled) {
  return enabled ? 'On' : 'Off';
}

export function showInLichKhoaLabel(value) {
  return parseShowInLichKhoa(value) ? 'On' : 'Off';
}
