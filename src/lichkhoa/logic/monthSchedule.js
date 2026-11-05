export const MONTH_ROLES = [
  { key: 'truc_chinh', label: 'Trực Chính' },
  { key: 'truc_kem', label: 'Trực kèm' },
  { key: 'cot1', label: 'Cột 1 BV' },
  { key: 'sn', label: 'SN' },
  { key: 'ro', label: 'RO' },
  { key: 'tc', label: 'TC' },
  { key: 'sa', label: 'SA' },
  { key: 'tt_chinh', label: 'TT chính' },
  { key: 'tt_phu', label: 'TT phụ' },
  { key: 'ttcc', label: 'TTCC phụ' }
];

export const MONTH_DAY_HEADERS = ['Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7', 'Chủ nhật'];

export const DEL_COL = 0;
export const TASK_COL = 1;
export const DATA_COL = 2;

export function resolveMonthRoles(roles) {
  if (Array.isArray(roles) && roles.length) return roles.map(role => ({ ...role }));
  return MONTH_ROLES.map(role => ({ ...role }));
}

export function toISODate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function dateLabel(date) {
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}`;
}

export function mondayOf(date) {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return toISODate(d);
}

export function currentMonthKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

export function shiftMonthKey(monthKey, delta) {
  const [y, m] = monthKey.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return currentMonthKey(d);
}

export function formatMonthLabel(monthKey) {
  const [y, m] = monthKey.split('-');
  return `Tháng ${Number(m)}/${y}`;
}

function parseISODate(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function weeksOfMonth(monthKey) {
  const [y, m] = monthKey.split('-').map(Number);
  const first = new Date(y, m - 1, 1);
  const last = new Date(y, m, 0);
  const start = parseISODate(mondayOf(first));
  const weeks = [];
  const cursor = new Date(start);
  while (cursor <= last) {
    const days = [];
    for (let i = 0; i < 7; i += 1) {
      const dt = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() + i);
      days.push({
        date: dt,
        iso: toISODate(dt),
        inMonth: dt.getMonth() === m - 1,
        label: dateLabel(dt)
      });
    }
    weeks.push({ start: toISODate(cursor), days });
    cursor.setDate(cursor.getDate() + 7);
  }
  return weeks;
}

export function sessionCellKey(iso, roleKey, session) {
  return `${iso}|${roleKey}|${session}`;
}

export function readMonthCell(monthGrid, iso, roleKey, session) {
  const grid = monthGrid || {};
  const key = sessionCellKey(iso, roleKey, session);
  if (Object.prototype.hasOwnProperty.call(grid, key)) return grid[key] ?? '';
  if (session === 'S' && Object.prototype.hasOwnProperty.call(grid, `${iso}|${roleKey}`)) {
    return grid[`${iso}|${roleKey}`] ?? '';
  }
  return '';
}

export const DAY_SESSIONS = [
  { id: 'S', suffix: 's', label: 'Sáng' },
  { id: 'R', suffix: 'r', label: 'Trưa' },
  { id: 'C', suffix: 'c', label: 'Chiều' },
  { id: 'T', suffix: 't', label: 'Tối' }
];

export function normalizeDaySessions(value) {
  const picked = new Set(Array.isArray(value) && value.length ? value : ['S', 'C']);
  const list = DAY_SESSIONS.map(item => item.id).filter(id => picked.has(id));
  return list.length ? list : ['S'];
}

export function sessionLabel(id) {
  return DAY_SESSIONS.find(item => item.id === id)?.label || id;
}

export function defaultMonthColumnKeys(sessions) {
  const active = normalizeDaySessions(sessions);
  const keys = ['del', 'task'];
  for (let day = 0; day < 7; day += 1) {
    active.forEach((id) => {
      const spec = DAY_SESSIONS.find(item => item.id === id);
      keys.push(`d${day}${spec.suffix}`);
    });
  }
  return keys;
}

function parseDayKey(key) {
  const match = String(key || '').match(/^d([0-6])([scrt])$/);
  if (!match) return null;
  const session = DAY_SESSIONS.find(item => item.suffix === match[2]);
  if (!session) return null;
  return { dayIndex: Number(match[1]), session: session.id };
}

function columnKeys(order, sessions) {
  const active = normalizeDaySessions(sessions);
  const dayKeys = (day) => active.map((id) => {
    const spec = DAY_SESSIONS.find(item => item.id === id);
    return `d${day}${spec.suffix}`;
  });
  if (!Array.isArray(order) || !order.length) return defaultMonthColumnKeys(active);

  const result = [];
  let pending = [];
  let lastDay = -1;
  let started = false;
  const flushDay = (day) => {
    result.push(...dayKeys(day));
    result.push(...pending);
    pending = [];
  };
  order.forEach((key) => {
    const day = parseDayKey(key);
    if (!day) {
      if (!started) result.push(key);
      else pending.push(key);
      return;
    }
    started = true;
    if (day.dayIndex !== lastDay) {
      if (lastDay >= 0) flushDay(lastDay);
      else {
        result.push(...pending);
        pending = [];
      }
      lastDay = day.dayIndex;
    }
  });
  if (lastDay >= 0) flushDay(lastDay);
  else result.push(...pending);
  for (let day = lastDay + 1; day < 7; day += 1) result.push(...dayKeys(day));
  if (!result.includes('del')) result.unshift('del');
  if (!result.includes('task')) result.splice(Math.max(0, result.indexOf('del')) + 1, 0, 'task');
  return result.filter((key, index) => result.indexOf(key) === index);
}

export function columnSpecs(order, titles = {}, sessions) {
  return columnKeys(order, sessions).map((key, index, list) => {
    if (key === 'del') return { key, kind: 'del', title: '' };
    if (key === 'task') return { key, kind: 'task', title: 'Nhiệm vụ' };
    if (key.startsWith('x:')) {
      const id = key.slice(2);
      return { key, kind: 'custom', id, title: titles[key] || 'Cột mới' };
    }
    const day = parseDayKey(key);
    if (!day) return null;
    const prev = parseDayKey(list[index - 1]);
    return {
      key,
      kind: 'day',
      dayIndex: day.dayIndex,
      session: day.session,
      lead: !prev || prev.dayIndex !== day.dayIndex,
      title: MONTH_DAY_HEADERS[day.dayIndex] || ''
    };
  }).filter(Boolean);
}

export function customCellKey(id, weekStart, slot) {
  return `x|${id}|${weekStart}|${slot}`;
}

function cellValue(column, info, monthGrid) {
  if (column.kind === 'del') return '';
  if (column.kind === 'task') return info.type === 'role' ? info.role.label : '';
  if (column.kind === 'custom') {
    const slot = info.type === 'role' ? info.role.key : 'head';
    return monthGrid?.[customCellKey(column.id, info.weekStart, slot)] ?? '';
  }
  const day = info.days[column.dayIndex];
  if (!day) return '';
  if (info.type === 'weekhead') return column.lead ? day.label : '';
  return readMonthCell(monthGrid, day.iso, info.role.key, column.session);
}

/**
 * One block per week: a date row (dd/mm, merged across every session of that day)
 * then one row per duty task. The same task list is repeated in every block.
 */
export function buildMonthTable(monthKey, monthGrid = {}, roles = MONTH_ROLES, order, titles, sessions) {
  const weeks = weeksOfMonth(monthKey);
  const taskRoles = resolveMonthRoles(roles);
  const columns = columnSpecs(order, titles, sessions);
  const rows = [];
  const meta = [];
  const mergeCells = [];

  weeks.forEach((week) => {
    const head = { type: 'weekhead', days: week.days, weekStart: week.start };
    const headRow = rows.length;
    rows.push(columns.map(column => cellValue(column, head, monthGrid)));
    meta.push(head);
    columns.forEach((column, index) => {
      if (column.kind !== 'day' || !column.lead) return;
      let span = 1;
      while (columns[index + span]?.kind === 'day' && columns[index + span].dayIndex === column.dayIndex) span += 1;
      if (span > 1) mergeCells.push({ row: headRow, col: index, rowspan: 1, colspan: span });
    });

    taskRoles.forEach((role) => {
      const info = { type: 'role', role, days: week.days, weekStart: week.start };
      rows.push(columns.map(column => cellValue(column, info, monthGrid)));
      meta.push(info);
    });
  });

  return { rows, meta, mergeCells, roles: taskRoles, columns };
}

export function monthOfVisibleRows(meta, rows) {
  let fallback = null;
  let dayOne = null;
  rows.forEach((row) => {
    const info = meta[row];
    if (!info?.days?.length) return;
    if (!fallback) {
      const inside = info.days.find(day => day.inMonth) || info.days[0];
      fallback = currentMonthKey(inside.date);
    }
    info.days.forEach((day) => {
      if (day.date.getDate() === 1) dayOne = currentMonthKey(day.date);
    });
  });
  return dayOne || fallback;
}
