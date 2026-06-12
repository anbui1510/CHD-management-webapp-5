import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Search, X } from 'lucide-react';
import { removeDiacritics } from '../types';

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
}

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
  className = ''
}: SearchableEnumSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
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

  const toggleMultiValue = (option: string) => {
    const next = selectedValues.includes(option)
      ? selectedValues.filter(item => item !== option)
      : [...selectedValues, option];
    onMultiChange?.(next);
  };

  const selectSingleValue = (option: string) => {
    onChange?.(option);
    setIsOpen(false);
    setSearchTerm('');
  };

  const removeSelected = (event: React.MouseEvent, option: string) => {
    event.stopPropagation();
    if (multiple) {
      onMultiChange?.(selectedValues.filter(item => item !== option));
    } else {
      onChange?.('');
    }
  };

  return (
    <div ref={rootRef} className={`relative w-full text-left ${className}`}>
      <button
        type="button"
        onClick={() => setIsOpen(prev => !prev)}
        className={`w-full min-h-[38px] bg-white border rounded-xl px-2.5 py-1.5 text-xs font-semibold flex items-center justify-between gap-2 transition shadow-sm ${
          required && selectedValues.length === 0
            ? 'border-rose-200'
            : 'border-slate-200 hover:border-[#d2145a]/40'
        }`}
      >
        <span className="flex-1 flex flex-wrap items-center gap-1.5 text-left">
          {selectedValues.length === 0 ? (
            <span className="text-slate-400">{placeholder}</span>
          ) : selectedValues.map(item => (
            <span
              key={item}
              className="inline-flex items-center gap-1 bg-indigo-50 text-indigo-700 border border-indigo-100 px-2 py-0.5 rounded-lg text-[11px] font-bold"
            >
              {item}
              <span
                role="button"
                tabIndex={-1}
                onClick={(e) => removeSelected(e, item)}
                className="hover:text-indigo-950 rounded-full p-0.5"
              >
                <X className="w-2.5 h-2.5" />
              </span>
            </span>
          ))}
        </span>
        <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />
      </button>

      {isOpen && (
        <div className={`absolute z-[80] w-full bg-white border border-slate-200 rounded-2xl shadow-xl flex flex-col overflow-hidden max-h-[260px] ${
          direction === 'up' ? 'bottom-full mb-1' : 'top-full mt-1'
        }`}>
          <div className="flex items-center gap-2 px-3 py-2 bg-slate-50 border-b border-slate-100 shrink-0">
            <Search className="w-3.5 h-3.5 text-slate-400" />
            <input
              autoFocus
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              onClick={(e) => e.stopPropagation()}
              placeholder={searchPlaceholder}
              className="w-full bg-transparent border-none outline-none text-xs font-semibold text-slate-700 placeholder:text-slate-400"
            />
            {searchTerm && (
              <button type="button" onClick={() => setSearchTerm('')} className="text-slate-400 hover:text-slate-600">
                <X className="w-3 h-3" />
              </button>
            )}
          </div>

          <div className="overflow-y-auto py-1 custom-scrollbar">
            {!multiple && (
              <div
                onClick={() => selectSingleValue('')}
                className="px-3.5 py-2 text-xs font-semibold cursor-pointer text-slate-400 hover:bg-slate-50 flex items-center justify-between"
              >
                <span>{placeholder}</span>
                {!value && <Check className="w-4 h-4 text-[#d2145a]" />}
              </div>
            )}
            {filteredOptions.length === 0 ? (
              <div className="px-4 py-5 text-center text-xs italic text-slate-400">Không tìm thấy lựa chọn phù hợp</div>
            ) : filteredOptions.map(option => {
              const selected = selectedValues.includes(option);
              return (
                <div
                  key={option}
                  onClick={() => multiple ? toggleMultiValue(option) : selectSingleValue(option)}
                  className={`px-3.5 py-2 text-xs font-bold cursor-pointer transition flex items-center justify-between gap-2 ${
                    selected ? 'bg-indigo-50 text-indigo-700' : 'text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <span className="leading-snug">{option}</span>
                  {selected && <Check className="w-4 h-4 text-[#d2145a] shrink-0" />}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
