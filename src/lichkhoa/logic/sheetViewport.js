/** Write only the cells that changed. Reading the source array avoids a lookup per cell. */
export function patchHotCells(hot, rows) {
  if (!hot || !Array.isArray(rows) || hot.countRows() !== rows.length) return;
  const width = rows[0]?.length || 0;
  if (hot.countCols() !== width) return;
  const source = hot.getSourceData?.() || [];
  const updates = [];
  rows.forEach((row, rowIndex) => {
    const current = source[rowIndex] || [];
    row.forEach((value, colIndex) => {
      const next = value ?? '';
      if (String(current[colIndex] ?? '') !== String(next)) updates.push([rowIndex, colIndex, next]);
    });
  });
  if (updates.length) hot.setDataAtCell(updates, 'loadData');
}

/** Zoom the grid without tying it to the frame. The week sheet scrolls on the outer frame. */
export function applySheetZoom(hot, scale) {
  if (!hot?.rootElement) return;
  const safe = Number(scale) > 0 ? Number(scale) : 1;
  hot.rootElement.style.zoom = safe === 1 ? '' : String(safe);
}

/** Match the grid width to its frame. The week grid keeps its own content height. */
export function fitSheetWidth(hot, scale) {
  const host = hot?.rootElement?.parentElement;
  if (!hot || !host || host.clientWidth < 32) return;
  const safe = Number(scale) > 0 ? Number(scale) : 1;
  const width = Math.max(480, Math.floor(host.clientWidth / safe));
  hot.rootElement.style.zoom = safe === 1 ? '' : String(safe);
  const current = hot.getSettings();
  if (current.width !== width) hot.updateSettings({ width });
}

/** Keep the grid filling its frame. Zoom changes cell size, not the frame. */
export function fitSheetViewport(hot, scale) {
  const host = hot?.rootElement?.parentElement;
  if (!hot || !host) return;
  if (host.clientHeight < 32 || host.clientWidth < 32) return;
  const safe = Number(scale) > 0 ? Number(scale) : 1;
  const height = Math.max(280, Math.floor(host.clientHeight / safe));
  const width = Math.max(480, Math.floor(host.clientWidth / safe));
  hot.rootElement.style.zoom = safe === 1 ? '' : String(safe);
  const current = hot.getSettings();
  if (current.height !== height || current.width !== width) {
    hot.updateSettings({ height, width });
  }
}

export function revealSheet(hot, scale) {
  const host = hot?.rootElement?.parentElement;
  if (!hot?.rootElement?.isConnected || !host) return;
  if (host.clientHeight < 32 || host.clientWidth < 32) return;
  const safe = Number(scale) > 0 ? Number(scale) : 1;
  const height = Math.max(280, Math.floor(host.clientHeight / safe));
  const width = Math.max(480, Math.floor(host.clientWidth / safe));
  const current = hot.getSettings();
  if (current.height === height && current.width === width) return;
  fitSheetViewport(hot, safe);
}

export function watchSheetViewport(hot, getScale, options = {}) {
  const host = hot?.rootElement?.parentElement;
  if (!host) return () => {};
  const fitFrame = options.lockHeight ? applySheetZoom : fitSheetViewport;
  let frame = 0;
  const fit = () => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => fitFrame(hot, getScale()));
  };
  fit();
  const observer = new ResizeObserver(fit);
  observer.observe(host);
  return () => {
    cancelAnimationFrame(frame);
    observer.disconnect();
  };
}
