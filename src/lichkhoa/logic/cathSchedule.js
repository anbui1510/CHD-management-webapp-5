import { splitTaskCodes } from './cellOrder';
import { readMonthCell } from './monthSchedule';
import { showsBelow } from './taskDisplay';

const MONTH_ROWS = [
  { key: 'tt_chinh', fallback: 'TT chính' },
  { key: 'tt_phu', fallback: 'TT phụ' },
  { key: 'ttcc', fallback: 'TTCC phụ' }
];

export const CATH_HEAD_KEY = 'rash_pm';

function fold(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function localRoles(saved) {
  const list = Array.isArray(saved) ? saved.filter(row => row?.key && row.source !== 'month') : [];
  const head = list.find(row => row.key === CATH_HEAD_KEY) || { key: CATH_HEAD_KEY, label: 'Rash/PM' };
  const rest = list.filter(row => row.key !== CATH_HEAD_KEY);
  return [
    { key: CATH_HEAD_KEY, label: String(head.label || 'Rash/PM').trim() || 'Rash/PM', source: 'local' },
    ...rest.map(row => ({
      key: row.key,
      label: String(row.label || 'Task mới').trim() || 'Task mới',
      source: 'local'
    }))
  ];
}

function monthRole(monthRoles, spec) {
  const roles = monthRoles || [];
  return roles.find(role => role.key === spec.key)
    || roles.find(role => fold(role.label) === fold(spec.fallback))
    || null;
}

/** Rash/PM first, then the three month rows, then tasks added with +. */
export function resolveCathRoles(saved, monthRoles) {
  const locals = localRoles(saved);
  const linked = MONTH_ROWS.map((spec) => {
    const role = monthRole(monthRoles, spec);
    return {
      key: spec.key,
      source: 'month',
      monthKey: role?.key || spec.key,
      label: role?.label || spec.fallback,
      taskId: role?.taskId
    };
  });
  return [locals[0], ...linked, ...locals.slice(1)];
}

export function localCathRoles(saved) {
  return localRoles(saved);
}

export function cathCellKey(iso, rowKey, session) {
  return `${iso}|${rowKey}|${session}`;
}

export function readCathCell(cathGrid, iso, rowKey, session) {
  return cathGrid?.[cathCellKey(iso, rowKey, session)] ?? '';
}

export function buildCathDisplayRows({ roles, days, sessions, monthGrid, cathGrid }) {
  const grid = cathGrid || {};
  return (roles || []).map((role) => {
    const row = [role.label, '', ''];
    (days || []).forEach((day) => {
      (sessions || []).forEach((session) => {
        const key = cathCellKey(day.iso, role.key, session);
        const text = Object.prototype.hasOwnProperty.call(grid, key)
          ? grid[key]
          : (role.source === 'month'
            ? readMonthCell(monthGrid, day.iso, role.monthKey, session)
            : readCathCell(grid, day.iso, role.key, session));
        row.push(text || '');
      });
    });
    row.push('');
    return row;
  });
}

function taskForLabel(label, taskList) {
  const needle = fold(label);
  if (!needle || needle === 'task moi') return null;
  const list = taskList || [];
  return list.find(task => fold(task.code) === needle)
    || list.find(task => fold(task.name) === needle)
    || null;
}

function holdsCode(value, code, taskList) {
  const needle = fold(code);
  return splitTaskCodes(value, taskList).some(item => fold(item) === needle);
}

/**
 * Local cath rows (Rash/PM and rows added with +) show the short name of the
 * doctor who received that task. Month rows are left untouched. A cell with no
 * holder keeps whatever was typed, including an outside doctor.
 */
export function pourCathNames({ roles, grid, staffList, taskList, days, sessions, cathGrid, assignments }) {
  const next = { ...(cathGrid || {}) };
  (roles || []).filter(role => role && role.source !== 'month').forEach((role) => {
    const task = taskForLabel(role.label, taskList);
    if (!task?.code || !showsBelow(task)) return;
    (days || []).forEach((day, dayIndex) => {
      (sessions || []).forEach((session) => {
        const assigned = assignments?.[`${task.id}|${dayIndex}|${session}`];
        const holder = assigned
          ? (staffList || []).find(person => person.shortName === assigned)
          : (staffList || []).find(person => (
            holdsCode(grid?.[person.shortName]?.[dayIndex]?.[session], task.code, taskList)
          ));
        if (!holder) return;
        next[cathCellKey(day.iso, role.key, session)] = holder.shortName;
      });
    });
  });
  return next;
}
