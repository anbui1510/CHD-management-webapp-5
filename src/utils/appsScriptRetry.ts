const RETRYABLE_HTTP_STATUSES = new Set([404, 408, 429, 500, 502, 503, 504]);

export function formatAppsScriptHttpError(status: number): string {
  if (status === 404) {
    return 'Không kết nối được Google Sheets (HTTP 404) — URL Web app có thể sai hoặc chưa deploy. App đang dùng dữ liệu đã lưu và sẽ tự thử đồng bộ lại.';
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
      if (!RETRYABLE_HTTP_STATUSES.has(response.status) || attempt === maxAttempts) {
        return response;
      }
    } catch (error) {
      if (attempt === maxAttempts) throw error;
    }

    await new Promise(resolve => setTimeout(resolve, baseDelayMs * attempt));
  }

  if (lastResponse) return lastResponse;
  throw new Error('Không kết nối được Google Sheets.');
}
