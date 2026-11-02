import { extractConsultSlideContent } from './extractContent';
import { mergeSlideExtract } from './mergeExtract';
import type {
  ConsultSlideAttachment,
  ConsultSlideConsultContext,
  ConsultSlideGenerateRequest,
  ConsultSlidePatientContext,
} from './types';

export interface ConsultSlideEnv {
  GEMINI_API_KEY?: string;
  GEMINI_MODEL?: string;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}

function parsePath(pathname: string): string[] {
  return pathname
    .replace(/^\/api\/consult-slide\/?/, '')
    .split('/')
    .filter(Boolean);
}

function normalizeAttachments(raw: unknown): ConsultSlideAttachment[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map(item => {
      const row = item as ConsultSlideAttachment;
      const base64 = String(row.base64 || '').replace(/^data:[^;]+;base64,/, '');
      return {
        kind: row.kind,
        mimeType: String(row.mimeType || 'application/octet-stream'),
        base64,
        fileName: row.fileName ? String(row.fileName) : undefined,
      } as ConsultSlideAttachment;
    })
    .filter(a => a.base64 && a.kind);
}

export async function handleConsultSlideRequest(
  request: Request,
  env: ConsultSlideEnv
): Promise<Response> {
  const method = request.method.toUpperCase();
  const segments = parsePath(new URL(request.url).pathname);
  const action = segments[0] || '';

  if (method === 'GET' && (action === '' || action === 'health')) {
    return json({
      ok: true,
      hasGeminiKey: Boolean(env.GEMINI_API_KEY),
    });
  }

  if (method === 'POST' && action === 'generate') {
    if (!env.GEMINI_API_KEY) {
      return json(
        {
          success: false,
          error:
            'Thiếu GEMINI_API_KEY lúc chạy (Runtime). Vào Workers & Pages → Settings → Variables and Secrets → thêm GEMINI_API_KEY.',
        },
        503
      );
    }

    try {
      const body = (await request.json()) as ConsultSlideGenerateRequest;
      const patient = (body.patient || {}) as ConsultSlidePatientContext;
      const consult = (body.consult || {}) as ConsultSlideConsultContext;
      const attachments = normalizeAttachments(body.attachments);
      if (!attachments.length) {
        return json({ success: false, error: 'Cần upload ít nhất một ảnh hoặc PDF.' }, 400);
      }

      // Cap attachments to avoid oversized Worker requests
      const capped = attachments.slice(0, 6);
      const rawExtract = await extractConsultSlideContent(patient, consult, capped, {
        apiKey: env.GEMINI_API_KEY,
        model: env.GEMINI_MODEL,
      });
      const extract = mergeSlideExtract({
        patient,
        consult,
        extract: rawExtract,
        preferOcr: Boolean(body.preferOcr),
      });

      return json({ success: true, extract });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return json({ success: false, error: message }, 500);
    }
  }

  return json(
    { error: `Unsupported route: ${method} /api/consult-slide/${segments.join('/')}` },
    404
  );
}
