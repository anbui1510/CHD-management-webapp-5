import type { CathLab, Consult, Operation, Staff } from '../types';
import { staffNameMatches } from './staffNameMatch';

export type ActivityPeriodPreset = 'all' | 'month' | 'quarter' | 'year';

export interface ActivityDateFilter {
  preset: ActivityPeriodPreset;
  year: number;
  month: number;
  quarter: number;
  customFrom?: string;
  customTo?: string;
  useCustomRange: boolean;
}

export interface ActivityChartPoint {
  key: string;
  label: string;
  value: number;
}

export interface ActivityMetricResult {
  total: number;
  chartData: ActivityChartPoint[];
}

export interface StaffActivityMetrics {
  consultRegistered: ActivityMetricResult;
  ptvMain: ActivityMetricResult;
  ptvAssistant: ActivityMetricResult;
}

const parseDateKey = (raw: string | undefined): string => {
  if (!raw) return '';
  const trimmed = String(raw).trim().split('T')[0];
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;

  const dashParts = trimmed.split('-');
  if (dashParts.length === 3 && dashParts[2].length === 4) {
    return `${dashParts[2]}-${dashParts[1].padStart(2, '0')}-${dashParts[0].padStart(2, '0')}`;
  }

  const slashParts = trimmed.split('/');
  if (slashParts.length === 3) {
    if (slashParts[2].length === 4) {
      return `${slashParts[2]}-${slashParts[1].padStart(2, '0')}-${slashParts[0].padStart(2, '0')}`;
    }
    if (slashParts[0].length === 4) {
      return `${slashParts[0]}-${slashParts[1].padStart(2, '0')}-${slashParts[2].padStart(2, '0')}`;
    }
  }

  return trimmed;
};

const inRange = (dateKey: string, fromKey: string, toKey: string): boolean => {
  if (!dateKey) return false;
  if (fromKey && dateKey < fromKey) return false;
  if (toKey && dateKey > toKey) return false;
  return true;
};

export function resolveActivityRange(filter: ActivityDateFilter): { from: string; to: string } {
  if (filter.useCustomRange && filter.customFrom && filter.customTo) {
    const from = parseDateKey(filter.customFrom);
    const to = parseDateKey(filter.customTo);
    return from <= to ? { from, to } : { from: to, to: from };
  }

  const year = filter.year;
  switch (filter.preset) {
    case 'month': {
      const month = String(filter.month).padStart(2, '0');
      const lastDay = new Date(year, filter.month, 0).getDate();
      return {
        from: `${year}-${month}-01`,
        to: `${year}-${month}-${String(lastDay).padStart(2, '0')}`,
      };
    }
    case 'quarter': {
      const startMonth = (filter.quarter - 1) * 3 + 1;
      const endMonth = startMonth + 2;
      const lastDay = new Date(year, endMonth, 0).getDate();
      return {
        from: `${year}-${String(startMonth).padStart(2, '0')}-01`,
        to: `${year}-${String(endMonth).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`,
      };
    }
    case 'year':
      return { from: `${year}-01-01`, to: `${year}-12-31` };
    default:
      return { from: '', to: '' };
  }
}

function buildBuckets(filter: ActivityDateFilter, range: { from: string; to: string }): ActivityChartPoint[] {
  if (filter.preset === 'all' && !filter.useCustomRange) {
    const years = new Set<number>();
    if (range.from) years.add(parseInt(range.from.slice(0, 4), 10));
    if (range.to) years.add(parseInt(range.to.slice(0, 4), 10));
    const minYear = years.size > 0 ? Math.min(...years) : filter.year - 5;
    const maxYear = years.size > 0 ? Math.max(...years) : filter.year;
    const points: ActivityChartPoint[] = [];
    for (let y = minYear; y <= maxYear; y += 1) {
      points.push({ key: String(y), label: String(y), value: 0 });
    }
    return points.length > 0 ? points : [{ key: String(filter.year), label: String(filter.year), value: 0 }];
  }

  if (filter.useCustomRange && range.from && range.to) {
    const fromDate = new Date(`${range.from}T00:00:00`);
    const toDate = new Date(`${range.to}T00:00:00`);
    const diffDays = Math.ceil((toDate.getTime() - fromDate.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays <= 31) {
      const points: ActivityChartPoint[] = [];
      const cursor = new Date(fromDate);
      while (cursor <= toDate) {
        const yyyy = cursor.getFullYear();
        const mm = String(cursor.getMonth() + 1).padStart(2, '0');
        const dd = String(cursor.getDate()).padStart(2, '0');
        const key = `${yyyy}-${mm}-${dd}`;
        points.push({ key, label: `${dd}/${mm}`, value: 0 });
        cursor.setDate(cursor.getDate() + 1);
      }
      return points;
    }
  }

  if (filter.preset === 'quarter') {
    const startMonth = (filter.quarter - 1) * 3 + 1;
    return Array.from({ length: 3 }, (_, idx) => {
      const month = startMonth + idx;
      const mm = String(month).padStart(2, '0');
      return {
        key: `${filter.year}-${mm}`,
        label: `T${filter.quarter}.${mm}`,
        value: 0,
      };
    });
  }

  const year = filter.year;
  const shortYear = String(year).slice(2);
  return Array.from({ length: 12 }, (_, idx) => {
    const month = idx + 1;
    const mm = String(month).padStart(2, '0');
    return {
      key: `${year}-${mm}`,
      label: `${mm}/${shortYear}`,
      value: 0,
    };
  });
}

function bucketKeyForDate(dateKey: string, filter: ActivityDateFilter): string {
  if (!dateKey) return '';
  if (filter.preset === 'all' && !filter.useCustomRange) {
    return dateKey.slice(0, 4);
  }

  if (filter.useCustomRange && filter.customFrom && filter.customTo) {
    const range = resolveActivityRange(filter);
    const fromDate = new Date(`${range.from}T00:00:00`);
    const toDate = new Date(`${range.to}T00:00:00`);
    const diffDays = Math.ceil((toDate.getTime() - fromDate.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays <= 31) return dateKey;
  }

  if (filter.preset === 'quarter') {
    return dateKey.slice(0, 7);
  }

  return dateKey.slice(0, 7);
}

function tallyEvents(
  events: { dateKey: string }[],
  filter: ActivityDateFilter,
  range: { from: string; to: string }
): ActivityMetricResult {
  const buckets = buildBuckets(filter, range);
  const bucketMap = new Map(buckets.map(point => [point.key, point]));

  let total = 0;
  events.forEach(event => {
    const dateKey = parseDateKey(event.dateKey);
    if (!inRange(dateKey, range.from, range.to)) return;
    total += 1;
    const key = bucketKeyForDate(dateKey, filter);
    const bucket = bucketMap.get(key);
    if (bucket) bucket.value += 1;
  });

  return {
    total,
    chartData: buckets,
  };
}

export function computeStaffActivityMetrics(
  staff: Staff,
  staffList: Staff[],
  consults: Consult[],
  cathlabs: CathLab[],
  operations: Operation[],
  filter: ActivityDateFilter
): StaffActivityMetrics {
  const range = resolveActivityRange(filter);

  const consultEvents = consults
    .filter(c => {
      const removed =
        c.Removed === true ||
        String(c.Removed || '')
          .trim()
          .toLowerCase() === 'true';
      return !removed && staffNameMatches(c.RequestBy, staff, staffList);
    })
    .map(c => ({ dateKey: c.ConsultDate }));

  const ptvMainEvents: { dateKey: string }[] = [];
  const ptvAssistantEvents: { dateKey: string }[] = [];

  cathlabs.forEach(cath => {
    const dateKey = cath.CathDate;
    if (staffNameMatches(cath._1stInterventionist, staff, staffList)) {
      ptvMainEvents.push({ dateKey });
    }
    [cath._2ndInterventionist, cath._3rdInterventionist, cath._4thInterventionist].forEach(name => {
      if (staffNameMatches(name, staff, staffList)) {
        ptvAssistantEvents.push({ dateKey });
      }
    });
  });

  operations.forEach(op => {
    const dateKey = op.SurgDate || '';
    if (staffNameMatches(op['1stSurgeon'], staff, staffList)) {
      ptvMainEvents.push({ dateKey });
    }
    [op['2ndSurgeon'], op['3rdSurgeon'], op['4thSurgeon']].forEach(name => {
      if (staffNameMatches(name, staff, staffList)) {
        ptvAssistantEvents.push({ dateKey });
      }
    });
  });

  if (filter.preset === 'all' && !filter.useCustomRange) {
    const allDates = [
      ...consultEvents.map(e => parseDateKey(e.dateKey)),
      ...ptvMainEvents.map(e => parseDateKey(e.dateKey)),
      ...ptvAssistantEvents.map(e => parseDateKey(e.dateKey)),
    ].filter(Boolean);
    if (allDates.length > 0) {
      allDates.sort();
      range.from = allDates[0];
      range.to = allDates[allDates.length - 1];
    }
  }

  return {
    consultRegistered: tallyEvents(consultEvents, filter, range),
    ptvMain: tallyEvents(ptvMainEvents, filter, range),
    ptvAssistant: tallyEvents(ptvAssistantEvents, filter, range),
  };
}
