import { splitTaskCodes } from './cellOrder';
import { leaveCovers } from './leaveRepeat';
import { sessionLabel } from './monthSchedule';
import { dutyPins, dutyScheduleTask } from './staffDuties';
import { alertMuted } from './taskAlert';

const SESSION_ID = { Sáng: 'S', Trưa: 'R', Chiều: 'C', Tối: 'T' };
const DAY_NAME = '(?:T[2-7]|CN)';

function fold(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function hasToken(value, code, taskList) {
  const needle = fold(code);
  if (!needle) return false;
  return splitTaskCodes(value, taskList).some(item => fold(item) === needle);
}

function personOf(staffList, shortName) {
  return (staffList || []).find(person => fold(person.shortName) === fold(shortName)) || null;
}

function readCell(grid, staffList, shortName, dayIndex, session) {
  const person = personOf(staffList, shortName);
  const key = person?.shortName || shortName;
  return grid?.[key]?.[dayIndex]?.[session] || '';
}

function dayIndexOf(days, dayName, dateStr) {
  return (days || []).findIndex(day => day.dayName === dayName && day.dateStr === dateStr);
}

function othersHave(grid, staffList, shortName, dayIndex, session, codes, taskList) {
  return codes.every(code => (staffList || []).some(person => (
    fold(person.shortName) !== fold(shortName)
    && hasToken(grid?.[person.shortName]?.[dayIndex]?.[session], code, taskList)
  )));
}

function anyoneHas(grid, staffList, dayIndex, session, code, taskList) {
  return (staffList || []).some(person => hasToken(grid?.[person.shortName]?.[dayIndex]?.[session], code, taskList));
}

function roomParts(value) {
  return String(value || '').split(/[,;\n|/]+/).map(part => part.trim()).filter(Boolean);
}

/** Rooms in a ward warning that still do not appear on any doctor for that slot. */
function missingRooms(grid, staffList, dayIndex, sessionIds, rooms, taskList) {
  const names = roomParts(rooms);
  const ids = (sessionIds || []).filter(Boolean);
  if (dayIndex < 0 || !ids.length) return names;
  return names.filter(room => !ids.some(session => anyoneHas(grid, staffList, dayIndex, session, room, taskList)));
}

function leaveCodes(requested) {
  return fold(requested) === 'p' ? [requested, 'BÙ'] : [requested];
}

function blockerCodes(quoted, taskList) {
  return splitTaskCodes(quoted, taskList).filter(code => fold(code) !== 'rt');
}

function slot(days, dayName, dateStr, sessionLabel) {
  const dayIndex = dayIndexOf(days, dayName, dateStr);
  const session = SESSION_ID[sessionLabel];
  if (dayIndex < 0 || !session) return null;
  return { dayIndex, session };
}

/**
 * Drop a stored schedule warning once the week grid already satisfies it.
 * Leave blocked by a month task (CT vs PKTC): the doctor has the leave code,
 * no longer has the month task, and that month task sits on someone else.
 */
export function warningStillApplies(message, ctx) {
  const text = String(message || '').trim();
  if (!text) return false;
  const { grid, days, staffList, taskList, sessions } = ctx;
  if (alertMuted(text, taskList)) return false;

  const leaveBlocked = text.match(new RegExp(
    `^Không xếp được (.+?) cho (.+) (${DAY_NAME}) (\\d{1,2}\\/\\d{1,2}) (Sáng|Trưa|Chiều|Tối): ô đã có "(.*)" từ lịch tháng\\. Cần sửa tay\\.(?: Ghi chú: .*\\.)?$`
  ));
  if (leaveBlocked) {
    const [, requested, shortName, dayName, dateStr, sessionLabel, quoted] = leaveBlocked;
    const at = slot(days, dayName, dateStr, sessionLabel);
    if (!at) return true;
    const cell = readCell(grid, staffList, shortName, at.dayIndex, at.session);
    const blocked = blockerCodes(quoted, taskList);
    const hasLeave = leaveCodes(requested).some(code => hasToken(cell, code, taskList));
    const stillBlocked = blocked.some(code => hasToken(cell, code, taskList));
    const moved = !blocked.length || othersHave(grid, staffList, shortName, at.dayIndex, at.session, blocked, taskList);
    return !(hasLeave && !stillBlocked && moved);
  }

  const study = text.match(new RegExp(
    `^Không xếp được lịch (?:học|dạy) "(.+)" (${DAY_NAME}) (\\d{1,2}\\/\\d{1,2}) (Sáng|Trưa|Chiều|Tối):`
  ));
  if (study) {
    const [, code, dayName, dateStr, sessionLabel] = study;
    const at = slot(days, dayName, dateStr, sessionLabel);
    if (!at) return true;
    return !anyoneHas(grid, staffList, at.dayIndex, at.session, code, taskList);
  }

  const clash = text.match(new RegExp(
    `^BS (.+?) có lịch ".+?" nhưng phải "(.+?)" (${DAY_NAME}) (\\d{1,2}\\/\\d{1,2}) (Sáng|Trưa|Chiều|Tối)\\.`
  ));
  if (clash) {
    const [, shortName, must, dayName, dateStr, sessionLabel] = clash;
    const at = slot(days, dayName, dateStr, sessionLabel);
    if (!at) return true;
    const cell = readCell(grid, staffList, shortName, at.dayIndex, at.session);
    return !hasToken(cell, must, taskList);
  }

  const weekly = text.match(new RegExp(
    `^Không xếp được (.+) (${DAY_NAME}) (\\d{1,2}\\/\\d{1,2}) (Sáng|Trưa|Chiều|Tối): người phụ trách đang bị khóa hoặc đang nghỉ\\.$`
  ));
  if (weekly) {
    const [, code, dayName, dateStr, sessionLabel] = weekly;
    const at = slot(days, dayName, dateStr, sessionLabel);
    if (!at) return true;
    return !(staffList || []).some((person) => {
      const cell = grid?.[person.shortName]?.[at.dayIndex]?.[at.session];
      if (!hasToken(cell, code, taskList)) return false;
      return !splitTaskCodes(cell, taskList).some(token => ['p', 'bu', 'ct', 'h'].includes(fold(token)));
    });
  }

  const roomSession = text.match(new RegExp(
    `^Bệnh phòng (.+?): (.+?) (${DAY_NAME}) (\\d{1,2}\\/\\d{1,2}) (Sáng|Trưa|Chiều|Tối) đang có .+, không xếp bệnh phòng buổi này\\. Cần bổ sung\\.$`
  ));
  if (roomSession) {
    const [, room, , dayName, dateStr, sessionLabel] = roomSession;
    const at = slot(days, dayName, dateStr, sessionLabel);
    if (!at) return true;
    return missingRooms(grid, staffList, at.dayIndex, [at.session], room, taskList).length > 0;
  }

  const outside = text.match(new RegExp(
    `^Task (.+?) chỉ giao .+? nhưng hồ sơ (.+?) đang ghim .+? (${DAY_NAME}) (\\d{1,2}\\/\\d{1,2}) (Sáng|Trưa|Chiều|Tối)\\.$`
  ));
  if (outside) {
    const [, code, shortName, dayName, dateStr, sessionName] = outside;
    const task = (taskList || []).find(item => fold(item.code) === fold(code));
    const person = (staffList || []).find(item => fold(item.shortName) === fold(shortName));
    if (!task || !person || !dutyScheduleTask(task)) return false;
    const owners = Array.isArray(task.owners) ? task.owners : [];
    if (!owners.length || owners.includes(person.id)) return false;
    const at = slot(days, dayName, dateStr, sessionName);
    if (!at) return true;
    return dutyPins(person).some(pin => pin.taskId === task.id && pin.day === at.dayIndex && pin.session === at.session);
  }

  const roomDay = text.match(new RegExp(
    `^Bệnh phòng (.+?): (.+?) nghỉ (${DAY_NAME}) (\\d{1,2}\\/\\d{1,2})(?: (Sáng|Trưa|Chiều|Tối))?\\. Cần bổ sung\\.$`
  ));
  if (roomDay) {
    const [, room, , dayName, dateStr, sessionName] = roomDay;
    const dayIndex = dayIndexOf(days, dayName, dateStr);
    if (dayIndex < 0) return true;
    const ids = sessionName ? [SESSION_ID[sessionName]] : (sessions?.length ? sessions : ['S', 'C']);
    return missingRooms(grid, staffList, dayIndex, ids, room, taskList).length > 0;
  }

  return true;
}

export function pruneResolvedAlerts(messages, ctx) {
  return (messages || []).filter(message => warningStillApplies(message, ctx));
}

export function sameAlerts(left, right) {
  return (left || []).join('\n') === (right || []).join('\n');
}

function locateAlert(message, days) {
  const text = String(message || '');
  const withSession = text.match(new RegExp(`(${DAY_NAME}) (\\d{1,2}\\/\\d{1,2}) (Sáng|Trưa|Chiều|Tối)`));
  if (withSession) {
    return {
      dayIndex: dayIndexOf(days, withSession[1], withSession[2]),
      sessionId: SESSION_ID[withSession[3]] || null
    };
  }
  const dayOnly = text.match(new RegExp(`(${DAY_NAME}) (\\d{1,2}\\/\\d{1,2})`));
  if (dayOnly) {
    return { dayIndex: dayIndexOf(days, dayOnly[1], dayOnly[2]), sessionId: null };
  }
  return null;
}

function taskByCode(code, taskList) {
  const needle = fold(code);
  return (taskList || []).find(task => fold(task.code) === needle) || null;
}

function locksTarget(source, target) {
  if (!source || !target) return false;
  return (source.locks || []).includes(target.id);
}

/** Pairs in one cell where one task lists the other under Khóa. */
export function lockPairs(codes, taskList) {
  const tasks = (codes || []).map(code => ({ code, task: taskByCode(code, taskList) })).filter(item => item.task);
  const pairs = [];
  tasks.forEach((left) => {
    tasks.forEach((right) => {
      if (left.task.id === right.task.id || !locksTarget(left.task, right.task)) return;
      const key = [fold(left.code), fold(right.code)].sort().join('|');
      if (pairs.some(pair => pair.key === key)) return;
      pairs.push({ key, locker: left.task.code, locked: right.task.code });
    });
  });
  return pairs;
}

/**
 * The task just typed stays. A task already in the cell is removed when it
 * locks that new task, or the new task locks it.
 */
export function resolveLockedCell(previous, next, taskList) {
  const before = splitTaskCodes(previous, taskList);
  const after = splitTaskCodes(next, taskList);
  const added = after.filter(code => !before.some(item => fold(item) === fold(code)));
  if (!added.length) return String(next ?? '');
  const addedTasks = added.map(code => taskByCode(code, taskList)).filter(Boolean);
  const kept = after.filter((code) => {
    if (added.some(item => fold(item) === fold(code))) return true;
    const task = taskByCode(code, taskList);
    if (!task) return true;
    return !addedTasks.some(item => locksTarget(task, item) || locksTarget(item, task));
  });
  if (kept.length === after.length) return String(next ?? '');
  return kept.join(', ');
}

/** Warnings for cells that still contain both a task and a task it locks. */
export function lockConflictMessages({ grid, staffList, days, sessions, taskList }) {
  const messages = [];
  const seen = new Set();
  (staffList || []).forEach((person) => {
    (days || []).forEach((day, dayIndex) => {
      (sessions || []).forEach((session) => {
        const codes = splitTaskCodes(grid?.[person.shortName]?.[dayIndex]?.[session], taskList);
        lockPairs(codes, taskList).forEach((pair) => {
          const message = `${pair.locker} khóa ${pair.locked} ${day.dayName} ${day.dateStr} ${sessionLabel(session)}`;
          if (seen.has(fold(message))) return;
          seen.add(fold(message));
          messages.push(message);
        });
      });
    });
  });
  return messages;
}

function coversIso(entry, iso) {
  return leaveCovers(entry, iso);
}

function entrySessionIds(entry) {
  if (Array.isArray(entry?.sessions) && entry.sessions.length) return entry.sessions;
  if (entry?.session === 'C' || entry?.session === 'S' || entry?.session === 'R' || entry?.session === 'T') {
    return [entry.session];
  }
  return ['S'];
}

function clashLabel(person, has, must, note) {
  const extra = String(note || '').trim();
  const held = String(has || '').trim() || 'lịch tháng';
  return `BS ${person} có lịch "${held}" nhưng phải "${must}"${extra ? ` ${extra}` : ''}`;
}

function savedNote(entries, { shortName, iso, session, code, field }) {
  const hit = (entries || []).find((entry) => {
    if (shortName && fold(entry.shortName) !== fold(shortName)) return false;
    if (iso && !coversIso(entry, iso)) return false;
    if (session && !entrySessionIds(entry).includes(session)) return false;
    if (field === 'type') {
      const type = entry.type || 'P';
      if (fold(type) !== fold(code) && !(fold(code) === 'bu' && fold(type) === 'p')) return false;
    }
    if (field === 'topic' && fold(entry.topic) !== fold(code)) return false;
    return true;
  });
  return String(hit?.note || '').trim();
}

/** Short label for the sheet. Week tasks stay "Thiếu …". Month, leave and study name the doctor. */
export function shortMissingLabel(message, ctx = {}) {
  const text = String(message || '').trim();
  const days = ctx.days || [];
  const stored = text.match(new RegExp(
    `^BS (.+?) có lịch "(.+?)" nhưng phải "(.+?)" (${DAY_NAME}) (\\d{1,2}\\/\\d{1,2}) (Sáng|Trưa|Chiều|Tối)\\.(?: Ghi chú: (.*)\\.)?$`
  ));
  if (stored) {
    return clashLabel(stored[1], stored[2], stored[3], stored[7]);
  }
  const lock = text.match(new RegExp(`^(.+?) khóa (.+?) (${DAY_NAME}) `));
  if (lock) return `${lock[1]} khóa ${lock[2]}`;
  const room = text.match(/^Bệnh phòng (.+?):/);
  if (room) {
    const names = roomParts(room[1]);
    const found = locateAlert(text, days);
    const ids = found?.sessionId ? [found.sessionId] : ['S', 'C'];
    const missing = found && found.dayIndex >= 0
      ? missingRooms(ctx.grid, ctx.staffList, found.dayIndex, ids, names.join(','), ctx.taskList)
      : names;
    return missing.length ? `Thiếu BP ${missing.join(', ')}` : '';
  }
  const study = text.match(new RegExp(
    `^Không xếp được lịch (?:học|dạy) "(.+?)" (${DAY_NAME}) (\\d{1,2}\\/\\d{1,2}) (Sáng|Trưa|Chiều|Tối):`
  ));
  if (study) {
    const [, code, dayName, dateStr, sessionName] = study;
    const at = slot(days, dayName, dateStr, sessionName);
    const iso = at ? days[at.dayIndex]?.iso : '';
    const entry = (ctx.studyEntries || []).find(item => (
      (!iso || coversIso(item, iso))
      && (!at || entrySessionIds(item).includes(at.session))
      && fold(item.topic) === fold(code)
    ));
    const inline = text.match(/Ghi chú: (.*)\.$/);
    if (entry?.shortName) {
      const cell = at ? readCell(ctx.grid, ctx.staffList, entry.shortName, at.dayIndex, at.session) : '';
      return clashLabel(entry.shortName, cell, code, entry.note || inline?.[1]);
    }
    return inline?.[1] ? `Thiếu ${code} ${inline[1]}` : `Thiếu ${code}`;
  }
  const leave = text.match(new RegExp(
    `^Không xếp được (.+?) cho (.+?) (${DAY_NAME}) (\\d{1,2}\\/\\d{1,2}) (Sáng|Trưa|Chiều|Tối): ô đã có "(.*)" từ lịch tháng\\. Cần sửa tay\\.(?: Ghi chú: (.*)\\.)?$`
  ));
  if (leave) {
    const [, must, person, dayName, dateStr, sessionName, has, inlineNote] = leave;
    const at = slot(days, dayName, dateStr, sessionName);
    const iso = at ? days[at.dayIndex]?.iso : '';
    const note = inlineNote || savedNote(ctx.leaveEntries, {
      shortName: person,
      iso,
      session: at?.session,
      code: must,
      field: 'type'
    });
    return clashLabel(person, has, must, note);
  }
  const outsidePin = text.match(/^Task (.+?) chỉ giao .+? nhưng hồ sơ (.+?) đang ghim /);
  if (outsidePin) return `Lệch ${outsidePin[1].trim()} ${outsidePin[2].trim()}`;
  const weekly = text.match(new RegExp(`^Không xếp được (.+) (${DAY_NAME}) `));
  if (weekly) return `Thiếu ${weekly[1].trim()}`;
  const month = text.match(/có "(.+)" nhưng không khớp/);
  if (month) return `Thiếu ${month[1].trim()}`;
  const owner = text.match(/^Task (.+) có ngày cố định nhưng chưa chọn Trách nhiệm\.$/);
  if (owner) return `Thiếu trách nhiệm ${owner[1].trim()}`;
  const slotMiss = text.match(new RegExp(`^Task (.+) ${DAY_NAME} .+ chưa chọn Sáng hoặc Chiều\\.$`));
  if (slotMiss) return `Chưa chọn buổi ${slotMiss[1].trim()}`;
  const unmatched = text.match(/^Lịch (?:nghỉ|dạy) của "(.+)" không khớp/);
  if (unmatched) return `Không khớp ${unmatched[1].trim()}`;
  return '';
}

/** One bottom row: each warning sits in the session column it refers to. */
export function buildSessionAlertRow(messages, {
  days, sessions, weekWidth, noteCol, fixedCols = 3, leaveEntries, studyEntries, grid, staffList, taskList
}) {
  const row = new Array(weekWidth).fill('');
  const buckets = new Map();
  const ctx = { days, leaveEntries, studyEntries, grid, staffList, taskList };
  (messages || []).forEach((message) => {
    const text = String(message || '').trim();
    const label = shortMissingLabel(text, ctx);
    if (!label) return;
    const found = locateAlert(text, days);
    let col = noteCol;
    if (found && found.dayIndex >= 0 && sessions?.length) {
      const sessionIndex = found.sessionId ? sessions.indexOf(found.sessionId) : 0;
      const useIndex = sessionIndex >= 0 ? sessionIndex : 0;
      col = fixedCols + found.dayIndex * sessions.length + useIndex;
    }
    if (col < 0 || col >= weekWidth) col = noteCol;
    const list = buckets.get(col) || [];
    if (!list.some(item => fold(item) === fold(label))) list.push(label);
    buckets.set(col, list);
  });
  buckets.forEach((list, col) => {
    row[col] = list.join('\n');
  });
  return row;
}
