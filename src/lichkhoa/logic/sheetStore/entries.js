import { LEAVE_HEADERS, STUDY_HEADERS } from './constants.js';
import { objectsToRows, parseJsonCell, rowsToObjects } from './tableUtils.js';

const str = (v) => String(v ?? '').trim();

/**
 * Chuẩn hóa ngày thành định dạng YYYY-MM-DD
 * Tránh lỗi Google Sheets trả về Date object bị JSON.stringify thành ISO UTC (lùi 1 ngày)
 */
export function normalizeDateIso(val) {
  if (!val) return '';
  const s = String(val).trim();
  if (!s) return '';
  if (s.includes('T')) {
    const d = new Date(s);
    if (!isNaN(d.getTime())) {
      // Bù giờ Việt Nam UTC+7
      const vnTime = new Date(d.getTime() + 7 * 3600 * 1000);
      const y = vnTime.getUTCFullYear();
      const m = String(vnTime.getUTCMonth() + 1).padStart(2, '0');
      const day = String(vnTime.getUTCDate()).padStart(2, '0');
      return `${y}-${m}-${day}`;
    }
    return s.slice(0, 10);
  }
  const dmMatch = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (dmMatch) {
    const [, d, m, y] = dmMatch;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  const ymdMatch = s.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
  if (ymdMatch) {
    const [, y, m, d] = ymdMatch;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  return s.slice(0, 10);
}

function importEntryRow(row, withStudy) {
  const from = normalizeDateIso(str(row.from) || str(row.fromDate));
  const to = normalizeDateIso(str(row.to) || str(row.toDate)) || from;
  const sessions = parseJsonCell(row.sessions, null);
  const repeat = parseJsonCell(row.repeat, null);
  const rawExdates = parseJsonCell(row.exdates, null);
  const exdates = Array.isArray(rawExdates) ? rawExdates.map(normalizeDateIso).filter(Boolean) : null;
  const createdAt = Number(row.createdAt);
  const entry = {
    id: str(row.id),
    staffId: str(row.staffId),
    fromDate: from,
    toDate: to,
    from,
    to,
    iso: normalizeDateIso(str(row.iso)) || from,
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
  const from = normalizeDateIso(entry.from || entry.fromDate || entry.iso || '');
  const to = normalizeDateIso(entry.to || entry.toDate) || from;
  const rawExdates = Array.isArray(entry.exdates) ? entry.exdates : [];
  const exdates = rawExdates.map(normalizeDateIso).filter(Boolean);
  return {
    ...entry,
    fromDate: from,
    toDate: to,
    from,
    to,
    iso: normalizeDateIso(entry.iso) || from,
    exdates: exdates.length ? exdates : '',
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
