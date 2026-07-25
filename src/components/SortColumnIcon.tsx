import { ChevronDown, ChevronUp } from 'lucide-react';
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

  if (!active) {
    return (
      <span className="inline-flex flex-col items-center justify-center leading-none text-slate-400 shrink-0">
        <ChevronUp className="w-2.5 h-2.5 -mb-0.5" strokeWidth={2.5} />
        <ChevronDown className="w-2.5 h-2.5" strokeWidth={2.5} />
      </span>
    );
  }

  if (order === 'asc') {
    return <ChevronDown className="w-3 h-3 text-indigo-600 shrink-0" strokeWidth={2.5} />;
  }

  return <ChevronUp className="w-3 h-3 text-indigo-600 shrink-0" strokeWidth={2.5} />;
}
