import { MONTH_HEADERS } from './constants.js';
import { objectsToRows, parseJsonCell, rowsToObjects } from './tableUtils.js';

export function importMonthRows(rows) {
  const objs = rowsToObjects(rows, MONTH_HEADERS);
  const bySheet = new Map();

  objs.forEach((row) => {
    const sheetId = String(row.sheetId || '').trim();
    if (!sheetId) return;
    if (!bySheet.has(sheetId)) {
      bySheet.set(sheetId, {
        monthGrid: {},
        monthColumnOrder: null,
        monthColumnTitles: {},
        monthRoles: [],
        monthKey: '',
      });
    }
    const bucket = bySheet.get(sheetId);
    const field = String(row.field || '').trim();
    if (field === 'month_cell') {
      const key = String(row.key || '').trim();
      if (key) bucket.monthGrid[key] = row.value ?? '';
    } else if (field === 'meta') {
      const key = String(row.key || '').trim();
      if (key === 'monthKey') bucket.monthKey = String(row.value || '').trim();
      if (key === 'monthColumnOrder') bucket.monthColumnOrder = parseJsonCell(row.value, null);
      if (key === 'monthColumnTitles') bucket.monthColumnTitles = parseJsonCell(row.value, {});
      if (key === 'monthRoles') bucket.monthRoles = parseJsonCell(row.value, []);
    }
  });

  return bySheet;
}

export function applyMonthToSheet(workbookSheet, monthData) {
  if (!monthData) return workbookSheet;
  return {
    ...workbookSheet,
    monthKey: monthData.monthKey || workbookSheet.monthKey,
    monthGrid: { ...(workbookSheet.monthGrid || {}), ...(monthData.monthGrid || {}) },
    monthColumnOrder: monthData.monthColumnOrder ?? workbookSheet.monthColumnOrder,
    monthColumnTitles: { ...(workbookSheet.monthColumnTitles || {}), ...(monthData.monthColumnTitles || {}) },
    monthRoles: monthData.monthRoles?.length ? monthData.monthRoles : workbookSheet.monthRoles,
  };
}

export function exportMonthRows(deptSheets) {
  const rows = [];
  (deptSheets?.sheets || []).forEach((sh) => {
    if (sh.monthKey) {
      rows.push({
        recordType: 'meta',
        sheetId: sh.id,
        monthKey: sh.monthKey,
        field: 'meta',
        key: 'monthKey',
        value: sh.monthKey,
      });
    }
    if (sh.monthColumnOrder) {
      rows.push({
        recordType: 'meta',
        sheetId: sh.id,
        monthKey: sh.monthKey || '',
        field: 'meta',
        key: 'monthColumnOrder',
        value: JSON.stringify(sh.monthColumnOrder),
      });
    }
    if (sh.monthColumnTitles && Object.keys(sh.monthColumnTitles).length) {
      rows.push({
        recordType: 'meta',
        sheetId: sh.id,
        monthKey: sh.monthKey || '',
        field: 'meta',
        key: 'monthColumnTitles',
        value: JSON.stringify(sh.monthColumnTitles),
      });
    }
    if (sh.monthRoles?.length) {
      rows.push({
        recordType: 'meta',
        sheetId: sh.id,
        monthKey: sh.monthKey || '',
        field: 'meta',
        key: 'monthRoles',
        value: JSON.stringify(sh.monthRoles),
      });
    }
    Object.entries(sh.monthGrid || {}).forEach(([key, value]) => {
      if (value === undefined || value === null || String(value).trim() === '') return;
      rows.push({
        recordType: 'cell',
        sheetId: sh.id,
        monthKey: sh.monthKey || '',
        field: 'month_cell',
        key,
        value,
      });
    });
  });
  return objectsToRows(rows, MONTH_HEADERS);
}
