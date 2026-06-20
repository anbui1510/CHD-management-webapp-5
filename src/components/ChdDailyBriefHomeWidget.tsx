import React, { useCallback, useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { Newspaper, ChevronRight } from 'lucide-react';
import { getTodayClientPayload, parseJsonResponse } from '../chdDailyBrief/browserApi';

interface ChdDailyBriefHomeWidgetProps {
  onOpen: () => void;
  className?: string;
}

export default function ChdDailyBriefHomeWidget({ onOpen, className = '' }: ChdDailyBriefHomeWidgetProps) {
  const [dateVN, setDateVN] = useState('');
  const [topicTitle, setTopicTitle] = useState('');

  const applyLocal = useCallback(() => {
    const local = getTodayClientPayload();
    setDateVN(local.dateVN);
    setTopicTitle(local.topic.topic);
  }, []);

  useEffect(() => {
    applyLocal();
    (async () => {
      try {
        const res = await fetch('/api/chd-brief/today');
        if (!res.ok) return;
        const data = (await parseJsonResponse(res)) as {
          dateVN?: string;
          topic?: { topic: string };
        };
        if (data.dateVN) setDateVN(data.dateVN);
        if (data.topic?.topic) setTopicTitle(data.topic.topic);
      } catch {
        // giữ dữ liệu local
      }
    })();
  }, [applyLocal]);

  return (
    <motion.button
      type="button"
      onClick={onOpen}
      whileHover={{ y: -1 }}
      className={`text-left bg-gradient-to-br from-blue-50 via-white to-pink-50/40 rounded-2xl p-3 border border-blue-100/80 shadow-sm flex flex-col relative overflow-hidden group min-h-[85px] hover:border-pink-200 hover:shadow-md transition-all ${className}`}
    >
      <div className="absolute top-1 right-1 opacity-[0.07] pointer-events-none">
        <Newspaper className="w-16 h-16 text-[#d2145a] group-hover:scale-110 transition-transform" />
      </div>

      <div className="relative z-10 flex flex-col gap-1.5 min-h-0">
        <div className="flex items-center justify-between gap-1">
          <span className="text-[10px] font-black uppercase text-blue-700 tracking-tight flex items-center gap-1">
            <Newspaper className="w-3 h-3 shrink-0" />
            CHD Daily Brief
          </span>
          <ChevronRight className="w-3.5 h-3.5 text-slate-400 group-hover:text-[#d2145a] shrink-0" />
        </div>

        <p className="text-[10px] font-bold text-slate-600 leading-snug">{dateVN}</p>

        <p className="text-[11px] font-extrabold text-slate-800 leading-snug line-clamp-3">
          {topicTitle}
        </p>
      </div>
    </motion.button>
  );
}
