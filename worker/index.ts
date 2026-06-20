import { handleChdBriefRequest, type ChdBriefEnv } from '../src/chdDailyBrief/cloudflareApi';

interface Env extends ChdBriefEnv {
  ASSETS: Fetcher;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname.startsWith('/api/chd-brief')) {
      return handleChdBriefRequest(request, env);
    }

    return env.ASSETS.fetch(request);
  },
};
