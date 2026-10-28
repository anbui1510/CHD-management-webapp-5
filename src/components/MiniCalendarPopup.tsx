import React, { useEffect, useRef, useState } from 'react';
import { formatVNTime } from '../types';
import { MiniCalendar } from './MiniCalendar';
import { VNDateInput } from './VNDateInput';

export { MiniCalendar } from './MiniCalendar';

interface DateFieldWithCalendarProps {
  label: string;
  value: string;
  onChange: (isoDate: string) => void;
  highlightFrom?: string;
  highlightTo?: string;
  /** When true (default), allow typing dd/mm/yyyy in addition to calendar pick. */
  allowManual?: boolean;
}

export function DateFieldWithCalendar({
  label,
  value,
  onChange,
  highlightFrom,
  highlightTo,
  allowManual = true,
}: DateFieldWithCalendarProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (event: MouseEvent | TouchEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('touchstart', handlePointerDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('touchstart', handlePointerDown);
    };
  }, [open]);

  if (allowManual) {
    return (
      <div ref={rootRef} className="relative font-sans">
        {label ? (
          <span className="text-[10px] font-black uppercase text-slate-500">{label}</span>
        ) : null}
        <div className={label ? 'mt-1' : ''}>
          <VNDateInput
            value={value}
            onChange={onChange}
            className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold font-sans focus:outline-none focus:ring-1 focus:ring-pink-400"
          />
        </div>
      </div>
    );
  }

  return (
    <div ref={rootRef} className="relative font-sans">
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
        <span className="text-xs font-bold font-sans text-slate-800">
          {value ? formatVNTime(value) : 'Chọn ngày'}
        </span>
        <span className="w-7 h-7 rounded-lg bg-pink-50 border border-pink-100 flex items-center justify-center shrink-0">
          <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 text-primary" fill="none" stroke="currentColor" strokeWidth="2">
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
    const handlePointerDown = (event: MouseEvent | TouchEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        onToggle();
      }
    };
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('touchstart', handlePointerDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('touchstart', handlePointerDown);
    };
  }, [active, onToggle]);

  return (
    <div ref={rootRef} className="relative font-sans">
      <button
        type="button"
        onClick={onToggle}
        className={`px-3 py-1.5 rounded-xl text-[11px] font-bold border transition inline-flex items-center gap-1.5 ${
          active
            ? 'bg-pink-50 border-pink-200 text-primary'
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
            <p className="mt-3 text-[10px] font-bold text-primary bg-pink-50 border border-pink-100 rounded-xl px-2 py-1.5 text-center">
              {formatVNTime(from)} → {formatVNTime(to)}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
