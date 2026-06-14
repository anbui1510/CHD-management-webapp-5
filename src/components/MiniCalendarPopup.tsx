import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { formatVNTime } from '../types';

const WEEKDAY_LABELS = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];

function toIsoDate(date: Date): string {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function parseIsoDate(value: string): Date | null {
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
    <div className="w-[252px] select-none">
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
                  ? 'bg-[#d2145a] text-white shadow-sm'
                  : ranged
                    ? 'bg-pink-50 text-[#d2145a]'
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

interface DateFieldWithCalendarProps {
  label: string;
  value: string;
  onChange: (isoDate: string) => void;
  highlightFrom?: string;
  highlightTo?: string;
}

export function DateFieldWithCalendar({
  label,
  value,
  onChange,
  highlightFrom,
  highlightTo,
}: DateFieldWithCalendarProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      {label ? (
        <span className="text-[10px] font-black uppercase text-slate-500">{label}</span>
      ) : null}
      <button
        type="button"
        onClick={() => setOpen(prev => !prev)}
        className={`mt-1 w-full flex items-center justify-between gap-2 rounded-xl border px-3 py-2 text-left transition ${
          open ? 'border-pink-300 bg-pink-50/40' : 'border-slate-200 bg-white hover:border-pink-200'
        }`}
      >
        <span className="text-xs font-bold font-mono text-slate-800">
          {value ? formatVNTime(value) : 'Chọn ngày'}
        </span>
        <span className="w-7 h-7 rounded-lg bg-pink-50 border border-pink-100 flex items-center justify-center shrink-0">
          <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 text-[#d2145a]" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="4" width="18" height="18" rx="2" />
            <path d="M16 2v4M8 2v4M3 10h18" />
          </svg>
        </span>
      </button>

      {open && (
        <div className="absolute left-0 top-[calc(100%+6px)] z-[80] rounded-2xl border border-slate-200 bg-white p-3 shadow-xl animate-in fade-in slide-in-from-top-1 duration-150">
          <MiniCalendar
            value={value}
            onChange={next => {
              onChange(next);
              setOpen(false);
            }}
            highlightFrom={highlightFrom}
            highlightTo={highlightTo}
          />
        </div>
      )}
    </div>
  );
}

interface DateRangePickerPopoverProps {
  from: string;
  to: string;
  onChange: (next: { from: string; to: string }) => void;
  active: boolean;
  onToggle: () => void;
}

export function DateRangePickerPopover({ from, to, onChange, active, onToggle }: DateRangePickerPopoverProps) {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!active) return;
    const handlePointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        onToggle();
      }
    };
    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, [active, onToggle]);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={onToggle}
        className={`px-3 py-1.5 rounded-xl text-[11px] font-bold border transition inline-flex items-center gap-1.5 ${
          active
            ? 'bg-pink-50 border-pink-200 text-[#d2145a]'
            : 'bg-white border-slate-200 text-slate-600 hover:border-pink-200'
        }`}
      >
        <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="3" y="4" width="18" height="18" rx="2" />
          <path d="M16 2v4M8 2v4M3 10h18" />
        </svg>
        Tùy chọn
      </button>

      {active && (
        <div className="absolute right-0 top-[calc(100%+8px)] z-[70] w-[290px] rounded-2xl border border-slate-200 bg-white p-3 shadow-xl animate-in fade-in slide-in-from-top-1 duration-150">
          <p className="text-[10px] font-black uppercase tracking-wider text-slate-400 mb-2">Chọn khoảng thời gian</p>
          <div className="space-y-3">
            <DateFieldWithCalendar
              label="Từ ngày"
              value={from}
              onChange={nextFrom => {
                const nextTo = to && nextFrom > to ? nextFrom : to;
                onChange({ from: nextFrom, to: nextTo });
              }}
              highlightFrom={from}
              highlightTo={to}
            />
            <DateFieldWithCalendar
              label="Đến ngày"
              value={to}
              onChange={nextTo => {
                const nextFrom = from && nextTo < from ? nextTo : from;
                onChange({ from: nextFrom, to: nextTo });
              }}
              highlightFrom={from}
              highlightTo={to}
            />
          </div>
          {from && to && (
            <p className="mt-3 text-[10px] font-bold text-[#d2145a] bg-pink-50 border border-pink-100 rounded-xl px-2 py-1.5 text-center">
              {formatVNTime(from)} → {formatVNTime(to)}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
