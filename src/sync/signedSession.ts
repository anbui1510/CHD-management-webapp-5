export interface SessionClaims {
  staffKey: string;
  role: string;
  canSync: boolean;
  exp: number;
}

const textEncoder = new TextEncoder();

function bytesToB64Url(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function b64UrlToBytes(value: string): Uint8Array {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/');
  const padLength = (4 - (padded.length % 4)) % 4;
  const binary = atob(padded + '='.repeat(padLength));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    textEncoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
}

export async function signSession(claims: SessionClaims, secret: string): Promise<string> {
  const payload = bytesToB64Url(textEncoder.encode(JSON.stringify(claims)));
  const signature = await crypto.subtle.sign('HMAC', await hmacKey(secret), textEncoder.encode(payload));
  return `${payload}.${bytesToB64Url(new Uint8Array(signature))}`;
}

export async function readSession(token: string, secret: string): Promise<SessionClaims | null> {
  const [payload, signature] = String(token || '').split('.');
  if (!payload || !signature || !secret) return null;
  const ok = await crypto.subtle.verify(
    'HMAC',
    await hmacKey(secret),
    b64UrlToBytes(signature),
    textEncoder.encode(payload)
  );
  if (!ok) return null;
  try {
    const claims = JSON.parse(new TextDecoder().decode(b64UrlToBytes(payload))) as SessionClaims;
    if (!claims?.staffKey || !claims.exp || Date.now() > claims.exp) return null;
    return claims;
  } catch {
    return null;
  }
}

export function sessionCookie(token: string, maxAgeSec: number, secure: boolean): string {
  const parts = [
    `CHD_AUTH_TOKEN=${token}`,
    'HttpOnly',
    'SameSite=Lax',
    'Path=/',
    `Max-Age=${maxAgeSec}`,
  ];
  if (secure) parts.push('Secure');
  return parts.join('; ');
}

export function readCookieToken(cookieHeader: string): string | null {
  const match = String(cookieHeader || '').match(/(?:^|;)\s*CHD_AUTH_TOKEN\s*=\s*([^;]+)/);
  return match ? decodeURIComponent(match[1].trim()) : null;
}

/** Prefer HttpOnly cookie; fall back to Authorization Bearer / x-auth-token (mobile Safari often drops cookies). */
export function readRequestAuthToken(request: Request): string | null {
  const cookieToken = readCookieToken(request.headers.get('cookie') || '');
  if (cookieToken && cookieToken !== 'cookie-session') return cookieToken;

  const auth = request.headers.get('authorization') || request.headers.get('Authorization') || '';
  if (auth.startsWith('Bearer ')) {
    const bearer = auth.slice(7).trim();
    if (bearer && bearer !== 'cookie-session') return bearer;
  }

  const xToken = (request.headers.get('x-auth-token') || request.headers.get('X-Auth-Token') || '').trim();
  if (xToken && xToken !== 'cookie-session') return xToken;

  return null;
}

export function slideSessionClaims(claims: SessionClaims, ttlMs: number): SessionClaims {
  return {
    ...claims,
    exp: Date.now() + ttlMs,
  };
}

export const CHD_AUTH_TOKEN_HEADER = 'X-CHD-Auth-Token';
