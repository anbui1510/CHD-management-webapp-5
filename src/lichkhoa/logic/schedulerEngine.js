// Weekly auto-schedule, applied to the week already open on the sheet.
// Layer 1: previous Sunday VG -> Monday morning and afternoon RT.
// Layer 2: copy the month roster into the matching week cells. Several tasks may share a duty role. A task marked "mã hóa vào gác" is rewritten to the code of the same-role task that is not itself encoded.
// Layer 3: registered leave, refused when the cell already comes from the month roster.
// Layer 4: registered teaching.
// Layer 5: staff pins first, then weekly tasks in Quản lý Task order. Month-classified tasks and P, BÙ, CT, H stay on the month pour.
// A ward task runs at its place in that list, only on the Sáng/Chiều slots chosen for that task. A lock only blocks that session.

import { normalizeDaySessions, readMonthCell } from './monthSchedule';
import { roleShortLabel, taskForRole } from './taskMatch';
import { orderCellText, splitTaskCodes } from './cellOrder';
import { leaveCovers } from './leaveRepeat';
import { dutyPins, dutyScheduleTask, pinHoldWarning, pinOwnerWarning } from './staffDuties';
import { traineeCovers } from './traineePeriod';
import { taskAlerts } from './taskAlert';
import { pourCathNames, readCathCell } from './cathSchedule';
import { showsBelow, showsOnWeek } from './taskDisplay';

export const HOLIDAY_DICTIONARY = {
  '1/1': 'Tết Dương lịch',
  '14/2': 'Valentine',
  '27/2': 'Ngày Thầy thuốc VN',
  '8/3': 'Quốc tế Phụ nữ',
  '30/4': 'Giải phóng miền Nam',
  '1/5': 'Quốc tế Lao động',
  '2/9': 'Quốc khánh',
  '20/10': 'Phụ nữ Việt Nam',
  '20/11': 'Nhà giáo Việt Nam',
  '22/12': 'Thành lập QĐNDVN',
  '26/4/2026': 'Giỗ tổ Hùng Vương',
  '16/2/2026': 'Nghỉ Giao thừa',
  '17/2/2026': 'Mùng 1 Tết',
  '18/2/2026': 'Mùng 2 Tết',
  '19/2/2026': 'Mùng 3 Tết'
};

const SESSION_LABEL = { S: 'Sáng', R: 'Trưa', C: 'Chiều', T: 'Tối' };
const DAY_NAMES = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];

function parseIso(iso) {
  const [y, m, d] = String(iso || '').split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

function isoOf(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function addIsoDays(iso, days) {
  const date = parseIso(iso);
  date.setDate(date.getDate() + days);
  return isoOf(date);
}

export function buildWeekDays(startDate) {
  const start = parseIso(startDate);
  const days = [];
  for (let d = 0; d < 7; d += 1) {
    const temp = new Date(start.getFullYear(), start.getMonth(), start.getDate() + d);
    const dayKey = `${temp.getDate()}/${temp.getMonth() + 1}`;
    const fullDateKey = `${temp.getDate()}/${temp.getMonth() + 1}/${temp.getFullYear()}`;
    const holidayName = HOLIDAY_DICTIONARY[fullDateKey] || HOLIDAY_DICTIONARY[dayKey] || '';
    days.push({
      dateObj: temp,
      iso: isoOf(temp),
      dayName: DAY_NAMES[d],
      dateStr: `${temp.getDate()}/${temp.getMonth() + 1}`,
      fullDateStr: fullDateKey,
      isHoliday: holidayName !== '',
      holidayName
    });
  }
  return days;
}

function blankDay(sessions) {
  const day = { isRT: false };
  sessions.forEach((id) => { day[id] = ''; });
  return day;
}

export function emptyWeekGrid(staffList, sessions) {
  const active = normalizeDaySessions(sessions);
  const grid = {};
  (staffList || []).forEach((person) => {
    grid[person.shortName] = {};
    for (let d = 0; d < 7; d += 1) grid[person.shortName][d] = blankDay(active);
  });
  return grid;
}

function fold(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function tokens(value, taskList) {
  return splitTaskCodes(value, taskList);
}

function hasToken(value, code, taskList) {
  const needle = fold(code);
  return tokens(value, taskList).some(item => fold(item) === needle);
}

function addToken(value, code, taskList) {
  if (!code || hasToken(value, code, taskList)) return String(value || '');
  const current = String(value || '').trim();
  return current ? `${current}, ${code}` : String(code);
}

function findTaskByCode(code, taskList) {
  const needle = fold(code);
  return (taskList || []).find(task => fold(task.code) === needle) || null;
}

function dutyHolders(taskList, role) {
  return (taskList || []).filter(task => task?.dutyRole === role);
}

// The code written on the week. Prefer a role holder that is not itself a source;
// if every holder encodes, use the one earlier in Quản lý Task.
function dutyTask(taskList, role) {
  const holders = dutyHolders(taskList, role);
  return holders.find(task => !task.encodeDuty) || holders[0] || null;
}

function isDutyToken(code, taskList, role, legacy) {
  const task = (taskList || []).find(item => fold(item?.code) === fold(code));
  if (task?.dutyRole === role) return true;
  const named = dutyTask(taskList, role);
  if (named && fold(code) === fold(named.code)) return true;
  if (task) return false;
  return fold(code) === legacy;
}

function encodesDuty(role, taskList) {
  const task = taskForRole(role, taskList);
  if (task) return !!task.encodeDuty;
  const label = fold(role?.label);
  return label === 'tc' || label === 'truc chinh' || label.includes('truc chinh');
}

function isWardTask(task) {
  return fold(`${task?.code || ''} ${task?.name || ''}`).includes('benh phong');
}

function isLeaveTask(task) {
  return task?.category === 'NGHI_VANG' || ['p', 'bu', 'ct', 'h'].includes(fold(task?.code));
}

function codeForRole(role, session, taskList) {
  const task = taskForRole(role, taskList);
  if (encodesDuty(role, taskList)) {
    if (session === 'C' || session === 'T') return dutyTask(taskList, 'vao_gac')?.code || task?.code || roleShortLabel(role, taskList);
    const morning = dutyTask(taskList, 'truc_ngay')?.code;
    if (morning && (session === 'S' || session === 'R')) return morning;
  }
  if (task?.code) return task.code;
  return roleShortLabel(role, taskList);
}

function staffNameKey(value) {
  return String(value || '').normalize('NFC').trim().toLocaleLowerCase('vi');
}

function matchOne(part, staffList) {
  const people = staffList || [];
  const exactKey = staffNameKey(part);
  const exact = people.filter(person => staffNameKey(person.shortName) === exactKey || staffNameKey(person.name) === exactKey);
  if (exact.length) return exact[0];
  const key = fold(part);
  if (!key) return null;
  const folded = people.filter(person => fold(person.shortName) === key || fold(person.name) === key);
  return folded.length === 1 ? folded[0] : null;
}

function matchStaff(text, staffList) {
  const found = [];
  String(text || '').split(/[,;/|\n]+/).map(item => item.trim()).filter(Boolean).forEach((part) => {
    const hit = matchOne(part.replace(/\([^)]*\)/g, ''), staffList);
    if (hit && !found.some(person => person.id === hit.id)) found.push(hit);
  });
  return found;
}

function taskByTopic(topic, taskList) {
  const needle = fold(topic);
  if (!needle) return null;
  return (taskList || []).find(task => fold(task.code) === needle || fold(task.name) === needle) || null;
}

function ownersOf(task, staffList) {
  const ids = Array.isArray(task?.owners) ? task.owners : [];
  return ids.map(id => (staffList || []).find(person => person.id === id)).filter(Boolean);
}

function collectStaffPinWarnings({ staffList, taskList, days, sessions, read, place, blocked, held }) {
  const warnings = [];
  const claimed = new Set();
  const active = sessions || [];
  (staffList || []).forEach((person) => {
    dutyPins(person).forEach((pin) => {
      const task = (taskList || []).find(item => item.id === pin.taskId);
      if (!dutyScheduleTask(task) || !days?.[pin.day] || !active.includes(pin.session)) return;
      const quiet = !taskAlerts(task);
      const when = `${days[pin.day].dayName} ${days[pin.day].dateStr} ${SESSION_LABEL[pin.session] || pin.session}`;
      const owners = ownersOf(task, staffList);
      if (owners.length && !owners.some(owner => owner.id === person.id)) {
        if (!quiet) warnings.push(pinOwnerWarning(task.code, owners.map(owner => owner.shortName).join(', '), person.shortName, when));
        return;
      }
      const substitute = (staffList || []).find(item => item.id === pin.substituteId && item.id !== person.id) || null;
      const allowedSub = substitute && (!owners.length || owners.some(owner => owner.id === substitute.id)) ? substitute : null;
      const holds = (who) => Boolean(who) && (
        hasToken(read(who, pin.day, pin.session), task.code, taskList)
        || held?.(who, pin.day, pin.session, task)
      );
      const key = `${task.id}|${pin.day}|${pin.session}`;
      if (holds(person) || holds(allowedSub)) {
        claimed.add(key);
        return;
      }
      if (claimed.has(key)) {
        if (!quiet) warnings.push(pinHoldWarning(person.shortName, task.code, when, read(person, pin.day, pin.session)));
        return;
      }
      let placed = false;
      if (place) {
        const queue = allowedSub ? [person, allowedSub] : [person];
        for (const candidate of queue) {
          if (blocked?.(candidate, pin.day, pin.session)) continue;
          if (place(candidate, pin.day, pin.session, task)) {
            placed = true;
            claimed.add(key);
            break;
          }
        }
      }
      if (!placed && !quiet) warnings.push(pinHoldWarning(person.shortName, task.code, when, read(person, pin.day, pin.session)));
    });
  });
  return warnings;
}

function savedSlots(task) {
  if (!Array.isArray(task?.fixedSlots)) return null;
  const days = new Set((Array.isArray(task.fixedDays) ? task.fixedDays : []).map(Number));
  const slots = task.fixedSlots
    .map(slot => ({
      day: Number(slot?.day),
      session: slot?.session === 'C' ? 'C' : slot?.session === 'S' ? 'S' : ''
    }))
    .filter(slot => slot.session && days.has(slot.day) && slot.day >= 0 && slot.day <= 6);
  const choseDay = [...days].some(day => day >= 0 && day <= 6);
  if (!slots.length && !choseDay) return null;
  return slots;
}

function taskSessions(task, active) {
  const spec = String(task?.session || '');
  const want = new Set();
  if (!spec || spec.includes('SANG')) want.add('S');
  if (spec.includes('TRUA')) want.add('R');
  if (spec.includes('CHIEU') || spec.includes('DEM')) want.add('C');
  if (spec.includes('TOI')) want.add('T');
  const list = active.filter(id => want.has(id));
  return list.length ? list : active.filter(id => id === 'S' || id === 'C');
}

function covers(entry, iso) {
  return leaveCovers(entry, iso);
}

function plannedLongLeave(entry) {
  return Boolean(entry?.plannedLong ?? entry?.studyLong);
}

function entrySessions(entry, active) {
  const raw = Array.isArray(entry?.sessions) && entry.sessions.length
    ? entry.sessions
    : [entry?.session === 'C' ? 'C' : 'S'];
  return active.filter(id => raw.includes(id));
}

function bonusOf(task) {
  if (task?.buRt || task?.buVg) {
    return {
      rt: task.buRt ? Number(task.deltaRt) || 0 : 0,
      vg: task.buVg ? Number(task.deltaVg) || 0 : 0
    };
  }
  if (task?.buMode === 'RT') return { rt: Number(task.delta) || 0, vg: 0 };
  if (task?.buMode === 'VG') return { rt: 0, vg: Number(task.delta) || 0 };
  return { rt: 0, vg: 0 };
}

function labeledRow(roomTable, needle, fallback) {
  const labels = roomTable?.labels || [];
  const index = labels.findIndex(label => fold(label).includes(needle));
  const matrix = roomTable?.matrix || [];
  if (index >= 0) return matrix[index] || [];
  return matrix[fallback] || [];
}

function roomPairs(roomTable) {
  const doctors = labeledRow(roomTable, 'phu trach', 0);
  const rooms = labeledRow(roomTable, 'phong', 1);
  const width = Math.max(doctors.length, rooms.length);
  const pairs = [];
  for (let index = 0; index < width; index += 1) {
    const doctor = String(doctors[index] || '').trim();
    const room = String(rooms[index] || '').trim();
    if (!doctor && !room) continue;
    pairs.push({ doctor, room });
  }
  return pairs;
}

export function generateWeeklySchedule({
  startDate,
  staffList = [],
  taskList = [],
  monthGrid = {},
  monthRoles = [],
  daySessions,
  leaveEntries = [],
  studyEntries = [],
  roomTable,
  sheets = [],
  existingNotes = {},
  cathRoles = [],
  cathGrid: incomingCath = {}
}) {
  const sessions = normalizeDaySessions(daySessions);
  const roomNames = roomPairs(roomTable).map(pair => pair.room).filter(Boolean);
  const days = buildWeekDays(startDate);
  const warnings = [];
  const roomWarnings = [];
  const buGrants = {};
  const leaveCuts = { bu: {}, phep: {} };
  const buPool = new Map(staffList.map(person => [person.id, Number(person.buBalance) || 0]));
  const monthCells = new Set();
  const granted = new Set();
  const grid = emptyWeekGrid(staffList, sessions);
  const rtSessions = ['S', 'C'].filter(id => sessions.includes(id));

  const ensure = (person, day) => {
    if (!grid[person.shortName]) {
      grid[person.shortName] = {};
      for (let index = 0; index < 7; index += 1) grid[person.shortName][index] = blankDay(sessions);
    }
    if (!grid[person.shortName][day]) grid[person.shortName][day] = blankDay(sessions);
    return grid[person.shortName][day];
  };

  const put = (person, day, session, code, fromMonth = false) => {
    if (!sessions.includes(session) || !code) return false;
    if (!traineeCovers(person, days[day]?.iso)) return false;
    const row = ensure(person, day);
    const current = String(row[session] || '');
    const isOff = (item) => isDutyToken(item, taskList, 'ra_truc', 'rt');
    const onlyRt = tokens(current, taskList).length > 0 && tokens(current, taskList).every(isOff);
    const offCode = dutyTask(taskList, 'ra_truc')?.code || 'RT';
    const next = onlyRt && !isOff(code) ? addToken(code, offCode, taskList) : addToken(current, code, taskList);
    row[session] = orderCellText(next, taskList, roomNames);
    if (tokens(row[session], taskList).some(isOff)) row.isRT = true;
    if (fromMonth) monthCells.add(`${person.shortName}|${day}|${session}`);
    return true;
  };

  const read = (person, day, session) => String(grid[person.shortName]?.[day]?.[session] || '');

  const dayHas = (person, day, code) => sessions.some(session => hasToken(read(person, day, session), code, taskList));

  const warnedDuty = new Set();
  const warnDuty = (role, message) => {
    if (warnedDuty.has(role)) return;
    warnedDuty.add(role);
    warnings.push(message);
  };
  // Next-day ra trực comes from the vào gác code, not from that day's month cell.
  const markRt = (person, day) => {
    const code = dutyTask(taskList, 'ra_truc')?.code;
    if (!code) {
      warnDuty('ra_truc', 'Có task mã hóa vào gác nhưng chưa có task vai trò Ra trực.');
      return;
    }
    rtSessions.forEach(session => put(person, day, session, code, false));
  };

  const peopleWithVg = (iso) => {
    const found = new Map();
    (sheets || []).forEach((sheet) => {
      const sheetDays = buildWeekDays(sheet.startDate);
      const index = sheetDays.findIndex(day => day.iso === iso);
      if (index < 0) return;
      staffList.forEach((person) => {
        const row = sheet.grid?.[person.shortName]?.[index] || {};
        const hit = Object.entries(row).some(([key, value]) => key !== 'isRT' && key !== 'note' && tokens(value, taskList).some(item => isDutyToken(item, taskList, 'vao_gac', 'vg')));
        if (hit) found.set(person.id, person);
      });
    });
    (monthRoles || []).forEach((role) => {
      sessions.forEach((session) => {
        const code = codeForRole(role, session, taskList);
        if (!isDutyToken(code, taskList, 'vao_gac', 'vg')) return;
        matchStaff(readMonthCell(monthGrid, iso, role.key, session), staffList).forEach((person) => {
          found.set(person.id, person);
        });
      });
    });
    return [...found.values()];
  };

  // Layer 1 — Monday RT when the previous Sunday has VG.
  peopleWithVg(addIsoDays(days[0].iso, -1)).forEach(person => markRt(person, 0));

  // Layer 2 — month roster into the same weekday and session.
  days.forEach((day, dayIndex) => {
    (monthRoles || []).forEach((role) => {
      sessions.forEach((session) => {
        const text = String(readMonthCell(monthGrid, day.iso, role.key, session) || '').trim();
        if (!text) return;
        const people = matchStaff(text, staffList);
        if (!people.length) {
          warnings.push(`Lịch tháng ${day.dayName} ${day.dateStr} ${SESSION_LABEL[session] || session} (${role.label || role.key}) có "${text}" nhưng không khớp bác sĩ nào.`);
          return;
        }
        const code = codeForRole(role, session, taskList);
        const roleTask = taskForRole(role, taskList);
        if (roleTask && !showsOnWeek(roleTask)) return;
        if (encodesDuty(role, taskList) && (session === 'C' || session === 'T') && !dutyTask(taskList, 'vao_gac')) {
          warnDuty('vao_gac', `Dòng ${role.label || role.key} đang mã hóa vào gác nhưng chưa có task vai trò Vào gác.`);
        }
        people.forEach((person) => {
          put(person, dayIndex, session, code, true);
          if (isDutyToken(code, taskList, 'vao_gac', 'vg') && dayIndex < 6) markRt(person, dayIndex + 1);
        });
      });
    });
  });

  const lockedBy = (value, task) => tokens(value, taskList).filter((code) => {
    const existing = findTaskByCode(code, taskList);
    return existing && task && (existing.locks || []).includes(task.id);
  });

  const absent = (value) => tokens(value, taskList).some(code => ['p', 'bu', 'ct', 'h'].includes(fold(code)));

  // Layer 3 — leave into week cells; month-poured cells win. plannedLong: keep month task, fill empty sessions with leave code, no warning.
  (leaveEntries || []).forEach((entry) => {
    const person = staffList.find(item => fold(item.shortName) === fold(entry.shortName));
    const requested = entry.type || 'P';
    if (!person) {
      if (entry.shortName) warnings.push(`Lịch nghỉ của "${entry.shortName}" không khớp bác sĩ nào.`);
      return;
    }
    days.forEach((day, dayIndex) => {
      if (!covers(entry, day.iso)) return;
      entrySessions(entry, sessions).forEach((session) => {
        const key = `${person.shortName}|${dayIndex}|${session}`;
        const current = read(person, dayIndex, session);
        if (monthCells.has(key)) {
          if (plannedLongLeave(entry)) return; // ưu tiên lịch tháng, không cảnh báo
          const note = String(entry.note || '').trim();
          warnings.push(`Không xếp được ${requested} cho ${person.shortName} ${day.dayName} ${day.dateStr} ${SESSION_LABEL[session] || session}: ô đã có "${current}" từ lịch tháng. Cần sửa tay.${note ? ` Ghi chú: ${note}.` : ''}`);
          return;
        }
        if (plannedLongLeave(entry) && String(current || '').trim()) {
          return; // ô đã có nội dung (không từ lịch tháng) — không ghi đè
        }
        let code = requested;
        if (fold(requested) === 'p') {
          const pool = buPool.get(person.id) || 0;
          if (pool >= 0.5) {
            code = 'BÙ';
            buPool.set(person.id, +(pool - 0.5).toFixed(1));
            leaveCuts.bu[person.shortName] = +((leaveCuts.bu[person.shortName] || 0) + 0.5).toFixed(1);
          } else {
            leaveCuts.phep[person.shortName] = +((leaveCuts.phep[person.shortName] || 0) + 0.5).toFixed(1);
          }
        }
        put(person, dayIndex, session, code);
      });
    });
  });

  const canTake = (person, day, session, task) => {
    if (!traineeCovers(person, days[day]?.iso)) return false;
    const current = read(person, day, session);
    if (absent(current)) return false;
    return lockedBy(current, task).length === 0;
  };

  const grant = (person, task, day, placedSessions) => {
    const bonus = bonusOf(task);
    if (!bonus.rt && !bonus.vg) return;
    const key = `${person.id}|${task.id}|${day}`;
    if (granted.has(key)) return;
    let amount = 0;
    if (bonus.rt && dayHas(person, day, 'RT')) amount += bonus.rt;
    if (bonus.vg && placedSessions.some(session => hasToken(read(person, day, session), 'VG', taskList))) amount += bonus.vg;
    if (!amount) return;
    granted.add(key);
    buGrants[person.shortName] = +((buGrants[person.shortName] || 0) + amount).toFixed(1);
  };

  const hasLowerRow = (task) => {
    const code = fold(task?.code);
    const name = fold(task?.name);
    const rows = [...(cathRoles || []), ...(monthRoles || [])];
    return rows.some((role) => {
      const label = fold(role?.label);
      return label && label !== 'task moi' && (label === code || label === name);
    });
  };
  const lowerNames = {};
  const placeTask = (person, day, session, task) => {
    if (!canTake(person, day, session, task)) return false;
    if (showsBelow(task)) lowerNames[`${task.id}|${day}|${session}`] = person.shortName;
    if (!showsOnWeek(task) && hasLowerRow(task)) return true;
    return put(person, day, session, task.code);
  };

  // Layer 4 — teaching registrations pour onto the assigned person for each covered day and session.
  (studyEntries || []).forEach((entry) => {
    const person = staffList.find(item => fold(item.shortName) === fold(entry.shortName));
    const task = (taskList || []).find(item => entry.taskId && item.id === entry.taskId)
      || taskByTopic(entry.topic || entry.type, taskList);
    const code = task?.code || entry.topic;
    if (!code) return;
    const quiet = task ? !taskAlerts(task) : false;
    if (!person) {
      if (entry.shortName && !quiet) warnings.push(`Lịch dạy của "${entry.shortName}" không khớp bác sĩ nào.`);
      return;
    }
    days.forEach((day, dayIndex) => {
      if (!covers(entry, day.iso)) return;
      entrySessions(entry, sessions).forEach((session) => {
        const key = `${person.shortName}|${dayIndex}|${session}`;
        const current = read(person, dayIndex, session);
        const note = String(entry.note || '').trim();
        const when = `${day.dayName} ${day.dateStr} ${SESSION_LABEL[session] || session}`;
        if (monthCells.has(key)) {
          if (plannedLongLeave(entry) || quiet) return;
          warnings.push(`Không xếp được ${code} cho ${person.shortName} ${when}: ô đã có "${current}" từ lịch tháng. Cần sửa tay.${note ? ` Ghi chú: ${note}.` : ''}`);
          return;
        }
        if (plannedLongLeave(entry) && String(current || '').trim()) return;
        const placed = task
          ? placeTask(person, dayIndex, session, task)
          : (!absent(current) && put(person, dayIndex, session, code));
        if (!placed) {
          if (quiet) return;
          const blocked = String(read(person, dayIndex, session) || current || '').trim();
          if (blocked) {
            warnings.push(`BS ${person.shortName} có lịch "${blocked}" nhưng phải "${code}" ${when}.${note ? ` Ghi chú: ${note}.` : ''}`);
          } else {
            warnings.push(`Không xếp được lịch dạy "${code}" ${when}: ưu tiên lịch tháng hoặc ô đã bị khóa.${note ? ` Ghi chú: ${note}.` : ''}`);
          }
          return;
        }
        if (task) grant(person, task, dayIndex, [session]);
      });
    });
  });

  let wardsPlaced = false;
  const placeWards = (wardTask) => {
    if (wardsPlaced) return;
    wardsPlaced = true;
    const reportRoom = (line) => {
      if (taskAlerts(wardTask)) roomWarnings.push(line);
    };
    const explicit = savedSlots(wardTask);
    const weekdaySessions = sessions.filter(id => id === 'S' || id === 'C');
    const plan = explicit
      ? explicit.filter(slot => days[slot.day] && sessions.includes(slot.session))
      : [0, 1, 2, 3, 4].filter(day => days[day]).flatMap(day => weekdaySessions.map(session => ({ day, session })));
    if (explicit) {
      const fixedDays = Array.isArray(wardTask?.fixedDays) ? wardTask.fixedDays.map(Number).filter(day => days[day]) : [];
      fixedDays.filter(day => !plan.some(slot => slot.day === day)).forEach((day) => {
        reportRoom(`Bệnh phòng ${days[day].dayName} ${days[day].dateStr} chưa chọn Sáng hoặc Chiều.`);
      });
    }
    const slotsByDay = new Map();
    plan.forEach((slot) => {
      const list = slotsByDay.get(slot.day) || [];
      if (!list.includes(slot.session)) list.push(slot.session);
      slotsByDay.set(slot.day, list);
    });
    roomPairs(roomTable).forEach(({ doctor, room }) => {
      if (!room) return;
      const people = matchStaff(doctor, staffList);
      if (!people.length) {
        reportRoom(`Bệnh phòng ${room}: chưa có bác sĩ phụ trách.`);
        return;
      }
      people.forEach((person) => {
        slotsByDay.forEach((useSessions, day) => {
          useSessions.forEach((session) => {
            const current = read(person, day, session);
            const blockers = lockedBy(current, wardTask);
            if (blockers.length) {
              reportRoom(`Bệnh phòng ${room}: ${person.shortName} ${days[day].dayName} ${days[day].dateStr} ${SESSION_LABEL[session] || session} đang có ${blockers.join(', ')}, không xếp bệnh phòng buổi này. Cần bổ sung.`);
              return;
            }
            if (absent(current)) {
              reportRoom(`Bệnh phòng ${room}: ${person.shortName} nghỉ ${days[day].dayName} ${days[day].dateStr} ${SESSION_LABEL[session] || session}. Cần bổ sung.`);
              return;
            }
            put(person, day, session, room);
          });
        });
      });
    });
  };

  // Personal pins name the doctor for one day and session. Task fixed slots fill whatever is left.
  warnings.push(...collectStaffPinWarnings({
    staffList,
    taskList,
    days,
    sessions,
    read,
    place: placeTask,
    blocked: (person, day, session) => monthCells.has(`${person.shortName}|${day}|${session}`)
  }));

  // Weekly tasks follow Quản lý Task order. Month scope and leave codes are poured earlier.
  (taskList || []).forEach((task) => {
    if (task.scope === 'month' || isLeaveTask(task)) return;
    if (isWardTask(task)) {
      placeWards(task);
      return;
    }
    const fixedDays = Array.isArray(task.fixedDays) ? task.fixedDays.map(Number).filter(day => days[day]) : [];
    if (!fixedDays.length) return;
    const explicit = savedSlots(task);
    const plan = explicit
      ? explicit.filter(slot => days[slot.day] && sessions.includes(slot.session))
      : fixedDays.filter(day => days[day]).flatMap(day => taskSessions(task, sessions).map(session => ({ day, session })));
    const quiet = !taskAlerts(task);
    if (explicit) {
      fixedDays.filter(day => days[day] && !plan.some(slot => slot.day === day)).forEach((day) => {
        if (!quiet) warnings.push(`Task ${task.code} ${days[day].dayName} ${days[day].dateStr} chưa chọn Sáng hoặc Chiều.`);
      });
    }
    const people = ownersOf(task, staffList);
    if (!people.length) {
      const open = plan.some(slot => !(staffList || []).some(person => hasToken(read(person, slot.day, slot.session), task.code, taskList)));
      if (open && !quiet) warnings.push(`Task ${task.code} có ngày cố định nhưng chưa chọn Trách nhiệm.`);
      return;
    }
    const byDay = new Map();
    plan.forEach((slot) => {
      const list = byDay.get(slot.day) || [];
      if (!list.includes(slot.session)) list.push(slot.session);
      byDay.set(slot.day, list);
    });
    const alreadyThisDay = (item, day) => sessions.some(id => (
      monthCells.has(`${item.shortName}|${day}|${id}`) && hasToken(read(item, day, id), task.code, taskList)
    ));
    const warnMiss = (day, session) => {
      if (quiet) return;
      warnings.push(`Không xếp được ${task.code} ${days[day].dayName} ${days[day].dateStr} ${SESSION_LABEL[session] || session}: người phụ trách đang bị khóa hoặc đang nghỉ.`);
    };
    if (task.rotate) {
      const rotationDays = [...byDay.keys()].sort((a, b) => a - b);
      rotationDays.forEach((day, index) => {
        const useSessions = byDay.get(day);
        const openSessions = useSessions.filter(session => !people.some(person => hasToken(read(person, day, session), task.code, taskList)));
        let chosen = null;
        if (openSessions.length) {
          for (let step = 0; step < people.length && !chosen; step += 1) {
            const person = people[(index + step) % people.length];
            const free = openSessions.every(session => !alreadyThisDay(person, day) && canTake(person, day, session, task));
            if (free) chosen = person;
          }
          if (!chosen) {
            openSessions.forEach(session => warnMiss(day, session));
            return;
          }
        }
        const placedSessions = [];
        useSessions.forEach((session) => {
          const holder = people.find(person => hasToken(read(person, day, session), task.code, taskList));
          if (holder) {
            placedSessions.push(session);
            return;
          }
          if (chosen && placeTask(chosen, day, session, task)) placedSessions.push(session);
        });
        const owner = chosen || people.find(person => useSessions.some(session => hasToken(read(person, day, session), task.code, taskList)));
        if (owner && placedSessions.length) grant(owner, task, day, placedSessions);
      });
      return;
    }
    byDay.forEach((useSessions, day) => {
      const placedByPerson = new Map();
      useSessions.forEach((session) => {
        const holder = people.find(item => hasToken(read(item, day, session), task.code, taskList));
        const chosen = holder || people.find(item => !alreadyThisDay(item, day) && canTake(item, day, session, task));
        if (!chosen) {
          warnMiss(day, session);
          return;
        }
        if (!holder) placeTask(chosen, day, session, task);
        const list = placedByPerson.get(chosen.id) || [];
        list.push(session);
        placedByPerson.set(chosen.id, list);
      });
      placedByPerson.forEach((placedSessions, id) => {
        const person = people.find(item => item.id === id);
        if (person) grant(person, task, day, placedSessions);
      });
    });
  });
  (staffList || []).forEach((person) => {
    const groups = new Map();
    dutyPins(person).forEach((pin) => {
      const task = (taskList || []).find(item => item.id === pin.taskId);
      if (!dutyScheduleTask(task) || !days[pin.day]) return;
      const owners = ownersOf(task, staffList);
      if (owners.length && !owners.some(owner => owner.id === person.id)) return;
      const substitute = (staffList || []).find(item => item.id === pin.substituteId && item.id !== person.id) || null;
      const allowedSub = substitute && (!owners.length || owners.some(owner => owner.id === substitute.id)) ? substitute : null;
      const holder = [person, allowedSub].find(who => who && (
        hasToken(read(who, pin.day, pin.session), task.code, taskList)
        || lowerNames[`${task.id}|${pin.day}|${pin.session}`] === who.shortName
      ));
      if (!holder) return;
      const key = `${holder.id}|${task.id}|${pin.day}`;
      const group = groups.get(key) || { holder, task, day: pin.day, sessions: [] };
      if (!group.sessions.includes(pin.session)) group.sessions.push(pin.session);
      groups.set(key, group);
    });
    groups.forEach(group => grant(group.holder, group.task, group.day, group.sessions));
  });
  if (!wardsPlaced) placeWards((taskList || []).find(isWardTask));

  const noteLines = {};
  const addNote = (person, line) => {
    const list = noteLines[person.shortName] || [];
    if (!list.includes(line)) list.push(line);
    noteLines[person.shortName] = list;
  };
  const ttWithRt = new Set(['tt', 'tt chinh', 'tt phu']);
  staffList.forEach((person) => {
    for (let day = 0; day < 7; day += 1) {
      if (!sessions.some(session => tokens(read(person, day, session), taskList).some(item => isDutyToken(item, taskList, 'ra_truc', 'rt')))) continue;
      let matched = null;
      sessions.forEach((session) => {
        tokens(read(person, day, session), taskList).forEach((code) => {
          if (!ttWithRt.has(fold(code)) || matched) return;
          matched = findTaskByCode(code, taskList) || { id: `code:${code}`, code };
        });
      });
      if (!matched) continue;
      const key = `${person.id}|${matched.id}|${day}`;
      if (granted.has(key)) continue;
      granted.add(key);
      const bonus = bonusOf(matched);
      const amount = bonus.rt > 0 ? bonus.rt : 0.5;
      buGrants[person.shortName] = +((buGrants[person.shortName] || 0) + amount).toFixed(1);
      addNote(person, `${days[day].dayName} ${days[day].dateStr}: có RT và ${matched.code}, cộng ${String(amount).replace('.', ',')} bù.`);
    }
  });
  staffList.forEach((person) => {
    const row = grid[person.shortName];
    if (!row) return;
    const prev = String(existingNotes?.[person.shortName] || '');
    const kept = prev.split('\n').map(line => line.trim()).filter(line => line && !/: có RT và .+ cộng [\d,]+ bù\.$/.test(line));
    const extra = (noteLines[person.shortName] || []).filter(line => !kept.includes(line));
    row.note = [...kept, ...extra].join('\n');
  });

  const cathGrid = pourCathNames({
    roles: cathRoles,
    grid,
    staffList,
    taskList,
    days,
    sessions,
    cathGrid: incomingCath,
    assignments: lowerNames
  });

  return { days, grid, warnings, roomWarnings, buGrants, leaveCuts, cathGrid };
}

/** Fixed slots that no longer have the task on any doctor, including after a manual delete. */
function foldLabel(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function lowerRole(task, cathRoles) {
  const code = foldLabel(task?.code);
  const name = foldLabel(task?.name);
  return (cathRoles || []).find((role) => {
    const label = foldLabel(role?.label);
    return label && label !== 'task moi' && (label === code || label === name);
  }) || null;
}

export function missingFixedTaskMessages({ grid, staffList, days, sessions, taskList, cathGrid, cathRoles }) {
  const messages = [];
  const active = sessions || [];
  const lowerText = (task, day, session) => {
    const role = lowerRole(task, cathRoles);
    if (!role || role.source === 'month') return role?.source === 'month' ? role.label : '';
    return readCathCell(cathGrid, days?.[day]?.iso, role.key, session);
  };
  (taskList || []).forEach((task) => {
    if (!task?.code || task.scope === 'month' || isLeaveTask(task) || isWardTask(task) || !taskAlerts(task)) return;
    const fixedDays = Array.isArray(task.fixedDays) ? task.fixedDays.map(Number).filter(day => days?.[day]) : [];
    if (!fixedDays.length) return;
    const explicit = savedSlots(task);
    const plan = explicit
      ? explicit.filter(slot => days[slot.day] && active.includes(slot.session))
      : fixedDays.flatMap(day => taskSessions(task, active).map(session => ({ day, session })));
    plan.forEach(({ day, session }) => {
      const onWeek = showsOnWeek(task) && (staffList || []).some(person => (
        hasToken(grid?.[person.shortName]?.[day]?.[session], task.code, taskList)
      ));
      const below = !showsOnWeek(task) && String(lowerText(task, day, session) || '').trim();
      if (onWeek || below) return;
      const dayInfo = days[day];
      messages.push(`Không xếp được ${task.code} ${dayInfo.dayName} ${dayInfo.dateStr} ${SESSION_LABEL[session] || session}: người phụ trách đang bị khóa hoặc đang nghỉ.`);
    });
  });
  messages.push(...collectStaffPinWarnings({
    staffList,
    taskList,
    days,
    sessions: active,
    read: (person, day, session) => grid?.[person.shortName]?.[day]?.[session],
    held: (person, day, session, task) => (
      !showsOnWeek(task) && foldLabel(lowerText(task, day, session)) === foldLabel(person.shortName)
    )
  }));
  return messages;
}
