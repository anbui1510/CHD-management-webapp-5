import React, { useEffect, useRef } from 'react';
import { UserCircle, ChevronDown } from 'lucide-react';
import type { Staff } from '../types';
import { getStaffInitial } from '../utils/staffNameMatch';

interface StaffAccountMenuProps {
  staff: Staff;
  isOpen: boolean;
  onToggle: () => void;
  onClose: () => void;
  onViewProfile: () => void;
}

export default function StaffAccountMenu({
  staff,
  isOpen,
  onToggle,
  onClose,
  onViewProfile,
}: StaffAccountMenuProps) {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        onClose();
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen, onClose]);

  const initial = getStaffInitial(staff);

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        type="button"
        onClick={onToggle}
        className={`flex items-center gap-1.5 rounded-xl px-2 py-0.5 transition ${
          isOpen
            ? 'bg-white/20 border border-white/30'
            : 'bg-white/10 border border-white/15 hover:bg-white/15'
        }`}
        title="Tài khoản"
      >
        <div className="w-5 h-5 rounded-full bg-white text-[#d2145a] font-extrabold text-[10px] flex items-center justify-center uppercase shadow-inner shrink-0">
          {initial}
        </div>
        <span className="font-extrabold text-xs text-white max-w-[140px] truncate hidden sm:inline">
          {staff.StaffName}
        </span>
        <ChevronDown className={`w-3.5 h-3.5 text-white/80 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute right-0 top-[calc(100%+8px)] z-[120] min-w-[210px] rounded-2xl border border-slate-200 bg-white shadow-xl py-1.5 animate-in fade-in slide-in-from-top-1 duration-150">
          <div className="px-3 py-2 border-b border-slate-100">
            <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Tài khoản</p>
            <p className="text-xs font-extrabold text-slate-800 truncate">{staff.StaffName}</p>
            <p className="text-[10px] font-bold text-[#d2145a]">{staff.Role}</p>
          </div>
          <button
            type="button"
            onClick={() => {
              onViewProfile();
              onClose();
            }}
            className="w-full flex items-center gap-2 px-3 py-2.5 text-left text-xs font-bold text-slate-700 hover:bg-pink-50 hover:text-[#d2145a] transition"
          >
            <UserCircle className="w-4 h-4 shrink-0" />
            Xem Profile
          </button>
        </div>
      )}
    </div>
  );
}
