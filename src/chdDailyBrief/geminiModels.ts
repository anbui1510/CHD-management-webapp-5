/** Models for Gemini Developer API (new AI Studio users: 2.5-flash often 404 — use 3.8). */
export const GEMINI_FREE_TIER_MODELS = [
  'gemini-3.8-flash',
  'gemini-2.5-flash-lite',
] as const;

export type GeminiModelId = (typeof GEMINI_FREE_TIER_MODELS)[number] | string;

export function resolveGeminiModels(preferred?: string): string[] {
  const trimmed = preferred?.trim();
  if (trimmed) {
    const rest = GEMINI_FREE_TIER_MODELS.filter(m => m !== trimmed);
    return [trimmed, ...rest];
  }
  return [...GEMINI_FREE_TIER_MODELS];
}

export function isGeminiQuotaError(err: unknown): boolean {
  const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
  return (
    msg.includes('429') ||
    msg.includes('resource_exhausted') ||
    msg.includes('quota exceeded') ||
    msg.includes('rate limit') ||
    msg.includes('limit: 0')
  );
}

export function formatGeminiUserError(err: unknown, lastModel?: string): string {
  const raw = err instanceof Error ? err.message : String(err);

  if (raw.includes('prepayment credits are depleted')) {
    return 'Hết credit Gemini (prepay). Vào https://ai.studio/projects → Billing để nạp thêm, hoặc dùng API key project Free tier.';
  }

  if (raw.includes('free_tier') && (raw.includes('limit: 0') || raw.includes('gemini-2.0-flash'))) {
    return `Model ${lastModel ?? 'gemini-3.8-flash'} không còn khả dụng. Đặt GEMINI_MODEL=gemini-3.8-flash trên Cloudflare (Variable) và Script properties, rồi redeploy.`;
  }

  if (raw.includes('free_tier') || raw.includes('Quota exceeded')) {
    return 'Vượt quota free tier Gemini (RPM/RPD). Đợi ~1 phút rồi thử lại, hoặc xem https://ai.dev/rate-limit . Gợi ý: GEMINI_MODEL=gemini-3.8-flash.';
  }

  if (raw.includes('API key not valid') || raw.includes('invalid_api_key')) {
    return 'API key Gemini không hợp lệ. Kiểm tra GEMINI_API_KEY trên Cloudflare Runtime Secrets.';
  }

  if (
    raw.includes('User location is not supported') ||
    raw.includes('FAILED_PRECONDITION') ||
    raw.toLowerCase().includes('location is not supported')
  ) {
    return 'Gemini từ Cloudflare Worker bị giới hạn vùng (User location is not supported). App đã chuyển sang gọi qua Apps Script — hãy deploy Apps Script mới và thêm GEMINI_API_KEY vào Project Settings → Script properties.';
  }

  const short = raw.length > 280 ? `${raw.slice(0, 280)}…` : raw;
  return `Gemini lỗi${lastModel ? ` (model: ${lastModel})` : ''}: ${short}`;
}

export function parseRetryDelayMs(err: unknown): number {
  const raw = err instanceof Error ? err.message : String(err);
  const match = raw.match(/retry in ([\d.]+)s/i);
  if (match) return Math.ceil(parseFloat(match[1]) * 1000) + 500;
  return 0;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export { sleep };
