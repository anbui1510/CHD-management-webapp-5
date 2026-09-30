export interface SyncConfigRecord {
  scriptUrl: string;
  scriptSecret?: string;
}

export interface CloudflareSyncConfigEnv {
  PUSH_KV: {
    get(key: string): Promise<string | null>;
    put(key: string, value: string): Promise<void>;
  };
  GOOGLE_SCRIPT_URL?: string;
  GOOGLE_SCRIPT_SECRET?: string;
  GOOGLE_SCRIPT_API_KEY?: string;
  VITE_GOOGLE_SCRIPT_URL?: string;
  VITE_GOOGLE_SCRIPT_SECRET?: string;
  VITE_GOOGLE_SCRIPT_API_KEY?: string;
}

const SYNC_CONFIG_KEY = 'sync_config_v1';

function readEnvScriptConfig(env: CloudflareSyncConfigEnv): SyncConfigRecord {
  return {
    scriptUrl: String(env.GOOGLE_SCRIPT_URL || env.VITE_GOOGLE_SCRIPT_URL || '').trim(),
    scriptSecret: String(
      env.GOOGLE_SCRIPT_SECRET ||
      env.VITE_GOOGLE_SCRIPT_SECRET ||
      env.GOOGLE_SCRIPT_API_KEY ||
      env.VITE_GOOGLE_SCRIPT_API_KEY ||
      ''
    ).trim(),
  };
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}

async function readSyncConfig(env: CloudflareSyncConfigEnv): Promise<SyncConfigRecord> {
  const raw = await env.PUSH_KV.get(SYNC_CONFIG_KEY);
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as SyncConfigRecord;
      return {
        scriptUrl: String(parsed.scriptUrl || '').trim(),
        scriptSecret: String(parsed.scriptSecret || '').trim(),
      };
    } catch {
      // fall through to env defaults
    }
  }

  return readEnvScriptConfig(env);
}

async function writeSyncConfig(env: CloudflareSyncConfigEnv, config: SyncConfigRecord): Promise<void> {
  await env.PUSH_KV.put(SYNC_CONFIG_KEY, JSON.stringify(config));
}

async function validateAppsScriptSetup(scriptUrl: string, scriptSecret: string): Promise<string | null> {
  const trimmed = String(scriptUrl || '').trim().replace(/\/+$/, '').split('?')[0].split('#')[0];
  if (!trimmed.startsWith('https://script.google.com/macros/s/')) {
    return 'Địa chỉ Apps Script không hợp lệ.';
  }

  const setupUrl = new URL(trimmed);
  setupUrl.searchParams.set('action', 'setup');
  if (scriptSecret) {
    setupUrl.searchParams.set('apiKey', scriptSecret);
  }
  setupUrl.searchParams.set('_ts', String(Date.now()));

  const setupRes = await fetch(setupUrl.toString());
  if (!setupRes.ok) {
    return `Google Apps Script setup trả về HTTP ${setupRes.status}`;
  }

  const text = (await setupRes.text()).trim();
  if (text.startsWith('<!DOCTYPE') || text.startsWith('<html') || text.startsWith('<!doctype')) {
    return 'Không thể cấu hình kết nối. Hãy chắc chắn Apps Script đã deploy với quyền Anyone.';
  }

  try {
    const parsed = JSON.parse(text) as { status?: string; message?: string };
    if (parsed.status === 'error') {
      return parsed.message || 'Lỗi thiết lập API Key.';
    }
  } catch {
    return 'Apps Script setup trả về JSON không hợp lệ.';
  }

  return null;
}

export async function handleCloudflareSyncConfigRequest(
  request: Request,
  env: CloudflareSyncConfigEnv
): Promise<Response> {
  const url = new URL(request.url);
  const method = request.method.toUpperCase();
  const parts = url.pathname.replace(/^\/api\/sync-config\/?/, '').split('/').filter(Boolean);
  const action = parts[0] || '';

  if (action === 'sync' && method === 'POST') {
    return json({ message: 'Đã yêu cầu tải lại dữ liệu từ Google Sheets.', shouldReload: true });
  }

  if (action === 'migrate' && method === 'POST') {
    const body = await request.json().catch(() => ({})) as SyncConfigRecord;
    const nextUrl = String(body.scriptUrl || '').trim();
    const nextSecret = String(body.scriptSecret || '').trim();

    if (!nextUrl) {
      return json({ error: 'Thiếu scriptUrl để đồng bộ cấu hình.' }, 400);
    }

    if (!nextUrl.startsWith('https://script.google.com/')) {
      return json({ error: 'Địa chỉ Apps Script không hợp lệ.' }, 400);
    }

    await writeSyncConfig(env, { scriptUrl: nextUrl, scriptSecret: nextSecret });
    return json({
      message: 'Đã đồng bộ cấu hình Google Sheets lên server dùng chung.',
      scriptUrl: nextUrl,
      scriptSecret: nextSecret,
      isSynced: true,
    });
  }

  if (method === 'GET') {
    const config = await readSyncConfig(env);
    return json({
      scriptUrl: config.scriptUrl,
      scriptSecret: config.scriptSecret || '',
      isSynced: !!config.scriptUrl,
    });
  }

  if (method === 'POST') {
    const body = await request.json().catch(() => ({})) as SyncConfigRecord;
    const nextUrl = String(body.scriptUrl || '').trim();
    const nextSecret = String(body.scriptSecret || '').trim();

    if (!nextUrl) {
      await writeSyncConfig(env, { scriptUrl: '', scriptSecret: '' });
      return json({ message: 'Đã hủy liên kết Google Apps Script.', scriptUrl: '', scriptSecret: '', isSynced: false });
    }

    if (!nextUrl.startsWith('https://script.google.com/')) {
      return json({ error: 'Địa chỉ Apps Script không hợp lệ! URL phải bắt đầu bằng https://script.google.com/' }, 400);
    }

    const setupError = await validateAppsScriptSetup(nextUrl, nextSecret);
    if (setupError) {
      return json({ error: setupError }, 500);
    }

    await writeSyncConfig(env, { scriptUrl: nextUrl, scriptSecret: nextSecret });
    return json({
      message: 'Kết nối Google Apps Script thành công! Cấu hình dùng chung cho mọi thiết bị.',
      scriptUrl: nextUrl,
      scriptSecret: nextSecret,
      isSynced: true,
    });
  }

  return json({ error: `Unsupported method: ${method}` }, 405);
}
