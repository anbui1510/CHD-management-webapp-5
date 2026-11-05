import { normalizeDaySessions, sessionLabel } from './monthSchedule';
import { splitTaskCodes } from './cellOrder';
import { leaveCovers } from './leaveRepeat';

function taskMapOf(taskList) {
  const map = new Map();
  (taskList || []).forEach((task) => {
    const code = String(task?.code || '').trim();
    if (code) map.set(code, task);
  });
  return map;
}

function cellCodes(raw, taskList) {
  const text = String(raw ?? '').trim();
  if (!text || text === '0') return [];
  return splitTaskCodes(text, taskList).filter((code) => code && code !== '0');
}

/**
 * Build a day agenda for mobile from the week grid.
 * @returns {{ day: object|null, sessions: Array, leaves: Array, studies: Array }}
 */
export function buildDayAgenda({
  days,
  grid,
  staffList,
  taskList,
  dayIndex,
  daySessions,
  filterShortName = '',
  leaveEntries = [],
  studyEntries = []
} = {}) {
  const day = Array.isArray(days) ? days[dayIndex] : null;
  const sessions = normalizeDaySessions(daySessions);
  const tasks = taskMapOf(taskList);
  const filter = String(filterShortName || '').trim();
  const staff = (staffList || []).filter((person) => !filter || person.shortName === filter);

  const sessionBlocks = sessions.map((id) => {
    const items = [];
    staff.forEach((person) => {
      const row = grid?.[person.shortName];
      const cell = row?.[dayIndex];
      const raw = cell?.[id];
      cellCodes(raw, taskList).forEach((code) => {
        const task = tasks.get(code);
        items.push({
          shortName: person.shortName,
          staffName: person.name || person.shortName,
          code,
          taskName: task?.name || code,
          bgColor: task?.bgColor || '#e5e7eb',
          textColor: task?.textColor || '#111827'
        });
      });
    });
    return { id, label: sessionLabel(id), items };
  });

  const iso = day?.iso;
  const leaves = iso
    ? (leaveEntries || []).filter((entry) => {
      if (!leaveCovers(entry, iso)) return false;
      if (!filter) return true;
      return String(entry.shortName || '').trim() === filter;
    })
    : [];
  const studies = iso
    ? (studyEntries || []).filter((entry) => {
      if (!leaveCovers(entry, iso)) return false;
      if (!filter) return true;
      return String(entry.shortName || '').trim() === filter;
    })
    : [];

  return { day, sessions: sessionBlocks, leaves, studies };
}

export function pickInitialDayIndex(days, todayIso) {
  if (!Array.isArray(days) || !days.length) return 0;
  const hit = days.findIndex((day) => day?.iso === todayIso);
  return hit >= 0 ? hit : 0;
}

export function todayIso(now = new Date()) {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
