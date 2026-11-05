export function selectionBox(hot) {
  const sel = hot.getSelectedRangeLast?.();
  if (!sel?.from || sel.from.row < 0 || sel.from.col < 0) return null;
  const row = Math.min(sel.from.row, sel.to.row);
  const col = Math.min(sel.from.col, sel.to.col);
  const endRow = Math.max(sel.from.row, sel.to.row);
  const endCol = Math.max(sel.from.col, sel.to.col);
  return {
    row,
    col,
    endRow,
    endCol,
    rowspan: endRow - row + 1,
    colspan: endCol - col + 1
  };
}

function sameMerge(a, b) {
  return a && b && a.row === b.row && a.col === b.col && a.rowspan === b.rowspan && a.colspan === b.colspan;
}

function overlaps(a, b) {
  const aRowEnd = a.row + a.rowspan - 1;
  const aColEnd = a.col + a.colspan - 1;
  const bRowEnd = b.row + b.rowspan - 1;
  const bColEnd = b.col + b.colspan - 1;
  return a.row <= bRowEnd && aRowEnd >= b.row && a.col <= bColEnd && aColEnd >= b.col;
}

export function userMerges(hot, structural = []) {
  const cells = hot.getPlugin('mergeCells')?.mergedCellsCollection?.mergedCells || [];
  return cells
    .map(cell => ({
      row: cell.row,
      col: cell.col,
      rowspan: cell.rowspan,
      colspan: cell.colspan
    }))
    .filter(cell => (cell.rowspan > 1 || cell.colspan > 1) && !structural.some(item => sameMerge(item, cell) || overlaps(item, cell)));
}

export function mergeSelection(hot) {
  const box = selectionBox(hot);
  if (!box || (box.rowspan === 1 && box.colspan === 1)) return false;
  hot.getPlugin('mergeCells').merge(box.row, box.col, box.endRow, box.endCol);
  return true;
}

export function unmergeSelection(hot) {
  const box = selectionBox(hot);
  if (!box) return false;
  const plugin = hot.getPlugin('mergeCells');
  const cells = [...(plugin.mergedCellsCollection?.mergedCells || [])];
  let changed = false;
  cells.forEach((cell) => {
    const endRow = cell.row + cell.rowspan - 1;
    const endCol = cell.col + cell.colspan - 1;
    const hit = cell.row <= box.endRow && endRow >= box.row && cell.col <= box.endCol && endCol >= box.col;
    if (!hit) return;
    plugin.unmerge(cell.row, cell.col, endRow, endCol);
    changed = true;
  });
  return changed;
}

export function mergeMenuItems(publish) {
  return {
    merge_cells: {
      name: 'Merge cells',
      disabled() {
        const box = selectionBox(this);
        return !box || (box.rowspan === 1 && box.colspan === 1);
      },
      callback() {
        if (mergeSelection(this)) publish(this);
      }
    },
    unmerge_cells: {
      name: 'Unmerge cells',
      disabled() {
        const box = selectionBox(this);
        if (!box) return true;
        const cells = this.getPlugin('mergeCells')?.mergedCellsCollection?.mergedCells || [];
        return !cells.some((cell) => {
          const endRow = cell.row + cell.rowspan - 1;
          const endCol = cell.col + cell.colspan - 1;
          return cell.row <= box.endRow && endRow >= box.row && cell.col <= box.endCol && endCol >= box.col;
        });
      },
      callback() {
        if (unmergeSelection(this)) publish(this);
      }
    }
  };
}

export function combineMerges(structural = [], saved = []) {
  const base = structural.filter(item => item.rowspan > 1 || item.colspan > 1);
  const extra = (saved || []).filter(item => item && (item.rowspan > 1 || item.colspan > 1) && !base.some(entry => overlaps(entry, item)));
  return [...base, ...extra];
}
