import React, { useEffect, useMemo, useRef, useState } from 'react';
import { SheetTabs } from './SheetTabs';
import { MonthSheet } from './MonthSheet';
import { SheetToolbar } from './SheetToolbar';
import { DayCalendar } from './DayCalendar';
import { TaskEditorModal } from './TaskEditorModal';
import { RoomSheet, roomTableOf, roomTableWithoutDoctors } from './RoomSheet';
import { rectSelectionHooks } from '../logic/rectSelection';
import { combineMerges, mergeMenuItems, userMerges } from '../logic/merges';
import { activeEntry, expandSharedTaskStyles, paintCell, pushFormatUndo, selectedEntries } from '../logic/cellFormat';
import { currentMonthKey, formatMonthLabel, normalizeDaySessions, sessionLabel, shiftMonthKey } from '../logic/monthSchedule';
import { buildCathDisplayRows, CATH_HEAD_KEY, resolveCathRoles } from '../logic/cathSchedule';
import { attachPaletteDrop } from '../logic/paletteDrop';
import { attachCellDragSwap } from '../logic/cellDragSwap';
import { applySheetZoom, patchHotCells, watchSheetViewport } from '../logic/sheetViewport';
import { taskForRole } from '../logic/taskMatch';
import { buildSessionAlertRow, lockConflictMessages } from '../logic/warningResolve';
import { buildWeekDays, missingFixedTaskMessages } from '../logic/schedulerEngine';
import { leadingTask, orderCellText } from '../logic/cellOrder';
import { canEdit, canSee, firstSheetPlan } from '../logic/access';
import { traineeCovers, traineeOnWeek } from '../logic/traineePeriod';
import { alertMuted } from '../logic/taskAlert';

const FIXED_COLS = 3;

function monthRoleGroup(role, taskList) {
  return taskForRole(role, taskList)?.category || '';
}

function findTaskColor(taskList, raw, roomNames) {
  const task = leadingTask(raw, taskList, roomNames);
  return task ? { bg: task.bgColor, text: task.textColor } : null;
}

function syncWeekFrame(hot) {
  if (!hot?.rootElement) return;
  let body = 0;
  for (let index = 0; index < hot.countRows(); index += 1) body += hot.getRowHeight(index) || 30;
  let cols = 0;
  for (let index = 0; index < hot.countCols(); index += 1) cols += hot.getColWidth(index) || 0;
  const zoom = parseFloat(hot.rootElement.style.zoom) || 1;
  const thead = hot.rootElement.querySelector('.ht_master .htCore thead');
  const measured = thead ? Math.ceil(thead.getBoundingClientRect().height / zoom) : 0;
  const leftClone = hot.rootElement.querySelector('.ht_clone_left, .ht_clone_inline_start');
  const leftCloneWidth = leftClone ? Math.ceil(leftClone.getBoundingClientRect().width / zoom) : 0;
  // When rowHeaders are off, left clone is only frozen data cols — do not add a fake gutter.
  const gutter = WEEK_ROW_HEADERS ? Math.max(leftCloneWidth, WEEK_ROW_HEADER_WIDTH) : 0;
  const table = hot.rootElement.querySelector('.ht_master .htCore');
  const tableWidth = table ? Math.ceil(table.getBoundingClientRect().width / zoom) : 0;
  const height = body + Math.max(measured, 48) + 4;
  const width = Math.max(cols + gutter + 4, tableWidth);
  const current = hot.getSettings();
  const next = {};
  if (current.height !== height) next.height = height;
  if (current.width !== width) next.width = width;
  if (Object.keys(next).length) hot.updateSettings(next);
}

const NAME_COL_WIDTH = 78;
const BALANCE_COL_WIDTH = 48;
const SESSION_COL_WIDTH = 96;
const NOTE_COL_WIDTH = 220;
/** Week sheet: no Handsontable row-index gutter (1…n); freeze starts at Bác sĩ. */
const WEEK_ROW_HEADERS = false;
const WEEK_ROW_HEADER_WIDTH = WEEK_ROW_HEADERS ? 50 : 0;
const WEEK_DEFAULT_FREEZE_COLS = 1; // cột BÁC SĨ

function dayColumnWidth(viewport, sessionCount, zoom) {
  const scale = zoom > 0 ? zoom : 1;
  const count = Math.max(1, sessionCount);
  const available = viewport / scale - WEEK_ROW_HEADER_WIDTH - NAME_COL_WIDTH - BALANCE_COL_WIDTH * 2;
  return Math.max(64, Math.floor(available / count));
}

function columnWidthsFor(count, noteCol, sessionWidth) {
  return Array.from({ length: count }, (_, index) => {
    if (index === 0) return NAME_COL_WIDTH;
    if (index < FIXED_COLS) return BALANCE_COL_WIDTH;
    if (index === noteCol) return NOTE_COL_WIDTH;
    return sessionWidth;
  });
}

function cathActionButton(label, title, onClick) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'month-add-task';
  button.title = title;
  button.setAttribute('aria-label', title);
  button.textContent = label;
  button.addEventListener('mousedown', (event) => {
    event.preventDefault();
    event.stopPropagation();
  });
  button.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    onClick();
  });
  return button;
}

function defaultWeekColWidth(index, noteCol, sessionWidth = SESSION_COL_WIDTH) {
  if (index === 0) return NAME_COL_WIDTH;
  if (index < FIXED_COLS) return BALANCE_COL_WIDTH;
  if (index === noteCol) return NOTE_COL_WIDTH;
  return sessionWidth;
}

function fitWeekColumns(hot, { viewport, zoom, noteCol, manual }) {
  if (!hot || manual || viewport < 320) return;
  const sessions = Math.max(1, noteCol - FIXED_COLS);
  const session = dayColumnWidth(viewport, sessions, zoom);
  const widths = columnWidthsFor(hot.countCols(), noteCol, session);
  if (widths.every((value, index) => hot.getColWidth(index) === value)) return;
  hot.updateSettings({ colWidths: widths });
  syncWeekFrame(hot);
}

function measureWeekHeights(table, widths, { alertRow, noteCol }) {
  const probe = document.createElement('div');
  probe.style.position = 'absolute';
  probe.style.visibility = 'hidden';
  probe.style.left = '-9999px';
  probe.style.boxSizing = 'border-box';
  probe.style.whiteSpace = 'pre-wrap';
  probe.style.wordBreak = 'normal';
  probe.style.overflowWrap = 'break-word';
  probe.style.font = '700 0.82rem var(--font-main), sans-serif';
  document.body.appendChild(probe);
  const heights = (table || []).map((line, rowIndex) => {
    const warning = rowIndex === alertRow;
    probe.style.lineHeight = warning ? '1.35' : '1.25';
    probe.style.padding = '4px 5px';
    probe.style.fontWeight = warning ? '600' : '700';
    let max = warning ? 28 : 30;
    (line || []).forEach((text, col) => {
      const value = String(text || '');
      if (!value.trim() || (!warning && col < FIXED_COLS)) return;
      const fallback = col === noteCol ? NOTE_COL_WIDTH : SESSION_COL_WIDTH;
      probe.style.width = `${Math.max(48, Number(widths?.[col]) || fallback)}px`;
      probe.textContent = value;
      max = Math.max(max, probe.offsetHeight + 2);
    });
    return max;
  });
  probe.remove();
  return heights;
}

function stickWeekFreeze(hot) {
  const root = hot?.rootElement;
  const scroller = root?.closest('.sheet-scroll');
  const left = root?.querySelector('.ht_clone_inline_start, .ht_clone_left');
  const top = root?.querySelector('.ht_clone_top');
  const corner = root?.querySelector('.ht_clone_top_inline_start_corner, .ht_clone_top_left_corner');
  if (!root || !scroller?.classList.contains('is-open') || !left || !top || !corner) return;
  const zoom = parseFloat(root.style.zoom) || 1;
  const rootRect = root.getBoundingClientRect();
  const box = scroller.getBoundingClientRect();
  const shiftX = Math.round(Math.max(0, Math.min((box.left - rootRect.left) / zoom, root.offsetWidth - left.offsetWidth)));
  const shiftY = Math.round(Math.max(0, Math.min((box.top - rootRect.top) / zoom, root.offsetHeight - top.offsetHeight)));
  left.style.transform = shiftX ? `translate(${shiftX}px, 0)` : '';
  top.style.transform = shiftY ? `translate(0, ${shiftY}px)` : '';
  corner.style.transform = shiftX || shiftY ? `translate(${shiftX}px, ${shiftY}px)` : '';
  root.classList.toggle('is-pin-x', shiftX > 0);
  root.classList.toggle('is-pin-y', shiftY > 0);
}

function alignFrozenPanes(hot) {
  const root = hot?.rootElement;
  if (!root) return;
  stickWeekFreeze(hot);
  const holder = root.querySelector('.ht_master .wtHolder');
  const top = holder?.scrollTop || 0;
  const left = holder?.scrollLeft || 0;
  const rows = hot.countRows?.() || 0;
  const stamp = root.__paneStamp;
  if (stamp && stamp.top === top && stamp.rows === rows && stamp.left !== left) {
    stamp.left = left;
    return;
  }
  const master = root.querySelector('.ht_master .htCore');
  const leftPaneCore = root.querySelector('.ht_clone_left .htCore, .ht_clone_inline_start .htCore');
  const corner = root.querySelector('.ht_clone_top_left_corner .htCore, .ht_clone_top_inline_start_corner .htCore');
  const leftPane = root.querySelector('.ht_clone_left, .ht_clone_inline_start');
  const paneWidth = leftPane ? leftPane.getBoundingClientRect().width : 0;
  root.style.setProperty('--freeze-pane', `${Math.round(paneWidth)}px`);
  if (!master || !leftPaneCore) {
    root.__paneStamp = { top, left, rows };
    return;
  }
  const apply = (sourceRows, targetRows) => {
    const heights = sourceRows.map(row => Math.round(row.getBoundingClientRect().height));
    heights.forEach((height, index) => {
      const target = targetRows[index];
      if (!target || height <= 0) return;
      const next = `${height}px`;
      if (target.style.height !== next) target.style.height = next;
    });
  };
  apply([...master.querySelectorAll('thead tr')], [...(corner?.querySelectorAll('thead tr') || [])]);
  apply([...master.querySelectorAll('tbody tr')], [...leftPaneCore.querySelectorAll('tbody tr')]);
  root.__paneStamp = { top, left, rows };
}

export function SheetView({
  dept,
  staffList,
  taskList,
  scheduleData,
  onUpdateCell,
  onUpdateCathCell,
  onRenameCathRole,
  onAddCathRole,
  onDeleteCathRole,
  onDateChange,
  onGoCurrentWeek,
  currentStartDate,
  sheets,
  activeSheetId,
  onSelectSheet,
  onAddSheet,
  onRenameSheet,
  onDuplicateSheet,
  onDeleteSheet,
  onMoveSheet,
  onColorSheet,
  monthKey,
  onMonthKeyChange,
  onUpdateMonthCell,
  onPatchStyles,
  onAddMonthRole,
  onInsertMonthRole,
  onRenameMonthRole,
  onDeleteMonthRole,
  onInsertMonthColumn,
  onRemoveMonthColumn,
  onRenameMonthColumn,
  onUpdateMonthCustomCell,
  onMonthMerges,
  categories,
  onAddTask,
  onAddCategory,
  onDeleteCategory,
  onUpdateRooms,
  onWeekMerges,
  onDaySessions,
  leaveEntries,
  studyEntries,
  onSaveLeave,
  onDeleteLeave,
  onSaveStudy,
  onDeleteStudy,
  onFreeze,
  onUpdateNote,
  onUpdateBalance,
  onAutoSchedule,
  actor
}) {
  const containerRef = useRef(null);
  const hotInstanceRef = useRef(null);
  const weekEditRef = useRef(null);
  const stylesRef = useRef(scheduleData.cellStyles || {});
  const taskListRef = useRef(taskList);
  const onUpdateRef = useRef(onUpdateCell);
  const onCathCellRef = useRef(onUpdateCathCell);
  const onCathRenameRef = useRef(onRenameCathRole);
  const onCathAddRef = useRef(onAddCathRole);
  const onCathDeleteRef = useRef(onDeleteCathRole);
  const onNoteRef = useRef(onUpdateNote);
  const onBalanceRef = useRef(onUpdateBalance);
  const describeRef = useRef(() => null);
  const bridge = useRef({
    hot: null,
    describe: () => null,
    getSelectedEntries: () => [],
    getActiveEntry: () => null
  });
  const formatCtl = useRef({ armed: false, style: null });
  const patchRef = useRef(onPatchStyles);
  const weekMergesRef = useRef(scheduleData.weekMerges || []);
  const onWeekMergesRef = useRef(onWeekMerges);
  const alertMergeRef = useRef([]);
  const roomNamesRef = useRef([]);
  const weekSizeRef = useRef({ cols: null, rows: null });
  const uiRef = useRef({});
  const [plan, setPlan] = useState('week');
  const [monthGroupKeys, setMonthGroupKeys] = useState(null);
  const [warm, setWarm] = useState({ month: false, leave: false, study: false });
  const [calMonth, setCalMonth] = useState(currentMonthKey);
  const [longNonce, setLongNonce] = useState(0);
  const [teachNonce, setTeachNonce] = useState(0);
  const [zoom, setZoom] = useState(100);
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;
  const readOnlyRef = useRef(false);
  readOnlyRef.current = !canEdit(actor, 'week');
  const shownPlanRef = useRef('week');
  const [painting, setPainting] = useState(false);
  const [activeStyle, setActiveStyle] = useState(null);
  const [scrolledMonth, setScrolledMonth] = useState(null);
  const [addOpen, setAddOpen] = useState(false);

  const { days, grid, roomWarnings, warnings } = scheduleData;
  const roomTable = roomTableOf(scheduleData, staffList);
  const hiddenRoomDoctors = staffList
    .filter(person => !traineeOnWeek(person, days))
    .map(person => String(person.shortName || '').trim())
    .filter(Boolean);
  const visibleRoomTable = roomTableWithoutDoctors(roomTable, hiddenRoomDoctors);
  const activeMonth = monthKey || currentMonthKey();
  const shownMonth = plan === 'month' ? (scrolledMonth || activeMonth) : activeMonth;
  const monthFilterGroups = useMemo(() => {
    const used = new Set((scheduleData.monthRoles || []).map(role => monthRoleGroup(role, taskList)));
    const groups = (categories || [])
      .filter(item => used.has(item.key))
      .map(item => ({ key: item.key, label: item.label }));
    if (used.has('')) groups.push({ key: '', label: 'Chưa phân nhóm' });
    return groups;
  }, [scheduleData.monthRoles, taskList, categories]);
  const visibleMonthRoles = useMemo(() => {
    const roles = scheduleData.monthRoles || [];
    if (!monthGroupKeys) return roles;
    const allow = new Set(monthGroupKeys);
    return roles.filter(role => allow.has(monthRoleGroup(role, taskList)));
  }, [scheduleData.monthRoles, taskList, monthGroupKeys]);
  const toggleMonthGroup = (key) => {
    const all = monthFilterGroups.map(item => item.key);
    const current = monthGroupKeys == null
      ? all
      : monthGroupKeys.filter(item => all.includes(item));
    const next = current.includes(key)
      ? current.filter(item => item !== key)
      : [...current, key];
    const showsAll = next.length === all.length && all.every(item => next.includes(item));
    setMonthGroupKeys(showsAll ? null : next);
  };

  stylesRef.current = scheduleData.cellStyles || {};
  taskListRef.current = taskList;
  onUpdateRef.current = onUpdateCell;
  onCathCellRef.current = onUpdateCathCell;
  onCathRenameRef.current = onRenameCathRole;
  onCathAddRef.current = onAddCathRole;
  onCathDeleteRef.current = onDeleteCathRole;
  onNoteRef.current = onUpdateNote;
  onBalanceRef.current = onUpdateBalance;
  patchRef.current = onPatchStyles;
  weekMergesRef.current = scheduleData.weekMerges || [];
  onWeekMergesRef.current = onWeekMerges;
  bridge.current.styles = scheduleData.cellStyles || {};
  uiRef.current.styles = scheduleData.cellStyles || {};
  uiRef.current.onActiveStyle = (style) => setActiveStyle(style);
  uiRef.current.onVisibleMonth = (key) => setScrolledMonth(prev => (prev === key ? prev : key));
  uiRef.current.onPaint = (entries, style) => {
    const tab = shownPlanRef.current === 'month' ? 'month' : 'week';
    if (!canEdit(actor, tab)) return;
    setPainting(false);
    if (!entries.length) return;
    const prev = {};
    const next = {};
    entries.forEach((entry) => {
      prev[entry.key] = entry.style ? { ...entry.style } : null;
      next[entry.key] = style && Object.keys(style).length ? { ...style } : null;
    });
    expandSharedTaskStyles(stylesRef.current, prev, next);
    pushFormatUndo(bridge.current.hot, prev, next, (map) => patchRef.current(map));
  };

  const weekModel = useMemo(() => {
  const sessions = normalizeDaySessions(scheduleData.daySessions);
  const weekStaff = staffList.filter(person => traineeOnWeek(person, days));
  const cathRoles = resolveCathRoles(scheduleData.cathRoles, scheduleData.monthRoles);
  const alertRows = [
    ...(warnings || []),
    ...(roomWarnings || []),
    ...lockConflictMessages({ grid, staffList: weekStaff, days, sessions, taskList }),
    ...missingFixedTaskMessages({
      grid,
      staffList: weekStaff,
      days,
      sessions,
      taskList,
      cathGrid: scheduleData.cathGrid,
      cathRoles
    })
  ].filter(message => !alertMuted(message, taskList));
  const roomLabelIndex = (roomTable.labels || []).findIndex(label => String(label || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .includes('phong'));
  const roomNames = (roomTable.matrix?.[roomLabelIndex >= 0 ? roomLabelIndex : 1] || [])
    .map(item => String(item || '').trim())
    .filter(Boolean);
  roomNamesRef.current = roomNames;
  const rowData = weekStaff.map(s => {
    const sData = grid[s.shortName] || {};
    const row = [s.shortName, s.buBalance, s.phepBalance];
    for (let d = 0; d < 7; d += 1) {
      sessions.forEach(id => {
        const text = traineeCovers(s, days[d]?.iso) ? (sData[d]?.[id] || '') : '';
        row.push(orderCellText(text, taskList, roomNames));
      });
    }
    row.push(sData.note || '');
    return row;
  });
  const cathRows = buildCathDisplayRows({
    roles: cathRoles,
    days,
    sessions,
    monthGrid: scheduleData.monthGrid,
    cathGrid: scheduleData.cathGrid
  });
  const doctorCount = weekStaff.length;
  const cathStart = doctorCount;
  const noteCol = FIXED_COLS + 7 * sessions.length;
  const weekWidth = noteCol + 1;
  const freezeRows = Math.max(0, Number(scheduleData.freeze?.week?.rows) || 0);
  // Default / minimum: freeze cột BÁC SĨ (index 0). Stored 0 vẫn nâng lên 1.
  const freezeCols = Math.max(
    WEEK_DEFAULT_FREEZE_COLS,
    Number(scheduleData.freeze?.week?.cols) || WEEK_DEFAULT_FREEZE_COLS
  );
  const alertLine = alertRows.length
    ? buildSessionAlertRow(alertRows, {
      days, sessions, weekWidth, noteCol, leaveEntries, studyEntries, grid, staffList, taskList
    })
    : null;
  const alertIndex = alertLine ? cathStart + cathRoles.length : -1;
  const weekData = alertLine ? [...rowData, ...cathRows, alertLine] : [...rowData, ...cathRows];

  const topHeaders = [
    'BÁC SĨ',
    'BÙ',
    'PHÉP',
    ...days.map(d => ({
      label: `${d.dayName} (${d.dateStr})`,
      colspan: sessions.length
    })),
    'Ghi chú'
  ];
  const subHeaders = ['', '', '', ...days.flatMap(() => sessions.map(sessionLabel)), ''];

  const dataKey = JSON.stringify([...rowData, ...cathRows]);
  const headerKey = `${sessions.join('')}|${days.map(d => d.dateStr).join(',')}`;
  const gridShape = `${headerKey}|${weekData.length}|${weekWidth}|${freezeRows}|${freezeCols}|${currentStartDate}`;
  const paintKey = `${dataKey}|${alertRows.join('|')}`;
  return {
    sessions, weekStaff, alertRows, roomNames, rowData, cathRoles, cathRows,
    doctorCount, cathStart, noteCol, freezeRows, freezeCols, alertLine, alertIndex,
    weekData, topHeaders, subHeaders, gridShape, paintKey
  };
  }, [scheduleData, staffList, taskList, leaveEntries, studyEntries, currentStartDate, days, grid, warnings, roomWarnings]);
  const {
    sessions, weekStaff, alertRows, roomNames, rowData, cathRoles, cathRows,
    doctorCount, cathStart, noteCol, freezeRows, freezeCols, alertLine, alertIndex,
    weekData, topHeaders, subHeaders, gridShape, paintKey
  } = weekModel;
  weekEditRef.current = {
    rowData, cathRoles, cathStart, doctorCount, days, sessions, noteCol, alertIndex
  };

  describeRef.current = (row, col) => {
    if (row >= cathStart && row < cathStart + cathRoles.length) {
      const role = cathRoles[row - cathStart];
      if (!role || col < 0) return null;
      if (col === 0) return { key: `w|cath|${role.key}|label`, style: stylesRef.current[`w|cath|${role.key}|label`] || null };
      if (col < FIXED_COLS || col === noteCol) return null;
      const offset = col - FIXED_COLS;
      const day = days[Math.floor(offset / sessions.length)];
      if (!day) return null;
      const session = sessions[offset % sessions.length];
      const key = `w|cath|${role.key}|${day.fullDateStr}|${session}`;
      return { key, style: stylesRef.current[key] || null };
    }
    const staff = weekStaff[row];
    if (!staff || col < 0) return null;
    let key = null;
    if (col === 0) key = `w|${staff.shortName}|label`;
    else if (col === 1) key = `w|${staff.shortName}|bu`;
    else if (col === 2) key = `w|${staff.shortName}|phep`;
    else if (col === noteCol) key = `w|${staff.shortName}|note`;
    else {
      const offset = col - FIXED_COLS;
      const day = days[Math.floor(offset / sessions.length)];
      if (!day) return null;
      const session = sessions[offset % sessions.length];
      key = `w|${staff.shortName}|${day.fullDateStr}|${session}`;
    }
    return { key, style: stylesRef.current[key] || null };
  };

  useEffect(() => {
    if (!containerRef.current || !window.Handsontable) return undefined;

    if (hotInstanceRef.current) {
      hotInstanceRef.current.destroy();
      hotInstanceRef.current = null;
    }

    alertMergeRef.current = [];

    const colCount = weekData[0]?.length || 0;
    const savedCols = weekSizeRef.current.cols;
    const useSavedCols = savedCols && savedCols.length === colCount;
    const savedRows = weekSizeRef.current.rows;
    const useSavedRows = savedRows && savedRows.length === weekData.length;
    const frameWidth = containerRef.current?.closest('.sheet-scroll')?.clientWidth || 0;
    const fittedSession = frameWidth > 320
      ? dayColumnWidth(frameWidth, Math.max(1, noteCol - FIXED_COLS), zoomRef.current / 100)
      : SESSION_COL_WIDTH;
    const colWidths = Array.from({ length: colCount }, (_, index) => (
      useSavedCols && savedCols[index] > 0 ? savedCols[index] : defaultWeekColWidth(index, noteCol, fittedSession)
    ));
    const alertRow = alertIndex;
    const wrappedHeights = measureWeekHeights(weekData, colWidths, { alertRow, noteCol });
    const hot = new window.Handsontable(containerRef.current, {
      data: weekData,
      nestedHeaders: [topHeaders, subHeaders],
      rowHeaders: WEEK_ROW_HEADERS,
      height: wrappedHeights.reduce((sum, row) => sum + row, 0) + 56,
      width: colWidths.reduce((sum, col) => sum + col, 0) + WEEK_ROW_HEADER_WIDTH + 4,
      licenseKey: 'non-commercial-and-evaluation',
      stretchH: 'none',
      fixedRowsTop: freezeRows,
      fixedColumnsStart: freezeCols,
      wordWrap: false,
      autoRowSize: false,
      autoColumnSize: false,
      viewportRowRenderingOffset: 2,
      viewportColumnRenderingOffset: 2,
      colWidths,
      rowHeights(index) {
        const measured = wrappedHeights[index] || 30;
        if (useSavedRows && savedRows[index] > measured) return savedRows[index];
        return measured;
      },
      manualColumnResize: true,
      manualRowResize: true,
      contextMenu: {
        items: {
          row_above: {},
          row_below: {},
          remove_row: {},
          col_left: {},
          col_right: {},
          remove_col: {},
          hsep_merge: '---------',
          ...mergeMenuItems((instance) => {
            if (readOnlyRef.current) return;
            const next = userMerges(instance, alertMergeRef.current);
            if (JSON.stringify(next) === JSON.stringify(weekMergesRef.current)) return;
            weekMergesRef.current = next;
            onWeekMergesRef.current?.(next);
          }),
          hsep2: '---------',
          undo: {},
          redo: {},
          copy: {},
          cut: {}
        }
      },
      copyPaste: true,
      undo: true,
      selectionMode: 'multiple',
      fillHandle: true,
      outsideClickDeselects: false,
      mergeCells: combineMerges([], weekMergesRef.current),
      ...rectSelectionHooks(),
      cells(row, col) {
        const cellProperties = {};
        const meta = weekEditRef.current;
        const desc = describeRef.current(row, col);
        const isAlert = meta.alertIndex >= 0 && row === meta.alertIndex;
        const isCath = row >= meta.cathStart && row < meta.cathStart + meta.cathRoles.length;
        const role = isCath ? meta.cathRoles[row - meta.cathStart] : null;
        const isNote = col === meta.noteCol;
        const isBalance = col === 1 || col === 2;
        const cathEditable = isCath && (
          (col === 0 && role?.source === 'local')
          || (col >= FIXED_COLS && col < meta.noteCol)
        );
        if (readOnlyRef.current || isAlert || (isCath && !cathEditable) || (!isCath && col < FIXED_COLS && !isBalance && !isNote)) {
          cellProperties.readOnly = true;
        }
        const wrapMode = desc?.style?.wrap;
        const naturalWrap = !isAlert && !isCath && (isNote || col >= FIXED_COLS) && wrapMode !== 'clip' && wrapMode !== 'overflow';
        cellProperties.wordWrap = isAlert || naturalWrap || wrapMode === 'wrap';
        if (naturalWrap) cellProperties.className = 'week-task';
        cellProperties.renderer = function weekRenderer(instance, td) {
          const live = weekEditRef.current;
          const liveNote = live.noteCol;
          const liveAlert = live.alertIndex >= 0 && row === live.alertIndex;
          const liveCath = row >= live.cathStart && row < live.cathStart + live.cathRoles.length;
          const liveRole = liveCath ? live.cathRoles[row - live.cathStart] : null;
          window.Handsontable.renderers.TextRenderer.apply(this, arguments);
          td.style.removeProperty('background-color');
          td.style.removeProperty('color');
          td.style.fontWeight = '';
          td.classList.remove('week-warning', 'week-task', 'week-cath-name');
          td.removeAttribute('title');
          if (liveAlert) {
            const text = String(instance.getDataAtCell(row, col) || '').trim();
            if (text) td.classList.add('week-warning');
            return;
          }
          if (liveCath) {
            if (col === 0) td.classList.add('week-cath-name');
            if (col === 1 && !readOnlyRef.current && liveRole?.source === 'local') {
              td.innerHTML = '';
              if (liveRole.key === CATH_HEAD_KEY) {
                td.appendChild(cathActionButton('+', 'Thêm task', () => onCathAddRef.current?.()));
              } else {
                td.appendChild(cathActionButton('×', `Xóa ${liveRole.label}`, () => {
                  if (window.confirm(`Xóa task ${liveRole.label}?`)) onCathDeleteRef.current?.(liveRole.key);
                }));
              }
            }
            const task = taskForRole(liveRole, taskListRef.current);
            const text = String(instance.getDataAtCell(row, col) || '').trim();
            const user = describeRef.current(row, col)?.style;
            const dayCell = col >= FIXED_COLS && col < liveNote;
            if (task && (col === 0 || (dayCell && text))) {
              if (!user?.bg && task.bgColor) td.style.setProperty('background-color', task.bgColor, 'important');
              if (!user?.color && task.textColor) td.style.setProperty('color', task.textColor, 'important');
              if (!user?.bold) td.style.fontWeight = '700';
            }
            paintCell(td, user);
            return;
          }
          if (naturalWrap) td.classList.add('week-task');
          if (col >= FIXED_COLS && col < liveNote) {
            const val = instance.getDataAtCell(row, col);
            const color = findTaskColor(taskListRef.current, val, roomNamesRef.current);
            const user = describeRef.current(row, col)?.style;
            if (color && !user?.bg) td.style.setProperty('background-color', color.bg || '#1f2937', 'important');
            if (color && !user?.color) td.style.setProperty('color', color.text || '#111827', 'important');
            if (color && !user?.bold) td.style.fontWeight = '700';
          }
          paintCell(td, describeRef.current(row, col)?.style);
        };
        return cellProperties;
      },
      afterGetColHeader(col, TH, headerLevel) {
        if (col >= 0 && (col < FIXED_COLS || col === noteCol) && headerLevel === 0) {
          TH.classList.add('ht-span-label');
          const label = TH.textContent;
          TH.replaceChildren();
          const span = document.createElement('span');
          span.className = 'col-title';
          span.textContent = label;
          TH.appendChild(span);
        }
        if (col >= 0 && (col < FIXED_COLS || col === noteCol) && headerLevel === 1) {
          TH.classList.add('ht-span-gap');
          TH.textContent = '';
        }
        if (headerLevel === 0 && col >= FIXED_COLS && col < noteCol && (col - FIXED_COLS) % sessions.length === 0) {
          const day = days[Math.floor((col - FIXED_COLS) / sessions.length)];
          if (!day) return;
          TH.innerHTML = `<div class="day-head">${day.dayName} (${day.dateStr})</div>`;
        }
      },
      afterChange(changes, source) {
        if (readOnlyRef.current || source === 'loadData' || !changes) return;
        const meta = weekEditRef.current;
        changes.forEach(([row, col, oldVal, newVal]) => {
          if (oldVal === newVal) return;
          if (row >= meta.cathStart && row < meta.cathStart + meta.cathRoles.length) {
            const role = meta.cathRoles[row - meta.cathStart];
            if (!role) return;
            if (col === 0) {
              if (role.source === 'local') onCathRenameRef.current?.(role.key, newVal ?? '');
              return;
            }
            if (col >= FIXED_COLS && col < meta.noteCol) {
              const dayIdx = Math.floor((col - FIXED_COLS) / meta.sessions.length);
              const session = meta.sessions[(col - FIXED_COLS) % meta.sessions.length];
              onCathCellRef.current?.(meta.days[dayIdx]?.iso, role.key, session, newVal ?? '');
            }
            return;
          }
          if (row >= meta.doctorCount) return;
          if (col === meta.noteCol && oldVal !== newVal) {
            onNoteRef.current?.(meta.rowData[row][0], newVal ?? '');
            return;
          }
          if ((col === 1 || col === 2) && oldVal !== newVal) {
            const saved = onBalanceRef.current?.(meta.rowData[row][0], col === 1 ? 'bu' : 'phep', newVal);
            if (saved === false) this.setDataAtCell(row, col, oldVal ?? '', 'loadData');
          }
          if (col >= FIXED_COLS && col < meta.noteCol && oldVal !== newVal) {
            const shortName = meta.rowData[row][0];
            const dayIdx = Math.floor((col - FIXED_COLS) / meta.sessions.length);
            const session = meta.sessions[(col - FIXED_COLS) % meta.sessions.length];
            onUpdateRef.current?.(shortName, dayIdx, session, newVal ?? '');
          }
        });
      },
      afterColumnResize() {
        const widths = [];
        for (let index = 0; index < this.countCols(); index += 1) widths.push(this.getColWidth(index));
        weekSizeRef.current.manual = true;
        weekSizeRef.current.cols = widths;
        const meta = weekEditRef.current;
        const heights = measureWeekHeights(this.getData(), widths, { alertRow: meta.alertIndex, noteCol: meta.noteCol });
        const plugin = this.getPlugin('manualRowResize');
        if (!plugin?.setManualSize) return;
        let changed = false;
        heights.forEach((height, index) => {
          const kept = Math.max(height, weekSizeRef.current.rows?.[index] || 0);
          if (this.getRowHeight(index) === kept) return;
          plugin.setManualSize(index, kept);
          changed = true;
        });
        if (changed) this.render();
        requestAnimationFrame(() => syncWeekFrame(this));
      },
      afterRowResize() {
        const heights = [];
        for (let index = 0; index < this.countRows(); index += 1) heights.push(this.getRowHeight(index));
        weekSizeRef.current.rows = heights;
        requestAnimationFrame(() => syncWeekFrame(this));
      },
      afterViewRender() {
        if (this.__alignFrame) return;
        const hot = this;
        this.__alignFrame = requestAnimationFrame(() => {
          hot.__alignFrame = 0;
          alignFrozenPanes(hot);
        });
      },
      afterSelectionEnd() {
        bridge.current.hot = this;
        bridge.current.describe = (row, col) => describeRef.current(row, col);
        bridge.current.getSelectedEntries = () => selectedEntries(this, describeRef.current);
        bridge.current.getActiveEntry = () => activeEntry(this, describeRef.current);
        const entries = selectedEntries(this, describeRef.current);
        const entry = activeEntry(this, describeRef.current);
        // Stash for toolbar — mobile taps often clear HOT selection before format runs.
        bridge.current.lastEntries = entries;
        bridge.current.lastActive = entry;
        uiRef.current.onActiveStyle?.(entry?.style || null);
        const ctl = formatCtl.current;
        if (!ctl?.armed) return;
        const painted = ctl.style || {};
        ctl.armed = false;
        uiRef.current.onPaint?.(entries, painted);
      }
    });

    hotInstanceRef.current = hot;
    if (shownPlanRef.current === 'week') {
      bridge.current.hot = hot;
      bridge.current.describe = (row, col) => describeRef.current(row, col);
      bridge.current.getSelectedEntries = () => selectedEntries(hot, describeRef.current);
      bridge.current.getActiveEntry = () => activeEntry(hot, describeRef.current);
    }

    const detachDrop = attachPaletteDrop(hot);
    const stopFit = watchSheetViewport(hot, () => zoomRef.current / 100, { lockHeight: true });
    const frame = containerRef.current?.closest('.sheet-scroll');
    let fitFrame = 0;
    const refitColumns = () => {
      fitWeekColumns(hot, {
        viewport: frame?.clientWidth || 0,
        zoom: zoomRef.current / 100,
        noteCol: weekEditRef.current.noteCol,
        manual: weekSizeRef.current.manual
      });
    };
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(fitFrame);
      fitFrame = requestAnimationFrame(refitColumns);
    });
    if (frame) observer.observe(frame);
    const onFrameScroll = () => stickWeekFreeze(hot);
    frame?.addEventListener('scroll', onFrameScroll, { passive: true });
    requestAnimationFrame(() => {
      refitColumns();
      syncWeekFrame(hot);
    });
    const detachDrag = attachCellDragSwap(hot, {
      describe: (row, col) => describeRef.current(row, col),
      onPatchStyles: (prev, next) => {
        pushFormatUndo(hot, prev, next, (map) => patchRef.current(map));
      }
    });
    return () => {
      detachDrop();
      detachDrag();
      stopFit();
      cancelAnimationFrame(fitFrame);
      observer.disconnect();
      frame?.removeEventListener('scroll', onFrameScroll);
      if (bridge.current.hot === hot) {
        bridge.current.hot = null;
        bridge.current.describe = () => null;
        bridge.current.getSelectedEntries = () => [];
        bridge.current.getActiveEntry = () => null;
      }
      hot.destroy();
      hotInstanceRef.current = null;
    };
    // Rebuild only when columns, row count, or the week itself change.
    // Cell text is patched in place by the effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gridShape]);

  useEffect(() => {
    patchHotCells(hotInstanceRef.current, weekData);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paintKey]);

  useEffect(() => {
    if (plan !== 'week') return;
    stylesRef.current = scheduleData.cellStyles || {};
    hotInstanceRef.current?.render();
  }, [plan, scheduleData.cellStyles, taskList, readOnlyRef.current]);

  useEffect(() => {
    if (canSee(actor, plan)) return;
    const next = firstSheetPlan(actor);
    if (next) setPlan(next);
  }, [actor, plan]);

  useEffect(() => {
    const hot = hotInstanceRef.current;
    if (!hot) return undefined;
    if (plan !== 'week') {
      hot.suspendRender?.();
      return undefined;
    }
    hot.resumeRender?.();
    bridge.current.hot = hot;
    bridge.current.describe = (row, col) => describeRef.current(row, col);
    bridge.current.getSelectedEntries = () => selectedEntries(hot, describeRef.current);
    bridge.current.getActiveEntry = () => activeEntry(hot, describeRef.current);
    const id = requestAnimationFrame(() => {
      hot.refreshDimensions?.();
      applySheetZoom(hot, zoomRef.current / 100);
      fitWeekColumns(hot, {
        viewport: hot.rootElement?.closest('.sheet-scroll')?.clientWidth || 0,
        zoom: zoomRef.current / 100,
        noteCol: weekEditRef.current.noteCol,
        manual: weekSizeRef.current.manual
      });
      syncWeekFrame(hot);
      hot.render();
    });
    return () => cancelAnimationFrame(id);
  }, [plan, zoom]);

  const activeSheetMeta = sheets.find(s => s.id === activeSheetId);

  const buildExportPayload = () => ({
    deptName: dept?.name,
    sheetLabel: activeSheetMeta?.name || 'Lich tuan',
    staffList: weekStaff,
    days,
    sessions,
    grid,
    taskList,
    roomNames,
    alertRows,
    cathRows,
    weekMerges: scheduleData.weekMerges || [],
    cellStyles: scheduleData.cellStyles || {},
    roomTable: visibleRoomTable,
    freezeCols: scheduleData.freeze?.week?.cols,
    monthKey: activeMonth,
    monthGrid: scheduleData.monthGrid,
    monthRoles: visibleMonthRoles,
    columnOrder: scheduleData.monthColumnOrder,
    columnTitles: scheduleData.monthColumnTitles,
    daySessions: scheduleData.daySessions,
    monthMerges: scheduleData.monthMerges || []
  });

  const handleDownload = async (format) => {
    try {
      const payload = buildExportPayload();
      if (plan === 'week') {
        if (format === 'xlsx') {
          const { exportWeekScheduleToExcel } = await import('../services/scheduleExcelExport');
          await exportWeekScheduleToExcel(payload);
        } else if (format === 'pdf') {
          const { exportWeekScheduleToPdf } = await import('../services/schedulePdfExport');
          await exportWeekScheduleToPdf(payload);
        }
      } else if (plan === 'month') {
        if (format === 'xlsx') {
          const { exportMonthScheduleToExcel } = await import('../services/scheduleExcelExport');
          await exportMonthScheduleToExcel(payload);
        } else if (format === 'pdf') {
          const { exportMonthScheduleToPdf } = await import('../services/schedulePdfExport');
          await exportMonthScheduleToPdf(payload);
        }
      }
    } catch (error) {
      console.error('Download export failed:', error);
      window.alert('Không tải được file. Vui lòng thử lại.');
    }
  };

  const sheetPlans = [
    ['week', 'Lịch tuần'],
    ['month', 'Lịch tháng'],
    ['leave', 'Lịch nghỉ'],
    ['study', 'Lịch dạy học']
  ].filter(([id]) => canSee(actor, id));
  const activePlan = sheetPlans.some(([id]) => id === plan) ? plan : (sheetPlans[0]?.[0] || plan);
  shownPlanRef.current = activePlan;
  const planLocked = !canEdit(actor, activePlan);
  const bookLocked = !canEdit(actor, 'week') && !canEdit(actor, 'month');

  const openPlan = (id) => {
    setPlan(id);
    if (id !== 'week') setWarm(prev => (prev[id] ? prev : { ...prev, [id]: true }));
  };

  const saveMonthTask = (payload, linkedTask) => {
    if (linkedTask) {
      onAddMonthRole(linkedTask);
    } else {
      const task = { id: `task_${Date.now()}`, ...payload };
      onAddTask(task);
      onAddMonthRole(task);
    }
    setAddOpen(false);
  };

  return (
    <div className={`view-container ${painting ? 'is-painting' : ''}`}>
      <div className="view-header">
        <div className="view-header-row">
          <div className="view-header-title">
            <div className="plan-menu-bar" role="tablist" aria-label="Loại lịch">
              {sheetPlans.map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  className={`plan-menu-item ${activePlan === id ? 'active' : ''}`}
                  aria-selected={activePlan === id}
                  onClick={() => openPlan(id)}
                >
                  {label}
                </button>
              ))}
              {activePlan !== 'week' && (
                <span className="plan-menu-meta">
                  {formatMonthLabel(activePlan === 'month' ? shownMonth : calMonth)}
                </span>
              )}
            </div>
          </div>

          {activePlan === 'leave' && canEdit(actor, 'leave') && (
            <div className="leave-long-slot">
              <button type="button" className="action-btn" onClick={() => setLongNonce(value => value + 1)}>
                Nghỉ dài hạn
              </button>
            </div>
          )}
          {activePlan === 'study' && canEdit(actor, 'study') && (
            <div className="leave-long-slot">
              <button type="button" className="action-btn" onClick={() => setTeachNonce(value => value + 1)}>
                Dạy dài hạn
              </button>
            </div>
          )}

          {activePlan === 'week' ? (
            <div className="date-navigator plan-menu-bar" role="group" aria-label="Điều hướng tuần">
              <button type="button" className="plan-menu-item" onClick={() => onDateChange(-7)}>
                Tuần trước
              </button>
              <button type="button" className="plan-menu-item" onClick={onGoCurrentWeek}>
                Hiện tại
              </button>
              <button type="button" className="plan-menu-item" onClick={() => onDateChange(7)}>
                Tuần sau
              </button>
            </div>
          ) : activePlan === 'month' ? (
            <div className="date-navigator plan-menu-bar" role="group" aria-label="Điều hướng tháng">
              <button type="button" className="plan-menu-item" onClick={() => onMonthKeyChange(activeMonth, -1)}>
                Tháng trước
              </button>
              <button type="button" className="plan-menu-item" onClick={() => onMonthKeyChange(currentMonthKey(), 0)}>
                Hiện tại
              </button>
              <button type="button" className="plan-menu-item" onClick={() => onMonthKeyChange(activeMonth, 1)}>
                Tháng sau
              </button>
            </div>
          ) : (
            <div className="date-navigator plan-menu-bar" role="group" aria-label="Điều hướng tháng">
              <button type="button" className="plan-menu-item" onClick={() => setCalMonth(key => shiftMonthKey(key, -1))}>
                Tháng trước
              </button>
              <button type="button" className="plan-menu-item" onClick={() => setCalMonth(currentMonthKey())}>
                Hiện tại
              </button>
              <button type="button" className="plan-menu-item" onClick={() => setCalMonth(key => shiftMonthKey(key, 1))}>
                Tháng sau
              </button>
            </div>
          )}
        </div>

        {(activePlan === 'week' || activePlan === 'month') && (
          <SheetToolbar
            bridge={bridge}
            patchRef={patchRef}
            formatCtl={formatCtl}
            painting={painting}
            setPainting={setPainting}
            zoom={zoom}
            onZoom={setZoom}
            onActiveStyle={setActiveStyle}
            daySessions={scheduleData.daySessions}
            onFreeze={(patch) => onFreeze?.(activePlan === 'month' ? 'month' : 'week', patch)}
            onAutoSchedule={activePlan === 'week' && canEdit(actor, 'week') ? onAutoSchedule : undefined}
            onDaySessions={canEdit(actor, activePlan) ? onDaySessions : undefined}
            onDownload={handleDownload}
            locked={planLocked}
            groupFilter={activePlan === 'month' ? {
              groups: monthFilterGroups,
              selected: monthGroupKeys,
              onToggle: toggleMonthGroup,
              onReset: () => setMonthGroupKeys(null)
            } : null}
          />
        )}
      </div>

      {(warm.leave || activePlan === 'leave') && (
        <DayCalendar
          mode="leave"
          hidden={activePlan !== 'leave'}
          monthKey={calMonth}
          entries={leaveEntries}
          staffList={staffList}
          onSave={planLocked || activePlan !== 'leave' ? undefined : onSaveLeave}
          onDelete={planLocked || activePlan !== 'leave' ? undefined : onDeleteLeave}
          longNonce={activePlan === 'leave' && !planLocked ? longNonce : 0}
          readOnly={planLocked || activePlan !== 'leave'}
        />
      )}
      {(warm.study || activePlan === 'study') && (
        <DayCalendar
          mode="study"
          hidden={activePlan !== 'study'}
          monthKey={calMonth}
          entries={studyEntries}
          staffList={staffList}
          taskList={taskList}
          onSave={planLocked || activePlan !== 'study' ? undefined : onSaveStudy}
          onDelete={planLocked || activePlan !== 'study' ? undefined : onDeleteStudy}
          longNonce={activePlan === 'study' && !planLocked ? teachNonce : 0}
          readOnly={planLocked || activePlan !== 'study'}
        />
      )}
      <div className={`sheet-scroll${activePlan === 'week' ? ' is-open' : ''}`}>
      <div className="sheet-workbook" hidden={activePlan !== 'week' && activePlan !== 'month'}>
        <div className="sheet-zoom">
          <div ref={containerRef} className={`sheet-grid-host${activePlan === 'week' ? '' : ' is-parked'}`} />
          {(warm.month || activePlan === 'month') && (
            <MonthSheet
              visible={activePlan === 'month'}
              monthKey={activeMonth}
              monthGrid={scheduleData.monthGrid}
              roles={visibleMonthRoles}
              columnOrder={scheduleData.monthColumnOrder}
              columnTitles={scheduleData.monthColumnTitles}
              daySessions={scheduleData.daySessions}
              monthMerges={scheduleData.monthMerges}
              cellStyles={scheduleData.cellStyles}
              bridge={bridge}
              formatCtl={formatCtl}
              uiRef={uiRef}
              onUpdateCell={activePlan === 'month' && !planLocked ? onUpdateMonthCell : undefined}
              onRequestAdd={activePlan === 'month' && !planLocked ? () => setAddOpen(true) : undefined}
              readOnly={activePlan !== 'month' || planLocked}
              onDeleteRole={onDeleteMonthRole}
              onInsertRole={onInsertMonthRole}
              onRenameRole={onRenameMonthRole}
              onInsertColumn={onInsertMonthColumn}
              onRemoveColumn={onRemoveMonthColumn}
              onRenameColumn={onRenameMonthColumn}
              onUpdateCustomCell={onUpdateMonthCustomCell}
              onMerges={onMonthMerges}
              taskList={taskList}
              freezeRows={Number(scheduleData.freeze?.month?.rows) || 0}
              freezeCols={scheduleData.freeze?.month?.cols}
              zoom={zoom}
            />
          )}
        </div>
        <SheetTabs
          sheets={sheets.map(sheet => ({
            ...sheet,
            label: `Tuần từ: ${buildWeekDays(sheet.startDate)[0]?.dateStr} đến ${buildWeekDays(sheet.startDate)[6]?.dateStr}`
          }))}
          activeSheetId={activeSheetId}
          onSelect={onSelectSheet}
          onAdd={onAddSheet}
          onRename={onRenameSheet}
          onDuplicate={onDuplicateSheet}
          onDelete={onDeleteSheet}
          onMove={onMoveSheet}
          onSetColor={onColorSheet}
          locked={bookLocked}
        />
      </div>

      <div className="room-assignments-container" hidden={activePlan !== 'week'}>
        <div className="room-title">Phân công bệnh phòng</div>
        {(roomTable?.matrix?.[0]?.length || 0) > 3 && (
          <div className="room-hint">Vuốt ngang bảng để xem đủ bác sĩ / phòng.</div>
        )}
        <RoomSheet
          active={activePlan === 'week'}
          table={roomTable}
          grid={grid}
          staffList={staffList}
          hiddenDoctors={hiddenRoomDoctors}
          taskList={taskList}
          cellStyles={scheduleData.cellStyles}
          bridge={bridge}
          formatCtl={formatCtl}
          uiRef={uiRef}
          onChange={readOnlyRef.current ? undefined : onUpdateRooms}
          readOnly={!canEdit(actor, 'week')}
        />
      </div>
      </div>

      {addOpen && (
        <TaskEditorModal
          title="Thêm Nghiệp Vụ / Task Mới"
          hint="Task mới được thêm vào cuối mọi khối tuần và vào danh mục task của khoa. Gõ để chọn task đã có (ký hiệu và tên)."
          submitLabel="Lưu Task"
          taskList={taskList}
          categories={categories}
          staffList={staffList}
          onClose={() => setAddOpen(false)}
          onSave={saveMonthTask}
          onAddCategory={onAddCategory}
          onDeleteCategory={onDeleteCategory}
        />
      )}
    </div>
  );
}
