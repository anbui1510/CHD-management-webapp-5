import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Search, Check, X, ChevronDown } from 'lucide-react';

interface Staff {
  StaffKey: string;
  StaffName: string;
  [key: string]: any;
}

interface StaffMultiSelectProps {
  staffList: Staff[];
  selectedMembers: string[];
  onChange: (members: string[]) => void;
  direction?: 'up' | 'down';
}

const getShortStaffName = (fullName: string, staffList: { StaffName: string }[] = []): string => {
  if (!fullName) return '';
  let cleaned = fullName.replace(/\s*\(.*?\)\s*/g, '').trim();
  cleaned = cleaned.replace(/^(BS\.|BS)\s+/i, '').trim();
  const parts = cleaned.split(/\s+/);
  if (parts.length === 0) return '';
  
  const firstName = parts[parts.length - 1];
  
  if (parts.length === 1) {
    return `BS. ${firstName}`;
  }
  
  const middleName = parts[parts.length - 2];
  
  const hasFirstNameDuplicate = staffList.length > 0 && staffList.some(s => {
    let sClean = s.StaffName.replace(/\s*\(.*?\)\s*/g, '').trim();
    sClean = sClean.replace(/^(BS\.|BS)\s+/i, '').trim();
    const sParts = sClean.split(/\s+/);
    if (sParts.length <= 1) return false;
    const sFirstName = sParts[sParts.length - 1];
    return s.StaffName !== fullName && sFirstName.toLowerCase() === firstName.toLowerCase();
  });
  
  if (hasFirstNameDuplicate && middleName) {
    const middleInitial = middleName.charAt(0).toUpperCase();
    return `BS. ${middleInitial}. ${firstName}`;
  }
  
  return `BS. ${firstName}`;
};

export function StaffMultiSelect({ staffList = [], selectedMembers = [], onChange, direction = 'down' }: StaffMultiSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);

  // Normalize selectedMembers to always be an array of strings
  const normalizedMembers = useMemo(() => {
    if (Array.isArray(selectedMembers)) return selectedMembers;
    if (typeof selectedMembers === 'string') {
      return (selectedMembers as string).split(',').map(s => s.trim()).filter(Boolean);
    }
    return [];
  }, [selectedMembers]);

  // Close dropdown on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Compute options list containing both standard Staff List and any custom names already selected
  const options = useMemo(() => {
    const stdOptions = staffList.map(s => {
      const shortName = getShortStaffName(s.StaffName, staffList);
      return {
        key: s.StaffKey,
        fullName: s.StaffName,
        shortName: shortName,
      };
    });

    // Also collect any selected members that are not represented in staffList (legacy or custom added)
    const extraOptions: typeof stdOptions = [];
    normalizedMembers.forEach((member, idx) => {
      if (!stdOptions.some(opt => opt.shortName === member)) {
        extraOptions.push({
          key: `custom_${idx}`,
          fullName: member,
          shortName: member,
        });
      }
    });

    return [...stdOptions, ...extraOptions];
  }, [staffList, normalizedMembers]);

  // Filter based on search query
  const filteredOptions = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return options;
    return options.filter(opt => 
      opt.fullName.toLowerCase().includes(q) || 
      opt.shortName.toLowerCase().includes(q)
    );
  }, [options, searchQuery]);

  const handleToggleOption = (shortName: string) => {
    let next: string[];
    if (normalizedMembers.includes(shortName)) {
      next = normalizedMembers.filter(m => m !== shortName);
    } else {
      next = [...normalizedMembers, shortName];
    }
    onChange(next);
  };

  const handleRemoveMember = (e: React.MouseEvent, shortName: string) => {
    e.stopPropagation();
    onChange(normalizedMembers.filter(m => m !== shortName));
  };

  return (
    <div ref={containerRef} className="relative w-full text-left font-sans text-xs">
      {/* Selection Control Container */}
      <div 
        onClick={() => setIsOpen(!isOpen)}
        className="w-full bg-white border border-slate-200 rounded-xl px-2.5 py-1.5 focus-within:ring-1 focus-within:ring-primary focus-within:border-primary shadow-sm cursor-pointer flex items-center justify-between min-h-[38px] transition duration-150"
      >
        {/* Selected Tags area */}
        <div className="flex flex-wrap gap-1.5 flex-1 select-none mr-2">
          {normalizedMembers.length === 0 ? (
            <span className="text-slate-400 font-semibold font-sans pl-1">-- Bấm hoặc Tìm để chọn bác sĩ --</span>
          ) : (
            normalizedMembers.map(member => (
              <span 
                key={member}
                className="inline-flex items-center gap-1 bg-pink-50 text-primary hover:bg-pink-100 border border-pink-100 px-2 py-0.5 rounded-lg text-[11px] font-bold font-sans transition-colors duration-100"
              >
                {member}
                <button
                  type="button"
                  onClick={(e) => handleRemoveMember(e, member)}
                  className="hover:text-pink-900 transition-colors cursor-pointer font-bold ml-0.5 p-0.5 rounded-full"
                >
                  <X className="w-2.5 h-2.5" />
                </button>
              </span>
            ))
          )}
        </div>
        <ChevronDown className="w-4 h-4 text-slate-400 shrink-0 select-none mr-1" />
      </div>

      {/* Floating Options Dropdown */}
      {isOpen && (
        <div className={`absolute z-50 w-full bg-white border border-slate-200 rounded-2xl shadow-xl flex flex-col overflow-hidden animate-in fade-in max-h-[250px] ${direction === 'up' ? 'bottom-full mb-1 slide-in-from-bottom-1' : 'top-full mt-1 slide-in-from-top-1'} duration-150`}>
          {/* Internal Search input */}
          <div className="flex items-center px-3 py-2 border-b border-slate-100 shrink-0 bg-slate-50 gap-2">
            <Search className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <input
              type="text"
              placeholder="Gõ tìm bác sĩ..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-transparent border-none text-xs focus:outline-none focus:ring-0 placeholder-slate-400 font-sans font-semibold py-0.5"
              autoFocus
              onClick={(e) => e.stopPropagation()}
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="text-slate-400 hover:text-slate-600 transition"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>

          {/* List of Options */}
          <div className="flex-1 overflow-y-auto py-1 scrollbar-thin">
            {filteredOptions.length === 0 ? (
              <p className="text-center text-slate-400 italic py-4 font-sans font-medium">Không tìm thấy bác sĩ nào</p>
            ) : (
              filteredOptions.map(opt => {
                const isSelected = normalizedMembers.includes(opt.shortName);
                return (
                  <div
                    key={opt.key}
                    onClick={() => handleToggleOption(opt.shortName)}
                    className={`flex items-center justify-between px-3.5 py-2 font-sans font-bold cursor-pointer transition duration-100 select-none ${
                        isSelected 
                          ? 'bg-pink-50 text-primary' 
                          : 'hover:bg-slate-50 text-slate-700'
                    }`}
                  >
                    <div className="flex flex-col">
                      <span className="text-neutral-900 group-hover:text-neutral-950 font-extrabold">{opt.shortName}</span>
                      <span className="text-[10px] text-slate-400 font-medium font-sans mt-0.5">{opt.fullName}</span>
                    </div>
                    {isSelected && (
                      <Check className="w-4 h-4 text-primary shrink-0 font-bold ml-2" />
                    )}
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
