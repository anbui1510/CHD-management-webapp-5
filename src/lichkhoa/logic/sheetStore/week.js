import { WEEK_HEADERS } from './constants.js';
import { objectsToRows, rowsToObjects } from './tableUtils.js';

/** TC-F304-04 — week grid cells */
export function importWeekRows(rows) {
  const objs = rowsToObjects(rows, WEEK_HEADERS);
  const sheetMeta = new Map();
  const weekCells = [];

  objs.forEach((row) => {
    const type = String(row.recordType || '').trim();
    if (type === 'sheet_meta') {
      const sheetId = String(row.sheetId || '').trim();
      if (!sheetId) return;
      if (!sheetMeta.has(sheetId)) {
        sheetMeta.set(sheetId, {
          id: sheetId,
          name: String(row.sheetName || 'Sheet 1').trim(),
          startDate: String(row.startDate || '').trim(),
          grid: {},
          weeks: {},
        });
      }
      const sh = sheetMeta.get(sheetId);
      if (row.sheetName) sh.name = String(row.sheetName).trim();
      if (row.startDate) sh.startDate = String(row.startDate).trim();
    } else if (type === 'week_cell') {
      weekCells.push(row);
    }
  });

  weekCells.forEach((row) => {
    const sheetId = String(row.sheetId || '').trim();
    const staffId = String(row.staffId || '').trim();
    const dayIndex = Number(row.dayIndex);
    const slot = String(row.slot || '').trim();
    const value = row.value ?? '';
    const weekStart = String(row.weekStart || row.startDate || '').trim();
    if (!sheetId || !staffId || !Number.isFinite(dayIndex) || !slot) return;
    if (!sheetMeta.has(sheetId)) {
      sheetMeta.set(sheetId, {
        id: sheetId,
        name: 'Sheet 1',
        startDate: weekStart,
        grid: {},
        weeks: {},
      });
    }
    const sh = sheetMeta.get(sheetId);
    const gridKey = weekStart && sh.weeks?.[weekStart] ? weekStart : 'active';
    if (gridKey === 'active') {
      if (!sh.grid[staffId]) sh.grid[staffId] = [];
      while (sh.grid[staffId].length <= dayIndex) sh.grid[staffId].push({ S: '', R: '', C: '', T: '' });
      if (!sh.grid[staffId][dayIndex] || typeof sh.grid[staffId][dayIndex] !== 'object') {
        sh.grid[staffId][dayIndex] = { S: '', R: '', C: '', T: '' };
      }
      sh.grid[staffId][dayIndex][slot] = value;
    } else {
      if (!sh.weeks[weekStart]) sh.weeks[weekStart] = { grid: {} };
      if (!sh.weeks[weekStart].grid[staffId]) sh.weeks[weekStart].grid[staffId] = [];
      while (sh.weeks[weekStart].grid[staffId].length <= dayIndex) {
        sh.weeks[weekStart].grid[staffId].push({ S: '', R: '', C: '', T: '' });
      }
      sh.weeks[weekStart].grid[staffId][dayIndex][slot] = value;
    }
  });

  return { sheets: [...sheetMeta.values()], activeSheetId: [...sheetMeta.keys()][0] || '' };
}

export function exportWeekRows(deptSheets) {
  const st = deptSheets || { sheets: [], activeSheetId: '' };
  const rows = [];
  (st.sheets || []).forEach((sh) => {
    rows.push({
      recordType: 'sheet_meta',
      sheetId: sh.id,
      sheetName: sh.name,
      startDate: sh.startDate,
      weekStart: '',
      staffId: '',
      dayIndex: '',
      slot: '',
      value: '',
    });
    const pushGrid = (grid, weekStart) => {
      Object.entries(grid || {}).forEach(([staffId, days]) => {
        (days || []).forEach((day, dayIndex) => {
          if (!day || typeof day !== 'object') return;
          ['S', 'R', 'C', 'T'].forEach((slot) => {
            const value = day[slot];
            if (value === undefined || value === null || String(value).trim() === '' || value === '0') return;
            rows.push({
              recordType: 'week_cell',
              sheetId: sh.id,
              sheetName: '',
              startDate: sh.startDate,
              weekStart: weekStart || sh.startDate,
              staffId,
              dayIndex,
              slot,
              value,
            });
          });
        });
      });
    };
    pushGrid(sh.grid, sh.startDate);
    Object.entries(sh.weeks || {}).forEach(([weekStart, saved]) => {
      pushGrid(saved?.grid, weekStart);
    });
  });
  return objectsToRows(rows, WEEK_HEADERS);
}
