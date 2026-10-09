export interface SheetsProxyTarget {
  scriptUrl: string;
  scriptSecret?: string;
}

export interface SheetsProxyRequest {
  kind: 'get' | 'post';
  action?: string;
  payload?: Record<string, unknown>;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}

/** Server-side Apps Script call. The API key stays on the server. */
export async function forwardToAppsScript(
  config: SheetsProxyTarget,
  request: SheetsProxyRequest
): Promise<Response> {
  const scriptUrl = String(config.scriptUrl || '').trim().replace(/\/+$/, '').split('?')[0].split('#')[0];
  if (!scriptUrl.startsWith('https://script.google.com/macros/s/')) {
    return json({ error: 'Chưa cấu hình Google Apps Script.' }, 400);
  }
  const apiKey = String(config.scriptSecret || '').trim();
  if (!apiKey) {
    return json({ error: 'Chưa cấu hình khóa API Google Sheets.' }, 400);
  }

  if (request.kind === 'get') {
    const action = String(request.action || 'getAll').replace(/[^a-zA-Z0-9_]/g, '');
    if (!action) return json({ error: 'Thiếu action.' }, 400);
    const url = new URL(scriptUrl);
    url.searchParams.set('action', action);
    url.searchParams.set('apiKey', apiKey);
    url.searchParams.set('_ts', String(Date.now()));
    const upstream = await fetch(url.toString(), { redirect: 'follow' });
    const text = await upstream.text();
    return new Response(text, {
      status: upstream.ok ? 200 : upstream.status,
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
    });
  }

  const payload = { ...(request.payload || {}), apiKey };
  const upstream = await fetch(scriptUrl, {
    method: 'POST',
    redirect: 'follow',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(payload),
  });
  const text = await upstream.text();
  return new Response(text, {
    status: upstream.ok ? 200 : upstream.status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}
