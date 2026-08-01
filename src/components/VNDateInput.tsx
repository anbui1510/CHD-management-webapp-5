import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { MiniCalendar, toIsoDate } from './MiniCalendar';

interface Props extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type'> {
  value: string; // ISO format: yyyy-mm-dd
  onChange: (value: string) => void;
}

function isoToDisplay(iso: string): string {
  if (!iso) return '';
  const parts = iso.split('-');
  if (parts.length !== 3) return '';
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

function isValidIsoDate(iso: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false;
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return false;
  const rebuilt = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return rebuilt === iso;
}

/**
 * Unified date field: type dd/mm/yyyy manually AND pick from calendar icon.
 * Calendar renders via portal so it is not clipped by modal overflow on mobile.
 */
export function VNDateInput({ value, onChange, className, ...props }: Props) {
  const [displayValue, setDisplayValue] = useState(() => isoToDisplay(value));
  const [open, setOpen] = useState(false);
  const [popoverStyle, setPopoverStyle] = useState<React.CSSProperties>({});
  const rootRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setDisplayValue(isoToDisplay(value));
  }, [value]);

  useEffect(() => {
    if (!open || !rootRef.current) return;

    const updatePosition = () => {
      const rect = rootRef.current!.getBoundingClientRect();
      const popoverWidth = 276;
      const popoverHeight = 320;
      const gap = 6;
      const viewportPadding = 8;

      let top = rect.bottom + gap;
      if (top + popoverHeight > window.innerHeight - viewportPadding) {
        top = Math.max(viewportPadding, rect.top - popoverHeight - gap);
      }

      let left = rect.right - popoverWidth;
      if (left < viewportPadding) left = viewportPadding;
      if (left + popoverWidth > window.innerWidth - viewportPadding) {
        left = Math.max(viewportPadding, window.innerWidth - popoverWidth - viewportPadding);
      }

      setPopoverStyle({
        position: 'fixed',
        top,
        left,
        width: popoverWidth,
        zIndex: 9999,
      });
    };

    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node;
      if (rootRef.current?.contains(target)) return;
      if (popoverRef.current?.contains(target)) return;
      setOpen(false);
    };
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('touchstart', handlePointerDown);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('touchstart', handlePointerDown);
      document.removeEventListener('keydown', handleKey);
    };
  }, [open]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let raw = e.target.value.replace(/[^\d]/g, '');
    if (raw.length > 8) raw = raw.slice(0, 8);

    let formatted = raw;
    if (raw.length > 4) {
      formatted = `${raw.slice(0, 2)}/${raw.slice(2, 4)}/${raw.slice(4)}`;
    } else if (raw.length > 2) {
      formatted = `${raw.slice(0, 2)}/${raw.slice(2)}`;
    }

    setDisplayValue(formatted);

    if (raw.length === 8) {
      const day = raw.slice(0, 2);
      const month = raw.slice(2, 4);
      const year = raw.slice(4);
      const iso = `${year}-${month}-${day}`;
      onChange(isValidIsoDate(iso) ? iso : '');
    } else {
      onChange('');
    }
  };

  const pickDate = (iso: string) => {
    onChange(iso);
    setDisplayValue(isoToDisplay(iso));
    setOpen(false);
  };

  const widthClasses = ((className || '').match(/\b(?:w-|max-w-|min-w-)[^\s]*/g) || ['w-full']).join(' ');
  const inputClass = `${(className || '')
    .replace(/\b(?:w-|max-w-|min-w-)[^\s]*/g, '')
    .replace(/\bfont-mono\b/g, 'font-sans')} w-full pr-10 font-sans`.trim();

  return (
    <div ref={rootRef} className={`relative flex items-center font-sans ${widthClasses}`}>
      <input
        {...props}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        placeholder={props.placeholder || 'Nhập dd/mm/yyyy hoặc chọn lịch'}
        value={displayValue}
        onChange={handleChange}
        className={inputClass}
      />
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen(prev => !prev);
        }}
        className={`absolute right-1.5 z-10 text-slate-400 hover:text-[#d2145a] focus:outline-none cursor-pointer p-1.5 rounded-lg transition flex items-center justify-center touch-manipulation ${
          open ? 'bg-pink-50 text-[#d2145a]' : 'hover:bg-slate-100'
        }`}
        title="Chọn từ lịch"
        aria-label="Chọn ngày từ lịch"
        aria-expanded={open}
        tabIndex={-1}
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 pointer-events-none">
          <path d="M8 2v4"/><path d="M16 2v4"/><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18"/>
        </svg>
      </button>

      {open && createPortal(
        <div
          ref={popoverRef}
          style={popoverStyle}
          className="rounded-2xl border border-slate-200 bg-white p-3 shadow-xl animate-in fade-in zoom-in-95 duration-150 font-sans"
        >
          <MiniCalendar value={value} onChange={pickDate} />
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={() => pickDate(toIsoDate(new Date()))}
              className="flex-1 text-[11px] font-bold text-[#d2145a] bg-pink-50 border border-pink-100 rounded-xl py-1.5"
            >
              Hôm nay
            </button>
            <button
              type="button"
              onClick={() => {
                onChange('');
                setDisplayValue('');
                setOpen(false);
              }}
              className="flex-1 text-[11px] font-bold text-slate-500 bg-slate-50 border border-slate-200 rounded-xl py-1.5"
            >
              Xóa
            </button>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
