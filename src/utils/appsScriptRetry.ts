const RETRYABLE_HTTP_STATUSES = new Set([404, 408, 429, 500, 502, 503, 504]);

export function formatAppsScriptHttpError(status: number): string {
  if (status === 404) {
    return 'Không kết nối được Google Sheets (HTTP 404) — URL Web app có thể sai, chưa deploy, hoặc Google đang lỗi tạm. App vẫn dùng dữ liệu đã lưu; bấm Đồng bộ lại để thử.';
  }
  return `Apps Script trả về HTTP ${status}`;
}

export function formatAppsScriptFetchError(error: unknown): string {
  if (error instanceof Error) {
    const match = error.message.match(/HTTP (\d+)/i);
    if (match) {
      return formatAppsScriptHttpError(Number(match[1]));
    }
    if (error.name === 'AbortError' || error.message.includes('abort')) {
      return 'Kết nối Google Sheets quá lâu — app đang dùng dữ liệu đã lưu và sẽ tự thử lại.';
    }
    return error.message;
  }
  return String(error || 'Không đồng bộ được Google Sheets.');
}

/** Strip junk from pasted Web app URLs so hydrate/compare doesn't wipe caches. */
export function normalizeAppsScriptUrl(raw: string): string {
  const trimmed = String(raw || '').trim();
  if (!trimmed) return '';
  try {
    const url = new URL(trimmed);
    // Keep origin + path only; drop hash/search (we append action ourselves).
    return `${url.origin}${url.pathname}`.replace(/\/+$/, '');
  } catch {
    return trimmed.split('#')[0].split('?')[0].replace(/\/+$/, '');
  }
}

export function buildAppsScriptActionUrl(
  scriptUrl: string,
  action: string,
  options?: { apiKey?: string; cacheBust?: boolean }
): string {
  const base = normalizeAppsScriptUrl(scriptUrl);
  if (!base) return '';
  const url = new URL(base);
  url.searchParams.set('action', action);
  if (options?.apiKey) url.searchParams.set('apiKey', options.apiKey);
  // Google edge occasionally serves sticky 404s; bust helps force a fresh hop.
  if (options?.cacheBust !== false) {
    url.searchParams.set('_ts', String(Date.now()));
  }
  return url.toString();
}

export async function fetchAppsScriptWithRetry(
  fetchOnce: () => Promise<Response>,
  options?: { maxAttempts?: number; baseDelayMs?: number }
): Promise<Response> {
  const maxAttempts = Math.max(1, options?.maxAttempts ?? 3);
  const baseDelayMs = options?.baseDelayMs ?? 1200;
  let lastResponse: Response | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const response = await fetchOnce();
      lastResponse = response;
      if (response.ok) return response;
      // 404 is often a transient Google Apps Script cold-start/redirect glitch.
      const retryable = RETRYABLE_HTTP_STATUSES.has(response.status);
      if (!retryable || attempt === maxAttempts) {
        return response;
      }
      // Longer backoff specifically for 404 (Google usercontent hop).
      const delay =
        response.status === 404
          ? Math.min(8000, baseDelayMs * attempt * 2)
          : baseDelayMs * attempt;
      await new Promise(resolve => setTimeout(resolve, delay));
      continue;
    } catch (error) {
      if (attempt === maxAttempts) throw error;
      await new Promise(resolve => setTimeout(resolve, baseDelayMs * attempt));
    }
  }

  if (lastResponse) return lastResponse;
  throw new Error('Không kết nối được Google Sheets.');
}
