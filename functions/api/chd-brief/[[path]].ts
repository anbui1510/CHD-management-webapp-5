import { getTopicForDate, formatDateISO, formatDateVN } from '../../../src/chdDailyBrief/topics';
import { searchPubMedForTopic } from '../../../src/chdDailyBrief/pubmed';
import { filterAndRankArticles } from '../../../src/chdDailyBrief/filterArticles';
import { generateBriefContent } from '../../../src/chdDailyBrief/generateContent';

interface Env {
  GEMINI_API_KEY: string;
  PUBMED_EMAIL?: string;
  PUBMED_TOOL?: string;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}

function parseSegments(pathParam: string | string[] | undefined): string[] {
  if (Array.isArray(pathParam)) return pathParam.filter(Boolean);
  if (typeof pathParam === 'string' && pathParam.trim()) {
    return pathParam.split('/').filter(Boolean);
  }
  return [];
}

export const onRequest = async (context: {
  request: Request;
  env: Env;
  params: Record<string, string | string[] | undefined>;
}): Promise<Response> => {
  const { request, env, params } = context;
  const method = request.method.toUpperCase();
  const segments = parseSegments(params.path as string | string[] | undefined);
  const action = segments[0] || 'today';
  const today = new Date();
  const dateIso = formatDateISO(today);
  const pubmedConfig = { email: env.PUBMED_EMAIL, tool: env.PUBMED_TOOL };

  if (method === 'GET' && action === 'today') {
    return json({
      dateIso,
      dateVN: formatDateVN(today),
      topic: getTopicForDate(today),
      content: null,
      status: { stage: 'idle', message: 'Sẵn sàng', date: dateIso, running: false },
      hasDocx: false,
    });
  }

  if (method === 'GET' && action === 'history') {
    return json({ entries: [] });
  }

  if (method === 'GET' && action === 'status') {
    return json({ stage: 'idle', message: 'Sẵn sàng', date: dateIso, running: false });
  }

  if (method === 'GET' && action === 'content') {
    return json({ error: 'Brief not found for this date' }, 404);
  }

  if (method === 'GET' && action === 'announcement') {
    return json({ error: 'Brief not found for this date' }, 404);
  }

  if (method === 'GET' && action === 'download') {
    return json(
      { error: 'Tải Word trên Cloudflare Pages: dùng nút Tải Word sau khi tạo bản tin (xuất file trên trình duyệt).' },
      503
    );
  }

  if (method === 'POST' && action === 'generate') {
    if (!env.GEMINI_API_KEY) {
      return json(
        {
          success: false,
          error: 'Thiếu GEMINI_API_KEY. Vào Cloudflare Pages → Settings → Environment variables để thêm.',
        },
        503
      );
    }

    try {
      const topic = getTopicForDate(today);
      const rawArticles = await searchPubMedForTopic(topic, pubmedConfig);
      if (rawArticles.length === 0) {
        return json({ success: false, error: 'Không tìm thấy bài trên PubMed' }, 404);
      }

      const selected = filterAndRankArticles(rawArticles, 5);
      if (selected.length === 0) {
        return json({ success: false, error: 'Không đủ bài sau khi lọc' }, 404);
      }

      const content = await generateBriefContent(topic, selected, today, {
        apiKey: env.GEMINI_API_KEY,
      });

      return json({ success: true, content, skipped: false });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return json({ success: false, error: message }, 500);
    }
  }

  return json({ error: `Unsupported route: ${method} /api/chd-brief/${segments.join('/')}` }, 404);
};
