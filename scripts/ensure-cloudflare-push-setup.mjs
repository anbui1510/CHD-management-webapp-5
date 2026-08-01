import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import webpush from 'web-push';

const root = process.cwd();
const wranglerPath = path.join(root, 'wrangler.toml');
const namespaceTitle = 'chdmanagementwebapp5-PUSH_KV';
const PLACEHOLDER_KV_ID = '00000000000000000000000000000000';

function isCloudflareCi() {
  return process.env.WORKERS_CI === '1' || process.env.CF_PAGES === '1' || process.env.CI === 'true';
}

function readCurrentKvId() {
  const content = fs.readFileSync(wranglerPath, 'utf8');
  const match = content.match(/\[\[kv_namespaces\]\][\s\S]*?id\s*=\s*"([^"]+)"/);
  return match?.[1] || '';
}

function patchWranglerKvId(kvId) {
  const currentId = readCurrentKvId();
  if (currentId === kvId) {
    console.log(`[cloudflare-push-setup] PUSH_KV id already set (${kvId}) — skipped patch.`);
    return;
  }

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

async function ensureKvNamespaceViaApi() {
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

function parseWranglerJson(output) {
  const start = output.indexOf('[') >= 0 ? output.indexOf('[') : output.indexOf('{');
  if (start < 0) return null;
  return JSON.parse(output.slice(start));
}

function ensureKvNamespaceViaWrangler() {
  try {
    const listOutput = execSync('npx wrangler kv namespace list', {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const namespaces = parseWranglerJson(listOutput);
    if (Array.isArray(namespaces)) {
      const existing = namespaces.find(item => item.title === namespaceTitle);
      if (existing?.id) {
        console.log(`[cloudflare-push-setup] Reusing KV namespace via wrangler ${existing.id}`);
        return existing.id;
      }
    }

    const createOutput = execSync(`npx wrangler kv namespace create "${namespaceTitle}"`, {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const created = parseWranglerJson(createOutput);
    const createdId = created?.id || created?.namespace_id;
    if (!createdId) {
      throw new Error('wrangler kv namespace create returned no id');
    }
    console.log(`[cloudflare-push-setup] Created KV namespace via wrangler ${createdId}`);
    return createdId;
  } catch (error) {
    console.warn('[cloudflare-push-setup] wrangler KV setup failed:', error instanceof Error ? error.message : error);
    return null;
  }
}

function ensureVapidSecrets() {
  if (!process.env.CLOUDFLARE_API_TOKEN) return;

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

async function resolveKvNamespaceId() {
  const currentId = readCurrentKvId();
  if (currentId && currentId !== PLACEHOLDER_KV_ID) {
    console.log(`[cloudflare-push-setup] Using existing PUSH_KV id=${currentId}`);
    return currentId;
  }

  if (process.env.CLOUDFLARE_API_TOKEN && process.env.CLOUDFLARE_ACCOUNT_ID) {
    try {
      return await ensureKvNamespaceViaApi();
    } catch (error) {
      console.warn('[cloudflare-push-setup] Cloudflare API KV setup failed:', error instanceof Error ? error.message : error);
    }
  }

  return ensureKvNamespaceViaWrangler();
}

async function main() {
  const kvId = await resolveKvNamespaceId();
  if (!kvId) {
    if (isCloudflareCi()) {
      throw new Error(
        'Không tạo được PUSH_KV namespace trước khi deploy. Hãy thêm CLOUDFLARE_API_TOKEN + CLOUDFLARE_ACCOUNT_ID vào Build variables hoặc chạy npm run setup:cloudflare-push một lần trên máy có quyền Cloudflare.'
      );
    }
    console.log('[cloudflare-push-setup] skipped — no KV namespace resolved.');
    process.exit(0);
  }

  patchWranglerKvId(kvId);
  ensureVapidSecrets();
}

main().catch(error => {
  console.error('[cloudflare-push-setup]', error);
  process.exit(1);
});
