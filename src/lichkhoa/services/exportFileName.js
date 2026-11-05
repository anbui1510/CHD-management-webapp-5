function fold(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D');
}

export function deptInitials(name) {
  const words = fold(name)
    .split(/\s+/)
    .filter(word => word && word.toLowerCase() !== 'khoa');
  const letters = words.map(word => word[0].toUpperCase()).join('');
  return letters || 'TM';
}

function pad2(value) {
  return String(value).padStart(2, '0');
}

export function dayMonthLabel(day) {
  const iso = String(day?.iso || '');
  const match = iso.match(/^\d{4}-(\d{2})-(\d{2})$/);
  if (match) return `${match[2]}-${match[1]}`;
  const [dayPart, monthPart] = String(day?.dateStr || '').split('/');
  if (!dayPart || !monthPart) return '';
  return `${pad2(dayPart)}-${pad2(monthPart)}`;
}

export function weekScheduleName(deptName, days) {
  const list = days || [];
  const from = dayMonthLabel(list[0]);
  const to = dayMonthLabel(list[list.length - 1]);
  const range = from && to ? ` ${from} - ${to}` : '';
  return `Lịch tuần ${deptInitials(deptName)}${range}`;
}
