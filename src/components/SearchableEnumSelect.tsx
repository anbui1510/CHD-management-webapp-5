import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown, Search, X } from 'lucide-react';
import { removeDiacritics } from '../types';
import { setMobileKeyboardOpen } from '../bootstrap/mobileViewport';
import { useIsMobile } from '../hooks/useMediaQuery';

interface SearchableEnumSelectProps {
  options: string[];
  value?: string;
  values?: string[];
  onChange?: (value: string) => void;
  onMultiChange?: (values: string[]) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  multiple?: boolean;
  required?: boolean;
  direction?: 'up' | 'down';
  className?: string;
  allowCreate?: boolean;
  createLabel?: (value: string) => string;
  onCreateOption?: (value: string) => void | Promise<void>;
  /** Tiêu đề hiển thị trên sheet mobile (mặc định: lấy từ `<label>` cùng cột). */
  fieldLabel?: string;
}

type NavItem =
  | { kind: 'clear' }
  | { kind: 'option'; value: string }
  | { kind: 'create' };

export function SearchableEnumSelect({
  options,
  value = '',
  values = [],
  onChange,
  onMultiChange,
  placeholder = '-- Chọn --',
  searchPlaceholder = 'Tìm kiếm...',
  multiple = false,
  required = false,
  direction = 'down',
  className = '',
  allowCreate = false,
  createLabel,
  onCreateOption,
  fieldLabel
}: SearchableEnumSelectProps) {
  const isMobile = useIsMobile();
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const mobilePanelRef = useRef<HTMLDivElement>(null);
  const [mobileSheetStyle, setMobileSheetStyle] = useState<React.CSSProperties>({});
  const [mobileBackdropStyle, setMobileBackdropStyle] = useState<React.CSSProperties>({});
  const [mobileContextLabel, setMobileContextLabel] = useState('');

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node;
      if (rootRef.current?.contains(target)) return;
      if (mobilePanelRef.current?.contains(target)) return;
      setIsOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, []);

  const normalizedOptions = useMemo(() => {
    const seen = new Set<string>();
    return options
      .map(opt => String(opt || '').trim())
      .filter(Boolean)
      .filter(opt => {
        const key = opt.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
  }, [options]);

  const selectedValues = multiple ? values.filter(Boolean) : (value ? [value] : []);
  const filteredOptions = useMemo(() => {
    const q = removeDiacritics(searchTerm).toLowerCase().trim();
    if (!q) return normalizedOptions;
    return normalizedOptions.filter(opt => removeDiacritics(opt).toLowerCase().includes(q));
  }, [normalizedOptions, searchTerm]);

  const canCreate = useMemo(() => {
    const valueToCreate = searchTerm.trim();
    if (!allowCreate || !valueToCreate) return false;
    return !normalizedOptions.some(option => option.toLowerCase() === valueToCreate.toLowerCase());
  }, [allowCreate, normalizedOptions, searchTerm]);

  const navItems = useMemo((): NavItem[] => {
    const items: NavItem[] = [];
    if (!multiple) items.push({ kind: 'clear' });
    filteredOptions.forEach(opt => items.push({ kind: 'option', value: opt }));
    if (canCreate) items.push({ kind: 'create' });
    return items;
  }, [multiple, filteredOptions, canCreate]);

  useEffect(() => {
    setHighlightedIndex(0);
  }, [searchTerm, isOpen, navItems.length]);

  useEffect(() => {
    if (!isOpen) return;
    const delay = isMobile ? 80 : 0;
    const id = window.setTimeout(() => {
      searchInputRef.current?.focus({ preventScroll: true });
    }, delay);
    return () => window.clearTimeout(id);
  }, [isOpen, isMobile]);

  useEffect(() => {
    if (!isOpen || !isMobile) return;

    const updateSheetPosition = () => {
      const vv = window.visualViewport;
      const layoutH = window.innerHeight;
      const offsetTop = vv?.offsetTop ?? 0;
      const vh = vv?.height ?? layoutH;
      const bottomInset = Math.max(0, layoutH - offsetTop - vh);
      // Bottom sheet: luôn bám mé trên bàn phím — tránh neo theo ô thấp làm top > bottom (panel biến mất).
      const sheetHeight = Math.min(520, Math.max(240, Math.round(vh * 0.78)));

      setMobileBackdropStyle({
        position: 'fixed',
        top: offsetTop,
        left: 0,
        right: 0,
        height: vh,
        zIndex: 9998,
      });
      setMobileSheetStyle({
        position: 'fixed',
        left: 0,
        right: 0,
        bottom: bottomInset,
        height: sheetHeight,
        maxHeight: sheetHeight,
        zIndex: 9999,
      });
    };

    updateSheetPosition();
    const vv = window.visualViewport;
    vv?.addEventListener('resize', updateSheetPosition);
    vv?.addEventListener('scroll', updateSheetPosition);
    window.addEventListener('resize', updateSheetPosition);
    return () => {
      vv?.removeEventListener('resize', updateSheetPosition);
      vv?.removeEventListener('scroll', updateSheetPosition);
      window.removeEventListener('resize', updateSheetPosition);
    };
  }, [isOpen, isMobile]);

  useEffect(() => {
    if (!isOpen || !listRef.current) return;
    const el = listRef.current.querySelector(`[data-nav-index="${highlightedIndex}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [highlightedIndex, isOpen]);

  const closeDropdown = useCallback(() => {
    setIsOpen(false);
    setSearchTerm('');
    setHighlightedIndex(0);
    if (isMobile) setMobileKeyboardOpen(false);
  }, [isMobile]);

  const resolveContextLabel = useCallback(() => {
    if (fieldLabel?.trim()) return fieldLabel.trim();
    const labelEl = rootRef.current?.parentElement?.querySelector('label');
    const fromDom = labelEl?.textContent?.trim();
    if (fromDom) return fromDom;
    return placeholder;
  }, [fieldLabel, placeholder]);

  const scrollTriggerIntoEditor = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const container = trigger.closest('[data-touch-scroll-container]');
    if (!(container instanceof HTMLElement)) return;
    const labelEl = trigger.parentElement?.querySelector('label');
    const anchor = labelEl ?? trigger;
    const anchorRect = anchor.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();
    if (anchorRect.top < containerRect.top + 4) {
      container.scrollTop -= containerRect.top - anchorRect.top + 8;
    }
  }, []);

  const openDropdown = useCallback(() => {
    if (isMobile) {
      setMobileContextLabel(resolveContextLabel());
      // Chỉ cuộn lên nếu label/ô bị khuất phía trên — không cuộn khi ô đã nằm thấp (tránh đẩy layout).
      scrollTriggerIntoEditor();
    }
    setIsOpen(true);
    setHighlightedIndex(0);
  }, [isMobile, resolveContextLabel, scrollTriggerIntoEditor]);

  const toggleMultiValue = (option: string) => {
    const next = selectedValues.includes(option)
      ? selectedValues.filter(item => item !== option)
      : [...selectedValues, option];
    onMultiChange?.(next);
  };

  const selectSingleValue = (option: string) => {
    onChange?.(option);
    closeDropdown();
    triggerRef.current?.focus();
  };

  const createOption = async () => {
    const valueToCreate = searchTerm.trim();
    if (!valueToCreate) return;
    await onCreateOption?.(valueToCreate);
    if (multiple) {
      onMultiChange?.([...selectedValues, valueToCreate]);
    } else {
      onChange?.(valueToCreate);
    }
    closeDropdown();
    triggerRef.current?.focus();
  };

  const activateHighlighted = () => {
    const item = navItems[highlightedIndex];
    if (!item) return;
    if (item.kind === 'clear') {
      selectSingleValue('');
      return;
    }
    if (item.kind === 'create') {
      void createOption();
      return;
    }
    if (multiple) {
      toggleMultiValue(item.value);
    } else {
      selectSingleValue(item.value);
    }
  };

  const removeSelected = (event: React.MouseEvent, option: string) => {
    event.stopPropagation();
    if (multiple) {
      onMultiChange?.(selectedValues.filter(item => item !== option));
    } else {
      onChange?.('');
    }
  };

  const handleTriggerKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (!isOpen) openDropdown();
    }
  };

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIndex(prev => Math.min(prev + 1, Math.max(navItems.length - 1, 0)));
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex(prev => Math.max(prev - 1, 0));
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      if (navItems.length > 0) activateHighlighted();
      return;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      closeDropdown();
      triggerRef.current?.focus();
      return;
    }
    if (e.key === 'Tab') {
      closeDropdown();
    }
  };

  let navCursor = 0;

  const triggerBorderClass =
    required && selectedValues.length === 0
      ? 'border-rose-200'
      : 'border-slate-200';

  const renderSelectedFace = (interactiveChips: boolean) => (
    <span className="flex-1 flex flex-wrap items-center gap-1.5 text-left min-w-0">
      {selectedValues.length === 0 ? (
        <span className="text-slate-400">{placeholder}</span>
      ) : (
        selectedValues.map(item => (
          <span
            key={item}
            className="inline-flex items-center gap-1 bg-indigo-50 text-indigo-700 border border-indigo-100 px-2 py-0.5 rounded-lg text-[11px] font-bold max-w-full"
          >
            <span className="truncate">{item}</span>
            {interactiveChips && (
              <span
                role="button"
                tabIndex={-1}
                onClick={(e) => removeSelected(e, item)}
                className="hover:text-indigo-950 rounded-full p-0.5 shrink-0"
              >
                <X className="w-2.5 h-2.5" />
              </span>
            )}
          </span>
        ))
      )}
    </span>
  );

  const dropdownPanelClass = `w-full bg-white border border-slate-200 shadow-xl flex flex-col overflow-hidden min-h-0 ${
    isMobile ? 'h-full max-h-full rounded-t-2xl border-b-0' : 'max-h-[260px] rounded-2xl'
  }`;

  const mobileSheetHeader = (
    <div className="shrink-0 px-3 pt-2.5 pb-2 border-b border-slate-100 bg-white">
      <div className="flex items-start justify-between gap-2 mb-2">
        <p className="text-[10px] font-bold uppercase text-slate-500 leading-snug flex-1">
          {mobileContextLabel || resolveContextLabel()}
        </p>
        <button
          type="button"
          onClick={() => closeDropdown()}
          className="shrink-0 p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          aria-label="Đóng danh sách"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
      <div
        className={`w-full min-h-[38px] bg-slate-50 border rounded-xl px-2.5 py-1.5 text-xs font-semibold flex items-center justify-between gap-2 ${triggerBorderClass}`}
        aria-hidden
      >
        {renderSelectedFace(true)}
        <ChevronDown className="w-4 h-4 text-primary shrink-0 rotate-180" />
      </div>
    </div>
  );

  const dropdownInner = (
    <>
      <div className="flex items-center gap-2 px-3 py-2 bg-slate-50 border-b border-slate-100 shrink-0">
        <Search className="w-3.5 h-3.5 text-slate-400" />
        <input
          ref={searchInputRef}
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          onKeyDown={handleSearchKeyDown}
          onClick={(e) => e.stopPropagation()}
          onFocus={() => isMobile && setMobileKeyboardOpen(true)}
          onBlur={() => {
            if (!isMobile) return;
            window.setTimeout(() => {
              const active = document.activeElement;
              if (mobilePanelRef.current?.contains(active)) return;
              setMobileKeyboardOpen(false);
            }, 120);
          }}
          placeholder={searchPlaceholder}
          className="w-full bg-transparent border-none outline-none text-xs font-semibold text-slate-700 placeholder:text-slate-400"
        />
        {searchTerm && (
          <button type="button" onClick={() => setSearchTerm('')} className="text-slate-400 hover:text-slate-600">
            <X className="w-3 h-3" />
          </button>
        )}
      </div>

      <div ref={listRef} role="listbox" className="overflow-y-auto py-1 custom-scrollbar min-h-0 flex-1">
        {!multiple && (() => {
          const idx = navCursor++;
          const highlighted = highlightedIndex === idx;
          return (
            <div
              key="__clear__"
              data-nav-index={idx}
              role="option"
              aria-selected={!value}
              onMouseEnter={() => setHighlightedIndex(idx)}
              onClick={() => selectSingleValue('')}
              className={`px-3.5 py-2 text-xs font-semibold cursor-pointer flex items-center justify-between ${
                highlighted ? 'bg-primary/10 text-primary' : 'text-slate-400 hover:bg-slate-50'
              }`}
            >
              <span>{placeholder}</span>
              {!value && <Check className="w-4 h-4 text-primary" />}
            </div>
          );
        })()}
        {filteredOptions.length === 0 && !canCreate ? (
          <div className="px-4 py-5 text-center text-xs italic text-slate-400">Không tìm thấy lựa chọn phù hợp</div>
        ) : filteredOptions.map(option => {
          const selected = selectedValues.includes(option);
          const idx = navCursor++;
          const highlighted = highlightedIndex === idx;
          return (
            <div
              key={option}
              data-nav-index={idx}
              role="option"
              aria-selected={selected}
              onMouseEnter={() => setHighlightedIndex(idx)}
              onClick={() => (multiple ? toggleMultiValue(option) : selectSingleValue(option))}
              className={`px-3.5 py-2 text-xs font-bold cursor-pointer transition flex items-center justify-between gap-2 ${
                highlighted
                  ? 'bg-primary/10 text-primary'
                  : selected
                    ? 'bg-indigo-50 text-indigo-700'
                    : 'text-slate-700 hover:bg-slate-50'
              }`}
            >
              <span className="leading-snug">{option}</span>
              {selected && <Check className="w-4 h-4 text-primary shrink-0" />}
            </div>
          );
        })}
        {canCreate && (() => {
          const idx = navCursor++;
          const highlighted = highlightedIndex === idx;
          return (
            <button
              key="__create__"
              type="button"
              data-nav-index={idx}
              onMouseEnter={() => setHighlightedIndex(idx)}
              onClick={() => void createOption()}
              className={`w-full px-3.5 py-2 text-left text-xs font-extrabold border-t border-slate-100 ${
                highlighted ? 'bg-emerald-100 text-emerald-800' : 'text-emerald-700 hover:bg-emerald-50'
              }`}
            >
              {createLabel ? createLabel(searchTerm.trim()) : `Thêm "${searchTerm.trim()}"`}
            </button>
          );
        })()}
      </div>
    </>
  );

  return (
    <div ref={rootRef} data-searchable-enum-root className={`relative w-full text-left ${className}`}>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => (isOpen ? closeDropdown() : openDropdown())}
        onKeyDown={handleTriggerKeyDown}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        className={`w-full min-h-[38px] bg-white border rounded-xl px-2.5 py-1.5 text-xs font-semibold flex items-center justify-between gap-2 transition shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/30 ${
          triggerBorderClass
        } ${isOpen && isMobile ? 'ring-2 ring-primary/35 border-primary/30' : 'hover:border-primary/40'}`}
        aria-label={mobileContextLabel || fieldLabel || placeholder}
      >
        {renderSelectedFace(true)}
        <ChevronDown className={`w-4 h-4 text-slate-400 shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && isMobile && typeof document !== 'undefined'
        ? createPortal(
            <>
              <div
                style={mobileBackdropStyle}
                className="bg-slate-900/20"
                aria-hidden
                onClick={() => closeDropdown()}
              />
              <div
                ref={mobilePanelRef}
                data-enum-select-dropdown
                data-touch-scroll-container
                style={mobileSheetStyle}
                className={`${dropdownPanelClass} animate-in slide-in-from-bottom-2 duration-150`}
              >
                {mobileSheetHeader}
                {dropdownInner}
              </div>
            </>,
            document.body
          )
        : null}

      {isOpen && !isMobile && (
        <div
          data-enum-select-dropdown
          className={`absolute z-[80] ${dropdownPanelClass} ${direction === 'up' ? 'bottom-full mb-1' : 'top-full mt-1'}`}
        >
          {dropdownInner}
        </div>
      )}
    </div>
  );
}
