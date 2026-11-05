export const PALETTE_MIME = 'application/x-lichkhoa';

export function palettePayload(kind, text) {
  return JSON.stringify({ kind, text });
}

export function readPalettePayload(dataTransfer) {
  const raw = dataTransfer?.getData(PALETTE_MIME);
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (parsed?.text) return { kind: parsed.kind || 'task', text: String(parsed.text) };
    } catch {
      /* fall through to plain text */
    }
  }
  const text = dataTransfer?.getData('text/plain')?.trim();
  return text ? { kind: 'task', text } : null;
}

function cellFromEvent(hot, event) {
  const td = event.target?.closest?.('td');
  if (!td || !hot.rootElement?.contains(td)) return null;
  const coords = hot.getCoords?.(td);
  if (!coords || coords.row < 0 || coords.col < 0) return null;
  return coords;
}

export function attachPaletteDrop(hot, allow) {
  const root = hot.rootElement;
  if (!root) return () => {};

  const over = (event) => {
    if (![...event.dataTransfer.types].includes(PALETTE_MIME) && ![...event.dataTransfer.types].includes('text/plain')) return;
    const coords = cellFromEvent(hot, event);
    if (!coords) return;
    if (hot.getCellMeta(coords.row, coords.col).readOnly) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
  };

  const drop = (event) => {
    const coords = cellFromEvent(hot, event);
    if (!coords) return;
    if (hot.getCellMeta(coords.row, coords.col).readOnly) return;
    const payload = readPalettePayload(event.dataTransfer);
    if (!payload) return;
    if (allow && !allow(coords.row, coords.col, payload)) return;
    event.preventDefault();
    const current = String(hot.getDataAtCell(coords.row, coords.col) ?? '').trim();
    const parts = current.split(/[,;/]/).map(part => part.trim()).filter(Boolean);
    if (parts.includes(payload.text)) return;
    hot.setDataAtCell(coords.row, coords.col, current ? `${current}, ${payload.text}` : payload.text, 'edit');
  };

  root.addEventListener('dragover', over);
  root.addEventListener('drop', drop);
  return () => {
    root.removeEventListener('dragover', over);
    root.removeEventListener('drop', drop);
  };
}
