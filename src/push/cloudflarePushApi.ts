import { sendPushNotification } from 'web-push-browser';
import type { WebPushPayload } from './pushPayload';
import { loadVapidKeys } from './loadVapidKeys';

export interface PushSubscriptionRecord {
  PushSubKey: string;
  StaffKey: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  UserAgent?: string;
  CreatedTime: string;
  UpdatedTime: string;
}

export interface PushKvStore {
  get(key: string): Promise<string | null>;
  put(key: string, value: string): Promise<void>;
}

export interface CloudflarePushEnv {
  PUSH_KV: PushKvStore;
  VAPID_PUBLIC_KEY?: string;
  VAPID_PRIVATE_KEY?: string;
  VAPID_SUBJECT?: string;
}

const SUBSCRIPTIONS_KEY = 'push_subscriptions_v1';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}

function isConfigured(env: CloudflarePushEnv): boolean {
  return !!(String(env.VAPID_PUBLIC_KEY || '').trim() && String(env.VAPID_PRIVATE_KEY || '').trim());
}

let cachedVapidKeys: CryptoKeyPair | null = null;
let cachedVapidFingerprint = '';

function resolveVapidContact(env: CloudflarePushEnv): string {
  const subject = String(env.VAPID_SUBJECT || 'mailto:chd-admin@hospital.vn').trim();
  return subject.replace(/^mailto:/i, '') || 'chd-admin@hospital.vn';
}

async function loadVapidKeysFromEnv(env: CloudflarePushEnv): Promise<CryptoKeyPair | null> {
  const publicKey = String(env.VAPID_PUBLIC_KEY || '').trim();
  const privateKey = String(env.VAPID_PRIVATE_KEY || '').trim();
  if (!publicKey || !privateKey) return null;

  const fingerprint = `${publicKey}:${privateKey}`;
  if (cachedVapidKeys && cachedVapidFingerprint === fingerprint) {
    return cachedVapidKeys;
  }

  try {
    const keyPair = await loadVapidKeys(publicKey, privateKey);
    cachedVapidKeys = keyPair;
    cachedVapidFingerprint = fingerprint;
    return keyPair;
  } catch (error) {
    console.error('[push] Failed to load VAPID keys:', error);
    return null;
  }
}

async function readSubscriptions(kv: PushKvStore): Promise<PushSubscriptionRecord[]> {
  const raw = await kv.get(SUBSCRIPTIONS_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeSubscriptions(kv: PushKvStore, records: PushSubscriptionRecord[]): Promise<void> {
  await kv.put(SUBSCRIPTIONS_KEY, JSON.stringify(records));
}

function normalizeSubscribeBody(body: any): Omit<PushSubscriptionRecord, 'PushSubKey' | 'CreatedTime' | 'UpdatedTime'> | null {
  const endpoint = String(body?.endpoint || '').trim();
  const keys = body?.keys || {};
  const p256dh = String(keys.p256dh || body?.p256dh || '').trim();
  const auth = String(keys.auth || body?.auth || '').trim();
  const staffKey = String(body?.StaffKey || '').trim();
  if (!endpoint || !p256dh || !auth || !staffKey) return null;
  return {
    StaffKey: staffKey,
    endpoint,
    p256dh,
    auth,
    UserAgent: String(body?.UserAgent || '').trim(),
  };
}

function createPushSubKey(existing: PushSubscriptionRecord[]): string {
  return `pushsub_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

function nowIso(): string {
  return new Date().toISOString();
}

async function upsertSubscription(kv: PushKvStore, body: any): Promise<{ record: PushSubscriptionRecord; isNew: boolean } | null> {
  const normalized = normalizeSubscribeBody(body);
  if (!normalized) return null;

  const subscriptions = await readSubscriptions(kv);
  const now = nowIso();
  const existingIndex = subscriptions.findIndex(item => item.endpoint === normalized.endpoint);

  if (existingIndex >= 0) {
    subscriptions[existingIndex] = {
      ...subscriptions[existingIndex],
      ...normalized,
      UpdatedTime: now,
    };
    await writeSubscriptions(kv, subscriptions);
    return { record: subscriptions[existingIndex], isNew: false };
  }

  const record: PushSubscriptionRecord = {
    PushSubKey: createPushSubKey(subscriptions),
    ...normalized,
    CreatedTime: now,
    UpdatedTime: now,
  };
  subscriptions.push(record);
  await writeSubscriptions(kv, subscriptions);
  return { record, isNew: true };
}

async function removeSubscription(kv: PushKvStore, staffKey: string, endpoint: string): Promise<boolean> {
  const subscriptions = await readSubscriptions(kv);
  const next = subscriptions.filter(item => !(item.endpoint === endpoint && item.StaffKey === staffKey));
  if (next.length === subscriptions.length) return false;
  await writeSubscriptions(kv, next);
  return true;
}

const RETRYABLE_PUSH_STATUS = new Set([408, 429, 500, 502, 503, 504]);
const STALE_PUSH_STATUS = new Set([400, 401, 403, 404, 410]);

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

interface SendToStaffOptions {
  removeStale?: boolean;
  retries?: number;
}

async function sendToStaff(
  kv: PushKvStore,
  env: CloudflarePushEnv,
  staffKey: string,
  payload: WebPushPayload,
  options: SendToStaffOptions = {}
) {
  const removeStale = options.removeStale !== false;
  const retries = Math.max(0, options.retries ?? 0);

  const vapidKeys = await loadVapidKeysFromEnv(env);
  if (!vapidKeys) {
    return {
      sent: 0,
      removed: 0,
      skipped: true,
      attempted: 0,
      needsResubscribe: false,
      errors: ['Không load được VAPID keys trên Worker'],
    };
  }

  const vapidContact = resolveVapidContact(env);
  const subscriptions = (await readSubscriptions(kv)).filter(item => String(item.StaffKey) === String(staffKey));
  if (subscriptions.length === 0) {
    return { sent: 0, removed: 0, skipped: false, attempted: 0, needsResubscribe: false, errors: [] as string[] };
  }

  let sent = 0;
  const staleEndpoints: string[] = [];
  const errors: string[] = [];
  const body = JSON.stringify(payload);

  for (const subscription of subscriptions) {
    let delivered = false;
    let lastError = '';

    for (let attempt = 0; attempt <= retries; attempt += 1) {
      try {
        const response = await sendPushNotification(
          vapidKeys,
          {
            endpoint: subscription.endpoint,
            keys: {
              p256dh: subscription.p256dh,
              auth: subscription.auth,
            },
          },
          vapidContact,
          body
        );

        if (response.ok || response.status === 201) {
          delivered = true;
          sent += 1;
          break;
        }

        const statusCode = response.status;
        const message = String(await response.text().catch(() => response.statusText || 'Push delivery failed')).slice(0, 180);
        lastError = `HTTP ${statusCode}: ${message}`;

        if (STALE_PUSH_STATUS.has(statusCode)) {
          break;
        }
        if (attempt < retries && RETRYABLE_PUSH_STATUS.has(statusCode)) {
          await sleep(800 * (attempt + 1));
          continue;
        }
        break;
      } catch (error: any) {
        const message = String(error?.message || 'Push delivery failed').slice(0, 180);
        lastError = message;
        break;
      }
    }

    if (!delivered) {
      errors.push(lastError || 'Push delivery failed');
      const statusCode = Number(lastError.match(/^HTTP (\d+)/)?.[1] || 0);
      if (STALE_PUSH_STATUS.has(statusCode)) {
        staleEndpoints.push(subscription.endpoint);
      }
    }
  }

  if (removeStale && staleEndpoints.length > 0) {
    const next = (await readSubscriptions(kv)).filter(item => !staleEndpoints.includes(item.endpoint));
    await writeSubscriptions(kv, next);
  }

  return {
    sent,
    removed: removeStale ? staleEndpoints.length : 0,
    skipped: false,
    attempted: subscriptions.length,
    needsResubscribe: removeStale && subscriptions.length > 0 && sent === 0,
    errors,
  };
}

function parseStaffKeyFromRequest(request: Request, body?: any): string {
  const url = new URL(request.url);
  const fromQuery = String(url.searchParams.get('staffKey') || url.searchParams.get('StaffKey') || '').trim();
  if (fromQuery) return fromQuery;
  if (body) {
    const fromBody = String(body.StaffKey || '').trim();
    if (fromBody) return fromBody;
  }
  return '';
}

export async function handleCloudflarePushRequest(request: Request, env: CloudflarePushEnv): Promise<Response> {
  const url = new URL(request.url);
  const method = request.method.toUpperCase();
  const parts = url.pathname.replace(/^\/api\/push\/?/, '').split('/').filter(Boolean);
  const action = parts[0] || '';

  if (!env.PUSH_KV) {
    return json({ error: 'Push KV chưa được cấu hình trên Worker', configured: false }, 503);
  }

  if (action === 'vapid-public-key' && method === 'GET') {
    const publicKey = String(env.VAPID_PUBLIC_KEY || '').trim();
    if (!publicKey) {
      return json({ error: 'Web Push chưa được cấu hình trên server', configured: false }, 503);
    }
    return json({
      publicKey,
      configured: true,
      pushSender: 'web-push-browser',
      hasPrivateKey: !!String(env.VAPID_PRIVATE_KEY || '').trim(),
    });
  }

  if (action === 'status' && method === 'GET') {
    const staffKey = parseStaffKeyFromRequest(request);
    if (!staffKey) {
      return json({ error: 'Thiếu staffKey', configured: isConfigured(env), subscribed: false }, 400);
    }
    const subscriptions = await readSubscriptions(env.PUSH_KV);
    const subscribed = subscriptions.some(item => String(item.StaffKey) === staffKey);
    return json({ configured: isConfigured(env), subscribed });
  }

  if (action === 'subscribe' && method === 'POST') {
    const body = await request.json().catch(() => ({}));
    const silent = body?.silent === true || body?.syncOnly === true;
    const upserted = await upsertSubscription(env.PUSH_KV, body);
    if (!upserted) {
      return json({ error: 'Thiếu endpoint hoặc keys push subscription' }, 400);
    }
    const { record, isNew } = upserted;

    let testResult: Awaited<ReturnType<typeof sendToStaff>> | undefined;
    if (isNew && !silent) {
      const testPayload: WebPushPayload = {
        title: 'CHD Management',
        body: 'Đã bật thông báo điện thoại thành công.',
        url: '/?view=home',
        notificationKey: `push_test_${Date.now()}`,
      };
      // Do not purge brand-new subscriptions when the welcome push fails (common on iOS right after subscribe).
      testResult = await sendToStaff(env.PUSH_KV, env, record.StaffKey, testPayload, {
        removeStale: false,
        retries: 2,
      });
    }

    return json({ ...record, testPush: testResult, subscribed: true }, 201);
  }

  if (action === 'unsubscribe' && method === 'DELETE') {
    const body = await request.json().catch(() => ({}));
    const staffKey = parseStaffKeyFromRequest(request, body);
    const endpoint = String(body?.endpoint || '').trim();
    if (!staffKey || !endpoint) {
      return json({ error: 'Thiếu endpoint hoặc StaffKey' }, 400);
    }
    const removed = await removeSubscription(env.PUSH_KV, staffKey, endpoint);
    return json({ success: removed });
  }

  if (action === 'deliver' && method === 'POST') {
    const body = await request.json().catch(() => ({}));
    const staffKey = String(body?.StaffKey || '').trim();
    if (!staffKey) {
      return json({ error: 'Thiếu StaffKey' }, 400);
    }
    const payload: WebPushPayload = {
      title: String(body?.title || 'CHD Management'),
      body: String(body?.body || 'Bạn có thông báo mới'),
      url: String(body?.url || '/?view=home'),
      notificationKey: String(body?.notificationKey || ''),
    };
    const result = await sendToStaff(env.PUSH_KV, env, staffKey, payload, { retries: 2 });
    return json(result);
  }

  if (action === 'test' && method === 'POST') {
    const body = await request.json().catch(() => ({}));
    const staffKey = String(body?.StaffKey || '').trim();
    if (!staffKey) {
      return json({ error: 'Thiếu StaffKey' }, 400);
    }
    const payload: WebPushPayload = {
      title: 'CHD Management — thử push',
      body: 'Nếu bạn thấy thông báo này, push điện thoại đang hoạt động.',
      url: '/?view=home',
      notificationKey: `push_manual_test_${Date.now()}`,
    };
    const result = await sendToStaff(env.PUSH_KV, env, staffKey, payload, { retries: 2 });
    return json(result);
  }

  return json({ error: 'Không tìm thấy endpoint push.' }, 404);
}
