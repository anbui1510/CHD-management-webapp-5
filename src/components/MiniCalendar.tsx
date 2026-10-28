import React, { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

const WEEKDAY_LABELS = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];

export function toIsoDate(date: Date): string {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export function parseIsoDate(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

interface MiniCalendarProps {
  value: string;
  onChange: (isoDate: string) => void;
  minDate?: string;
  maxDate?: string;
  highlightFrom?: string;
  highlightTo?: string;
}

export function MiniCalendar({
  value,
  onChange,
  minDate,
  maxDate,
  highlightFrom,
  highlightTo,
}: MiniCalendarProps) {
  const initial = parseIsoDate(value) || new Date();
  const [viewYear, setViewYear] = useState(initial.getFullYear());
  const [viewMonth, setViewMonth] = useState(initial.getMonth());

  useEffect(() => {
    const parsed = parseIsoDate(value);
    if (!parsed) return;
    setViewYear(parsed.getFullYear());
    setViewMonth(parsed.getMonth());
  }, [value]);

  const cells = useMemo(() => {
    const firstDay = new Date(viewYear, viewMonth, 1);
    let startDay = firstDay.getDay();
    if (startDay === 0) startDay = 7;
    const totalDays = new Date(viewYear, viewMonth + 1, 0).getDate();
    const prevTotalDays = new Date(viewYear, viewMonth, 0).getDate();
    const result: Array<{ iso: string; day: number; inMonth: boolean }> = [];

    for (let i = startDay - 1; i > 0; i -= 1) {
      const day = prevTotalDays - i + 1;
      const date = new Date(viewYear, viewMonth - 1, day);
      result.push({ iso: toIsoDate(date), day, inMonth: false });
    }

    for (let day = 1; day <= totalDays; day += 1) {
      const date = new Date(viewYear, viewMonth, day);
      result.push({ iso: toIsoDate(date), day, inMonth: true });
    }

    while (result.length % 7 !== 0) {
      const day = result.length - (startDay - 1) - totalDays + 1;
      const date = new Date(viewYear, viewMonth + 1, day);
      result.push({ iso: toIsoDate(date), day, inMonth: false });
    }

    return result;
  }, [viewMonth, viewYear]);

  const inHighlightRange = (iso: string) => {
    if (!highlightFrom || !highlightTo) return false;
    const from = highlightFrom <= highlightTo ? highlightFrom : highlightTo;
    const to = highlightFrom <= highlightTo ? highlightTo : highlightFrom;
    return iso >= from && iso <= to;
  };

  const isDisabled = (iso: string) => {
    if (minDate && iso < minDate) return true;
    if (maxDate && iso > maxDate) return true;
    return false;
  };

  return (
    <div className="w-[252px] select-none font-sans">
      <div className="flex items-center justify-between mb-2">
        <button
          type="button"
          onClick={() => {
            if (viewMonth === 0) {
              setViewMonth(11);
              setViewYear(prev => prev - 1);
            } else {
              setViewMonth(prev => prev - 1);
            }
          }}
          className="p-1 rounded-lg hover:bg-slate-100 text-slate-500"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <span className="text-[11px] font-extrabold text-slate-800">
          Tháng {viewMonth + 1}/{viewYear}
        </span>
        <button
          type="button"
          onClick={() => {
            if (viewMonth === 11) {
              setViewMonth(0);
              setViewYear(prev => prev + 1);
            } else {
              setViewMonth(prev => prev + 1);
            }
          }}
          className="p-1 rounded-lg hover:bg-slate-100 text-slate-500"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-0.5 mb-1">
        {WEEKDAY_LABELS.map(label => (
          <div key={label} className="text-[9px] font-black text-slate-400 text-center py-0.5">
            {label}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-0.5">
        {cells.map(cell => {
          const selected = cell.iso === value;
          const ranged = inHighlightRange(cell.iso);
          const disabled = isDisabled(cell.iso);
          return (
            <button
              key={`${cell.iso}-${cell.inMonth ? 'in' : 'out'}`}
              type="button"
              disabled={disabled}
              onClick={() => onChange(cell.iso)}
              className={`h-8 rounded-lg text-[11px] font-bold transition ${
                selected
                  ? 'bg-primary text-white shadow-sm'
                  : ranged
                    ? 'bg-pink-50 text-primary'
                    : cell.inMonth
                      ? 'text-slate-700 hover:bg-slate-100'
                      : 'text-slate-300 hover:bg-slate-50'
              } ${disabled ? 'opacity-30 cursor-not-allowed hover:bg-transparent' : ''}`}
            >
              {cell.day}
            </button>
          );
        })}
      </div>
    </div>
  );
}
