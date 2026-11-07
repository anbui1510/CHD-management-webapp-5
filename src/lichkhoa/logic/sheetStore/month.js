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
  const mergedGrid = { ...(monthData.monthGrid || {}) };
  if (workbookSheet.monthGrid && typeof workbookSheet.monthGrid === 'object') {
    Object.entries(workbookSheet.monthGrid).forEach(([key, val]) => {
      if (val !== undefined && val !== null && String(val).trim() !== '') {
        // Local thắng khi có giá trị (tránh pull đè mất ô vừa gõ)
        mergedGrid[key] = val;
      }
    });
  }
  return {
    ...workbookSheet,
    monthKey: monthData.monthKey || workbookSheet.monthKey,
    monthGrid: mergedGrid,
    monthColumnOrder: monthData.monthColumnOrder ?? workbookSheet.monthColumnOrder,
    monthColumnTitles: { ...(workbookSheet.monthColumnTitles || {}), ...(monthData.monthColumnTitles || {}) },
    monthRoles: monthData.monthRoles?.length ? monthData.monthRoles : workbookSheet.monthRoles,
  };
}

export function exportMonthRows(deptSheets) {
  const rows = [];
  const sheets = deptSheets?.sheets || [];
  const activeSheetId = deptSheets?.activeSheetId || sheets[0]?.id || 'sheet_dept_tim_mach_1';
  const primarySheet = sheets.find((s) => s.id === activeSheetId) || sheets[0] || {};

  const monthKey = primarySheet.monthKey || '2026-11';
  rows.push({
    recordType: 'meta',
    sheetId: activeSheetId,
    monthKey,
    field: 'meta',
    key: 'monthKey',
    value: monthKey,
  });

  const columnOrder = primarySheet.monthColumnOrder || sheets.find((s) => s.monthColumnOrder)?.monthColumnOrder;
  if (columnOrder) {
    rows.push({
      recordType: 'meta',
      sheetId: activeSheetId,
      monthKey,
      field: 'meta',
      key: 'monthColumnOrder',
      value: JSON.stringify(columnOrder),
    });
  }

  const columnTitles = primarySheet.monthColumnTitles || sheets.find((s) => s.monthColumnTitles && Object.keys(s.monthColumnTitles).length)?.monthColumnTitles;
  if (columnTitles && Object.keys(columnTitles).length) {
    rows.push({
      recordType: 'meta',
      sheetId: activeSheetId,
      monthKey,
      field: 'meta',
      key: 'monthColumnTitles',
      value: JSON.stringify(columnTitles),
    });
  }

  const roles = (primarySheet.monthRoles && primarySheet.monthRoles.length)
    ? primarySheet.monthRoles
    : sheets.find((s) => Array.isArray(s.monthRoles) && s.monthRoles.length)?.monthRoles;
  if (roles && roles.length) {
    rows.push({
      recordType: 'meta',
      sheetId: activeSheetId,
      monthKey,
      field: 'meta',
      key: 'monthRoles',
      value: JSON.stringify(roles),
    });
  }

  // Thu thập mọi ô lịch tháng trên tất cả các sheet trong khoa
  const uniqueCells = {};
  sheets.forEach((sh) => {
    Object.entries(sh.monthGrid || {}).forEach(([key, value]) => {
      if (value !== undefined && value !== null && String(value).trim() !== '') {
        uniqueCells[key] = value;
      }
    });
  });

  Object.entries(uniqueCells).forEach(([key, value]) => {
    rows.push({
      recordType: 'cell',
      sheetId: activeSheetId,
      monthKey,
      field: 'month_cell',
      key,
      value,
    });
  });

  return objectsToRows(rows, MONTH_HEADERS);
}
