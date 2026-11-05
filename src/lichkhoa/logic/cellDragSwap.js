/**
 * Drag the border of a selected range (or Alt-drag anywhere in it)
 * to swap those cells with the cells under the pointer.
 * A move that overlaps the selection shifts the values instead of swapping.
 * Click, type, range-select and the fill handle stay as they are.
 */

const EDGE = 8;

function boundsOf(hot) {
  const last = hot.getSelectedLast?.();
  if (!last) return null;
  const [r1, c1, r2, c2] = last;
  if (r1 < 0 || c1 < 0 || r2 < 0 || c2 < 0) return null;
  return {
    r1: Math.min(r1, r2),
    c1: Math.min(c1, c2),
    r2: Math.max(r1, r2),
    c2: Math.max(c1, c2)
  };
}

function inside(bounds, row, col) {
  return row >= bounds.r1 && row <= bounds.r2 && col >= bounds.c1 && col <= bounds.c2;
}

function editable(hot, row, col) {
  if (row < 0 || col < 0 || row >= hot.countRows() || col >= hot.countCols()) return false;
  return !hot.getCellMeta(row, col).readOnly;
}

function rangeEditable(hot, bounds) {
  for (let row = bounds.r1; row <= bounds.r2; row += 1) {
    for (let col = bounds.c1; col <= bounds.c2; col += 1) {
      if (!editable(hot, row, col)) return false;
    }
  }
  return true;
}

function nearEdge(event, td) {
  const rect = td.getBoundingClientRect();
  const x = event.clientX - rect.left;
  const y = event.clientY - rect.top;
  return x <= EDGE || y <= EDGE || rect.right - event.clientX <= EDGE || rect.bottom - event.clientY <= EDGE;
}

function nearFillHandle(event, td) {
  const rect = td.getBoundingClientRect();
  return rect.right - event.clientX <= 14 && rect.bottom - event.clientY <= 14;
}

function cellFromPoint(hot, event) {
  const node = document.elementFromPoint(event.clientX, event.clientY);
  const td = node?.closest?.('td');
  if (!td || !hot.rootElement?.contains(td)) return null;
  const coords = hot.getCoords?.(td);
  if (!coords || coords.row < 0 || coords.col < 0) return null;
  return coords;
}

function paint(hot, rows, className, on) {
  rows.forEach(([row, col]) => {
    const td = hot.getCell(row, col);
    td?.classList.toggle(className, on);
  });
}

function cellsOf(bounds) {
  const list = [];
  for (let row = bounds.r1; row <= bounds.r2; row += 1) {
    for (let col = bounds.c1; col <= bounds.c2; col += 1) list.push([row, col]);
  }
  return list;
}

function shifted(bounds, dRow, dCol) {
  return cellsOf(bounds).map(([row, col]) => [row + dRow, col + dCol]);
}

function applyMove(hot, bounds, dRow, dCol, describe, onPatchStyles) {
  const pairs = cellsOf(bounds).map(([row, col]) => ({
    row,
    col,
    nextRow: row + dRow,
    nextCol: col + dCol
  }));
  if (pairs.some(pair => !editable(hot, pair.nextRow, pair.nextCol))) return false;

  const sourceKeys = new Set(pairs.map(pair => `${pair.row},${pair.col}`));
  const destKeys = new Set(pairs.map(pair => `${pair.nextRow},${pair.nextCol}`));
  const overlap = [...sourceKeys].some(key => destKeys.has(key));
  const touched = new Set([...sourceKeys, ...destKeys]);
  const original = new Map();
  touched.forEach((key) => {
    const [row, col] = key.split(',').map(Number);
    original.set(key, hot.getDataAtCell(row, col));
  });

  const nextValue = new Map();
  if (!overlap) {
    pairs.forEach((pair) => {
      nextValue.set(`${pair.nextRow},${pair.nextCol}`, original.get(`${pair.row},${pair.col}`));
      nextValue.set(`${pair.row},${pair.col}`, original.get(`${pair.nextRow},${pair.nextCol}`));
    });
  } else {
    pairs.forEach((pair) => {
      nextValue.set(`${pair.nextRow},${pair.nextCol}`, original.get(`${pair.row},${pair.col}`));
    });
    pairs.forEach((pair) => {
      const key = `${pair.row},${pair.col}`;
      if (!destKeys.has(key)) nextValue.set(key, '');
    });
  }

  const changes = [];
  nextValue.forEach((value, key) => {
    const [row, col] = key.split(',').map(Number);
    const before = original.get(key) ?? '';
    const after = value ?? '';
    if (String(before) !== String(after)) changes.push([row, col, after]);
  });
  if (changes.length) hot.setDataAtCell(changes, 'edit');

  if (describe && onPatchStyles) {
    const prev = {};
    const next = {};
    const styleAt = (row, col) => {
      const entry = describe(row, col);
      if (!entry?.key) return null;
      return { key: entry.key, style: entry.style ? { ...entry.style } : null };
    };
    const writeStyle = (row, col, style) => {
      const entry = styleAt(row, col);
      if (!entry) return;
      prev[entry.key] = entry.style;
      next[entry.key] = style ? { ...style } : null;
    };
    if (!overlap) {
      pairs.forEach((pair) => {
        const from = styleAt(pair.row, pair.col);
        const to = styleAt(pair.nextRow, pair.nextCol);
        writeStyle(pair.nextRow, pair.nextCol, from?.style || null);
        writeStyle(pair.row, pair.col, to?.style || null);
      });
    } else {
      pairs.forEach((pair) => {
        writeStyle(pair.nextRow, pair.nextCol, styleAt(pair.row, pair.col)?.style || null);
      });
      pairs.forEach((pair) => {
        if (!destKeys.has(`${pair.row},${pair.col}`)) writeStyle(pair.row, pair.col, null);
      });
    }
    const changed = Object.keys(next).some(key => JSON.stringify(prev[key] || null) !== JSON.stringify(next[key] || null));
    if (changed) onPatchStyles(prev, next);
  }
  return true;
}

export function attachCellDragSwap(hot, { describe, onPatchStyles } = {}) {
  const root = hot.rootElement;
  if (!root) return () => {};

  let drag = null;

  const clearMarks = () => {
    root.querySelectorAll('.cell-drag-source, .cell-drag-target').forEach((node) => {
      node.classList.remove('cell-drag-source', 'cell-drag-target');
    });
  };

  const onMouseDown = (event) => {
    if (event.button !== 0 || event.target?.closest?.('.corner')) return;
    const td = event.target?.closest?.('td');
    if (!td || !root.contains(td)) return;
    const coords = hot.getCoords?.(td);
    if (!coords) return;
    const bounds = boundsOf(hot);
    if (!bounds || !inside(bounds, coords.row, coords.col) || !rangeEditable(hot, bounds)) return;
    const fromBorder = nearEdge(event, td) && !nearFillHandle(event, td);
    if (!fromBorder && !event.altKey) return;
    event.preventDefault();
    event.stopPropagation();
    drag = {
      bounds,
      grabRow: coords.row,
      grabCol: coords.col,
      startX: event.clientX,
      startY: event.clientY,
      moved: false
    };
  };

  const onMouseMove = (event) => {
    if (!drag) {
      const td = event.target?.closest?.('td');
      const coords = td && root.contains(td) ? hot.getCoords?.(td) : null;
      const bounds = coords && boundsOf(hot);
      const ready = bounds && inside(bounds, coords.row, coords.col) && rangeEditable(hot, bounds)
        && ((nearEdge(event, td) && !nearFillHandle(event, td)) || event.altKey);
      root.classList.toggle('cell-drag-ready', Boolean(ready));
      return;
    }
    if (!drag.moved) {
      if (Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) < 4) return;
      drag.moved = true;
      paint(hot, cellsOf(drag.bounds), 'cell-drag-source', true);
    }
    const coords = cellFromPoint(hot, event);
    paint(hot, drag.targets || [], 'cell-drag-target', false);
    drag.targets = [];
    if (!coords) return;
    const dRow = coords.row - drag.grabRow;
    const dCol = coords.col - drag.grabCol;
    if (!dRow && !dCol) return;
    const targets = shifted(drag.bounds, dRow, dCol);
    if (targets.some(([row, col]) => !editable(hot, row, col))) return;
    drag.targets = targets;
    drag.dRow = dRow;
    drag.dCol = dCol;
    paint(hot, targets, 'cell-drag-target', true);
  };

  const onMouseUp = () => {
    if (!drag) return;
    const current = drag;
    drag = null;
    root.classList.remove('cell-drag-ready');
    clearMarks();
    if (current.moved && current.dRow != null && (current.dRow || current.dCol)) {
      applyMove(hot, current.bounds, current.dRow, current.dCol, describe, onPatchStyles);
    }
  };

  root.addEventListener('mousedown', onMouseDown, true);
  document.addEventListener('mousemove', onMouseMove);
  document.addEventListener('mouseup', onMouseUp);
  return () => {
    root.removeEventListener('mousedown', onMouseDown, true);
    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('mouseup', onMouseUp);
    root.classList.remove('cell-drag-ready');
    clearMarks();
  };
}
