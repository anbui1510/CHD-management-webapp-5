import { handleChdBriefRequest, type ChdBriefEnv } from '../src/chdDailyBrief/cloudflareApi';
import { handleCloudflarePushRequest, type CloudflarePushEnv } from '../src/push/cloudflarePushApi';

interface Env extends ChdBriefEnv, CloudflarePushEnv {
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

    return env.ASSETS.fetch(request);
  },
};
