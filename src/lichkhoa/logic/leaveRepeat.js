const WEEK_FULL = ['thứ Hai', 'thứ Ba', 'thứ Tư', 'thứ Năm', 'thứ Sáu', 'thứ Bảy', 'Chủ nhật'];
const WEEK_SHORT = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'Cn'];
const NTH = ['', 'nhất', 'hai', 'ba', 'tư', 'năm'];

function parts(iso) {
  const [y, m, d] = String(iso || '').split('-').map(Number);
  if (!y || !m || !d) return null;
  return { y, m, d };
}

function isoOf(y, m, d) {
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function utc(iso) {
  const item = parts(iso);
  if (!item) return null;
  return Date.UTC(item.y, item.m - 1, item.d);
}

export function addDays(iso, count) {
  const time = utc(iso);
  if (time == null) return iso;
  const date = new Date(time + count * 86400000);
  return isoOf(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
}

function addMonths(iso, count) {
  const item = parts(iso);
  if (!item) return iso;
  const monthIndex = item.y * 12 + (item.m - 1) + count;
  const year = Math.floor(monthIndex / 12);
  const month = monthIndex % 12;
  const last = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return isoOf(year, month + 1, Math.min(item.d, last));
}

export function daysBetween(start, end) {
  const from = utc(start);
  const to = utc(end);
  if (from == null || to == null) return 0;
  return Math.round((to - from) / 86400000);
}

/** Monday = 0 … Sunday = 6. */
export function weekdayIndex(iso) {
  const time = utc(iso);
  if (time == null) return 0;
  return (new Date(time).getUTCDay() + 6) % 7;
}

function nthWeekday(iso) {
  const item = parts(iso);
  if (!item) return 1;
  return Math.floor((item.d - 1) / 7) + 1;
}

function weekStart(iso) {
  return addDays(iso, -weekdayIndex(iso));
}

function monthIndex(iso) {
  const item = parts(iso);
  return item ? item.y * 12 + (item.m - 1) : 0;
}

export function weeklyLabel(iso) {
  return `Hàng tuần vào ${WEEK_FULL[weekdayIndex(iso)]}`;
}

export function monthlyWeekdayLabel(iso) {
  return `Hàng tháng vào ngày ${WEEK_FULL[weekdayIndex(iso)]} thứ ${NTH[nthWeekday(iso)] || nthWeekday(iso)}`;
}

export function monthlyDateLabel(iso) {
  const item = parts(iso);
  return `Hàng tháng vào ngày ${item ? item.d : ''}`;
}

export function yearlyLabel(iso) {
  const item = parts(iso);
  return item ? `Hàng năm vào ngày ${item.d} tháng ${item.m}` : 'Hàng năm';
}

export const REPEAT_PRESETS = ['none', 'daily', 'weekly', 'monthly', 'yearly', 'weekdays', 'custom'];

export function presetRule(preset, from) {
  const base = {
    interval: 1,
    end: 'never',
    until: addDays(from, 30),
    count: 30,
    monthMode: 'date'
  };
  if (preset === 'daily') return { ...base, preset, freq: 'day' };
  if (preset === 'weekly') {
    return { ...base, preset, freq: 'week', byDay: [weekdayIndex(from)], until: addDays(from, 91), count: 13 };
  }
  if (preset === 'monthly') {
    return { ...base, preset, freq: 'month', monthMode: 'weekday', until: addMonths(from, 12), count: 12 };
  }
  if (preset === 'yearly') {
    return { ...base, preset, freq: 'year', until: addMonths(from, 60), count: 5 };
  }
  if (preset === 'weekdays') {
    return { ...base, preset: 'weekdays', freq: 'week', byDay: [0, 1, 2, 3, 4] };
  }
  return null;
}

export function cleanRepeat(repeat, from) {
  if (!repeat || !repeat.freq || repeat.preset === 'none') return null;
  const freq = ['day', 'week', 'month', 'year'].includes(repeat.freq) ? repeat.freq : 'week';
  const interval = Math.max(1, Math.min(99, Number(repeat.interval) || 1));
  const end = ['never', 'until', 'count'].includes(repeat.end) ? repeat.end : 'never';
  let byDay;
  if (freq === 'week') {
    byDay = [...new Set((repeat.byDay || [weekdayIndex(from)]).map(Number))]
      .filter(day => day >= 0 && day <= 6);
    if (!byDay.length) byDay = [weekdayIndex(from)];
  }
  return {
    preset: repeat.preset || 'custom',
    freq,
    interval,
    byDay,
    monthMode: repeat.monthMode === 'weekday' ? 'weekday' : 'date',
    end,
    until: repeat.until || '',
    count: Math.max(1, Math.min(500, Number(repeat.count) || 1))
  };
}

export function retargetRepeat(repeat, from) {
  if (!repeat || repeat.preset === 'custom' || repeat.preset === 'none') return repeat || null;
  const next = presetRule(repeat.preset, from);
  if (!next) return repeat;
  return { ...next, end: repeat.end, until: repeat.until, count: repeat.count };
}

function startsOn(rule, from, cursor) {
  if (!from || !cursor || cursor < from) return false;
  const interval = Math.max(1, Number(rule.interval) || 1);
  if (rule.freq === 'day') return daysBetween(from, cursor) % interval === 0;
  if (rule.freq === 'week') {
    const days = rule.byDay?.length ? rule.byDay : [weekdayIndex(from)];
    if (!days.includes(weekdayIndex(cursor))) return false;
    const weeks = Math.round(daysBetween(weekStart(from), weekStart(cursor)) / 7);
    return weeks % interval === 0;
  }
  if (rule.freq === 'month') {
    const diff = monthIndex(cursor) - monthIndex(from);
    if (diff < 0 || diff % interval !== 0) return false;
    if (rule.monthMode === 'weekday') {
      return weekdayIndex(cursor) === weekdayIndex(from) && nthWeekday(cursor) === nthWeekday(from);
    }
    const wanted = parts(from).d;
    const current = parts(cursor);
    const last = new Date(Date.UTC(current.y, current.m, 0)).getUTCDate();
    return current.d === Math.min(wanted, last);
  }
  if (rule.freq === 'year') {
    const start = parts(from);
    const current = parts(cursor);
    if (!start || !current || current.m !== start.m || current.d !== start.d) return false;
    return current.y >= start.y && (current.y - start.y) % interval === 0;
  }
  return false;
}

function occurrenceAllowed(rule, from, start) {
  if (!startsOn(rule, from, start)) return false;
  if (!rule.end || rule.end === 'never') return true;
  if (rule.end === 'until') return !rule.until || start <= rule.until;
  const count = Math.min(500, Math.max(1, Number(rule.count) || 1));
  let seen = 0;
  let date = from;
  let guard = 0;
  while (date <= start && guard < 40000) {
    if (startsOn(rule, from, date)) {
      seen += 1;
      if (date === start) return seen <= count;
      if (seen >= count) return false;
    }
    date = addDays(date, 1);
    guard += 1;
  }
  return false;
}

function exdatesOf(entry) {
  return Array.isArray(entry?.exdates) ? entry.exdates : [];
}

function bounds(entry) {
  const from = entry?.from || entry?.iso || '';
  const rawTo = entry?.to || from;
  const to = rawTo >= from ? rawTo : from;
  return { from, to };
}

/** Repeating leave, or a long leave that covers more than one day. */
export function seriesLeave(entry) {
  if (entry?.repeat?.freq) return true;
  const { from, to } = bounds(entry);
  return Boolean(from && to && to > from);
}

/** Start of the occurrence that contains this day. A plain range uses the day itself. */
export function occurrenceStartOn(entry, iso) {
  if (!iso) return null;
  const { from, to } = bounds(entry);
  if (!from || iso < from) return null;
  if (!entry?.repeat?.freq && iso > to) return null;
  const skipped = new Set(exdatesOf(entry));
  if (!entry?.repeat?.freq) return skipped.has(iso) ? null : iso;
  const span = Math.max(0, Math.min(370, daysBetween(from, to)));
  for (let back = 0; back <= span; back += 1) {
    const start = addDays(iso, -back);
    if (start < from) break;
    if (skipped.has(start)) continue;
    if (occurrenceAllowed(entry.repeat, from, start)) return start;
  }
  return null;
}

function withExdates(entry, dates) {
  const exdates = [...new Set(dates.filter(Boolean))].sort();
  const next = { ...entry };
  if (exdates.length) next.exdates = exdates;
  else delete next.exdates;
  return next;
}

/**
 * scope `one` drops that occurrence. `following` keeps only days before it.
 * Returns null when nothing of the registration remains.
 */
export function leaveAfterRemoval(entry, iso, scope) {
  if (!entry || scope === 'all') return null;
  const start = occurrenceStartOn(entry, iso);
  if (!start) return entry;
  const { from, to } = bounds(entry);
  const kept = exdatesOf(entry).filter(day => day !== start);
  if (scope === 'one') {
    if (!entry.repeat?.freq) {
      let cursor = from;
      let remains = false;
      let guard = 0;
      while (cursor <= to && guard < 800) {
        if (cursor !== start && !kept.includes(cursor)) {
          remains = true;
          break;
        }
        cursor = addDays(cursor, 1);
        guard += 1;
      }
      if (!remains) return null;
    }
    return withExdates(entry, [...kept, start]);
  }
  const until = addDays(start, -1);
  if (!from || until < from) return null;
  if (!entry.repeat?.freq) {
    return withExdates({ ...entry, to: until }, kept.filter(day => day <= until));
  }
  return withExdates({
    ...entry,
    repeat: { ...entry.repeat, end: 'until', until }
  }, kept.filter(day => day < start));
}

/** A day belongs to the leave. Without a repeat rule this is the from–to range. */
export function leaveCovers(entry, iso) {
  if (!iso) return false;
  const { from, to } = bounds(entry);
  if (!from || !to) return false;
  const rule = entry?.repeat;
  const skipped = exdatesOf(entry);
  if (!rule?.freq) return iso >= from && iso <= to && !skipped.includes(iso);
  const span = Math.max(0, Math.min(370, daysBetween(from, to)));
  for (let back = 0; back <= span; back += 1) {
    const start = addDays(iso, -back);
    if (start < from) break;
    if (skipped.includes(start)) continue;
    if (occurrenceAllowed(rule, from, start)) return true;
  }
  return false;
}

export function repeatPresetOf(repeat, from) {
  if (!repeat?.freq) return 'none';
  const presets = ['daily', 'weekly', 'monthly', 'yearly', 'weekdays'];
  for (const preset of presets) {
    const sample = presetRule(preset, from);
    if (!sample || sample.freq !== repeat.freq) continue;
    if (Number(sample.interval) !== Number(repeat.interval || 1)) continue;
    if (repeat.freq === 'month' && sample.monthMode !== (repeat.monthMode || 'date')) continue;
    if (repeat.freq === 'week') {
      const left = (sample.byDay || []).slice().sort().join(',');
      const right = (repeat.byDay || []).slice().sort().join(',');
      if (left !== right) continue;
    }
    return preset;
  }
  return 'custom';
}

function endSuffix(repeat) {
  if (repeat.end === 'until' && repeat.until) return `, đến ${repeat.until.split('-').reverse().join('/')}`;
  if (repeat.end === 'count') return `, ${repeat.count} lần`;
  return '';
}

export function repeatSummary(repeat, from) {
  if (!repeat?.freq) return 'Không lặp lại';
  const tail = endSuffix(repeat);
  if (repeat.preset === 'daily') return `Hàng ngày${tail}`;
  if (repeat.preset === 'weekly') return `${weeklyLabel(from)}${tail}`;
  if (repeat.preset === 'monthly') return `${monthlyWeekdayLabel(from)}${tail}`;
  if (repeat.preset === 'yearly') return `${yearlyLabel(from)}${tail}`;
  if (repeat.preset === 'weekdays') return `Mỗi ngày trong tuần (từ thứ Hai tới thứ Sáu)${tail}`;
  const unit = { day: 'ngày', week: 'tuần', month: 'tháng', year: 'năm' }[repeat.freq] || 'ngày';
  const every = `Lặp lại mỗi ${repeat.interval || 1} ${unit}`;
  const days = repeat.freq === 'week' && repeat.byDay?.length
    ? ` vào ${repeat.byDay.slice().sort((a, b) => a - b).map(day => WEEK_SHORT[day]).join(', ')}`
    : '';
  const month = repeat.freq === 'month'
    ? `, ${repeat.monthMode === 'weekday' ? monthlyWeekdayLabel(from) : monthlyDateLabel(from)}`
    : '';
  return `${every}${days}${month}${tail}`;
}

export { WEEK_SHORT };
