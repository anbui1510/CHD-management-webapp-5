import { handleChdBriefRequest, type ChdBriefEnv } from '../src/chdDailyBrief/cloudflareApi';

interface Env extends ChdBriefEnv {
  ASSETS: Fetcher;
  SUPABASE_URL?: string;
  SUPABASE_ANON_KEY?: string;
  VITE_SUPABASE_URL?: string;
  VITE_SUPABASE_ANON_KEY?: string;
}

function jsonResponse(body: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), {
    status: init?.status || 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      ...(init?.headers || {}),
    },
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/api/config') {
      const supabaseUrl = String(env.SUPABASE_URL || env.VITE_SUPABASE_URL || '').trim();
      const supabaseAnonKey = String(env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY || '').trim();
      if (!supabaseUrl || !supabaseAnonKey) {
        return jsonResponse(
          { error: 'Supabase chưa được cấu hình trên Cloudflare Worker.' },
          { status: 503 }
        );
      }
      return jsonResponse({ supabaseUrl, supabaseAnonKey });
    }

    if (url.pathname.startsWith('/api/chd-brief')) {
      return handleChdBriefRequest(request, env);
    }

    return env.ASSETS.fetch(request);
  },
};
