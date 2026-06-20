import React, { useCallback, useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { Newspaper, ChevronRight, Sparkles, BookOpen } from 'lucide-react';
import { getTodayClientPayload, parseJsonResponse } from '../chdDailyBrief/browserApi';
import type { ChdBriefContent } from '../chdDailyBrief/types';

interface ChdDailyBriefHomeWidgetProps {
  onOpen: () => void;
  className?: string;
}

export default function ChdDailyBriefHomeWidget({ onOpen, className = '' }: ChdDailyBriefHomeWidgetProps) {
  const [dateVN, setDateVN] = useState('');
  const [topicTitle, setTopicTitle] = useState('');
  const [content, setContent] = useState<ChdBriefContent | null>(null);

  const applyLocal = useCallback(() => {
    const local = getTodayClientPayload();
    setDateVN(local.dateVN);
    setTopicTitle(local.topic.topic);
    setContent(local.content);
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
          content?: ChdBriefContent | null;
        };
        if (data.dateVN) setDateVN(data.dateVN);
        if (data.topic?.topic) setTopicTitle(data.topic.topic);
        if (data.content) setContent(data.content);
      } catch {
        // giữ dữ liệu local
      }
    })();
  }, [applyLocal]);

  const previewArticle = content?.articles?.[0];
  const articleCount = content?.articles?.length ?? 0;

  return (
    <motion.button
      type="button"
      onClick={onOpen}
      whileHover={{ y: -1 }}
      className={`text-left bg-gradient-to-br from-blue-50 via-white to-pink-50/40 rounded-2xl p-3 border border-blue-100/80 shadow-sm flex flex-col justify-between relative overflow-hidden group min-h-[85px] hover:border-pink-200 hover:shadow-md transition-all ${className}`}
    >
      <div className="absolute top-1 right-1 opacity-[0.07] pointer-events-none">
        <Newspaper className="w-16 h-16 text-[#d2145a] group-hover:scale-110 transition-transform" />
      </div>

      <div className="relative z-10 flex flex-col h-full min-h-0 gap-1">
        <div className="flex items-center justify-between gap-1 shrink-0">
          <span className="text-[10px] font-black uppercase text-blue-700 tracking-tight flex items-center gap-1">
            <Newspaper className="w-3 h-3 shrink-0" />
            CHD Daily Brief
          </span>
          <ChevronRight className="w-3.5 h-3.5 text-slate-400 group-hover:text-[#d2145a] shrink-0" />
        </div>

        <p className="text-[9px] font-bold text-slate-500 leading-tight truncate">{dateVN}</p>

        <p className="text-[10px] font-extrabold text-slate-800 leading-snug line-clamp-2 flex-1">
          {topicTitle || 'Bản tin y văn tim mạch nhi'}
        </p>

        {previewArticle ? (
          <div className="mt-0.5 pt-1 border-t border-slate-100/80 shrink-0">
            <div className="flex items-center gap-1 text-[9px] font-black text-emerald-700">
              <BookOpen className="w-2.5 h-2.5 shrink-0" />
              {articleCount} bài hôm nay
            </div>
            <p className="text-[9px] font-semibold text-slate-600 line-clamp-1 mt-0.5">
              {previewArticle.titleNews}
            </p>
          </div>
        ) : (
          <div className="flex items-center gap-1 text-[9px] font-bold text-[#d2145a] mt-auto shrink-0">
            <Sparkles className="w-2.5 h-2.5" />
            Tạo bản tin →
          </div>
        )}
      </div>
    </motion.button>
  );
}
