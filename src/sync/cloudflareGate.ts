import { denialForSheetsPayload, isAdminRole, type StaffActor } from '../auth/staffUpdateGuard';
import { forwardToAppsScript } from './sheetsProxy';
import { readSyncConfig, type CloudflareSyncConfigEnv } from './cloudflareSyncConfigApi';
import { readCookieToken, readSession, sessionCookie, signSession, type SessionClaims } from './signedSession';

const SESSION_TTL_MS = 8 * 60 * 60 * 1000;
const LOGIN_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const LOGIN_CACHE_PREFIX = 'staff_login_v1:';
/** Stable signing key — must not change when Google Sheets API key rotates. */
const SESSION_SECRET_KV_KEY = 'chd_session_secret_v1';
const loginAttempts = new Map<string, { count: number; resetAt: number }>();

type CachedStaff = {
  StaffKey?: string;
  Role?: string;
  Permissions?: string;
  StaffRolePreset?: string;
  FireDate?: string;
  StaffName?: string;
  Name?: string;
};

type CachedLogin = {
  hash: string;
  staff: CachedStaff;
  exp: number;
};

export interface CloudflareGateEnv extends CloudflareSyncConfigEnv {
  SESSION_SECRET?: string;
}

function json(body: unknown, status = 200, extraHeaders?: HeadersInit): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...extraHeaders },
  });
}

async function signingSecret(env: CloudflareGateEnv): Promise<string> {
  if (env.SESSION_SECRET && env.SESSION_SECRET.trim()) return env.SESSION_SECRET.trim();

  const stored = await env.PUSH_KV.get(SESSION_SECRET_KV_KEY);
  if (stored && stored.trim()) return stored.trim();

  const generated = [...crypto.getRandomValues(new Uint8Array(32))]
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('');
  await env.PUSH_KV.put(SESSION_SECRET_KV_KEY, generated);
  return generated;
}

export async function readRequestSession(request: Request, env: CloudflareGateEnv): Promise<SessionClaims | null> {
  const token = readCookieToken(request.headers.get('cookie') || '');
  if (!token || token === 'cookie-session') return null;
  const secret = await signingSecret(env);
  if (!secret) return null;
  return readSession(token, secret);
}

function tooManyAttempts(key: string): boolean {
  const now = Date.now();
  const entry = loginAttempts.get(key);
  if (!entry || now > entry.resetAt) {
    loginAttempts.set(key, { count: 1, resetAt: now + 10 * 60 * 1000 });
    return false;
  }
  entry.count += 1;
  return entry.count > 8;
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

async function hashLoginPassword(password: string, salt?: string): Promise<string> {
  const useSalt = salt || [...crypto.getRandomValues(new Uint8Array(16))].map(byte => byte.toString(16).padStart(2, '0')).join('');
  return `sha256$${useSalt}$${await sha256Hex(`${password}:${useSalt}`)}`;
}

async function cachedPasswordMatches(password: string, stored: string): Promise<boolean> {
  const parts = String(stored || '').split('$');
  if (parts.length !== 3 || parts[0] !== 'sha256' || !parts[1] || !parts[2]) return false;
  const next = await hashLoginPassword(password, parts[1]);
  if (next.length !== stored.length) return false;
  let diff = 0;
  for (let i = 0; i < next.length; i += 1) diff |= next.charCodeAt(i) ^ stored.charCodeAt(i);
  return diff === 0;
}

async function readLoginCache(env: CloudflareGateEnv, staffKey: string): Promise<CachedLogin | null> {
  const raw = await env.PUSH_KV.get(`${LOGIN_CACHE_PREFIX}${staffKey}`);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as CachedLogin;
    if (!parsed?.hash || !parsed.staff?.StaffKey || !parsed.exp || parsed.exp < Date.now()) return null;
    return parsed;
  } catch {
    return null;
  }
}

async function writeLoginCache(env: CloudflareGateEnv, staffKey: string, password: string, staff: CachedStaff): Promise<void> {
  const record: CachedLogin = {
    hash: await hashLoginPassword(password),
    staff,
    exp: Date.now() + LOGIN_CACHE_TTL_MS,
  };
  await env.PUSH_KV.put(`${LOGIN_CACHE_PREFIX}${staffKey}`, JSON.stringify(record));
}

function canSyncFromStaff(staff: { Role?: string; Permissions?: string; StaffRolePreset?: string }): boolean {
  if (isAdminRole(staff.Role)) return true;
  if (String(staff.StaffRolePreset || '') === 'admin-khoa') return true;
  return String(staff.Permissions || '').split(/[,;\n]+/).map(item => item.trim()).includes('google-sheets');
}

export async function handleCloudflareAuthRequest(request: Request, env: CloudflareGateEnv): Promise<Response> {
  const url = new URL(request.url);
  const action = url.pathname.replace(/^\/api\/auth\/?/, '');
  const method = request.method.toUpperCase();
  const secure = url.protocol === 'https:';

  if (action === 'logout' && method === 'POST') {
    return json({ success: true }, 200, {
      'Set-Cookie': 'CHD_AUTH_TOKEN=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0',
    });
  }

  if (action === 'me' && method === 'GET') {
    const session = await readRequestSession(request, env);
    if (!session) return json({ error: 'Yêu cầu đăng nhập.' }, 401);
    return json({ StaffKey: session.staffKey, Role: session.role });
  }

  if (action !== 'login' || method !== 'POST') {
    return json({ error: 'Không tìm thấy endpoint auth.' }, 404);
  }

  const body = await request.json().catch(() => ({})) as { StaffKey?: string; Password?: string };
  const staffKey = String(body.StaffKey || '').trim();
  const password = String(body.Password || '');
  if (!staffKey || !password) {
    return json({ error: 'Vui lòng nhập mã nhân viên và mật khẩu.' }, 400);
  }

  const ip = request.headers.get('cf-connecting-ip') || 'unknown';
  if (tooManyAttempts(`${ip}:${staffKey}`)) {
    return json({ error: 'Bạn đã thử đăng nhập quá nhiều lần. Vui lòng đợi vài phút.' }, 429);
  }

  const config = await readSyncConfig(env);
  if (!config.scriptUrl || !config.scriptSecret) {
    return json({ error: 'Máy chủ chưa cấu hình Google Sheets.' }, 503);
  }

  const cached = await readLoginCache(env, staffKey);
  if (cached && await cachedPasswordMatches(password, cached.hash)) {
    if (String(cached.staff.FireDate || '').trim()) {
      return json({ error: 'Tài khoản đã bị vô hiệu hóa.' }, 403);
    }
    const secret = await signingSecret(env);
    if (!secret) return json({ error: 'Máy chủ chưa có khóa phiên đăng nhập.' }, 503);
    const claims: SessionClaims = {
      staffKey: String(cached.staff.StaffKey),
      role: String(cached.staff.Role || ''),
      canSync: canSyncFromStaff(cached.staff),
      exp: Date.now() + SESSION_TTL_MS,
    };
    const token = await signSession(claims, secret);
    loginAttempts.delete(`${ip}:${staffKey}`);
    return json(
      { token: 'cookie-session', staff: cached.staff },
      200,
      { 'Set-Cookie': sessionCookie(token, SESSION_TTL_MS / 1000, secure) }
    );
  }

  const upstream = await forwardToAppsScript(config, {
    kind: 'post',
    payload: { action: 'login', staffKey, password },
  });
  const result = await upstream.json().catch(() => null) as { status?: string; message?: string; staff?: CachedStaff } | null;
  if (!result || result.status !== 'success' || !result.staff?.StaffKey) {
    return json({ error: 'Mã nhân viên hoặc mật khẩu không đúng.' }, 401);
  }
  if (String(result.staff.FireDate || '').trim()) {
    return json({ error: 'Tài khoản đã bị vô hiệu hóa.' }, 403);
  }
  await writeLoginCache(env, staffKey, password, result.staff).catch(() => undefined);

  const secret = await signingSecret(env);
  if (!secret) return json({ error: 'Máy chủ chưa có khóa phiên đăng nhập.' }, 503);

  const claims: SessionClaims = {
    staffKey: String(result.staff.StaffKey),
    role: String(result.staff.Role || ''),
    canSync: canSyncFromStaff(result.staff),
    exp: Date.now() + SESSION_TTL_MS,
  };
  const token = await signSession(claims, secret);
  loginAttempts.delete(`${ip}:${staffKey}`);
  return json(
    { token: 'cookie-session', staff: result.staff },
    200,
    { 'Set-Cookie': sessionCookie(token, SESSION_TTL_MS / 1000, secure) }
  );
}

export async function handleCloudflareSheetsProxy(request: Request, env: CloudflareGateEnv): Promise<Response> {
  if (request.method.toUpperCase() !== 'POST') {
    return json({ error: 'Method not allowed' }, 405);
  }
  const session = await readRequestSession(request, env);
  if (!session) return json({ error: 'Yêu cầu đăng nhập để truy cập tài nguyên này.' }, 401);

  const body = await request.json().catch(() => ({})) as { kind?: string; action?: string; payload?: Record<string, unknown> };
  const actor: StaffActor = { StaffKey: session.staffKey, Role: session.role };
  if (body.kind === 'post') {
    const denial = denialForSheetsPayload(actor, body.payload || null);
    if (denial) return json({ error: denial }, 403);
  } else if (body.kind !== 'get') {
    return json({ error: 'Yêu cầu proxy không hợp lệ.' }, 400);
  }

  const config = await readSyncConfig(env);
  return forwardToAppsScript(config, {
    kind: body.kind,
    action: body.action,
    payload: body.payload,
  });
}
