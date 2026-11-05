import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  buildMonthTable, customCellKey, monthOfVisibleRows, resolveMonthRoles, sessionLabel
} from '../logic/monthSchedule';
import { activeEntry, paintCell, selectedEntries, taskLabelStyle, taskLabelStyleKey } from '../logic/cellFormat';
import { roleShortLabel, taskForRole } from '../logic/taskMatch';
import { rectSelectionHooks } from '../logic/rectSelection';
import { combineMerges, mergeMenuItems, userMerges } from '../logic/merges';
import { attachPaletteDrop } from '../logic/paletteDrop';
import { patchHotCells, revealSheet, watchSheetViewport } from '../logic/sheetViewport';
import { useConfirm } from './ConfirmDialog';

const MONTH_PANE_REV = 7;

function pinMonthColumns(hot) {
  const root = hot?.rootElement;
  if (!root) return;
  const freeze = Number(hot.getSettings().fixedColumnsStart) || 0;
  const pin = freeze + 1;
  const rows = root.querySelectorAll('.ht_master .htCore tr, .ht_clone_top .htCore tr');
  if (!rows.length || pin <= 0) return;
  const sample = root.querySelector('.ht_master .htCore tbody tr');
  const sig = sample ? [...sample.children].map(cell => cell.offsetWidth).join(',') : '';
  let missing = false;
  rows.forEach((row) => {
    const cell = row.children[1] || row.children[0];
    if (cell && !cell.classList.contains('month-pin')) missing = true;
  });
  if (!missing && sig && root.__pinSig === sig) return;
  root.__pinSig = sig;
  rows.forEach((row) => {
    let left = 0;
    [...row.children].forEach((cell, index) => {
      const width = cell.offsetWidth;
      if (index < pin) {
        cell.classList.add('month-pin');
        cell.style.left = `${left}px`;
      } else if (cell.classList.contains('month-pin')) {
        cell.classList.remove('month-pin');
        cell.style.left = '';
      }
      left += width;
    });
  });
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[ch]));
}

function safeColor(value, fallback) {
  const color = String(value || '').trim();
  return /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(color) ? color : fallback;
}

function createTaskSuggest(taskListRef) {
  let box = null;
  let items = [];
  let active = 0;
  let editor = null;
  let inputEl = null;
  let onInput = null;

  const hide = () => {
    box?.remove();
    box = null;
    items = [];
    active = 0;
  };

  const detachInput = () => {
    if (inputEl && onInput) inputEl.removeEventListener('input', onInput);
    inputEl = null;
    onInput = null;
  };

  const close = () => {
    hide();
    detachInput();
    editor = null;
  };

  const paint = () => {
    if (!box) return;
    box.innerHTML = items.map((task, index) => (
      `<button type="button" class="task-cell-suggest-item${index === active ? ' active' : ''}" data-index="${index}">
        <span class="task-cell-suggest-code" style="background:${safeColor(task.bgColor, '#e5e7eb')};color:${safeColor(task.textColor, '#111827')}">${escapeHtml(task.code)}</span>
        <span>${escapeHtml(task.name)}</span>
      </button>`
    )).join('');
  };

  const place = () => {
    const input = editor?.TEXTAREA;
    if (!box || !input) return;
    const rect = input.getBoundingClientRect();
    const width = Math.max(rect.width, 280);
    box.style.width = `${width}px`;
    box.style.left = `${Math.max(8, Math.min(rect.left, window.innerWidth - width - 8))}px`;
    const below = rect.bottom + 4;
    const height = Math.min(260, box.scrollHeight);
    box.style.top = `${below + height > window.innerHeight - 8 ? Math.max(8, rect.top - height - 4) : below}px`;
  };

  const render = (query) => {
    const q = String(query || '').trim().toLowerCase();
    items = q
      ? (taskListRef.current || []).filter(task =>
        String(task.code || '').toLowerCase().includes(q) || String(task.name || '').toLowerCase().includes(q)
      ).slice(0, 8)
      : [];
    active = 0;
    if (!items.length) {
      hide();
      return;
    }
    if (!box) {
      box = document.createElement('div');
      box.className = 'task-cell-suggest';
      box.addEventListener('mousedown', (event) => {
        event.preventDefault();
        const button = event.target.closest('[data-index]');
        if (!button) return;
        active = Number(button.dataset.index);
        pick();
      });
      document.body.appendChild(box);
    }
    paint();
    place();
  };

  return {
    isOpen: () => !!box,
    close,
    attach(hot) {
      detachInput();
      editor = hot.getActiveEditor();
      inputEl = editor?.TEXTAREA || null;
      if (!inputEl) return;
      onInput = () => render(inputEl.value);
      inputEl.addEventListener('input', onInput);
      inputEl.addEventListener('blur', () => setTimeout(close, 0), { once: true });
      const holder = hot.rootElement?.querySelector('.ht_master .wtHolder');
      if (holder && !holder.dataset.taskSuggestScroll) {
        holder.dataset.taskSuggestScroll = '1';
        holder.addEventListener('scroll', () => close(), { passive: true });
      }
      render(inputEl.value);
    },
    move(step) {
      if (!items.length) return;
      active = (active + step + items.length) % items.length;
      paint();
      box?.querySelector('.active')?.scrollIntoView({ block: 'nearest' });
    },
    pick() {
      const task = items[active];
      const current = editor;
      if (!task || !current) return false;
      current.setValue(task.code);
      close();
      current.finishEditing(false);
      return true;
    }
  };
}

export function MonthSheet({
  monthKey,
  monthGrid,
  roles,
  columnOrder,
  columnTitles,
  daySessions,
  monthMerges,
  cellStyles,
  bridge,
  formatCtl,
  uiRef,
  onUpdateCell,
  onRequestAdd,
  onDeleteRole,
  onInsertRole,
  onRenameRole,
  onInsertColumn,
  onRemoveColumn,
  onRenameColumn,
  onUpdateCustomCell,
  onMerges,
  taskList,
  freezeRows = 0,
  freezeCols = null,
  zoom = 100,
  readOnly = false,
  visible = true
}) {
  const containerRef = useRef(null);
  const hotRef = useRef(null);
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;
  const visibleRef = useRef(visible);
  visibleRef.current = visible;
  const paintFrame = useRef(0);
  const paintMeasure = useRef(false);
  const paintMonth = (measure) => {
    if (measure) paintMeasure.current = true;
    cancelAnimationFrame(paintFrame.current);
    paintFrame.current = requestAnimationFrame(() => {
      const hot = hotRef.current;
      const shouldMeasure = paintMeasure.current;
      paintMeasure.current = false;
      if (!hot || !visibleRef.current) return;
      if (shouldMeasure) {
        hot.refreshDimensions?.();
        revealSheet(hot, zoomRef.current / 100);
      }
      hot.render();
    });
  };
  const readOnlyRef = useRef(!!readOnly);
  readOnlyRef.current = !!readOnly;
  const metaRef = useRef([]);
  const stylesRef = useRef({});
  const describeRef = useRef(() => null);
  const onUpdateRef = useRef(onUpdateCell);
  const onAddRef = useRef(onRequestAdd);
  const onDeleteRef = useRef(onDeleteRole);
  const onInsertRef = useRef(onInsertRole);
  const onRenameRef = useRef(onRenameRole);
  const rolesRef = useRef([]);
  const taskListRef = useRef(taskList || []);
  const columnsRef = useRef([]);
  const widthByKeyRef = useRef({});
  const viewRef = useRef({ top: 0, left: 0, row: null, col: null, nav: null });
  const onInsertColumnRef = useRef(onInsertColumn);
  const onRemoveColumnRef = useRef(onRemoveColumn);
  const onRenameColumnRef = useRef(onRenameColumn);
  const onCustomRef = useRef(onUpdateCustomCell);
  const onMergesRef = useRef(onMerges);
  const mergesRef = useRef(monthMerges || []);
  const structuralRef = useRef([]);
  const freezeRef = useRef({ rows: 0, cols: null });
  freezeRef.current = { rows: Number(freezeRows) || 0, cols: freezeCols };
  const [confirm, confirmDialog] = useConfirm();
  const [colEdit, setColEdit] = useState(null);
  const confirmRef = useRef(confirm);
  confirmRef.current = confirm;
  onUpdateRef.current = onUpdateCell;
  onAddRef.current = onRequestAdd;
  onDeleteRef.current = onDeleteRole;
  onInsertRef.current = onInsertRole;
  onRenameRef.current = onRenameRole;
  onInsertColumnRef.current = onInsertColumn;
  onRemoveColumnRef.current = onRemoveColumn;
  onRenameColumnRef.current = onRenameColumn;
  onCustomRef.current = onUpdateCustomCell;
  onMergesRef.current = onMerges;
  mergesRef.current = monthMerges || [];
  taskListRef.current = taskList || [];

  const taskRoles = useMemo(() => resolveMonthRoles(roles), [roles]);
  rolesRef.current = taskRoles;
  const model = useMemo(
    () => buildMonthTable(monthKey, monthGrid || {}, taskRoles, columnOrder, columnTitles, daySessions),
    [monthKey, monthGrid, taskRoles, columnOrder, columnTitles, daySessions]
  );
  structuralRef.current = model.mergeCells;
  const columns = model.columns;
  columnsRef.current = columns;
  const taskCol = columns.findIndex(column => column.kind === 'task');
  metaRef.current = model.meta;
  stylesRef.current = cellStyles || {};
  const rowData = useMemo(() => model.rows.map((row, index) => {
    const info = model.meta[index];
    if (info?.type !== 'role' || taskCol < 0) return row;
    const short = roleShortLabel(info.role, taskList || []);
    if (short === row[taskCol]) return row;
    const next = row.slice();
    next[taskCol] = short;
    return next;
  }), [model, taskCol, taskList]);
  const structureKey = useMemo(() => JSON.stringify({
    columns: columns.map(column => `${column.key}:${column.title}`),
    roles: taskRoles.map(role => role.key),
    monthKey,
    weeks: model.meta.filter(item => item.type === 'weekhead').map(item => item.weekStart),
    sessions: daySessions || ['S', 'C']
  }), [columns, taskRoles, monthKey, model, daySessions]);
  const valueKey = useMemo(() => JSON.stringify(rowData), [rowData]);

  const columnAt = (col) => columnsRef.current[col] || null;

  const isEditable = (row, col) => {
    if (readOnlyRef.current) return false;
    const info = metaRef.current[row];
    const column = columnAt(col);
    if (!info || !column || column.kind === 'del') return false;
    if (info.type === 'weekhead') return column.kind === 'custom';
    return column.kind === 'task' || column.kind === 'day' || column.kind === 'custom';
  };

  describeRef.current = (row, col) => {
    const info = metaRef.current[row];
    const column = columnAt(col);
    if (!info || !column) return null;
    if (column.kind === 'task' && info.type === 'role') {
      return {
        key: taskLabelStyleKey(info.role.key),
        style: taskLabelStyle(stylesRef.current, info.role.key)
      };
    }
    if (column.kind === 'custom') {
      const slot = info.type === 'role' ? info.role.key : 'head';
      const key = `m|${customCellKey(column.id, info.weekStart, slot)}`;
      return { key, style: stylesRef.current[key] || null };
    }
    if (column.kind !== 'day' || info.type !== 'role') return null;
    const day = info.days[column.dayIndex];
    if (!day) return null;
    const key = `m|${day.iso}|${info.role.key}|${column.session}`;
    return { key, style: stylesRef.current[key] || null };
  };

  useEffect(() => {
    if (!containerRef.current || !window.Handsontable) return undefined;

    if (hotRef.current) {
      const previous = hotRef.current;
      const holder = previous.rootElement?.querySelector('.ht_master .wtHolder');
      if (holder) {
        viewRef.current.top = holder.scrollTop;
        viewRef.current.left = holder.scrollLeft;
      }
      const selected = previous.getSelectedLast();
      if (selected) {
        viewRef.current.row = selected[0];
        viewRef.current.col = selected[1];
      }
      columnsRef.current.forEach((column, index) => {
        widthByKeyRef.current[column.key] = previous.getColWidth(index);
      });
      previous.destroy();
      hotRef.current = null;
    }

    const colWidths = columns.map((column) => {
      const saved = widthByKeyRef.current[column.key];
      if (saved) return saved;
      if (column.kind === 'del') return 42;
      if (column.kind === 'task') return 180;
      return column.kind === 'custom' ? 120 : 72;
    });
    const topHeaders = [];
    const subHeaders = [];
    for (let index = 0; index < columns.length; index += 1) {
      const column = columns[index];
      if (column.kind === 'day') {
        let span = 1;
        while (
          columns[index + span]?.kind === 'day'
          && columns[index + span].dayIndex === column.dayIndex
        ) span += 1;
        topHeaders.push(span > 1 ? { label: column.title, colspan: span } : column.title);
        for (let offset = 0; offset < span; offset += 1) subHeaders.push(sessionLabel(columns[index + offset].session));
        index += span - 1;
      } else if (column.kind === 'custom') {
        topHeaders.push(column.title || 'Cột mới');
        subHeaders.push('');
      } else if (column.kind === 'task') {
        topHeaders.push('Nhiệm vụ');
        subHeaders.push('');
      } else {
        topHeaders.push('');
        subHeaders.push('');
      }
    }
    const meta = metaRef.current;
    const frozen = Math.max(1, columns.findIndex(column => column.kind === 'day'));

    const askDelete = async (role) => {
      const ok = await confirmRef.current({
        title: 'Xóa nhiệm vụ',
        message: `Xóa "${role.label}" khỏi tất cả các tuần trong tháng?`,
        confirmText: 'Xóa',
        cancelText: 'Hủy',
        variant: 'danger'
      });
      if (ok) onDeleteRef.current(role.key);
    };

    const taskSuggest = createTaskSuggest(taskListRef);

    const rectHooks = rectSelectionHooks();
    const { afterOnCellMouseDown: trackRect, ...restRect } = rectHooks;

    const hot = new window.Handsontable(containerRef.current, {
      data: rowData,
      nestedHeaders: [topHeaders, subHeaders],
      rowHeaders: true,
      height: 560,
      width: '100%',
      licenseKey: 'non-commercial-and-evaluation',
      stretchH: 'last',
      manualColumnResize: true,
      manualRowResize: true,
      contextMenu: {
        items: {
          insert_above: {
            name: 'Insert row above',
            disabled() {
              return !!readOnlyRef.current;
            },
            callback(_key, selection) {
              if (readOnlyRef.current) return;
              const row = selection?.[0]?.start?.row ?? this.getSelectedLast()?.[0];
              if (row == null) return;
              const info = metaRef.current[row];
              const list = rolesRef.current;
              const index = info?.type === 'role'
                ? Math.max(0, list.findIndex(role => role.key === info.role.key))
                : 0;
              onInsertRef.current?.(index);
            }
          },
          insert_below: {
            name: 'Insert row below',
            disabled() {
              return !!readOnlyRef.current;
            },
            callback(_key, selection) {
              if (readOnlyRef.current) return;
              const row = selection?.[0]?.start?.row ?? this.getSelectedLast()?.[0];
              if (row == null) return;
              const info = metaRef.current[row];
              const list = rolesRef.current;
              const found = info?.type === 'role' ? list.findIndex(role => role.key === info.role.key) : -1;
              onInsertRef.current?.(found < 0 ? 0 : found + 1);
            }
          },
          remove_row: {
            name: 'Remove row',
            disabled() {
              if (readOnlyRef.current) return true;
              const sel = this.getSelectedLast();
              const info = sel ? metaRef.current[sel[0]] : null;
              return info?.type !== 'role';
            },
            callback(_key, selection) {
              if (readOnlyRef.current) return;
              const row = selection?.[0]?.start?.row ?? this.getSelectedLast()?.[0];
              const info = row == null ? null : metaRef.current[row];
              if (info?.type === 'role') askDelete(info.role);
            }
          },
          hsep1: '---------',
          col_left: {
            name: 'Insert column left',
            disabled() {
              return !!readOnlyRef.current;
            },
            callback(_key, selection) {
              if (readOnlyRef.current) return;
              const col = selection?.[0]?.start?.col ?? this.getSelectedLast()?.[1];
              if (col == null) return;
              onInsertColumnRef.current?.(col, 'left');
            }
          },
          col_right: {
            name: 'Insert column right',
            disabled() {
              return !!readOnlyRef.current;
            },
            callback(_key, selection) {
              if (readOnlyRef.current) return;
              const col = selection?.[0]?.start?.col ?? this.getSelectedLast()?.[1];
              if (col == null) return;
              onInsertColumnRef.current?.(col, 'right');
            }
          },
          rename_col: {
            name: 'Đổi tên cột',
            disabled() {
              if (readOnlyRef.current) return true;
              const sel = this.getSelectedLast();
              const column = sel ? columnAt(sel[1]) : null;
              return column?.kind !== 'custom';
            },
            callback(_key, selection) {
              if (readOnlyRef.current) return;
              const col = selection?.[0]?.start?.col ?? this.getSelectedLast()?.[1];
              if (col == null) return;
              const header = this.getCell(-1, col) || this.getCell(0, col);
              const rect = header?.getBoundingClientRect();
              const column = columnAt(col);
              if (!rect || column?.kind !== 'custom') return;
              setColEdit({
                key: column.key,
                value: column.title || '',
                top: rect.top,
                left: rect.left,
                width: Math.max(rect.width, 140),
                height: Math.max(rect.height, 28)
              });
            }
          },
          remove_col: {
            name: 'Remove column',
            disabled() {
              if (readOnlyRef.current) return true;
              const sel = this.getSelectedLast();
              const column = sel ? columnAt(sel[1]) : null;
              return column?.kind !== 'custom';
            },
            callback(_key, selection) {
              if (readOnlyRef.current) return;
              const col = selection?.[0]?.start?.col ?? this.getSelectedLast()?.[1];
              const column = col == null ? null : columnAt(col);
              if (column?.kind === 'custom') onRemoveColumnRef.current?.(column.key);
            }
          },
          hsep_merge: '---------',
          ...mergeMenuItems((hot) => {
            if (readOnlyRef.current) return;
            const next = userMerges(hot, structuralRef.current);
            if (JSON.stringify(next) === JSON.stringify(mergesRef.current)) return;
            mergesRef.current = next;
            onMergesRef.current?.(next);
          }),
          hsep2: '---------',
          undo: {},
          redo: {},
          hsep3: '---------',
          copy: {},
          cut: {}
        }
      },
      copyPaste: true,
      undo: true,
      selectionMode: 'multiple',
      fillHandle: true,
      outsideClickDeselects: false,
      enterMoves(event) {
        const selected = this.getSelectedLast();
        if (!selected) return { row: 1, col: 0 };
        const dir = event?.shiftKey ? -1 : 1;
        let row = selected[0];
        const col = selected[1];
        for (let guard = 0; guard < this.countRows(); guard += 1) {
          row += dir;
          if (row < 0 || row >= this.countRows()) return { row: 0, col: 0 };
          if (isEditable(row, col)) return { row: row - selected[0], col: 0 };
        }
        return { row: 0, col: 0 };
      },
      tabMoves(event) {
        const selected = this.getSelectedLast();
        if (!selected) return { row: 0, col: 1 };
        const dir = event?.shiftKey ? -1 : 1;
        const row = selected[0];
        let col = selected[1];
        for (let guard = 0; guard < this.countCols(); guard += 1) {
          col += dir;
          if (col < 0 || col >= this.countCols()) return { row: 0, col: 0 };
          if (isEditable(row, col)) return { row: 0, col: col - selected[1] };
        }
        return { row: 0, col: 0 };
      },
      fixedRowsTop: freezeRef.current.rows,
      fixedColumnsStart: freezeRef.current.cols == null ? frozen : Number(freezeRef.current.cols) || 0,
      wordWrap: false,
      autoRowSize: false,
      renderAllColumns: true,
      viewportRowRenderingOffset: 8,
      colWidths,
      autoColumnSize: false,
      afterColumnResize(_size, column) {
        const spec = columnAt(column);
        if (spec) widthByKeyRef.current[spec.key] = this.getColWidth(column);
      },
      rowHeights: meta.map(item => (item.type === 'weekhead' ? 32 : 28)),
      mergeCells: combineMerges(model.mergeCells, mergesRef.current),
      ...restRect,
      cells(row, col) {
        const props = {};
        const desc = describeRef.current(row, col);
        props.readOnly = !isEditable(row, col);
        if (desc?.style?.wrap === 'wrap') props.wordWrap = true;
        else if (desc) props.wordWrap = false;
        props.renderer = function monthRenderer(instance, td) {
          window.Handsontable.renderers.TextRenderer.apply(this, arguments);
          td.style.removeProperty('background-color');
          td.style.removeProperty('color');
          td.style.fontWeight = '';
          const rowInfo = metaRef.current[row];
          const spec = columnAt(col);
          td.classList.remove('month-weekhead', 'month-role', 'month-outside', 'month-del');
          if (!rowInfo || !spec) return;

          if (rowInfo.type === 'weekhead') {
            td.classList.add('month-weekhead');
            if (spec.kind === 'day') {
              const day = rowInfo.days[spec.dayIndex];
              if (day && !day.inMonth) td.classList.add('month-outside');
            }
            paintCell(td, describeRef.current(row, col)?.style);
            return;
          }

          if (spec.kind === 'del') {
            td.classList.add('month-del');
            if (readOnlyRef.current) {
              td.innerHTML = '';
              return;
            }
            td.innerHTML = '<button type="button" class="month-del-btn" title="Xóa nhiệm vụ">×</button>';
            const button = td.querySelector('button');
            button.addEventListener('mousedown', (event) => {
              event.preventDefault();
              event.stopPropagation();
            });
            button.addEventListener('click', (event) => {
              event.preventDefault();
              event.stopPropagation();
              askDelete(rowInfo.role);
            });
            return;
          }

          if (spec.kind === 'task') td.classList.add('month-role');
          const task = taskForRole(rowInfo.role, taskListRef.current);
          const value = String(instance.getDataAtCell(row, col) || '').trim();
          const cell = describeRef.current(row, col);
          const labelStyle = taskLabelStyle(stylesRef.current, rowInfo.role.key);
          const rowBg = labelStyle?.bg || task?.bgColor;
          const rowColor = labelStyle?.color || task?.textColor;
          if (spec.kind === 'day') {
            const day = rowInfo.days[spec.dayIndex];
            if (day && !day.inMonth) td.classList.add('month-outside');
            if (value && rowBg && !cell?.style?.bg) {
              td.style.setProperty('background-color', rowBg, 'important');
              td.style.fontWeight = '700';
            }
            if (value && rowColor && !cell?.style?.color) {
              td.style.setProperty('color', rowColor, 'important');
            }
          }
          if (spec.kind === 'task' && task && !cell?.style?.bg) {
            td.style.setProperty('background-color', task.bgColor, 'important');
            td.style.setProperty('color', task.textColor || '#111827', 'important');
            td.style.fontWeight = '700';
          }
          paintCell(td, cell?.style);
        };
        return props;
      },
      afterGetColHeader(col, TH, headerLevel) {
        const spec = columnAt(col);
        const spanned = spec && spec.kind !== 'day';
        TH.rowSpan = 1;
        TH.style.display = '';
        TH.classList.remove('ht-span-label', 'ht-span-gap', 'ht-frozen-head');
        if (spanned && headerLevel === 0) TH.classList.add('ht-span-label');
        if (spanned && headerLevel === 1) {
          TH.classList.add('ht-span-gap');
          TH.textContent = '\u00a0';
        }
        if (spec?.kind === 'del' && headerLevel === 0) TH.innerHTML = '';
        if (spanned && headerLevel === 0 && spec?.kind !== 'task' && spec?.kind !== 'del') {
          const label = TH.textContent;
          TH.replaceChildren();
          const span = document.createElement('span');
          span.className = 'col-title';
          span.textContent = label;
          TH.appendChild(span);
        }
        if (spec?.kind === 'task' && headerLevel === 0) {
          if (readOnlyRef.current) {
            TH.innerHTML = '<div class="col-title month-task-head"><span>Nhiệm vụ</span></div>';
            return;
          }
          TH.innerHTML = '<div class="col-title month-task-head"><span>Nhiệm vụ</span><button type="button" class="month-add-task" title="Thêm nhiệm vụ">+</button></div>';
          const button = TH.querySelector('button');
          button.addEventListener('mousedown', (event) => {
            event.preventDefault();
            event.stopPropagation();
          });
          button.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            onAddRef.current();
          });
        }
      },
      afterOnCellMouseDown(event, coords) {
        trackRect.call(this, event, coords);
        viewRef.current.nav = null;
        if (readOnlyRef.current) return;
        if (event.button !== 0 || coords.row >= 0 || event.detail < 2) return;
        const spec = columnAt(coords.col);
        if (spec?.kind !== 'custom') return;
        const element = event.target?.nodeType === 1 ? event.target : event.target?.parentElement;
        const header = element?.closest?.('th') || this.getCell(0, coords.col);
        const rect = header?.getBoundingClientRect();
        if (!rect) return;
        setColEdit({
          key: spec.key,
          value: spec.title || '',
          top: rect.top,
          left: rect.left,
          width: Math.max(rect.width, 140),
          height: Math.max(rect.height, 28)
        });
      },
      afterBeginEditing(row, col) {
        taskSuggest.close();
        const info = metaRef.current[row];
        if (columnAt(col)?.kind !== 'task' || info?.type !== 'role') return;
        setTimeout(() => taskSuggest.attach(this), 0);
      },
      beforeKeyDown(event) {
        if (event.key === 'Escape') viewRef.current.nav = null;
        if (!taskSuggest.isOpen()) return;
        if (event.key === 'ArrowDown') {
          taskSuggest.move(1);
          event.preventDefault();
          event.stopImmediatePropagation();
        } else if (event.key === 'ArrowUp') {
          taskSuggest.move(-1);
          event.preventDefault();
          event.stopImmediatePropagation();
        } else if (event.key === 'Enter' || event.key === 'Tab') {
          if (taskSuggest.pick()) {
            event.preventDefault();
            event.stopImmediatePropagation();
          }
        } else if (event.key === 'Escape') {
          taskSuggest.close();
          event.preventDefault();
          event.stopImmediatePropagation();
        }
      },
      afterChange(changes, source) {
        if (readOnlyRef.current || source === 'loadData' || source === 'syncRole' || !changes) return;
        changes.forEach(([row, col, oldVal, newVal]) => {
          if (oldVal === newVal) return;
          const info = metaRef.current[row];
          const spec = columnAt(col);
          if (!info || !spec) return;
          if (spec.kind === 'task' && info.type === 'role') {
            const label = String(newVal ?? '');
            onRenameRef.current(info.role.key, label);
            const taskIndex = columnsRef.current.findIndex(column => column.kind === 'task');
            const updates = [];
            metaRef.current.forEach((item, index) => {
              if (item?.type !== 'role' || item.role.key !== info.role.key || taskIndex < 0) return;
              if (String(this.getDataAtCell(index, taskIndex) ?? '') === label) return;
              updates.push([index, taskIndex, label]);
            });
            if (updates.length) this.setDataAtCell(updates, 'syncRole');
            return;
          }
          if (spec.kind === 'day' && info.type === 'role') {
            const day = info.days[spec.dayIndex];
            if (!day) return;
            onUpdateRef.current(day.iso, info.role.key, spec.session, newVal ?? '');
            return;
          }
          if (spec.kind === 'custom') {
            const slot = info.type === 'role' ? info.role.key : 'head';
            onCustomRef.current?.(spec.id, info.weekStart, slot, newVal ?? '');
          }
        });
      },
      afterSelectionEnd() {
        const entry = activeEntry(this, describeRef.current);
        uiRef.current.onActiveStyle?.(entry?.style || null);
        const ctl = formatCtl.current;
        if (!ctl?.armed) return;
        const entries = selectedEntries(this, describeRef.current);
        const painted = ctl.style || {};
        ctl.armed = false;
        uiRef.current.onPaint?.(entries, painted);
      },
      afterViewRender() {
        pinMonthColumns(this);
      },
      afterRender() {
        pinMonthColumns(this);
        const holder = this.rootElement?.querySelector('.ht_master .wtHolder');
        if (holder && !holder.dataset.monthScroll) {
          holder.dataset.monthScroll = '1';
          holder.addEventListener('scroll', () => {
            viewRef.current.top = holder.scrollTop;
            viewRef.current.left = holder.scrollLeft;
            reportMonth(this);
          }, { passive: true });
        }
        if (holder && !holder.dataset.monthPlaced) {
          holder.dataset.monthPlaced = '1';
          const top = viewRef.current.top || 0;
          const left = viewRef.current.left || 0;
          const row = viewRef.current.row;
          const col = viewRef.current.col;
          const place = () => {
            if (!holder.isConnected) return;
            if (Math.abs(holder.scrollTop - top) > 1) holder.scrollTop = top;
            if (Math.abs(holder.scrollLeft - left) > 1) holder.scrollLeft = left;
            if (row != null && col != null && row < this.countRows() && col < this.countCols()) {
              const selected = this.getSelectedLast();
              if (!selected) this.selectCell(row, col, row, col, false);
            }
          };
          place();
          requestAnimationFrame(place);
        }
        reportMonth(this);
      }
    });

    function reportMonth(instance) {
      const holder = instance.rootElement?.querySelector('.ht_master .wtHolder');
      const body = instance.rootElement?.querySelector('.ht_master .htCore tbody');
      if (!holder || !body) return;
      const box = holder.getBoundingClientRect();
      const visible = [];
      body.querySelectorAll('tr').forEach((tr) => {
        const rect = tr.getBoundingClientRect();
        if (rect.bottom < box.top + 2 || rect.top > box.bottom - 2) return;
        const td = tr.querySelector('td');
        if (!td) return;
        const coords = instance.getCoords(td);
        if (coords && coords.row >= 0) visible.push(coords.row);
      });
      const key = monthOfVisibleRows(metaRef.current, visible);
      if (key) uiRef.current.onVisibleMonth?.(key);
    }

    hotRef.current = hot;
    const stopFit = watchSheetViewport(hot, () => zoomRef.current / 100);
    if (visibleRef.current) {
      bridge.current.hot = hot;
      bridge.current.describe = (row, col) => describeRef.current(row, col);
      bridge.current.getSelectedEntries = () => selectedEntries(hot, describeRef.current);
      bridge.current.getActiveEntry = () => activeEntry(hot, describeRef.current);
    }

    const detachDrop = attachPaletteDrop(hot, (row, col, payload) => {
      if (readOnlyRef.current) return false;
      const column = columnsRef.current[col];
      if (!column || column.kind === 'del') return false;
      if (payload.kind === 'staff' && column.kind === 'task') return false;
      const info = metaRef.current?.[row];
      if (info?.type === 'weekhead' && column.kind !== 'custom') return false;
      return true;
    });
    return () => {
      stopFit();
      detachDrop();
      const holder = hot.rootElement?.querySelector('.ht_master .wtHolder');
      if (holder) holder.dataset.monthScroll = '';
      const selected = hot.getSelectedLast?.();
      if (selected) {
        viewRef.current.row = selected[0];
        viewRef.current.col = selected[1];
      }
      columnsRef.current.forEach((column, index) => {
        widthByKeyRef.current[column.key] = hot.getColWidth(index);
      });
      if (bridge.current.hot === hot) {
        bridge.current.hot = null;
        bridge.current.describe = () => null;
        bridge.current.getSelectedEntries = () => [];
        bridge.current.getActiveEntry = () => null;
      }
      hot.destroy();
      taskSuggest.close();
      hotRef.current = null;
    };
    // Recreate when the month grid structure or values change.
    // MONTH_PANE_REV recreates the grid when the frozen-column alignment changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [structureKey, monthKey, MONTH_PANE_REV]);

  useEffect(() => {
    if (!visibleRef.current) return;
    paintMonth(false);
  }, [readOnly]);

  useEffect(() => {
    const hot = hotRef.current;
    if (!hot) return;
    const structural = Math.max(1, columnsRef.current.findIndex(column => column.kind === 'day'));
    const rows = Number(freezeRows) || 0;
    const cols = freezeCols == null ? structural : Number(freezeCols) || 0;
    const settings = hot.getSettings();
    if ((Number(settings.fixedRowsTop) || 0) === rows && (Number(settings.fixedColumnsStart) || 0) === cols) return;
    hot.updateSettings({ fixedRowsTop: rows, fixedColumnsStart: cols });
  }, [freezeRows, freezeCols]);

  useEffect(() => {
    const hot = hotRef.current;
    if (!hot) return undefined;
    if (!visible) {
      hot.suspendRender?.();
      return undefined;
    }
    hot.resumeRender?.();
    bridge.current.hot = hot;
    bridge.current.describe = (row, col) => describeRef.current(row, col);
    bridge.current.getSelectedEntries = () => selectedEntries(hot, describeRef.current);
    bridge.current.getActiveEntry = () => activeEntry(hot, describeRef.current);
    paintMonth(true);
    return () => cancelAnimationFrame(paintFrame.current);
  }, [visible, zoom]);

  useEffect(() => {
    patchHotCells(hotRef.current, rowData);
  }, [valueKey, rowData]);

  useEffect(() => {
    stylesRef.current = cellStyles || {};
    if (!visible) return;
    paintMonth(false);
  }, [cellStyles, taskList, visible]);

  return (
    <>
      <div ref={containerRef} className={`sheet-grid-host month-sheet${visible ? '' : ' is-parked'}`} />
      {colEdit && (
        <input
          className="room-label-input"
          style={{ top: colEdit.top, left: colEdit.left, width: colEdit.width, height: colEdit.height }}
          value={colEdit.value}
          autoFocus
          placeholder="Tên cột"
          onChange={(event) => setColEdit(current => ({ ...current, value: event.target.value }))}
          onBlur={(event) => {
            const key = colEdit.key;
            const value = event.target.value.trim() || 'Cột mới';
            setColEdit(null);
            onRenameColumnRef.current?.(key, value);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') event.currentTarget.blur();
            if (event.key === 'Escape') setColEdit(null);
          }}
        />
      )}
      {confirmDialog}
    </>
  );
}
