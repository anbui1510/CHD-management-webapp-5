import React from 'react';
import { Construction } from 'lucide-react';
import { useViewSubheader } from '../hooks/useViewSubheader';

interface DevelopingFeatureViewProps {
  title: string;
  subtitle?: string;
}

export default function DevelopingFeatureView({
  title,
  subtitle = 'Tính năng đang phát triển'
}: DevelopingFeatureViewProps) {
  useViewSubheader({ title, showSearch: false, icon: <Construction className="w-4 h-4" /> });

  return (
    <div className="flex-1 h-full flex items-center justify-center p-8 bg-slate-50 animate-in fade-in duration-200">
      <div className="bg-white border border-slate-200 rounded-3xl shadow-sm p-10 max-w-md text-center">
        <div className="w-14 h-14 bg-amber-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
          <Construction className="w-7 h-7 text-amber-600" />
        </div>
        <h2 className="text-base font-extrabold text-slate-800 uppercase tracking-wide">{title}</h2>
        <p className="text-sm text-slate-500 mt-2 font-semibold">{subtitle}</p>
      </div>
    </div>
  );
}
