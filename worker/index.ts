import { handleChdBriefRequest, type ChdBriefEnv } from '../src/chdDailyBrief/cloudflareApi';
import { handleConsultSlideRequest, type ConsultSlideEnv } from '../src/consultSlide/cloudflareApi';
import { handleCloudflarePushRequest, type CloudflarePushEnv } from '../src/push/cloudflarePushApi';
import { handleCloudflareSyncConfigRequest, readSyncConfig, type CloudflareSyncConfigEnv } from '../src/sync/cloudflareSyncConfigApi';
import {
  handleCloudflareAuthRequest,
  handleCloudflareSheetsProxy,
  readRequestSession,
  type CloudflareGateEnv,
} from '../src/sync/cloudflareGate';
import {
  handleCloudflareLichKhoaRequest,
  type CloudflareLichKhoaSyncConfigEnv,
} from '../src/sync/cloudflareLichKhoaSyncConfigApi';
interface Env extends ChdBriefEnv, ConsultSlideEnv, CloudflarePushEnv, CloudflareSyncConfigEnv, CloudflareGateEnv, CloudflareLichKhoaSyncConfigEnv {
  ASSETS: Fetcher;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}

const STATIC_FILE_EXT = /\.(?:js|mjs|css|map|woff2?|ttf|otf|png|jpe?g|gif|webp|svg|ico|webmanifest|txt|pptx|pdf)$/i;

function isStaticAssetPath(pathname: string): boolean {
  if (pathname.startsWith('/assets/')) return true;
  if (pathname.startsWith('/icons/')) return true;
  if (pathname.startsWith('/consult-slide/')) return true;
  if (pathname.startsWith('/lichkhoa/')) return true;
  return STATIC_FILE_EXT.test(pathname);
}

function wantsHtmlDocument(request: Request): boolean {
  if (request.method !== 'GET' && request.method !== 'HEAD') return false;
  const accept = request.headers.get('Accept') || '';
  return accept.includes('text/html') || accept === '*/*';
}

/** Avoid SPA fallback HTML on missing JS/CSS (causes blank screen after deploy). */
async function serveClientAsset(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  let response = await env.ASSETS.fetch(request);

  if (isStaticAssetPath(url.pathname)) {
    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('text/html')) {
      return new Response('Not Found', {
        status: 404,
        headers: { 'Cache-Control': 'no-store' },
      });
    }
    return response;
  }

  if (response.status === 404 && wantsHtmlDocument(request)) {
    const indexRequest = new Request(new URL('/index.html', url.origin), request);
    response = await env.ASSETS.fetch(indexRequest);
  }

  return response;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const method = request.method.toUpperCase();

    if (url.pathname.startsWith('/api/auth/')) {
      return handleCloudflareAuthRequest(request, env);
    }

    if (url.pathname === '/api/sheets/proxy') {
      return handleCloudflareSheetsProxy(request, env, ctx);
    }

    if (url.pathname.startsWith('/api/chd-brief')) {
      const generate = method === 'POST' && /\/generate\/?$/.test(url.pathname);
      if (generate) {
        const session = await readRequestSession(request, env);
        if (!session) return json({ error: 'Yêu cầu đăng nhập để tạo bản tin.' }, 401);
      }
      return handleChdBriefRequest(request, env);
    }

    if (url.pathname.startsWith('/api/consult-slide')) {
      const generate = method === 'POST' && /\/generate\/?$/.test(url.pathname);
      if (generate) {
        const session = await readRequestSession(request, env);
        if (!session) return json({ error: 'Yêu cầu đăng nhập để tạo slide staff.' }, 401);
      }
      return handleConsultSlideRequest(request, env);
    }

    if (url.pathname.startsWith('/api/push')) {
      return handleCloudflarePushRequest(request, env);
    }

    if (url.pathname.startsWith('/api/sync-config')) {
      if (method !== 'GET') {
        const session = await readRequestSession(request, env);
        if (session) {
          if (!session.canSync) return json({ error: 'Bạn không có quyền cấu hình Google Sheets.' }, 403);
        } else {
          const config = await readSyncConfig(env);
          const needsBootstrap = !config.scriptUrl || !config.scriptSecret;
          if (!needsBootstrap) return json({ error: 'Yêu cầu đăng nhập để đổi cấu hình Google Sheets.' }, 401);
        }
      }
      return handleCloudflareSyncConfigRequest(request, env);
    }

    if (url.pathname.startsWith('/api/lichkhoa/')) {
      return handleCloudflareLichKhoaRequest(request, env);
    }

    return serveClientAsset(request, env);
  },
};
