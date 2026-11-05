import { readRequestSession, type CloudflareGateEnv } from './cloudflareGate';
import {
  normalizeLichKhoaSpreadsheetId,
  verifyLichKhoaSpreadsheetAccess,
} from './lichKhoaSpreadsheetVerify';

export interface LichKhoaSyncConfigRecord {
  scriptUrl: string;
  scriptSecret?: string;
  spreadsheetId?: string;
}

export interface CloudflareLichKhoaSyncConfigEnv {
  PUSH_KV: {
    get(key: string): Promise<string | null>;
    put(key: string, value: string): Promise<void>;
  };
  LICHKHOA_SCRIPT_URL?: string;
  LICHKHOA_SCRIPT_SECRET?: string;
  LICHKHOA_SCRIPT_API_KEY?: string;
  LICHKHOA_SPREADSHEET_ID?: string;
}

const LICHKHOA_SYNC_CONFIG_KEY = 'lichkhoa_sync_config_v1';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}

function readEnvLichKhoaConfig(env: CloudflareLichKhoaSyncConfigEnv): LichKhoaSyncConfigRecord {
  return {
    scriptUrl: String(env.LICHKHOA_SCRIPT_URL || '').trim(),
    scriptSecret: String(
      env.LICHKHOA_SCRIPT_SECRET || env.LICHKHOA_SCRIPT_API_KEY || ''
    ).trim(),
    spreadsheetId: String(env.LICHKHOA_SPREADSHEET_ID || '').trim(),
  };
}

export async function readLichKhoaSyncConfig(
  env: CloudflareLichKhoaSyncConfigEnv
): Promise<LichKhoaSyncConfigRecord> {
  const envDefaults = readEnvLichKhoaConfig(env);
  const raw = await env.PUSH_KV.get(LICHKHOA_SYNC_CONFIG_KEY);
  if (!raw) return envDefaults;
  try {
    const parsed = JSON.parse(raw) as LichKhoaSyncConfigRecord;
    return {
      scriptUrl: envDefaults.scriptUrl || String(parsed.scriptUrl || '').trim(),
      scriptSecret: envDefaults.scriptSecret || String(parsed.scriptSecret || '').trim(),
      spreadsheetId: envDefaults.spreadsheetId || String(parsed.spreadsheetId || '').trim(),
    };
  } catch {
    return envDefaults;
  }
}

async function writeLichKhoaSyncConfig(
  env: CloudflareLichKhoaSyncConfigEnv,
  config: LichKhoaSyncConfigRecord
): Promise<void> {
  await env.PUSH_KV.put(LICHKHOA_SYNC_CONFIG_KEY, JSON.stringify(config));
}

function normalizeScriptUrl(scriptUrl: string): string {
  return String(scriptUrl || '').trim().replace(/\/+$/, '').split('?')[0].split('#')[0];
}

async function validateLichKhoaBridge(scriptUrl: string, scriptSecret: string): Promise<string | null> {
  const trimmed = normalizeScriptUrl(scriptUrl);
  if (!trimmed.startsWith('https://script.google.com/')) {
    return 'URL Apps Script lịch khoa không hợp lệ.';
  }

  let setupUrl = `${trimmed}?action=setup`;
  if (scriptSecret) setupUrl += `&apiKey=${encodeURIComponent(scriptSecret)}`;
  setupUrl += `&_ts=${Date.now()}`;

  const setupRes = await fetch(setupUrl, { redirect: 'follow' });
  const setupText = (await setupRes.text()).trim();
  if (setupText.startsWith('<!') || setupText.startsWith('<html')) {
    return 'Apps Script trả HTML — kiểm tra deploy Web app (Anyone) và URL.';
  }

  let testUrl = `${trimmed}?action=test`;
  if (scriptSecret) testUrl += `&apiKey=${encodeURIComponent(scriptSecret)}`;
  testUrl += `&_ts=${Date.now()}`;

  try {
    const testRes = await fetch(testUrl, { redirect: 'follow' });
    const testData = JSON.parse(await testRes.text()) as { status?: string; ok?: boolean; message?: string };
    if (testData.status !== 'success' && !testData.ok) {
      return testData.message || 'Không test được bridge lịch khoa.';
    }
  } catch {
    return 'Không test được bridge lịch khoa (JSON không hợp lệ).';
  }

  return null;
}

export async function handleCloudflareLichKhoaSyncConfigRequest(
  request: Request,
  env: CloudflareLichKhoaSyncConfigEnv
): Promise<Response> {
  const method = request.method.toUpperCase();

  if (method === 'GET') {
    const config = await readLichKhoaSyncConfig(env);
    const normalized =
      normalizeLichKhoaSpreadsheetId(config.spreadsheetId || '') || config.spreadsheetId || '';
    if (normalized && normalized !== config.spreadsheetId) {
      await writeLichKhoaSyncConfig(env, { ...config, spreadsheetId: normalized });
    }
    return json({
      scriptUrl: config.scriptUrl,
      spreadsheetId: normalized,
      hasSecret: !!config.scriptSecret,
      isSynced: !!(config.scriptUrl && normalized),
    });
  }

  if (method !== 'POST') {
    return json({ error: `Unsupported method: ${method}` }, 405);
  }

  const body = await request.json().catch(() => ({})) as LichKhoaSyncConfigRecord & { disconnect?: boolean };
  const { scriptUrl, scriptSecret, spreadsheetId, disconnect } = body;

  if (disconnect || !scriptUrl) {
    await writeLichKhoaSyncConfig(env, { scriptUrl: '', scriptSecret: '', spreadsheetId: '' });
    return json({ success: true, message: 'Đã hủy liên kết Sheet lịch khoa.' });
  }

  if (!String(scriptUrl).startsWith('https://script.google.com/')) {
    return json({ error: 'URL Apps Script lịch khoa không hợp lệ.' }, 400);
  }

  const sheetIdRaw = String(spreadsheetId || '').trim();
  if (!sheetIdRaw) {
    return json({ error: 'Thiếu Spreadsheet ID lịch khoa.' }, 400);
  }
  const sheetId = normalizeLichKhoaSpreadsheetId(sheetIdRaw);
  if (!sheetId) {
    return json({
      error: 'Spreadsheet ID không hợp lệ. Copy đúng ID từ URL Google Sheet (docs.google.com/spreadsheets/d/…/edit, thường 44 ký tự).',
    }, 400);
  }

  const existing = await readLichKhoaSyncConfig(env);
  const secretToStore = String(scriptSecret || '').trim() || existing.scriptSecret || '';

  const validationError = await validateLichKhoaBridge(String(scriptUrl).trim(), secretToStore);
  if (validationError) {
    return json({ error: validationError }, 400);
  }

  const sheetVerify = await verifyLichKhoaSpreadsheetAccess(
    String(scriptUrl).trim(),
    secretToStore,
    sheetId
  );
  if (sheetVerify.error) {
    return json({ error: sheetVerify.error }, 400);
  }

  await writeLichKhoaSyncConfig(env, {
    scriptUrl: String(scriptUrl).trim(),
    scriptSecret: secretToStore,
    spreadsheetId: sheetId,
  });

  const message = sheetVerify.warning
    ? `Kết nối Sheet lịch khoa đã lưu. ${sheetVerify.warning}`
    : 'Kết nối Sheet lịch khoa thành công.';
  return json({ success: true, message, legacyScript: !!sheetVerify.legacyScript });
}

export async function handleCloudflareLichKhoaProxy(
  request: Request,
  env: CloudflareLichKhoaSyncConfigEnv & CloudflareGateEnv
): Promise<Response> {
  if (request.method.toUpperCase() !== 'POST') {
    return json({ error: 'Method not allowed' }, 405);
  }

  const session = await readRequestSession(request, env);
  if (!session?.staffKey) {
    return json({ error: 'Yêu cầu đăng nhập để truy cập tài nguyên này.' }, 401);
  }

  const config = await readLichKhoaSyncConfig(env);
  if (!config.scriptUrl) {
    return json({ error: 'Chưa cấu hình Apps Script lịch khoa.' }, 400);
  }

  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const spreadsheetIdRaw = String(body.spreadsheetId || config.spreadsheetId || '').trim();
  const spreadsheetId =
    normalizeLichKhoaSpreadsheetId(spreadsheetIdRaw) || spreadsheetIdRaw;
  if (!spreadsheetId) {
    return json({ error: 'Thiếu spreadsheetId lịch khoa.' }, 400);
  }

  const payload = {
    ...body,
    spreadsheetId,
    staffKey: session.staffKey,
    apiKey: config.scriptSecret || '',
  };
  delete (payload as Record<string, unknown>).scriptSecret;

  const scriptUrl = normalizeScriptUrl(config.scriptUrl);
  const upstream = await fetch(scriptUrl, {
    method: 'POST',
    redirect: 'follow',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(payload),
  });
  const text = await upstream.text();
  return new Response(text, {
    status: upstream.ok ? 200 : upstream.status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}

export async function handleCloudflareLichKhoaRequest(
  request: Request,
  env: CloudflareLichKhoaSyncConfigEnv & CloudflareGateEnv
): Promise<Response> {
  const url = new URL(request.url);
  const method = request.method.toUpperCase();

  if (url.pathname === '/api/lichkhoa/proxy') {
    return handleCloudflareLichKhoaProxy(request, env);
  }

  if (url.pathname === '/api/lichkhoa/sync-config' || url.pathname.startsWith('/api/lichkhoa/sync-config/')) {
    if (method !== 'GET') {
      const session = await readRequestSession(request, env);
      if (!session) {
        return json({ error: 'Yêu cầu đăng nhập để cấu hình Sheet lịch khoa.' }, 401);
      }
    }
    return handleCloudflareLichKhoaSyncConfigRequest(request, env);
  }

  return json({ error: 'Không tìm thấy endpoint lichkhoa.' }, 404);
}
