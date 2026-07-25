import { handleChdBriefRequest, type ChdBriefEnv } from '../src/chdDailyBrief/cloudflareApi';
import { handleCloudflarePushRequest, type CloudflarePushEnv } from '../src/push/cloudflarePushApi';
import { handleCloudflareSyncConfigRequest, type CloudflareSyncConfigEnv } from '../src/sync/cloudflareSyncConfigApi';

interface Env extends ChdBriefEnv, CloudflarePushEnv, CloudflareSyncConfigEnv {
  ASSETS: Fetcher;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname.startsWith('/api/chd-brief')) {
      return handleChdBriefRequest(request, env);
    }

    if (url.pathname.startsWith('/api/push')) {
      return handleCloudflarePushRequest(request, env);
    }

    if (url.pathname.startsWith('/api/sync-config')) {
      return handleCloudflareSyncConfigRequest(request, env);
    }

    return env.ASSETS.fetch(request);
  },
};
