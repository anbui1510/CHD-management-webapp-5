import fs from 'fs';
import path from 'path';
import { readGoogleScriptConfigFromEnv } from './cloudflare-env.mjs';

const root = process.cwd();
const wranglerPath = path.join(root, 'wrangler.toml');
const SYNC_CONFIG_KEY = 'sync_config_v1';

function readKvNamespaceId() {
  const content = fs.readFileSync(wranglerPath, 'utf8');
  const match = content.match(/\[\[kv_namespaces\]\][\s\S]*?id\s*=\s*"([^"]+)"/);
  if (!match?.[1] || match[1] === '00000000000000000000000000000000') {
    throw new Error('PUSH_KV namespace id is missing in wrangler.toml');
  }
  return match[1];
}

async function cfAccountApi(pathname, options = {}) {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const token = process.env.CLOUDFLARE_API_TOKEN;
  if (!accountId || !token) {
    throw new Error('Missing CLOUDFLARE_ACCOUNT_ID or CLOUDFLARE_API_TOKEN');
  }

  const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}${pathname}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });

  const payload = await response.json();
  if (!payload.success) {
    throw new Error(`Cloudflare API ${pathname} failed: ${JSON.stringify(payload.errors || payload)}`);
  }
  return payload.result;
}

async function readExistingSyncConfig(kvId) {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const token = process.env.CLOUDFLARE_API_TOKEN;
  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/storage/kv/namespaces/${kvId}/values/${encodeURIComponent(SYNC_CONFIG_KEY)}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (response.status === 404) return null;
  if (!response.ok) return null;
  try {
    return JSON.parse(await response.text());
  } catch {
    return null;
  }
}

async function main() {
  const { scriptUrl, scriptSecret } = readGoogleScriptConfigFromEnv();

  if (!process.env.CLOUDFLARE_API_TOKEN) {
    console.log('[cloudflare-sync-config] CLOUDFLARE_API_TOKEN missing — skipped KV seed.');
    process.exit(0);
  }

  if (!scriptUrl) {
    console.log('[cloudflare-sync-config] GOOGLE_SCRIPT_URL / VITE_GOOGLE_SCRIPT_URL missing — skipped KV seed.');
    process.exit(0);
  }

  const kvId = readKvNamespaceId();
  const existing = await readExistingSyncConfig(kvId);
  const secretToStore = scriptSecret || String(existing?.scriptSecret || '').trim();
  if (!secretToStore) {
    console.log('[cloudflare-sync-config] No API key in env or KV — skipped so an empty key is not saved.');
    process.exit(0);
  }

  const value = JSON.stringify({ scriptUrl, scriptSecret: secretToStore });
  await cfAccountApi(`/storage/kv/namespaces/${kvId}/values/${encodeURIComponent(SYNC_CONFIG_KEY)}`, {
    method: 'PUT',
    body: value,
  });

  console.log(`[cloudflare-sync-config] Seeded sync config into KV namespace ${kvId}.`);
}

main().catch(err => {
  console.error('[cloudflare-sync-config] Failed:', err);
  process.exit(1);
});
