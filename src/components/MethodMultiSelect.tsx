import React, { useState, useRef, useEffect } from 'react';
import { Search, X, Check } from 'lucide-react';

interface MethodMultiSelectProps {
  options: string[];
  selectedMethods: string[];
  onChange: (selected: string[]) => void;
  placeholder?: string;
  direction?: 'up' | 'down';
}

export function MethodMultiSelect({ options, selectedMethods, onChange, placeholder = "Chọn phương pháp...", direction = 'down' }: MethodMultiSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const filteredOptions = options.filter(opt => opt.toLowerCase().includes(searchTerm.toLowerCase()));

  const toggleOption = (option: string) => {
    const newSelected = selectedMethods.includes(option)
      ? selectedMethods.filter(item => item !== option)
      : [...selectedMethods, option];
    onChange(newSelected);
  };

  const removeOption = (e: React.MouseEvent, option: string) => {
    e.stopPropagation();
    onChange(selectedMethods.filter(item => item !== option));
  };

  return (
    <div className="relative w-full" ref={dropdownRef}>
      <div 
        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 min-h-[42px] cursor-pointer flex flex-wrap gap-2 items-center focus-within:ring-1 focus-within:ring-indigo-500 transition-shadow"
        onClick={() => setIsOpen(!isOpen)}
      >
        {selectedMethods.length === 0 && (
          <span className="text-slate-400 font-medium">{placeholder}</span>
        )}
        {selectedMethods.map(method => (
          <span key={method} className="bg-indigo-100 text-indigo-700 text-xs font-bold px-2 py-1 flex items-center gap-1 rounded-md">
            {method}
            <button 
              type="button" 
              onClick={(e) => removeOption(e, method)}
              className="hover:bg-indigo-200 hover:text-indigo-900 rounded-full p-0.5 transition"
            >
              <X className="w-3 h-3" />
            </button>
          </span>
        ))}
      </div>

      {isOpen && (
        <div className={`absolute z-50 w-full bg-white border border-slate-200 rounded-xl shadow-lg max-h-60 flex flex-col overflow-hidden ${direction === 'up' ? 'bottom-full mb-1' : 'top-full mt-1'}`}>
          <div className="p-2 border-b border-slate-100 shrink-0 relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Tìm kiếm..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              onClick={(e) => e.stopPropagation()}
              className="w-full pl-8 pr-3 py-1.5 bg-slate-50 border-none rounded-lg text-sm text-slate-700 focus:ring-0 focus:outline-none placeholder:text-slate-400"
            />
          </div>
          <div className="overflow-y-auto w-full custom-scrollbar py-1">
            {filteredOptions.length === 0 ? (
              <div className="p-3 text-center text-slate-500 text-sm italic font-medium">Không tìm thấy phương pháp nào</div>
            ) : (
              filteredOptions.map(option => {
                const isSelected = selectedMethods.includes(option);
                return (
                  <div
                    key={option}
                    onClick={() => toggleOption(option)}
                    className={`px-3 py-2 cursor-pointer flex items-center justify-between text-sm transition font-medium ${isSelected ? 'bg-indigo-50 text-indigo-700' : 'hover:bg-slate-50 text-slate-700'}`}
                  >
                    <span>{option}</span>
                    {isSelected && <Check className="w-4 h-4 text-indigo-600" />}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
