import { TASK_HEADERS } from './constants.js';
import { boolCell, numCell, objectsToRows, parseJsonCell, rowsToObjects } from './tableUtils.js';

/** TC-F304-03 */
export function importTaskRows(rows) {
  const objs = rowsToObjects(rows, TASK_HEADERS);
  return objs.map((row) => ({
    id: String(row.id || '').trim(),
    code: String(row.code || '').trim(),
    name: String(row.name || '').trim(),
    category: String(row.category || '').trim(),
    session: String(row.session || '').trim(),
    scope: String(row.scope || 'week').trim(),
    description: String(row.description || '').trim(),
    bgColor: String(row.bgColor || '').trim(),
    textColor: String(row.textColor || '').trim(),
    blocker: boolCell(row.blocker),
    delta: numCell(row.delta, 0),
    dutyRole: String(row.dutyRole || '').trim(),
    encodeDuty: boolCell(row.encodeDuty),
    buRt: boolCell(row.buRt),
    buVg: boolCell(row.buVg),
    deltaRt: numCell(row.deltaRt, 0),
    deltaVg: numCell(row.deltaVg, 0),
    triggerRT: boolCell(row.triggerRT),
    owners: parseJsonCell(row.ownersJson, []),
    ownerOrder: parseJsonCell(row.ownerOrderJson, []),
    fixedDays: parseJsonCell(row.fixedDaysJson, []),
    fixedSlots: parseJsonCell(row.fixedSlotsJson, []),
    locks: parseJsonCell(row.locksJson, []),
  })).filter((t) => t.id);
}

export function exportTaskRows(tasks) {
  const objects = (tasks || []).map((t) => ({
    id: t.id,
    code: t.code,
    name: t.name,
    category: t.category,
    session: t.session,
    scope: t.scope || 'week',
    description: t.description || '',
    bgColor: t.bgColor || '',
    textColor: t.textColor || '',
    blocker: t.blocker ? 'true' : 'false',
    delta: t.delta ?? 0,
    dutyRole: t.dutyRole || '',
    encodeDuty: t.encodeDuty ? 'true' : 'false',
    buRt: t.buRt ? 'true' : 'false',
    buVg: t.buVg ? 'true' : 'false',
    deltaRt: t.deltaRt ?? 0,
    deltaVg: t.deltaVg ?? 0,
    triggerRT: t.triggerRT ? 'true' : 'false',
    ownersJson: JSON.stringify(t.owners || []),
    ownerOrderJson: JSON.stringify(t.ownerOrder || []),
    fixedDaysJson: JSON.stringify(t.fixedDays || []),
    fixedSlotsJson: JSON.stringify(t.fixedSlots || []),
    locksJson: JSON.stringify(t.locks || []),
  }));
  return objectsToRows(objects, TASK_HEADERS);
}
