import { ArrowUpDown } from 'lucide-react';
import { useIsMobile } from '../hooks/useMediaQuery';

interface SortColumnIconProps {
  active: boolean;
  order: 'asc' | 'desc';
}

export function SortColumnIcon({ active, order }: SortColumnIconProps) {
  const isMobile = useIsMobile();

  if (!isMobile) {
    return (
      <span className="text-[11px] text-slate-400 font-semibold inline-block">
        {active ? (order === 'asc' ? '▲' : '▼') : '↕'}
      </span>
    );
  }

  return (
    <span
      className={`inline-flex items-center justify-center w-5 h-5 rounded-full shrink-0 border ${
        active
          ? 'bg-white border-indigo-200 text-indigo-600'
          : 'bg-white border-slate-200 text-slate-400'
      }`}
    >
      <ArrowUpDown
        className={`w-2.5 h-2.5 transition-transform duration-200 ${active && order === 'asc' ? 'rotate-180' : ''}`}
      />
    </span>
  );
}
