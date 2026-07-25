import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import webpush from 'web-push';

const root = process.cwd();
const wranglerPath = path.join(root, 'wrangler.toml');
const namespaceTitle = 'chdmanagementwebapp5-PUSH_KV';

function patchWranglerKvId(kvId) {
  const content = fs.readFileSync(wranglerPath, 'utf8');
  const updated = content.replace(
    /(\[\[kv_namespaces\]\][\s\S]*?id\s*=\s*)"[^"]+"/,
    `$1"${kvId}"`
  );
  if (updated === content) {
    throw new Error('Could not patch PUSH_KV id in wrangler.toml');
  }
  fs.writeFileSync(wranglerPath, updated);
  console.log(`[cloudflare-push-setup] Patched wrangler.toml PUSH_KV id=${kvId}`);
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

async function ensureKvNamespace() {
  const namespaces = await cfAccountApi('/storage/kv/namespaces?per_page=100');
  const existing = namespaces.find(item => item.title === namespaceTitle);
  if (existing?.id) {
    console.log(`[cloudflare-push-setup] Reusing KV namespace ${existing.id}`);
    return existing.id;
  }

  const created = await cfAccountApi('/storage/kv/namespaces', {
    method: 'POST',
    body: JSON.stringify({ title: namespaceTitle }),
  });
  if (!created?.id) {
    throw new Error('Failed to create PUSH_KV namespace');
  }
  console.log(`[cloudflare-push-setup] Created KV namespace ${created.id}`);
  return created.id;
}

function ensureVapidSecrets() {
  let secrets = [];
  try {
    const output = execSync('npx wrangler secret list', {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const start = output.indexOf('[');
    if (start >= 0) {
      secrets = JSON.parse(output.slice(start));
    }
  } catch (error) {
    const stdout = error?.stdout ? String(error.stdout) : '';
    const start = stdout.indexOf('[');
    if (start >= 0) {
      secrets = JSON.parse(stdout.slice(start));
    }
  }

  const hasPrivate = secrets.some(item => item.name === 'VAPID_PRIVATE_KEY');
  const hasPublic = secrets.some(item => item.name === 'VAPID_PUBLIC_KEY');

  if (hasPrivate && hasPublic) {
    console.log('[cloudflare-push-setup] VAPID secrets already present — skipped generation.');
    return;
  }

  const keys = webpush.generateVAPIDKeys();
  execSync('npx wrangler secret put VAPID_PRIVATE_KEY', {
    input: keys.privateKey,
    stdio: ['pipe', 'inherit', 'inherit'],
  });
  execSync('npx wrangler secret put VAPID_PUBLIC_KEY', {
    input: keys.publicKey,
    stdio: ['pipe', 'inherit', 'inherit'],
  });
  if (!secrets.some(item => item.name === 'VAPID_SUBJECT')) {
    execSync('npx wrangler secret put VAPID_SUBJECT', {
      input: 'mailto:chd-admin@hospital.vn',
      stdio: ['pipe', 'inherit', 'inherit'],
    });
  }
  console.log('[cloudflare-push-setup] Generated and uploaded VAPID secrets to Cloudflare Worker.');
}

async function main() {
  if (!process.env.CLOUDFLARE_API_TOKEN) {
    console.log('[cloudflare-push-setup] CLOUDFLARE_API_TOKEN missing — skipped remote setup.');
    process.exit(0);
  }

  const kvId = await ensureKvNamespace();
  patchWranglerKvId(kvId);
  ensureVapidSecrets();
}

main().catch(error => {
  console.error('[cloudflare-push-setup]', error);
  process.exit(1);
});
