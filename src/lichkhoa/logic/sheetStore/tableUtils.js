export function rowsToObjects(rows, headers) {
  if (!rows?.length) return [];
  const [first, ...rest] = rows;
  const hdr = (first || []).map((c) => String(c || '').trim());
  const useHeaders = hdr.some(Boolean) ? hdr : headers;
  const start = hdr.some(Boolean) ? rest : rows;
  return start
    .filter((row) => row?.some((cell) => String(cell ?? '').trim() !== ''))
    .map((row) => {
      const obj = {};
      useHeaders.forEach((key, i) => {
        if (key) obj[key] = row[i] ?? '';
      });
      return obj;
    });
}

export function objectsToRows(objects, headers) {
  return [
    headers,
    ...(objects || []).map((obj) => headers.map((h) => {
      const v = obj[h];
      if (v === undefined || v === null) return '';
      if (typeof v === 'object') return JSON.stringify(v);
      return v;
    })),
  ];
}

export function metaRowsToObject(rows) {
  const map = {};
  (rows || []).forEach((row) => {
    const k = String(row[0] || '').trim();
    if (!k || k.startsWith('#')) return;
    map[k] = row[1] ?? '';
  });
  return map;
}

export function metaObjectToRows(meta) {
  return Object.entries(meta || {}).map(([k, v]) => [k, v ?? '']);
}

export function parseJsonCell(value, fallback) {
  const s = String(value ?? '').trim();
  if (!s) return fallback;
  try {
    return JSON.parse(s);
  } catch {
    return fallback;
  }
}

export function numCell(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export function boolCell(value) {
  if (value === true || value === 'true' || value === '1' || value === 'TRUE') return true;
  return false;
}
