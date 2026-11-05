import { LEAVE_HEADERS, STUDY_HEADERS } from './constants.js';
import { objectsToRows, rowsToObjects } from './tableUtils.js';

export function importLeaveRows(rows) {
  return rowsToObjects(rows, LEAVE_HEADERS).map((row) => ({
    id: String(row.id || '').trim(),
    staffId: String(row.staffId || '').trim(),
    fromDate: String(row.fromDate || '').trim(),
    toDate: String(row.toDate || '').trim(),
    note: String(row.note || '').trim(),
    type: String(row.type || '').trim(),
  })).filter((e) => e.id);
}

export function exportLeaveRows(entries) {
  return objectsToRows(entries || [], LEAVE_HEADERS);
}

export function importStudyRows(rows) {
  return rowsToObjects(rows, STUDY_HEADERS).map((row) => ({
    id: String(row.id || '').trim(),
    staffId: String(row.staffId || '').trim(),
    fromDate: String(row.fromDate || '').trim(),
    toDate: String(row.toDate || '').trim(),
    note: String(row.note || '').trim(),
  })).filter((e) => e.id);
}

export function exportStudyRows(entries) {
  return objectsToRows(entries || [], STUDY_HEADERS);
}
