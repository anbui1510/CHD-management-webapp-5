import ExcelJS from 'exceljs';
import { taskLabelStyle } from '../logic/cellFormat';
import { orderCellText, leadingTask } from '../logic/cellOrder';
import {
  buildMonthTable,
  formatMonthLabel,
  resolveMonthRoles,
  sessionLabel,
  customCellKey
} from '../logic/monthSchedule';
import { matchTask, roleShortLabel, taskForRole } from '../logic/taskMatch';
import { buildSessionAlertRow } from '../logic/warningResolve';
import { weekScheduleName } from './exportFileName';

const FIXED_COLS = 3;

function downloadBuffer(buffer, filename) {
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function safeFileName(value) {
  return String(value || 'lich-khoa')
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 100);
}

function hexArgb(hex) {
  if (!hex || typeof hex !== 'string') return undefined;
  let h = hex.trim().replace('#', '');
  if (h.length === 3) h = h.split('').map(ch => ch + ch).join('');
  if (h.length !== 6) return undefined;
  return `FF${h.toUpperCase()}`;
}

function applyStyle(cell, style, defaults = {}) {
  const font = { name: 'Arial', size: style?.fontSize || defaults.fontSize || 11 };
  const fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFFFF' } };
  const vAlign = style?.vAlign || defaults.vAlign;
  const hAlign = style?.hAlign || defaults.hAlign;
  const alignment = {
    vertical: vAlign === 'top' ? 'top' : vAlign === 'bottom' ? 'bottom' : 'middle',
    horizontal: hAlign === 'left' ? 'left' : hAlign === 'right' ? 'right' : 'center',
    wrapText: style?.wrap === 'wrap' || style?.wrap === 'clip' || defaults.wrapText
  };

  if (defaults.color) font.color = { argb: hexArgb(defaults.color) };
  if (defaults.bg) fill.fgColor = { argb: hexArgb(defaults.bg) };
  if (style?.color) font.color = { argb: hexArgb(style.color) };
  if (style?.bg) fill.fgColor = { argb: hexArgb(style.bg) };
  if (style?.bold || defaults.bold) font.bold = true;
  if (style?.italic) font.italic = true;
  if (style?.underline) font.underline = true;

  cell.font = font;
  cell.fill = fill;
  cell.alignment = alignment;
}

function headerStyle(cell) {
  applyStyle(cell, null, { bold: true, bg: '#E8EAED', wrapText: true });
  cell.border = thinBorder();
}

function thinBorder() {
  const side = { style: 'thin', color: { argb: 'FFD0D7DE' } };
  return { top: side, left: side, bottom: side, right: side };
}

function setGridBorders(ws, fromRow, fromCol, toRow, toCol) {
  for (let r = fromRow; r <= toRow; r += 1) {
    for (let c = fromCol; c <= toCol; c += 1) {
      const cell = ws.getCell(r, c);
      cell.border = thinBorder();
    }
  }
}

function mergeSafe(ws, r1, c1, r2, c2) {
  if (r2 < r1 || c2 < c1) return;
  if (r1 === r2 && c1 === c2) return;
  ws.mergeCells(r1, c1, r2, c2);
}

function weekDescribe(staffList, days, sessions, noteCol, row, col) {
  const staff = staffList[row];
  if (!staff || col < 0) return null;
  if (col === 0) return { key: `w|${staff.shortName}|label` };
  if (col === 1) return { key: `w|${staff.shortName}|bu` };
  if (col === 2) return { key: `w|${staff.shortName}|phep` };
  if (col === noteCol) return { key: `w|${staff.shortName}|note` };
  const offset = col - FIXED_COLS;
  const day = days[Math.floor(offset / sessions.length)];
  if (!day) return null;
  const session = sessions[offset % sessions.length];
  return { key: `w|${staff.shortName}|${day.fullDateStr}|${session}` };
}

function appendRoomBlock(ws, startRow, roomTable, cellStyles) {
  let row = startRow + 1;
  const title = ws.getCell(row, 1);
  title.value = 'Phân công bệnh phòng';
  title.font = { name: 'Arial', size: 12, bold: true, color: { argb: 'FF9A3412' } };
  title.alignment = { vertical: 'middle', horizontal: 'left', wrapText: false };
  row += 1;
  const labels = roomTable?.labels || [];
  const matrix = roomTable?.matrix || [];
  const width = Math.max(0, ...matrix.map(line => line?.length || 0));
  labels.forEach((label, rIndex) => {
    const labelCell = ws.getCell(row + rIndex, 1);
    labelCell.value = label;
    applyStyle(labelCell, null, { bold: true, bg: '#E8EAED', hAlign: 'left' });
    labelCell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: false };
    labelCell.border = thinBorder();
    for (let cIndex = 0; cIndex < width; cIndex += 1) {
      const cell = ws.getCell(row + rIndex, cIndex + 2);
      cell.value = matrix[rIndex]?.[cIndex] ?? '';
      const key = `r|${rIndex}|${cIndex}`;
      applyStyle(cell, cellStyles?.[key] || null, { hAlign: 'center' });
      cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: false };
      cell.border = thinBorder();
    }
    ws.getRow(row + rIndex).height = 22;
  });
  return row + labels.length;
}

export async function exportWeekScheduleToExcel({
  deptName,
  sheetLabel,
  staffList,
  days,
  sessions,
  grid,
  taskList,
  roomNames,
  alertRows,
  cathRows = [],
  weekMerges,
  cellStyles,
  roomTable,
  freezeCols = 0
}) {
  const noteCol = FIXED_COLS + 7 * sessions.length;
  const weekWidth = noteCol + 1;
  const rowData = staffList.map((s) => {
    const sData = grid[s.shortName] || {};
    const row = [s.shortName, s.buBalance, s.phepBalance];
    for (let d = 0; d < 7; d += 1) {
      sessions.forEach((id) => row.push(orderCellText(sData[d]?.[id] || '', taskList, roomNames)));
    }
    row.push(sData.note || '');
    return row;
  });
  const alertData = (alertRows || []).length
    ? [buildSessionAlertRow(alertRows, { days, sessions, weekWidth, noteCol })]
    : [];
  const allRows = [...rowData, ...(cathRows || []), ...alertData];
  const cathStart = staffList.length;
  const alertStart = cathStart + (cathRows || []).length;

  const wb = new ExcelJS.Workbook();
  wb.creator = 'LichKhoa Webapp';
  const scheduleName = weekScheduleName(deptName, days);
  const ws = wb.addWorksheet(scheduleName.slice(0, 31), {
    views: [{ state: 'frozen', ySplit: 2, xSplit: 2 }]
  });

  const dataColOffset = 2;
  const headerRow1 = 1;
  const headerRow2 = 2;
  const dataStartRow = 3;

  ws.getColumn(1).width = 18;
  headerStyle(ws.getCell(headerRow1, 1));
  mergeSafe(ws, headerRow1, 1, headerRow2, 1);

  const fixedTitles = ['BÁC SĨ', 'BÙ', 'PHÉP'];
  fixedTitles.forEach((title, index) => {
    const col = dataColOffset + index;
    ws.getColumn(col).width = index === 0 ? 12 : 8;
    const cell = ws.getCell(headerRow1, col);
    cell.value = title;
    headerStyle(cell);
    mergeSafe(ws, headerRow1, col, headerRow2, col);
  });

  let colCursor = dataColOffset + FIXED_COLS;
  days.forEach((day) => {
    const startCol = colCursor;
    sessions.forEach((sessionId) => {
      ws.getColumn(colCursor).width = sessionId === 'S' || sessionId === 'C' ? 14 : 10;
      const sub = ws.getCell(headerRow2, colCursor);
      sub.value = sessionLabel(sessionId);
      headerStyle(sub);
      colCursor += 1;
    });
    const top = ws.getCell(headerRow1, startCol);
    top.value = `${day.dayName} (${day.dateStr})`;
    headerStyle(top);
    if (sessions.length > 1) mergeSafe(ws, headerRow1, startCol, headerRow1, colCursor - 1);
  });

  const noteExcelCol = dataColOffset + noteCol;
  ws.getColumn(noteExcelCol).width = 24;
  const noteHead = ws.getCell(headerRow1, noteExcelCol);
  noteHead.value = 'Ghi chú';
  headerStyle(noteHead);
  mergeSafe(ws, headerRow1, noteExcelCol, headerRow2, noteExcelCol);

  allRows.forEach((rowValues, rowIndex) => {
    const excelRow = dataStartRow + rowIndex;
    const isAlert = rowIndex >= alertStart;
    const isCath = rowIndex >= cathStart && rowIndex < alertStart;
    ws.getCell(excelRow, 1).value = isAlert || isCath ? '' : rowIndex + 1;
    ws.getCell(excelRow, 1).alignment = { horizontal: 'center', vertical: 'middle' };

    rowValues.forEach((value, colIndex) => {
      const excelCol = dataColOffset + colIndex;
      const cell = ws.getCell(excelRow, excelCol);
      cell.value = value ?? '';
      if (isCath) {
        const task = matchTask(rowValues[0], taskList);
        const dayCell = colIndex >= FIXED_COLS && colIndex < noteCol;
        const text = String(value || '').trim();
        const painted = task && (colIndex === 0 || (dayCell && text));
        applyStyle(cell, null, {
          bold: painted || colIndex === 0,
          bg: painted ? task.bgColor : (colIndex === 0 ? '#F4F7FB' : undefined),
          color: painted ? task.textColor : undefined,
          wrapText: dayCell
        });
        return;
      }
      if (isAlert) {
        const text = String(value || '').trim();
        if (text) {
          applyStyle(cell, null, { bold: true, bg: '#FFF4E5', color: '#9A3412', wrapText: true, hAlign: 'left', vAlign: 'top' });
          const lines = Math.max(text.split('\n').length, Math.ceil(text.length / 18));
          const row = ws.getRow(excelRow);
          row.height = Math.max(row.height || 18, lines * 16);
        }
        return;
      }
      const desc = weekDescribe(staffList, days, sessions, noteCol, rowIndex, colIndex);
      const style = desc ? cellStyles?.[desc.key] : null;
      const defaults = {};
      if (colIndex >= FIXED_COLS && colIndex < noteCol) {
        const task = leadingTask(String(value || ''), taskList, roomNames);
        if (task) {
          defaults.bg = task.bgColor;
          defaults.color = task.textColor;
          defaults.bold = true;
        }
      }
      applyStyle(cell, style, { ...defaults, wrapText: colIndex === noteCol || colIndex >= FIXED_COLS });
    });
  });

  const hotToExcel = (hotRow, hotCol) => ({
    row: dataStartRow + hotRow,
    col: dataColOffset + hotCol
  });

  (weekMerges || []).forEach((merge) => {
    const start = hotToExcel(merge.row, merge.col);
    mergeSafe(
      ws,
      start.row,
      start.col,
      start.row + (merge.rowspan || 1) - 1,
      start.col + (merge.colspan || 1) - 1
    );
  });

  setGridBorders(ws, headerRow1, 1, dataStartRow + allRows.length - 1, dataColOffset + weekWidth - 1);

  let nextRow = dataStartRow + allRows.length + 1;
  if (roomTable?.labels?.length) {
    nextRow = appendRoomBlock(ws, nextRow - 1, roomTable, cellStyles);
  }

  const file = safeFileName(`${scheduleName}.xlsx`);
  const buffer = await wb.xlsx.writeBuffer();
  downloadBuffer(buffer, file);
}

function monthDescribe(meta, columns, taskList, styles, row, col, value) {
  const info = meta[row];
  const column = columns[col];
  if (!info || !column) return { style: null, defaults: {} };
  if (column.kind === 'task' && info.type === 'role') {
    const task = taskForRole(info.role, taskList || []);
    const defaults = {};
    if (task) {
      defaults.bg = task.bgColor;
      defaults.color = task.textColor;
      defaults.bold = true;
    }
    return {
      key: `m|label|${info.role.key}`,
      style: taskLabelStyle(styles, info.role.key),
      defaults
    };
  }
  if (column.kind === 'custom') {
    const slot = info.type === 'role' ? info.role.key : 'head';
    const key = `m|${customCellKey(column.id, info.weekStart, slot)}`;
    return { key, style: styles?.[key] || null, defaults: {} };
  }
  if (column.kind !== 'day' || info.type !== 'role') return { style: null, defaults: {} };
  const day = info.days[column.dayIndex];
  if (!day) return { style: null, defaults: {} };
  const key = `m|${day.iso}|${info.role.key}|${column.session}`;
  const style = styles?.[key] || null;
  const defaults = {};
  if (String(value || '').trim()) {
    const task = taskForRole(info.role, taskList || []);
    const labelStyle = taskLabelStyle(styles, info.role.key);
    const bg = labelStyle?.bg || task?.bgColor;
    const color = labelStyle?.color || task?.textColor;
    if (bg && !style?.bg) defaults.bg = bg;
    if (color && !style?.color) defaults.color = color;
    if (defaults.bg || defaults.color) defaults.bold = true;
  }
  return { key, style, defaults };
}

export async function exportMonthScheduleToExcel({
  deptName,
  monthKey,
  monthGrid,
  monthRoles,
  columnOrder,
  columnTitles,
  daySessions,
  monthMerges,
  cellStyles,
  taskList
}) {
  const roles = resolveMonthRoles(monthRoles);
  const model = buildMonthTable(monthKey, monthGrid || {}, roles, columnOrder, columnTitles, daySessions);
  const columns = model.columns;
  const taskCol = columns.findIndex(column => column.kind === 'task');
  const rowData = model.rows.map((row, index) => {
    const info = model.meta[index];
    if (info?.type !== 'role' || taskCol < 0) return row;
    const short = roleShortLabel(info.role, taskList || []);
    if (short === row[taskCol]) return row;
    const next = row.slice();
    next[taskCol] = short;
    return next;
  });

  const wb = new ExcelJS.Workbook();
  wb.creator = 'LichKhoa Webapp';
  const ws = wb.addWorksheet('Lịch tháng', {
    views: [{ state: 'frozen', ySplit: 2, xSplit: 3 }]
  });

  const dataColOffset = 2;
  const headerRow1 = 1;
  const headerRow2 = 2;
  const dataStartRow = 3;

  ws.getColumn(1).width = 5;
  headerStyle(ws.getCell(headerRow1, 1));
  mergeSafe(ws, headerRow1, 1, headerRow2, 1);

  let colCursor = dataColOffset;
  for (let index = 0; index < columns.length; index += 1) {
    const column = columns[index];
    if (column.kind === 'day') {
      let span = 1;
      while (
        columns[index + span]?.kind === 'day'
        && columns[index + span].dayIndex === column.dayIndex
      ) span += 1;
      const startCol = colCursor;
      for (let offset = 0; offset < span; offset += 1) {
        ws.getColumn(colCursor).width = 11;
        const sub = ws.getCell(headerRow2, colCursor);
        sub.value = sessionLabel(columns[index + offset].session);
        headerStyle(sub);
        colCursor += 1;
      }
      const top = ws.getCell(headerRow1, startCol);
      top.value = column.title || '';
      headerStyle(top);
      if (span > 1) mergeSafe(ws, headerRow1, startCol, headerRow1, colCursor - 1);
      index += span - 1;
    } else if (column.kind === 'custom') {
      ws.getColumn(colCursor).width = 14;
      const top = ws.getCell(headerRow1, colCursor);
      top.value = column.title || 'Cột mới';
      headerStyle(top);
      mergeSafe(ws, headerRow1, colCursor, headerRow2, colCursor);
      colCursor += 1;
    } else if (column.kind === 'task') {
      ws.getColumn(colCursor).width = 18;
      const top = ws.getCell(headerRow1, colCursor);
      top.value = 'Nhiệm vụ';
      headerStyle(top);
      mergeSafe(ws, headerRow1, colCursor, headerRow2, colCursor);
      colCursor += 1;
    } else {
      ws.getColumn(colCursor).width = 4;
      headerStyle(ws.getCell(headerRow1, colCursor));
      mergeSafe(ws, headerRow1, colCursor, headerRow2, colCursor);
      colCursor += 1;
    }
  }

  rowData.forEach((rowValues, rowIndex) => {
    const excelRow = dataStartRow + rowIndex;
    ws.getCell(excelRow, 1).value = rowIndex + 1;
    ws.getCell(excelRow, 1).alignment = { horizontal: 'center', vertical: 'middle' };
    rowValues.forEach((value, colIndex) => {
      const excelCol = dataColOffset + colIndex;
      const cell = ws.getCell(excelRow, excelCol);
      cell.value = value ?? '';
      const { style, defaults } = monthDescribe(model.meta, columns, taskList, cellStyles, rowIndex, colIndex, value);
      applyStyle(cell, style, { ...defaults, wrapText: true });
    });
  });

  const hotToExcel = (hotRow, hotCol) => ({
    row: dataStartRow + hotRow,
    col: dataColOffset + hotCol
  });

  [...(model.mergeCells || []), ...(monthMerges || [])].forEach((merge) => {
    const start = hotToExcel(merge.row, merge.col);
    mergeSafe(
      ws,
      start.row,
      start.col,
      start.row + (merge.rowspan || 1) - 1,
      start.col + (merge.colspan || 1) - 1
    );
  });

  setGridBorders(ws, headerRow1, 1, dataStartRow + rowData.length - 1, dataColOffset + columns.length - 1);

  const label = formatMonthLabel(monthKey).replace(/\//g, '-');
  const file = safeFileName(`${deptName || 'Khoa'} - Lich thang ${label}.xlsx`);
  const buffer = await wb.xlsx.writeBuffer();
  downloadBuffer(buffer, file);
}
