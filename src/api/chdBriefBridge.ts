import {
  getTodayClientPayload,
  getHistoryClientPayload,
  getAnnouncementClient,
  loadCachedBrief,
  saveCachedBrief,
  parseJsonResponse,
} from '../chdDailyBrief/browserApi';

const jsonResponse = (body: unknown, init?: ResponseInit) =>
  new Response(JSON.stringify(body), {
    status: init?.status || 200,
    headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) },
  });

const textResponse = (body: string, init?: ResponseInit) =>
  new Response(body, {
    status: init?.status || 200,
    headers: { 'Content-Type': 'text/plain; charset=utf-8', ...(init?.headers || {}) },
  });

async function tryNativeChdBrief(
  nativeFetch: typeof fetch,
  path: string,
  init?: RequestInit
): Promise<Response | null> {
  try {
    const res = await nativeFetch(`/api/chd-brief/${path}`, init);
    const text = await res.clone().text();
    const trimmed = text.trimStart().toLowerCase();
    if (
      trimmed.startsWith('<!doctype') ||
      trimmed.startsWith('<html') ||
      (trimmed.startsWith('<') && trimmed.includes('<head'))
    ) {
      return null;
    }
    try {
      JSON.parse(text);
    } catch {
      return null;
    }
    return new Response(text, {
      status: res.status,
      statusText: res.statusText,
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
    });
  } catch {
    return null;
  }
}

export async function handleChdBriefRequest(
  parts: string[],
  method: string,
  init: RequestInit | undefined,
  nativeFetch: typeof fetch
): Promise<Response> {
  const subPath = parts.slice(1).join('/');
  const serverRes = await tryNativeChdBrief(nativeFetch, subPath || 'today', init);
  if (serverRes) {
    if (method === 'POST' && parts[1] === 'generate' && serverRes.ok) {
      try {
        const data = (await serverRes.clone().json()) as { content?: { DATE_ISO?: string } };
        if (data?.content?.DATE_ISO) saveCachedBrief(data.content as any);
      } catch {
        // ignore cache errors
      }
    }
    return serverRes;
  }

  const action = parts[1] || 'today';

  if (method === 'GET' && action === 'today') {
    return jsonResponse(getTodayClientPayload());
  }

  if (method === 'GET' && action === 'history') {
    return jsonResponse(getHistoryClientPayload());
  }

  if (method === 'GET' && action === 'status') {
    return jsonResponse(getTodayClientPayload().status);
  }

  if (method === 'GET' && action === 'content' && parts[2]) {
    const content = loadCachedBrief(parts[2]);
    if (!content) return jsonResponse({ error: 'Brief not found for this date' }, { status: 404 });
    return jsonResponse(content);
  }

  if (method === 'GET' && action === 'announcement' && parts[2]) {
    const text = getAnnouncementClient(parts[2]);
    if (!text) return jsonResponse({ error: 'Brief not found for this date' }, { status: 404 });
    return textResponse(text);
  }

  if (method === 'POST' && action === 'generate') {
    return jsonResponse(
      {
        success: false,
        error:
          'Không kết nối được API. Trên Cloudflare Pages cần Pages Functions + GEMINI_API_KEY. Chủ đề hôm nay vẫn xem được offline.',
      },
      { status: 503 }
    );
  }

  if (method === 'GET' && action === 'download') {
    return jsonResponse({ error: 'Tải Word cần API server Node.' }, { status: 503 });
  }

  return jsonResponse({ error: `Unsupported CHD Brief route: ${method} ${subPath}` }, { status: 404 });
}

export { parseJsonResponse };
