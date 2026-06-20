import React from 'react';
import { Pencil } from 'lucide-react';

interface PatientAdminEditButtonProps {
  onClick: () => void;
  title?: string;
  className?: string;
}

export function PatientAdminEditButton({
  onClick,
  title = 'Sửa hành chính',
  className = '',
}: PatientAdminEditButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={title}
      className={`w-9 h-9 shrink-0 rounded-full bg-white hover:bg-[#d2145a] hover:text-white border border-slate-300 hover:border-[#d2145a] text-[#d2145a] shadow-sm transition flex items-center justify-center cursor-pointer ${className}`}
    >
      <Pencil className="w-4 h-4" />
    </button>
  );
}
