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
interface Env extends ChdBriefEnv, ConsultSlideEnv, CloudflarePushEnv, CloudflareSyncConfigEnv, CloudflareGateEnv {
  ASSETS: Fetcher;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const method = request.method.toUpperCase();

    if (url.pathname.startsWith('/api/auth/')) {
      return handleCloudflareAuthRequest(request, env);
    }

    if (url.pathname === '/api/sheets/proxy') {
      return handleCloudflareSheetsProxy(request, env);
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

    return env.ASSETS.fetch(request);
  },
};
