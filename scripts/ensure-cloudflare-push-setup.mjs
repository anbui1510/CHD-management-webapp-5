import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import webpush from 'web-push';

const root = process.cwd();
const wranglerPath = path.join(root, 'wrangler.toml');
const namespaceTitle = 'chdmanagementwebapp5-PUSH_KV';

function run(command, options = {}) {
  return execSync(command, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], ...options }).trim();
}

function runJson(command) {
  const output = run(command);
  if (!output) return null;
  const start = output.indexOf('[') >= 0 ? output.indexOf('[') : output.indexOf('{');
  if (start < 0) return null;
  return JSON.parse(output.slice(start));
}

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

function ensureKvNamespace() {
  const listed = runJson('npx wrangler kv namespace list --json') || [];
  const existing = listed.find(item => item.title === namespaceTitle);
  if (existing?.id) {
    console.log(`[cloudflare-push-setup] Reusing KV namespace ${existing.id}`);
    return existing.id;
  }
  const created = runJson(`npx wrangler kv namespace create ${namespaceTitle} --json`);
  if (!created?.id) {
    throw new Error('Failed to create PUSH_KV namespace');
  }
  console.log(`[cloudflare-push-setup] Created KV namespace ${created.id}`);
  return created.id;
}

function ensureVapidSecrets() {
  const secrets = runJson('npx wrangler secret list --json') || [];
  const hasPrivate = secrets.some(item => item.name === 'VAPID_PRIVATE_KEY');
  const hasPublic = secrets.some(item => item.name === 'VAPID_PUBLIC_KEY');

  if (hasPrivate && hasPublic) {
    console.log('[cloudflare-push-setup] VAPID secrets already present — skipped generation.');
    return;
  }

  const keys = webpush.generateVAPIDKeys();
  execSync('npx wrangler secret put VAPID_PRIVATE_KEY', { input: keys.privateKey, stdio: ['pipe', 'inherit', 'inherit'] });
  execSync('npx wrangler secret put VAPID_PUBLIC_KEY', { input: keys.publicKey, stdio: ['pipe', 'inherit', 'inherit'] });
  if (!secrets.some(item => item.name === 'VAPID_SUBJECT')) {
    execSync('npx wrangler secret put VAPID_SUBJECT', { input: 'mailto:chd-admin@hospital.vn', stdio: ['pipe', 'inherit', 'inherit'] });
  }
  console.log('[cloudflare-push-setup] Generated and uploaded VAPID secrets to Cloudflare Worker.');
}

function main() {
  if (!process.env.CLOUDFLARE_API_TOKEN) {
    console.log('[cloudflare-push-setup] CLOUDFLARE_API_TOKEN missing — skipped remote setup.');
    process.exit(0);
  }

  const kvId = ensureKvNamespace();
  patchWranglerKvId(kvId);
  ensureVapidSecrets();
}

main();
