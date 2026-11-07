import { LEAVE_HEADERS, STUDY_HEADERS } from './constants.js';
import { objectsToRows, parseJsonCell, rowsToObjects } from './tableUtils.js';

const str = (v) => String(v ?? '').trim();

function importEntryRow(row, withStudy) {
  const from = str(row.from) || str(row.fromDate);
  const to = str(row.to) || str(row.toDate) || from;
  const sessions = parseJsonCell(row.sessions, null);
  const repeat = parseJsonCell(row.repeat, null);
  const exdates = parseJsonCell(row.exdates, null);
  const createdAt = Number(row.createdAt);
  const entry = {
    id: str(row.id),
    staffId: str(row.staffId),
    fromDate: from,
    toDate: to,
    from,
    to,
    iso: str(row.iso) || from,
    shortName: str(row.shortName),
    note: str(row.note),
    type: str(row.type),
    session: str(row.session),
    sessions: Array.isArray(sessions) ? sessions : (str(row.session) ? [str(row.session)] : []),
    plannedLong: row.plannedLong === true || str(row.plannedLong).toLowerCase() === 'true',
  };
  if (repeat && typeof repeat === 'object') entry.repeat = repeat;
  if (Array.isArray(exdates) && exdates.length) entry.exdates = exdates;
  if (Number.isFinite(createdAt) && createdAt > 0) entry.createdAt = createdAt;
  if (withStudy) {
    entry.taskId = str(row.taskId);
    entry.topic = str(row.topic);
  }
  return entry;
}

function toExportShape(entry) {
  const from = entry.from || entry.fromDate || entry.iso || '';
  const to = entry.to || entry.toDate || from;
  return {
    ...entry,
    fromDate: entry.fromDate || from,
    toDate: entry.toDate || to,
    from,
    to,
    iso: entry.iso || from,
    exdates: Array.isArray(entry.exdates) && entry.exdates.length ? entry.exdates : '',
    sessions: Array.isArray(entry.sessions) ? entry.sessions : '',
    plannedLong: entry.plannedLong ? 'true' : '',
  };
}

export function importLeaveRows(rows) {
  return rowsToObjects(rows, LEAVE_HEADERS)
    .map((row) => importEntryRow(row, false))
    .filter((e) => e.id);
}

export function exportLeaveRows(entries) {
  return objectsToRows((entries || []).filter(Boolean).map(toExportShape), LEAVE_HEADERS);
}

export function importStudyRows(rows) {
  return rowsToObjects(rows, STUDY_HEADERS)
    .map((row) => importEntryRow(row, true))
    .filter((e) => e.id);
}

export function exportStudyRows(entries) {
  return objectsToRows((entries || []).filter(Boolean).map(toExportShape), STUDY_HEADERS);
}
