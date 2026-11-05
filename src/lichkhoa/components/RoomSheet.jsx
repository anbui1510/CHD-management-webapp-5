import React, { useEffect, useRef, useState } from 'react';
import { activeEntry, paintCell, selectedEntries } from '../logic/cellFormat';
import { attachPaletteDrop } from '../logic/paletteDrop';
import { patchHotCells } from '../logic/sheetViewport';

const DEFAULT_LABELS = ['BS Phụ trách', 'Tên bệnh phòng'];
const DEFAULT_COL_WIDTH = 120;
const DEFAULT_ROW_HEIGHT = 32;

function roomGridPixelHeight(rowHeights) {
  const rows = (rowHeights || []).reduce((sum, height) => sum + (Number(height) || DEFAULT_ROW_HEIGHT), 0);
  // Handsontable keeps the horizontal scrollbar inside this height.
  return rows + 18;
}

function fold(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

/** Staff identity keeps Vietnamese diacritics, so ÂN and AN stay different people. */
function staffNameKey(value) {
  return String(value || '').normalize('NFC').trim().toLocaleLowerCase('vi');
}

function sameStaffName(a, b) {
  return staffNameKey(a) === staffNameKey(b);
}

function doctorRowIndex(labels) {
  const index = (labels || []).findIndex(item => fold(item) === fold('BS Phụ trách'));
  return index >= 0 ? index : 0;
}

function staffShortNames(staffList) {
  return (staffList || []).map(person => String(person.shortName || '').trim()).filter(Boolean);
}

function doctorRowNeedsStaffSync(matrix, labels, staffList) {
  const names = staffShortNames(staffList);
  if (!names.length) return false;
  const row = matrix[doctorRowIndex(labels)] || [];
  const width = Math.max(row.length, names.length);
  for (let col = 0; col < names.length; col += 1) {
    if (!sameStaffName(row[col], names[col])) return true;
  }
  for (let col = names.length; col < width; col += 1) {
    if (String(row[col] || '').trim()) return true;
  }
  return names.length > row.length;
}

function legacyColumns(sheet) {
  if (Array.isArray(sheet?.roomColumns) && sheet.roomColumns.length) return sheet.roomColumns;
  const entries = Object.entries(sheet?.roomAssignments || {});
  if (entries.length) {
    return entries.map(([room, doctors]) => ({
      doctor: Array.isArray(doctors) ? doctors.join(', ') : String(doctors || ''),
      room: String(room).toUpperCase()
    }));
  }
  return [
    { doctor: '', room: '' },
    { doctor: '', room: '' },
    { doctor: '', room: '' }
  ];
}

function alignRoomColumnsToStaff(matrix, labels, colWidths, staffList) {
  const names = staffShortNames(staffList);
  if (!names.length || !doctorRowNeedsStaffSync(matrix, labels, staffList)) return null;
  const doctorRow = doctorRowIndex(labels);
  const doctors = (matrix[doctorRow] || []).map(cell => String(cell ?? ''));
  const used = new Set();
  const matched = names.map((name) => {
    const index = doctors.findIndex((cell, col) => !used.has(col) && sameStaffName(cell, name));
    if (index >= 0) used.add(index);
    return index;
  });
  const leftover = doctors.map((_, col) => col).filter(col => !used.has(col));
  const sources = [...matched, ...leftover];
  return {
    matrix: matrix.map((row, rowIndex) => sources.map((src, col) => {
      if (rowIndex === doctorRow) return col < names.length ? names[col] : '';
      if (src < 0) return '';
      return String(row[src] ?? '');
    })),
    colWidths: sources.map(src => (src >= 0 ? Number(colWidths?.[src]) : 0) || DEFAULT_COL_WIDTH)
  };
}

function applyStaffToDoctorRow(table, staffList) {
  const aligned = alignRoomColumnsToStaff(table.matrix, table.labels, table.colWidths, staffList);
  if (!aligned) return table;
  return { ...table, matrix: aligned.matrix, colWidths: aligned.colWidths };
}

export function roomTableWithoutDoctors(table, names) {
  const hidden = new Set((names || []).map(staffNameKey).filter(Boolean));
  if (!table?.matrix?.length || !hidden.size) return table;
  const doctorRow = doctorRowIndex(table.labels);
  const keep = (table.matrix[doctorRow] || []).map(name => !hidden.has(staffNameKey(name)));
  if (keep.every(Boolean)) return table;
  return {
    ...table,
    matrix: table.matrix.map(row => (row || []).filter((_, col) => keep[col])),
    colWidths: (table.colWidths || []).filter((_, col) => keep[col])
  };
}

export function roomTableOf(sheet, staffList = null) {
  const saved = sheet?.roomTable;
  let table;
  if (saved?.labels?.length && Array.isArray(saved.matrix)) {
    const width = Math.max(1, ...saved.matrix.map(row => row.length), saved.colWidths?.length || 0);
    const matrix = saved.labels.map((_, rowIndex) => {
      const row = saved.matrix[rowIndex] || [];
      return Array.from({ length: width }, (_, colIndex) => String(row[colIndex] ?? ''));
    });
    table = {
      labels: saved.labels.map(label => String(label ?? '')),
      matrix,
      colWidths: Array.from({ length: width }, (_, index) => Number(saved.colWidths?.[index]) || DEFAULT_COL_WIDTH),
      rowHeights: saved.labels.map((_, index) => Number(saved.rowHeights?.[index]) || DEFAULT_ROW_HEIGHT)
    };
  } else {
    const columns = legacyColumns(sheet);
    table = {
      labels: DEFAULT_LABELS.slice(),
      matrix: [
        columns.map(column => column.doctor || ''),
        columns.map(column => column.room || '')
      ],
      colWidths: columns.map(() => DEFAULT_COL_WIDTH),
      rowHeights: DEFAULT_LABELS.map(() => DEFAULT_ROW_HEIGHT)
    };
  }
  return staffList ? applyStaffToDoctorRow(table, staffList) : table;
}

function words(value) {
  return fold(value).split(/[^a-z0-9]+/).filter(word => word.length > 2);
}

function taskMatchesQuery(task, query) {
  const code = fold(task.code);
  const name = fold(task.name);
  const needle = fold(query);
  if (!needle) return false;
  if (code === needle || name === needle || name.includes(needle) || (name.length > 3 && needle.includes(name))) return true;
  if (needle.includes('hoc vien') && (code === 'hv' || name.includes('hoc vien') || name.includes('sinh vien') || /(^| )hv( |$)/.test(`${code} ${name}`))) return true;
  const queryWords = words(query);
  const nameWords = words(task.name);
  if (queryWords.length < 2) return false;
  const matched = queryWords.filter(word => nameWords.some(part => part.includes(word) || word.includes(part))).length;
  return matched >= 2 && matched / queryWords.length >= 0.5;
}
function countSessions(grid, staffList, taskList, doctorName, query) {
  const doctor = fold(doctorName);
  const needle = fold(query);
  if (!doctor || !needle) return '';
  const staff = (staffList || []).find(person => fold(person.shortName) === doctor || fold(person.name) === doctor);
  const row = staff ? grid?.[staff.shortName] : null;
  if (!row) return 0;
  const related = (taskList || []).filter(task => taskMatchesQuery(task, query));
  const codes = new Set(related.map(task => fold(task.code)).filter(Boolean));
  if (!codes.size && needle.length <= 12 && !needle.includes(' ')) codes.add(needle);
  let total = 0;
  for (let day = 0; day < 7; day += 1) {
    const cell = row[day] || {};
    ['S', 'C'].forEach(session => {
      const text = fold(cell[session]);
      if (!text) return;
      const parts = text.split(/[,;/]+/).map(part => part.trim()).filter(Boolean);
      const hit = parts.some(part => codes.has(part) || fold(part) === needle || related.some(task => fold(task.name) === part));
      if (hit) total += 1;
    });
  }
  return total;
}

function hiddenDoctorColumns(matrix, labels, names) {
  const hidden = new Set((names || []).map(staffNameKey).filter(Boolean));
  if (!hidden.size) return [];
  const doctorRow = doctorRowIndex(labels);
  return (matrix?.[doctorRow] || [])
    .map((name, col) => (hidden.has(staffNameKey(name)) ? col : -1))
    .filter(col => col >= 0);
}

export function RoomSheet({ table, grid, staffList, taskList, cellStyles, bridge, formatCtl, uiRef, onChange, readOnly = false, active = true, hiddenDoctors = [] }) {
  const containerRef = useRef(null);
  const hotRef = useRef(null);
  const stylesRef = useRef(cellStyles || {});
  const onChangeRef = useRef(onChange);
  const labelsRef = useRef(table.labels);
  const sizeRef = useRef({ colWidths: table.colWidths, rowHeights: table.rowHeights });
  const countRef = useRef({ grid, staffList, taskList });
  const hiddenDoctorsRef = useRef(hiddenDoctors);
  hiddenDoctorsRef.current = hiddenDoctors;
  const [labelEdit, setLabelEdit] = useState(null);
  const readOnlyRef = useRef(!!readOnly);
  readOnlyRef.current = !!readOnly;
  stylesRef.current = cellStyles || {};
  onChangeRef.current = onChange;
  labelsRef.current = table.labels;
  sizeRef.current = { colWidths: table.colWidths, rowHeights: table.rowHeights };
  countRef.current = { grid, staffList, taskList };

  const structureKey = JSON.stringify({
    labels: table.labels,
    rows: table.matrix?.length || 0,
    cols: table.matrix?.[0]?.length || 0
  });
  const valueKey = JSON.stringify(table.matrix || []);

  const describe = (row, col) => {
    if (row < 0 || col < 0) return null;
    const key = `room|${row}|${col}`;
    return { key, style: stylesRef.current[key] || null };
  };

  useEffect(() => {
    if (!containerRef.current || !window.Handsontable) return undefined;
    if (hotRef.current) {
      hotRef.current.destroy();
      hotRef.current = null;
    }

    const claim = (hot) => {
      bridge.current.hot = hot;
      bridge.current.describe = describe;
      bridge.current.getSelectedEntries = () => selectedEntries(hot, describe);
      bridge.current.getActiveEntry = () => activeEntry(hot, describe);
    };

    const publish = (hot, labels = labelsRef.current) => {
      const colCount = hot.countCols();
      const matrix = Array.from({ length: hot.countRows() }, (_, row) => (
        Array.from({ length: colCount }, (_, col) => String(hot.getDataAtCell(row, col) ?? ''))
      ));
      const colWidths = Array.from({ length: colCount }, (_, col) => hot.getColWidth(col) || DEFAULT_COL_WIDTH);
      const rowHeights = Array.from({ length: hot.countRows() }, (_, row) => hot.getRowHeight(row) || DEFAULT_ROW_HEIGHT);
      labelsRef.current = labels.slice(0, hot.countRows());
      sizeRef.current = { colWidths, rowHeights };
      onChangeRef.current({
        labels: labelsRef.current,
        matrix,
        colWidths,
        rowHeights
      });
    };

    const fillCounts = (hot, row) => {
      const label = labelsRef.current[row] || '';
      const doctorRow = labelsRef.current.findIndex(item => fold(item) === fold('BS Phụ trách'));
      if (!label.trim() || doctorRow < 0 || doctorRow === row) return;
      const { grid: weekGrid, staffList: people, taskList: tasks } = countRef.current;
      const updates = [];
      for (let col = 0; col < hot.countCols(); col += 1) {
        const names = String(hot.getDataAtCell(doctorRow, col) ?? '').split(/[,;/]+/).map(name => name.trim()).filter(Boolean);
        const total = names.reduce((sum, name) => sum + (Number(countSessions(weekGrid, people, tasks, name, label)) || 0), 0);
        updates.push([row, col, names.length ? total : '']);
      }
      if (updates.length) hot.setDataAtCell(updates, 'count');
    };

    const openLabelEditor = (hot, row) => {
      const header = hot.getCell(row, -1);
      const rect = header?.getBoundingClientRect();
      if (!rect || rect.width < 2) return;
      setLabelEdit({
        row,
        value: labelsRef.current[row] || '',
        top: rect.top,
        left: rect.left,
        width: Math.max(rect.width, 180),
        height: rect.height
      });
    };

    const narrowUi = typeof window !== 'undefined' && window.matchMedia('(max-width: 720px)').matches;
    const headerWidth = narrowUi ? 108 : 168;
    const colWidths = (table.colWidths || []).map((width) => {
      const n = Number(width) || DEFAULT_COL_WIDTH;
      return narrowUi ? Math.min(n, 88) : n;
    });

    const hot = new window.Handsontable(containerRef.current, {
      data: table.matrix,
      rowHeaders(index) {
        return labelsRef.current[index] || 'Dòng mới';
      },
      rowHeaderWidth: headerWidth,
      colHeaders: false,
      height: roomGridPixelHeight(table.rowHeights),
      width: '100%',
      licenseKey: 'non-commercial-and-evaluation',
      hiddenColumns: {
        columns: hiddenDoctorColumns(table.matrix, table.labels, hiddenDoctorsRef.current),
        indicators: false
      },
      // Không stretch trên mobile — giữ colWidths để cuộn ngang xem đủ BS.
      stretchH: narrowUi ? 'none' : 'all',
      autoColumnSize: false,
      manualColumnResize: true,
      manualRowResize: true,
      colWidths,
      rowHeights: table.rowHeights,
      contextMenu: {
        items: {
          insert_above: {
            name: 'Insert row above',
            disabled() {
              return !!readOnlyRef.current;
            },
            callback() {
              if (readOnlyRef.current) return;
              const row = this.getSelectedLast()?.[0] ?? 0;
              this.alter('insert_row_above', row);
            }
          },
          insert_below: {
            name: 'Insert row below',
            disabled() {
              return !!readOnlyRef.current;
            },
            callback() {
              if (readOnlyRef.current) return;
              const row = this.getSelectedLast()?.[0] ?? this.countRows() - 1;
              this.alter('insert_row_below', row);
            }
          },
          rename_row: {
            name: 'Đổi tên dòng',
            disabled() {
              return !!readOnlyRef.current;
            },
            callback() {
              if (readOnlyRef.current) return;
              const row = this.getSelectedLast()?.[0];
              if (row == null) return;
              openLabelEditor(this, row);
            }
          },
          remove_row: {
            name: 'Remove row',
            disabled() {
              return !!readOnlyRef.current || this.countRows() <= 1;
            },
            callback() {
              if (readOnlyRef.current) return;
              const row = this.getSelectedLast()?.[0];
              if (row == null || this.countRows() <= 1) return;
              this.alter('remove_row', row);
            }
          },
          hsep1: '---------',
          col_left: {
            name: 'Insert column left',
            disabled() { return !!readOnlyRef.current; }
          },
          col_right: {
            name: 'Insert column right',
            disabled() { return !!readOnlyRef.current; }
          },
          remove_col: {
            name: 'Remove column',
            disabled() { return !!readOnlyRef.current; }
          },
          hsep2: '---------',
          count_row: {
            name: 'Tính số lượt',
            disabled() { return !!readOnlyRef.current; },
            callback() {
              if (readOnlyRef.current) return;
              const row = this.getSelectedLast()?.[0];
              if (row == null) return;
              fillCounts(this, row);
            }
          },
          hsep3: '---------',
          undo: { disabled() { return !!readOnlyRef.current; } },
          redo: { disabled() { return !!readOnlyRef.current; } },
          hsep4: '---------',
          copy: {},
          cut: { disabled() { return !!readOnlyRef.current; } }
        }
      },
      copyPaste: true,
      undo: true,
      selectionMode: 'multiple',
      fillHandle: true,
      outsideClickDeselects: false,
      minCols: 1,
      minRows: 1,
      cells() {
        return {
          readOnly: !!readOnlyRef.current,
          wordWrap: false,
          renderer(instance, td, row, col) {
            window.Handsontable.renderers.TextRenderer.apply(this, arguments);
            td.style.removeProperty('background-color');
            td.style.removeProperty('color');
            td.style.fontWeight = '';
            paintCell(td, describe(row, col)?.style);
          }
        };
      },
      afterOnCellMouseDown(event, coords) {
        if (readOnlyRef.current) return;
        if (event.button !== 0 || coords.col !== -1 || coords.row < 0) return;
        const element = event.target?.nodeType === 1 ? event.target : event.target?.parentElement;
        if (element?.closest?.('.manualRowResizer')) return;
        openLabelEditor(this, coords.row);
      },
      afterChange(changes, source) {
        if (readOnlyRef.current || !changes || source === 'loadData' || source === 'syncStaff') return;
        publish(this);
      },
      afterCreateRow(index, amount) {
        if (readOnlyRef.current) return;
        const next = labelsRef.current.slice();
        next.splice(index, 0, ...Array(amount).fill(''));
        labelsRef.current = next;
        const heights = sizeRef.current.rowHeights.slice();
        heights.splice(index, 0, ...Array(amount).fill(DEFAULT_ROW_HEIGHT));
        sizeRef.current = { ...sizeRef.current, rowHeights: heights };
        publish(this, next);
      },
      afterRemoveRow(index, amount) {
        if (readOnlyRef.current) return;
        const next = labelsRef.current.slice();
        next.splice(index, amount);
        if (!next.length) next.push('BS Phụ trách');
        labelsRef.current = next;
        publish(this, next);
      },
      afterCreateCol() {
        if (readOnlyRef.current) return;
        publish(this);
      },
      afterRemoveCol() {
        if (readOnlyRef.current) return;
        if (this.countCols() < 1) this.alter('insert_col_end', 0, 1, 'ensureColumn');
        else publish(this);
      },
      afterColumnResize() {
        if (readOnlyRef.current) return;
        publish(this);
      },
      afterRowResize() {
        if (readOnlyRef.current) return;
        const heights = Array.from({ length: this.countRows() }, (_, row) => this.getRowHeight(row) || DEFAULT_ROW_HEIGHT);
        this.updateSettings({ height: roomGridPixelHeight(heights) });
        publish(this);
      },
      afterSelectionEnd() {
        claim(this);
        const entry = activeEntry(this, describe);
        uiRef.current.onActiveStyle?.(entry?.style || null);
        const ctl = formatCtl.current;
        if (!ctl?.armed) return;
        const entries = selectedEntries(this, describe);
        const painted = ctl.style || {};
        ctl.armed = false;
        uiRef.current.onPaint?.(entries, painted);
      }
    });

    hotRef.current = hot;
    const detachDrop = attachPaletteDrop(hot);
    return () => {
      detachDrop();
      if (bridge.current.hot === hot) {
        bridge.current.hot = null;
        bridge.current.describe = () => null;
        bridge.current.getSelectedEntries = () => [];
        bridge.current.getActiveEntry = () => null;
      }
      hot.destroy();
      hotRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [structureKey]);

  useEffect(() => {
    patchHotCells(hotRef.current, JSON.parse(valueKey));
  }, [valueKey]);

  useEffect(() => {
    stylesRef.current = cellStyles || {};
    const hot = hotRef.current;
    if (!hot) return;
    hot.updateSettings({
      fillHandle: !readOnly,
      manualColumnResize: !readOnly,
      manualRowResize: !readOnly
    });
    hot.render();
  }, [cellStyles, readOnly]);

  const staffKey = staffShortNames(staffList).join('\u0001');
  const hiddenKey = (hiddenDoctors || []).map(fold).filter(Boolean).join('\u0001');

  useEffect(() => {
    const hot = hotRef.current;
    if (!hot) return;
    const plugin = hot.getPlugin?.('hiddenColumns');
    const columns = hiddenDoctorColumns(JSON.parse(valueKey), labelsRef.current, hiddenDoctorsRef.current);
    const current = plugin?.getHiddenColumns?.() || [];
    const same = current.length === columns.length && current.every((col, index) => col === columns[index]);
    if (same) return;
    hot.updateSettings({
      hiddenColumns: { columns, indicators: false }
    });
    hot.render();
  }, [hiddenKey, valueKey]);

  useEffect(() => {
    const hot = hotRef.current;
    const names = staffShortNames(staffList);
    if (!hot || !names.length) return;

    const labels = labelsRef.current;
    const rowCount = hot.countRows();
    const currentMatrix = Array.from({ length: rowCount }, (_, row) => (
      Array.from({ length: hot.countCols() }, (_, col) => String(hot.getDataAtCell(row, col) ?? ''))
    ));
    if (!doctorRowNeedsStaffSync(currentMatrix, labels, staffList)) return;

    const aligned = alignRoomColumnsToStaff(currentMatrix, labels, sizeRef.current.colWidths, staffList);
    if (!aligned) return;
    const { matrix, colWidths } = aligned;
    hot.loadData(matrix, 'syncStaff');
    hot.updateSettings({ colWidths });
    const rowHeights = Array.from({ length: rowCount }, (_, row) => hot.getRowHeight(row) || DEFAULT_ROW_HEIGHT);
    labelsRef.current = labels;
    sizeRef.current = { colWidths, rowHeights };
    onChangeRef.current({ labels, matrix, colWidths, rowHeights });
  }, [staffKey, structureKey]);

  useEffect(() => {
    if (!active) return undefined;
    const hot = hotRef.current;
    if (!hot) return undefined;
    const id = requestAnimationFrame(() => {
      hot.refreshDimensions();
      hot.render();
    });
    return () => cancelAnimationFrame(id);
  }, [active]);

  return (
    <>
      <div ref={containerRef} className="room-grid-host" />
      {labelEdit && (
        <input
          className="room-label-input"
          style={{ top: labelEdit.top, left: labelEdit.left, width: labelEdit.width, height: labelEdit.height }}
          value={labelEdit.value}
          autoFocus
          placeholder="Tên dòng, ví dụ Dạy học sinh viên"
          onFocus={(event) => event.target.select()}
          onChange={(event) => setLabelEdit(current => ({ ...current, value: event.target.value }))}
          onBlur={(event) => {
            const value = event.target.value;
            const row = labelEdit.row;
            const next = labelsRef.current.slice();
            next[row] = value.trim();
            labelsRef.current = next;
            const hot = hotRef.current;
            setLabelEdit(null);
            if (!hot) return;
            hot.render();
            const colCount = hot.countCols();
            const matrix = Array.from({ length: hot.countRows() }, (_, index) => (
              Array.from({ length: colCount }, (_, col) => String(hot.getDataAtCell(index, col) ?? ''))
            ));
            onChangeRef.current({
              labels: next,
              matrix,
              colWidths: sizeRef.current.colWidths,
              rowHeights: sizeRef.current.rowHeights
            });
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') event.currentTarget.blur();
            if (event.key === 'Escape') setLabelEdit(null);
          }}
        />
      )}
    </>
  );
}
