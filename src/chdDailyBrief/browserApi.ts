import { formatDateISO, formatDateVN, getTopicForDate } from './topics';
import { formatAnnouncementVN } from './formatAnnouncement';
import type { ChdBriefContent } from './types';

const CACHE_PREFIX = 'chd_brief_content_';

export function loadCachedBrief(dateIso: string): ChdBriefContent | null {
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + dateIso);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function saveCachedBrief(content: ChdBriefContent): void {
  localStorage.setItem(CACHE_PREFIX + content.DATE_ISO, JSON.stringify(content));
}

export function getTodayClientPayload() {
  const today = new Date();
  const dateIso = formatDateISO(today);
  const content = loadCachedBrief(dateIso);
  return {
    dateIso,
    dateVN: formatDateVN(today),
    topic: getTopicForDate(today),
    content,
    status: {
      stage: 'idle',
      message: content ? 'Đã có bản tin (cache trình duyệt)' : 'Sẵn sàng',
      date: dateIso,
      running: false,
    },
    hasDocx: Boolean(content),
  };
}

export function getHistoryClientPayload() {
  const entries: Array<{ date: string; topic: string; createdAt: string; status: 'success' | 'error' }> = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key?.startsWith(CACHE_PREFIX)) continue;
    try {
      const content = JSON.parse(localStorage.getItem(key) || '') as ChdBriefContent;
      if (content?.DATE_ISO) {
        entries.push({
          date: content.DATE_ISO,
          topic: content.TOPIC,
          createdAt: content.DATE_ISO,
          status: 'success',
        });
      }
    } catch {
      // ignore bad cache entries
    }
  }
  entries.sort((a, b) => b.date.localeCompare(a.date));
  return { entries };
}

export function getAnnouncementClient(date: string): string | null {
  const content = loadCachedBrief(date);
  return content ? formatAnnouncementVN(content) : null;
}

export async function parseJsonResponse(res: Response): Promise<unknown> {
  const contentType = res.headers.get('content-type') || '';
  const text = await res.text();
  if (contentType.includes('text/html') || text.trimStart().toLowerCase().startsWith('<!doctype')) {
    throw new Error(
      'API server chưa sẵn sàng (nhận HTML thay vì JSON). Hãy deploy với Node server (npm start) hoặc chạy npm run dev.'
    );
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new Error('Phản hồi API không phải JSON hợp lệ.');
  }
}

export async function fetchChdBrief(path: string, init?: RequestInit): Promise<Response> {
  const res = await fetch(`/api/chd-brief/${path}`, init);
  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('text/html')) {
    const cloned = res.clone();
    const peek = (await cloned.text()).trimStart().slice(0, 20).toLowerCase();
    if (peek.startsWith('<!doctype') || peek.startsWith('<html')) {
      throw new Error(
        'API server chưa sẵn sàng. Vui lòng redeploy với Node server hoặc chạy npm run dev cục bộ.'
      );
    }
  }
  return res;
}
