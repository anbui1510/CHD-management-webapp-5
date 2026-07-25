import fs from 'fs';
import path from 'path';
import webpush from 'web-push';

const root = process.cwd();
const envPath = path.join(root, '.env');
const examplePath = path.join(root, '.env.example');

function parseEnv(content) {
  const map = new Map();
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    map.set(key, value);
  }
  return map;
}

function serializeEnv(content, map) {
  const lines = content.split('\n');
  const seen = new Set();
  const output = lines.map((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) return line;
    const key = trimmed.slice(0, trimmed.indexOf('=')).trim();
    if (!map.has(key)) return line;
    seen.add(key);
    const value = map.get(key) ?? '';
    return `${key}="${value}"`;
  });

  for (const [key, value] of map.entries()) {
    if (!seen.has(key)) {
      output.push(`${key}="${value}"`);
    }
  }

  return `${output.join('\n').replace(/\n?$/, '\n')}`;
}

const baseContent = fs.existsSync(envPath)
  ? fs.readFileSync(envPath, 'utf8')
  : (fs.existsSync(examplePath) ? fs.readFileSync(examplePath, 'utf8') : '');

const envMap = parseEnv(baseContent);
const hasPublic = String(envMap.get('VAPID_PUBLIC_KEY') || '').trim();
const hasPrivate = String(envMap.get('VAPID_PRIVATE_KEY') || '').trim();

if (!hasPublic || !hasPrivate) {
  const keys = webpush.generateVAPIDKeys();
  envMap.set('VAPID_PUBLIC_KEY', keys.publicKey);
  envMap.set('VAPID_PRIVATE_KEY', keys.privateKey);
  if (!String(envMap.get('VAPID_SUBJECT') || '').trim()) {
    envMap.set('VAPID_SUBJECT', 'mailto:chd-admin@hospital.vn');
  }
  console.log('[setup-vapid-env] Generated new VAPID keys.');
} else {
  console.log('[setup-vapid-env] VAPID keys already present — skipped generation.');
}

fs.writeFileSync(envPath, serializeEnv(baseContent, envMap));
console.log(`[setup-vapid-env] Updated ${envPath}`);
