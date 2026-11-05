export const DEFAULT_FONT = 13;
export const ZOOM_STEPS = [50, 75, 90, 100, 125, 150, 200];

export const COLOR_ROWS = [
  ['#000000', '#434343', '#666666', '#999999', '#b7b7b7', '#cccccc', '#d9d9d9', '#efefef', '#f3f3f3', '#ffffff'],
  ['#980000', '#ff0000', '#ff9900', '#ffff00', '#00ff00', '#00ffff', '#4a86e8', '#0000ff', '#9900ff', '#ff00ff'],
  ['#e6b8af', '#f4cccc', '#fce5cd', '#fff2cc', '#d9ead3', '#d0e0e3', '#c9daf8', '#cfe2f3', '#d9d2e9', '#ead1dc'],
  ['#dd7e6b', '#ea9999', '#f9cb9c', '#ffe599', '#b6d7a8', '#a2c4c9', '#a4c2f4', '#9fc5e8', '#b4a7d6', '#d5a6bd'],
  ['#cc4125', '#e06666', '#f6b26b', '#ffd966', '#93c47d', '#76a5af', '#6d9eeb', '#6fa8dc', '#8e7cc3', '#c27ba0'],
  ['#a61c00', '#cc0000', '#e69138', '#f1c232', '#6aa84f', '#45818e', '#3c78d8', '#3d85c6', '#674ea7', '#a64d79'],
  ['#85200c', '#990000', '#b45f06', '#bf9000', '#38761d', '#134f5c', '#1155cc', '#0b5394', '#351c75', '#741b47'],
  ['#5b0f00', '#660000', '#783f04', '#7f6000', '#274e13', '#0c343d', '#1c4587', '#073763', '#20124d', '#4c1130']
];

const FORMAT_CLASSES = [
  'fmt-bold', 'fmt-italic', 'fmt-underline',
  'fmt-left', 'fmt-center', 'fmt-right',
  'fmt-top', 'fmt-middle', 'fmt-bottom',
  'fmt-wrap', 'fmt-overflow', 'fmt-clip'
];

export function taskLabelStyleKey(roleKey) {
  return `m|label|${roleKey}`;
}

export function legacyTaskLabelKeys(styles, roleKey) {
  return Object.keys(styles || {}).filter((key) => {
    const parts = key.split('|');
    return parts.length === 4 && parts[0] === 'm' && parts[1] === 'label' && parts[3] === roleKey;
  });
}

export function taskLabelStyle(styles, roleKey) {
  const shared = styles?.[taskLabelStyleKey(roleKey)];
  if (shared) return shared;
  const legacy = legacyTaskLabelKeys(styles, roleKey).find(key => styles[key]);
  return legacy ? styles[legacy] : null;
}

export function expandSharedTaskStyles(styles, prev, next) {
  Object.keys(next).forEach((key) => {
    const parts = key.split('|');
    if (parts.length !== 3 || parts[0] !== 'm' || parts[1] !== 'label') return;
    legacyTaskLabelKeys(styles, parts[2]).forEach((oldKey) => {
      if (Object.prototype.hasOwnProperty.call(next, oldKey)) return;
      prev[oldKey] = styles?.[oldKey] ? { ...styles[oldKey] } : null;
      next[oldKey] = null;
    });
  });
}

export function cleanStyle(style) {
  if (!style) return null;
  const out = {};
  if (style.bold) out.bold = true;
  if (style.italic) out.italic = true;
  if (style.underline) out.underline = true;
  if (style.fontSize && Number(style.fontSize) !== DEFAULT_FONT) out.fontSize = Number(style.fontSize);
  if (style.color) out.color = style.color;
  if (style.bg) out.bg = style.bg;
  if (style.hAlign && style.hAlign !== 'center') out.hAlign = style.hAlign;
  if (style.vAlign && style.vAlign !== 'middle') out.vAlign = style.vAlign;
  if (style.wrap && style.wrap !== 'overflow') out.wrap = style.wrap;
  return Object.keys(out).length ? out : null;
}

export function paintCell(td, style) {
  FORMAT_CLASSES.forEach(name => td.classList.remove(name));
  td.style.removeProperty('font-size');
  if (!style) return;

  if (style.bold) td.classList.add('fmt-bold');
  if (style.italic) td.classList.add('fmt-italic');
  if (style.underline) td.classList.add('fmt-underline');
  if (style.hAlign) td.classList.add(`fmt-${style.hAlign}`);
  if (style.vAlign) td.classList.add(`fmt-${style.vAlign}`);
  if (style.wrap === 'wrap') td.classList.add('fmt-wrap');
  else if (style.wrap === 'clip') td.classList.add('fmt-clip');
  else if (style.wrap === 'overflow') td.classList.add('fmt-overflow');
  if (style.fontSize) td.style.setProperty('font-size', `${style.fontSize}px`, 'important');
  if (style.color) td.style.setProperty('color', style.color, 'important');
  if (style.bg) td.style.setProperty('background-color', style.bg, 'important');
}

export function selectedEntries(hot, describe) {
  const ranges = hot?.getSelected?.() || [];
  const out = [];
  const seen = new Set();
  ranges.forEach((range) => {
    const [r1, c1, r2, c2] = range;
    const rMin = Math.min(r1, r2);
    const rMax = Math.max(r1, r2);
    const cMin = Math.min(c1, c2);
    const cMax = Math.max(c1, c2);
    for (let r = rMin; r <= rMax; r += 1) {
      for (let c = cMin; c <= cMax; c += 1) {
        if (r < 0 || c < 0) continue;
        const desc = describe(r, c);
        if (!desc?.key || seen.has(desc.key)) continue;
        seen.add(desc.key);
        out.push(desc);
      }
    }
  });
  return out;
}

export function activeEntry(hot, describe) {
  const last = hot?.getSelectedLast?.();
  if (!last) return null;
  const [r1, c1, r2, c2] = last;
  return describe(r2, c2) || describe(r1, c1) || null;
}

export function pushFormatUndo(hot, prev, next, apply) {
  const plugin = hot?.getPlugin?.('undoRedo');
  if (plugin?.done) {
    plugin.done(() => ({
      actionType: 'cellFormat',
      undo(_instance, callback) {
        apply(prev);
        if (callback) callback();
      },
      redo(_instance, callback) {
        apply(next);
        if (callback) callback();
      }
    }));
  }
  apply(next);
}
