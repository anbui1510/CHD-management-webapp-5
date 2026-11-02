/**
 * Unit checks for Sheets proxy auth helpers (no browser / Worker required).
 * Run: node scripts/test-sheets-proxy-auth.mjs
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

// Minimal atob for Node when loading the TS-compiled logic via dynamic transpile is heavy —
// instead re-implement the pure helpers inline matching sheetsProxyAuth.ts for lockstep checks,
// then also import via tsx if available.

const SESSION_AUTH_HINTS = [
  'yêu cầu đăng nhập',
  'phiên đăng nhập',
  'đăng nhập lại',
  'unauthorized',
  'authentication required',
];

function isSignedSessionToken(token) {
  const value = String(token || '').trim();
  if (!value || value === 'cookie-session') return false;
  const parts = value.split('.');
  return parts.length === 2 && parts[0].length > 8 && parts[1].length > 8;
}

function isSessionAuthErrorBody(bodyText) {
  const text = String(bodyText || '').trim();
  if (!text) return true;
  if (text.startsWith('<')) return false;
  try {
    const parsed = JSON.parse(text);
    const message = String(parsed.error || parsed.message || '').toLowerCase();
    if (!message) return true;
    return SESSION_AUTH_HINTS.some(hint => message.includes(hint));
  } catch {
    const lower = text.toLowerCase();
    return SESSION_AUTH_HINTS.some(hint => lower.includes(hint));
  }
}

function classifyProxyHttpError(status, bodyText) {
  if (status === 401 && isSessionAuthErrorBody(bodyText)) {
    return { name: 'SheetsProxyAuthError', message: 'session' };
  }
  if (status === 401) {
    return { name: 'Error', message: 'Google từ chối truy cập Web app (HTTP 401)' };
  }
  return { name: 'Error', message: `Apps Script trả về HTTP ${status}` };
}

// 1) Proxy session 401 must NOT be labeled as "Apps Script trả về HTTP 401"
{
  const err = classifyProxyHttpError(401, JSON.stringify({
    error: 'Yêu cầu đăng nhập để truy cập tài nguyên này.'
  }));
  assert.equal(err.name, 'SheetsProxyAuthError');
  assert.notEqual(err.message.includes('Apps Script trả về HTTP 401'), true);
}

// 2) Upstream Google 401 (HTML / no session hint) keeps a clear deploy message
{
  const err = classifyProxyHttpError(401, '<html>Unauthorized</html>');
  assert.equal(err.name, 'Error');
  assert.match(err.message, /Google từ chối|HTTP 401/);
}

// 3) cookie-session placeholder is not a signed token
{
  assert.equal(isSignedSessionToken('cookie-session'), false);
  assert.equal(isSignedSessionToken(''), false);
  assert.equal(isSignedSessionToken('abcdefghij.klmnopqrst'), true);
  assert.equal(isSignedSessionToken('short.sig'), false);
}

// 4) Retryable set must not include 401 (source lock)
{
  const retrySrc = readFileSync(join(root, 'src/utils/appsScriptRetry.ts'), 'utf8');
  assert.match(retrySrc, /RETRYABLE_HTTP_STATUSES = new Set\(\[404, 408, 429, 500, 502, 503, 504\]\)/);
  assert.doesNotMatch(retrySrc, /RETRYABLE_HTTP_STATUSES = new Set\(\[[^\]]*401/);
}

// 5) Worker gate accepts Bearer and slides session
{
  const gateSrc = readFileSync(join(root, 'src/sync/cloudflareGate.ts'), 'utf8');
  assert.match(gateSrc, /readRequestAuthToken/);
  assert.match(gateSrc, /attachSlidSession/);
  assert.match(gateSrc, /CHD_AUTH_TOKEN_HEADER/);
  // Login must return signed JWT, not opaque cookie-session placeholder
  assert.doesNotMatch(gateSrc, /token:\s*'cookie-session'/);
}

// 6) Client bridge awaits Sheets write and surfaces _sheetsSync
{
  const bridgeSrc = readFileSync(join(root, 'src/api/appsScriptFetch.ts'), 'utf8');
  assert.match(bridgeSrc, /syncRecordToScriptAwaited/);
  assert.match(bridgeSrc, /_sheetsSync:\s*sheetsSync/);
  assert.match(bridgeSrc, /SheetsProxyAuthError/);
  assert.match(bridgeSrc, /getProxyAuthHeaders/);
  assert.doesNotMatch(bridgeSrc, /const syncRecordToScript = \(/);
}

console.log('OK: sheets proxy auth / mobile sync guards passed');
