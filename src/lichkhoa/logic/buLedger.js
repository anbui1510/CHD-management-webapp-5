function previousMonday(iso) {
  if (!iso) return '';
  const [y, m, d] = String(iso).split('-').map(Number);
  const date = new Date(y, (m || 1) - 1, d || 1);
  date.setDate(date.getDate() - 7);
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${mm}-${dd}`;
}

function earnedOf(sheet) {
  return { ...(sheet?.buGrants || {}) };
}

/** Bonuses written as "cộng 0,5 bù" on the week note. */
export function notedBuBonuses(grid) {
  const totals = {};
  Object.entries(grid || {}).forEach(([name, row]) => {
    const note = String(row?.note || '');
    const re = /cộng\s+([\d]+(?:[.,]\d+)?)\s+bù/gi;
    let sum = 0;
    let match = re.exec(note);
    while (match) {
      sum += Number(String(match[1]).replace(',', '.')) || 0;
      match = re.exec(note);
    }
    if (sum) totals[name] = +sum.toFixed(1);
  });
  return totals;
}

// What the old delta actually added. A week opened from an older snapshot
// kept the previous week's buGrants, so equal grants posted as zero.
function alreadyPosted(sheet) {
  const earned = earnedOf(sheet);
  const prev = sheet?.weeks?.[previousMonday(sheet?.startDate)];
  if (!prev || !Object.prototype.hasOwnProperty.call(prev, 'buGrants')) return earned;
  const inherited = prev.buGrants || {};
  const posted = {};
  Object.keys(earned).forEach((name) => {
    posted[name] = +((Number(earned[name]) || 0) - (Number(inherited[name]) || 0)).toFixed(1);
  });
  return posted;
}

/** Grants already added to staff.buBalance for this week. */
export function buBaseline(sheet) {
  const earned = earnedOf(sheet);
  if (sheet?.buPosted) return sheet.buPosted;
  const notes = notedBuBonuses(sheet?.grid);
  const names = Object.keys(notes);
  if (!names.length) return earned;
  const already = alreadyPosted(sheet);
  const baseline = { ...earned };
  names.forEach((name) => {
    const got = Number(earned[name]) || 0;
    const posted = Number(already[name]) || 0;
    const unpaid = Math.min(Number(notes[name]) || 0, Math.max(0, +(got - posted).toFixed(1)));
    baseline[name] = +(got - unpaid).toFixed(1);
  });
  return baseline;
}

export function buGrantDeltas(after, posted) {
  const names = new Set([...Object.keys(after || {}), ...Object.keys(posted || {})]);
  const deltas = {};
  names.forEach((name) => {
    const delta = +((Number(after?.[name]) || 0) - (Number(posted?.[name]) || 0)).toFixed(1);
    if (delta) deltas[name] = delta;
  });
  return deltas;
}

/** Note bonuses that were recorded on the week but cancelled by the previous ledger. */
export function buCatchUp(sheet) {
  if (sheet?.buPosted) return {};
  return buGrantDeltas(earnedOf(sheet), buBaseline(sheet));
}
