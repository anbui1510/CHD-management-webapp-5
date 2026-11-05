export const DUTY_WEEKDAYS = [
  { id: 0, label: 'T2' },
  { id: 1, label: 'T3' },
  { id: 2, label: 'T4' },
  { id: 3, label: 'T5' },
  { id: 4, label: 'T6' },
  { id: 5, label: 'T7' },
  { id: 6, label: 'CN' }
];

function fold(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

/** Week tasks a person can pin. Month rows, leave codes and bệnh phòng stay on their own pour. */
export function dutyScheduleTask(task) {
  if (!task?.id || !task.code) return false;
  if (task.scope === 'month') return false;
  if (task.category === 'NGHI_VANG') return false;
  const code = fold(task.code);
  if (code === 'p' || code === 'bu' || code === 'ct' || code === 'h') return false;
  if (fold(`${task.code} ${task.name}`).includes('benh phong')) return false;
  return true;
}

export function cleanDutySlots(raw) {
  const slots = [];
  (Array.isArray(raw) ? raw : []).forEach((slot) => {
    const day = Number(slot?.day);
    const session = slot?.session === 'C' ? 'C' : slot?.session === 'S' ? 'S' : '';
    if (!session || !Number.isInteger(day) || day < 0 || day > 6) return;
    if (slots.some(item => item.day === day && item.session === session)) return;
    slots.push({ day, session });
  });
  return slots;
}

export function normalizeDuties(list) {
  if (!Array.isArray(list)) return [];
  return list.map((row, index) => {
    const slots = cleanDutySlots(row?.slots);
    const picked = new Set((Array.isArray(row?.days) ? row.days : []).map(Number));
    slots.forEach(slot => picked.add(slot.day));
    return {
      id: row?.id || `duty_${index}`,
      taskId: row?.taskId || '',
      days: DUTY_WEEKDAYS.map(day => day.id).filter(id => picked.has(id)),
      slots,
      substituteId: row?.substituteId || '',
      enabled: row?.enabled !== false
    };
  });
}

/** Enabled day+session pins. A weekday with no S/C is kept on the form but not scheduled. */
export function dutyPins(person) {
  return normalizeDuties(person?.taskDuties)
    .filter(row => row.enabled && row.taskId)
    .flatMap(row => row.slots.map(slot => ({
      taskId: row.taskId,
      day: slot.day,
      session: slot.session,
      substituteId: row.substituteId
    })));
}

export function pinHoldWarning(shortName, code, when, cell) {
  const held = String(cell || '').trim() || 'trống';
  return `BS ${shortName} có lịch "${held}" nhưng phải "${code}" ${when}.`;
}

export function pinOwnerWarning(code, ownerNames, shortName, when) {
  return `Task ${code} chỉ giao ${ownerNames} nhưng hồ sơ ${shortName} đang ghim ${code} ${when}.`;
}
