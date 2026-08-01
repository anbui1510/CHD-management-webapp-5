import React, { useCallback, useEffect, useState } from 'react';
import { motion } from 'motion/react';
import {
  Newspaper,
  RefreshCw,
  Download,
  Copy,
  CheckCircle,
  AlertTriangle,
  Clock,
  BookOpen,
  Sparkles,
} from 'lucide-react';
import {
  parseJsonResponse,
  loadCachedBrief,
  saveCachedBrief,
  getTodayClientPayload,
  getHistoryClientPayload,
} from '../chdDailyBrief/browserApi';
import { useModuleSubheaderTitleOnly } from '../hooks/useModuleSubheader';
import { downloadBriefDocx } from '../chdDailyBrief/buildDocxBlob';
import { formatAnnouncementVN } from '../chdDailyBrief/formatAnnouncement';
import type { ChdBriefContent } from '../chdDailyBrief/types';

interface ChdArticle {
  titleNews: string;
  hook: string;
  body: string;
  titleOriginal: string;
  author: string;
  journal: string;
  date: string;
  doi: string;
}

interface DailyTopic {
  topic: string;
  keywords: string;
  purpose: string;
  preferredTypes: string;
}

interface PipelineStatus {
  stage: string;
  message: string;
  date: string;
  running: boolean;
  error?: string;
}

interface HistoryEntry {
  date: string;
  topic: string;
  createdAt: string;
  status: 'success' | 'error';
  error?: string;
}

const STAGE_LABELS: Record<string, string> = {
  idle: 'Sẵn sàng',
  pubmed: 'Đang tra PubMed',
  filter: 'Đang chọn bài',
  generate: 'AI viết nội dung',
  docx: 'Xuất Word',
  done: 'Hoàn thành',
  error: 'Lỗi',
};

export default function ChdDailyBriefView() {
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [dateIso, setDateIso] = useState('');
  const [dateVN, setDateVN] = useState('');
  const [topic, setTopic] = useState<DailyTopic | null>(null);
  const [content, setContent] = useState<ChdBriefContent | null>(null);
  const [status, setStatus] = useState<PipelineStatus | null>(null);
  const [hasDocx, setHasDocx] = useState(false);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [selectedDate, setSelectedDate] = useState('');
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');

  useModuleSubheaderTitleOnly('chd-daily-brief', <Newspaper className="w-4 h-4" />);

  const loadToday = useCallback(async () => {
    setLoading(true);
    setError('');
    const local = getTodayClientPayload();
    setDateIso(local.dateIso);
    setDateVN(local.dateVN);
    setTopic(local.topic);
    setContent(local.content);
    setStatus(local.status as PipelineStatus);
    setHasDocx(local.hasDocx);
    setSelectedDate(local.dateIso);
    setLoading(false);

    try {
      const res = await fetch('/api/chd-brief/today');
      if (!res.ok) return;
      const data = await parseJsonResponse(res) as {
        dateIso: string;
        dateVN: string;
        topic: DailyTopic;
        content: ChdBriefContent | null;
        status: PipelineStatus;
        hasDocx: boolean;
      };
      setDateIso(data.dateIso);
      setDateVN(data.dateVN);
      setTopic(data.topic);
      if (data.content) setContent(data.content);
      setStatus(data.status);
      setHasDocx(data.hasDocx || Boolean(data.content));
      setSelectedDate(data.dateIso);
    } catch {
      // Giữ dữ liệu local — trang vẫn dùng được khi API chưa sẵn sàng
    }
  }, []);

  const loadHistory = useCallback(async () => {
    setHistory(getHistoryClientPayload().entries);
    try {
      const res = await fetch('/api/chd-brief/history');
      if (!res.ok) return;
      const data = await parseJsonResponse(res) as { entries?: HistoryEntry[] };
      if (data.entries?.length) setHistory(data.entries);
    } catch {
      // ignore
    }
  }, []);

  const loadBriefForDate = useCallback(async (date: string) => {
    setSelectedDate(date);
    try {
      const res = await fetch(`/api/chd-brief/content/${date}`);
      if (res.ok) {
        const data = await parseJsonResponse(res) as ChdBriefContent;
        setContent(data);
        setHasDocx(true);
      } else {
        setContent(null);
        setHasDocx(false);
      }
    } catch {
      setContent(null);
      setHasDocx(false);
    }
  }, []);

  useEffect(() => {
    loadToday();
    loadHistory();
  }, [loadToday, loadHistory]);

  const pollStatus = useCallback(async () => {
    const res = await fetch('/api/chd-brief/status');
    if (res.ok) {
      const s = await parseJsonResponse(res) as PipelineStatus;
      setStatus(s);
      return s;
    }
    return null;
  }, []);

  const handleGenerate = async (force = false) => {
    setGenerating(true);
    setError('');
    try {
      const res = await fetch('/api/chd-brief/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ force }),
      });
      const data = await parseJsonResponse(res) as {
        success?: boolean;
        skipped?: boolean;
        error?: string;
        content?: ChdBriefContent;
      };
      if (!data.success && !data.skipped) {
        throw new Error(data.error || 'Tạo bản tin thất bại');
      }
      if (data.content) {
        setContent(data.content);
        saveCachedBrief(data.content);
        setHasDocx(true);
      }
      await loadToday();
      await loadHistory();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Lỗi không xác định');
      await pollStatus();
    } finally {
      setGenerating(false);
    }
  };

  const handleCopyAnnouncement = async () => {
    const date = selectedDate || dateIso;
    try {
      const cached = content || loadCachedBrief(date);
      if (cached) {
        await navigator.clipboard.writeText(formatAnnouncementVN(cached));
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
        return;
      }
      const res = await fetch(`/api/chd-brief/announcement/${date}`);
      if (!res.ok) throw new Error('Chưa có bản tin cho ngày này');
      const text = await res.text();
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Copy thất bại');
    }
  };

  const handleDownload = async () => {
    const date = selectedDate || dateIso;
    const brief = content || loadCachedBrief(date);
    if (brief) {
      try {
        await downloadBriefDocx(brief);
        return;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Tải Word thất bại');
        return;
      }
    }
    window.open(`/api/chd-brief/download/${date}`, '_blank');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <RefreshCw className="w-6 h-6 animate-spin text-[#d2145a]" />
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Newspaper className="w-6 h-6 text-[#d2145a]" />
              <h1 className="text-2xl font-bold text-slate-800">CHD Daily Brief</h1>
            </div>
            <p className="text-slate-500 text-sm">Bản tin y văn tim mạch nhi mỗi sáng 7h</p>
          </div>
          <button
            onClick={() => handleGenerate(Boolean(content))}
            disabled={generating}
            className="flex items-center gap-2 px-4 py-2 bg-[#d2145a] text-white rounded-lg hover:bg-[#b01048] disabled:opacity-60 transition-colors text-sm font-medium shrink-0"
          >
            {generating ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : (
              <Sparkles className="w-4 h-4" />
            )}
            {generating ? 'Đang tạo...' : content ? 'Tạo lại bản tin' : 'Tạo bản tin ngay'}
          </button>
        </div>

        {/* Status bar */}
        {(generating || status?.running) && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-blue-50 border border-blue-100 rounded-xl p-4 flex items-center gap-3"
          >
            <RefreshCw className="w-5 h-5 text-blue-600 animate-spin shrink-0" />
            <div>
              <p className="text-sm font-medium text-blue-800">
                {STAGE_LABELS[status?.stage ?? 'pubmed'] ?? status?.message}
              </p>
              <p className="text-xs text-blue-600">{status?.message}</p>
            </div>
          </motion.div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-100 rounded-xl p-4 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        {/* Today's topic card */}
        {topic && (
          <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
            <div className="flex items-center gap-2 mb-3">
              <Clock className="w-4 h-4 text-[#d2145a]" />
              <span className="text-sm font-semibold text-slate-700">{dateVN}</span>
            </div>
            <h2 className="text-lg font-bold text-[#2E5090] mb-2">{topic.topic}</h2>
            <div className="space-y-2 text-sm text-slate-600">
              <p><span className="font-medium text-slate-700">Từ khóa:</span> {topic.keywords}</p>
              <p><span className="font-medium text-slate-700">Mục đích:</span> {topic.purpose}</p>
              <p><span className="font-medium text-slate-700">Dạng bài nên đọc:</span> {topic.preferredTypes}</p>
            </div>
          </div>
        )}

        {/* Actions */}
        {content && (
          <div className="flex flex-wrap gap-3">
            <button
              onClick={handleDownload}
              disabled={!hasDocx}
              className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 text-sm font-medium text-slate-700 disabled:opacity-50"
            >
              <Download className="w-4 h-4" />
              Tải Word (.docx)
            </button>
            <button
              onClick={handleCopyAnnouncement}
              className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 text-sm font-medium text-slate-700"
            >
              {copied ? <CheckCircle className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4" />}
              {copied ? 'Đã copy!' : 'Copy thông báo sáng'}
            </button>
          </div>
        )}

        {/* Articles preview */}
        {content && content.articles.length > 0 && (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <BookOpen className="w-5 h-5 text-[#d2145a]" />
              <h3 className="text-lg font-bold text-slate-800">5 bài đọc hôm nay</h3>
            </div>
            {content.articles.map((article, idx) => (
              <motion.div
                key={idx}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.05 }}
                className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm"
              >
                <h4 className="text-base font-bold text-[#2E5090] mb-2">
                  {idx + 1}. {article.titleNews}
                </h4>
                <p className="text-sm italic text-[#1F3864] mb-3 leading-relaxed">{article.hook}</p>
                <p className="text-sm text-slate-700 leading-relaxed mb-4">{article.body}</p>
                <div className="border-t border-slate-100 pt-3 space-y-1">
                  <p className="text-xs italic text-slate-500">{article.titleOriginal}</p>
                  <p className="text-xs text-slate-400">
                    {article.author} | {article.journal} | {article.date}
                  </p>
                  {article.doi && (
                    <a
                      href={article.doi}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-blue-600 hover:underline"
                    >
                      {article.doi}
                    </a>
                  )}
                </div>
              </motion.div>
            ))}
          </div>
        )}

        {!content && !generating && (
          <div className="bg-slate-50 border border-dashed border-slate-200 rounded-xl p-8 text-center">
            <Newspaper className="w-10 h-10 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-500 text-sm">Chưa có bản tin hôm nay. Nhấn "Tạo bản tin ngay" để bắt đầu.</p>
          </div>
        )}

        {/* History */}
        {history.length > 0 && (
          <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
            <h3 className="text-sm font-bold text-slate-700 mb-3">Lịch sử bản tin</h3>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {history.map(entry => (
                <button
                  key={entry.date}
                  onClick={() => loadBriefForDate(entry.date)}
                  className={`w-full text-left flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-colors ${
                    selectedDate === entry.date
                      ? 'bg-pink-50 text-[#d2145a]'
                      : 'hover:bg-slate-50 text-slate-600'
                  }`}
                >
                  <span>{entry.date} - {entry.topic.slice(0, 40)}...</span>
                  {entry.status === 'success' ? (
                    <CheckCircle className="w-4 h-4 text-green-500 shrink-0" />
                  ) : (
                    <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
                  )}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
