import { getTopicForDate, formatDateISO, formatDateVN } from './topics';
import { searchAllSourcesForTopic } from './literatureSearch';
import { filterAndRankArticles } from './filterArticles';
import { generateBriefContent } from './generateContent';

export interface ChdBriefEnv {
  GEMINI_API_KEY?: string;
  PUBMED_EMAIL?: string;
  PUBMED_TOOL?: string;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}

function parsePath(pathname: string): string[] {
  return pathname
    .replace(/^\/api\/chd-brief\/?/, '')
    .split('/')
    .filter(Boolean);
}

export async function handleChdBriefRequest(request: Request, env: ChdBriefEnv): Promise<Response> {
  const method = request.method.toUpperCase();
  const segments = parsePath(new URL(request.url).pathname);
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
      { error: 'Tải Word: dùng nút Tải Word sau khi tạo bản tin (xuất file trên trình duyệt).' },
      503
    );
  }

  if (method === 'POST' && action === 'generate') {
    if (!env.GEMINI_API_KEY) {
      return json(
        {
          success: false,
          error:
            'Thiếu GEMINI_API_KEY lúc chạy (Runtime). Vào Workers & Pages → chdmanagementwebapp5 → Settings → Variables and Secrets (mục Runtime, không phải Build) → Add → Type: Secret → Name: GEMINI_API_KEY → redeploy.',
        },
        503
      );
    }

    try {
      const topic = getTopicForDate(today);
      const { articles: rawArticles, sourcesHit } = await searchAllSourcesForTopic(topic, pubmedConfig);
      if (rawArticles.length === 0) {
        return json(
          {
            success: false,
            error:
              'Không tìm thấy bài trên các nguồn (PubMed, PMC, Embase, Cochrane, Semantic Scholar, OpenAlex).',
          },
          404
        );
      }

      const selected = filterAndRankArticles(rawArticles, 5);
      if (selected.length === 0) {
        return json({ success: false, error: 'Không đủ bài sau khi lọc' }, 404);
      }

      const content = await generateBriefContent(topic, selected, today, {
        apiKey: env.GEMINI_API_KEY,
      });

      return json({ success: true, content, skipped: false, sourcesHit });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return json({ success: false, error: message }, 500);
    }
  }

  return json({ error: `Unsupported route: ${method} /api/chd-brief/${segments.join('/')}` }, 404);
}

export function isNonJsonResponse(text: string): boolean {
  const trimmed = text.trimStart().toLowerCase();
  if (trimmed.startsWith('<!doctype') || trimmed.startsWith('<html') || trimmed.startsWith('<')) {
    return true;
  }
  try {
    JSON.parse(text);
    return false;
  } catch {
    return true;
  }
}
