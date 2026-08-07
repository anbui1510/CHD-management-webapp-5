import webpush from 'web-push';
import path from 'path';
import type { Notification } from './src/types';
import { buildWebPushPayload, type WebPushPayload } from './src/push/pushPayload';

export type { WebPushPayload };
export { buildWebPushPayload, resolveNotificationDeepLink } from './src/push/pushPayload';

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

type ReadWriteDb = {
  readDB: <T>(file: string, defaults: T) => T;
  writeDB: (file: string, data: unknown) => void;
  createUniqueKey: (prefix: string, existingKeys: string[]) => string;
  newTimestamp: () => string;
};

let vapidConfigured = false;

export function initWebPushFromEnv(): boolean {
  const publicKey = String(process.env.VAPID_PUBLIC_KEY || '').trim();
  const privateKey = String(process.env.VAPID_PRIVATE_KEY || '').trim();
  const subject = String(process.env.VAPID_SUBJECT || 'mailto:chd-admin@hospital.local').trim();

  if (!publicKey || !privateKey) {
    console.warn('[web-push] VAPID keys missing — OS push notifications disabled. Run: npm run generate:vapid');
    vapidConfigured = false;
    return false;
  }

  webpush.setVapidDetails(subject, publicKey, privateKey);
  vapidConfigured = true;
  return true;
}

export function getVapidPublicKey(): string {
  return String(process.env.VAPID_PUBLIC_KEY || '').trim();
}

export function isWebPushConfigured(): boolean {
  return vapidConfigured && !!getVapidPublicKey();
}

function normalizeSubscriptionInput(body: any): Omit<PushSubscriptionRecord, 'PushSubKey' | 'CreatedTime' | 'UpdatedTime'> | null {
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

export function upsertPushSubscription(
  db: ReadWriteDb,
  subscriptionsFile: string,
  staffKey: string,
  body: any
): { record: PushSubscriptionRecord; isNew: boolean } | null {
  const normalized = normalizeSubscriptionInput({ ...body, StaffKey: staffKey });
  if (!normalized) return null;

  const subscriptions = db.readDB<PushSubscriptionRecord[]>(subscriptionsFile, []);
  const now = db.newTimestamp();
  const existingIndex = subscriptions.findIndex(item => item.endpoint === normalized.endpoint);

  if (existingIndex >= 0) {
    subscriptions[existingIndex] = {
      ...subscriptions[existingIndex],
      ...normalized,
      UpdatedTime: now,
    };
    db.writeDB(subscriptionsFile, subscriptions);
    return { record: subscriptions[existingIndex], isNew: false };
  }

  const record: PushSubscriptionRecord = {
    PushSubKey: db.createUniqueKey('pushsub', subscriptions.map(item => item.PushSubKey)),
    ...normalized,
    CreatedTime: now,
    UpdatedTime: now,
  };
  subscriptions.push(record);
  db.writeDB(subscriptionsFile, subscriptions);
  return { record, isNew: true };
}

export function removePushSubscription(
  db: ReadWriteDb,
  subscriptionsFile: string,
  staffKey: string,
  endpoint: string
): boolean {
  const subscriptions = db.readDB<PushSubscriptionRecord[]>(subscriptionsFile, []);
  const next = subscriptions.filter(item => !(item.endpoint === endpoint && item.StaffKey === staffKey));
  if (next.length === subscriptions.length) return false;
  db.writeDB(subscriptionsFile, next);
  return true;
}

const PUSH_DELIVERY_LOG_MAX = 2000;

type PushDeliveryLogEntry = {
  notificationKey: string;
  deliveredAt: string;
};

export function getPushDeliveryLogFile(dbDir: string): string {
  return path.join(dbDir, 'push-delivery-log.json');
}

function readPushDeliveryLog(db: ReadWriteDb, deliveryLogFile: string): PushDeliveryLogEntry[] {
  return db.readDB<PushDeliveryLogEntry[]>(deliveryLogFile, []);
}

export function hasServerPushBeenDelivered(
  db: ReadWriteDb,
  deliveryLogFile: string,
  notificationKey: string
): boolean {
  const key = String(notificationKey || '').trim();
  if (!key) return false;
  return readPushDeliveryLog(db, deliveryLogFile).some(item => item.notificationKey === key);
}

export function markServerPushDelivered(
  db: ReadWriteDb,
  deliveryLogFile: string,
  notificationKey: string
): void {
  const key = String(notificationKey || '').trim();
  if (!key || hasServerPushBeenDelivered(db, deliveryLogFile, key)) return;
  const log = readPushDeliveryLog(db, deliveryLogFile);
  log.push({ notificationKey: key, deliveredAt: db.newTimestamp() });
  db.writeDB(deliveryLogFile, log.slice(-PUSH_DELIVERY_LOG_MAX));
}

export async function sendWebPushToStaff(
  db: ReadWriteDb,
  subscriptionsFile: string,
  staffKey: string,
  payload: WebPushPayload,
  options?: { deliveryLogFile?: string }
): Promise<{ sent: number; removed: number; skipped: boolean; alreadyDelivered?: boolean }> {
  if (!isWebPushConfigured()) {
    return { sent: 0, removed: 0, skipped: true };
  }

  const notificationKey = String(payload.notificationKey || '').trim();
  const deliveryLogFile = options?.deliveryLogFile;
  if (notificationKey && deliveryLogFile && hasServerPushBeenDelivered(db, deliveryLogFile, notificationKey)) {
    return { sent: 0, removed: 0, skipped: true, alreadyDelivered: true };
  }

  const subscriptions = db.readDB<PushSubscriptionRecord[]>(subscriptionsFile, [])
    .filter(item => String(item.StaffKey) === String(staffKey));

  if (subscriptions.length === 0) {
    return { sent: 0, removed: 0, skipped: false };
  }

  let sent = 0;
  let removed = 0;
  const staleEndpoints: string[] = [];
  const body = JSON.stringify(payload);

  for (const subscription of subscriptions) {
    try {
      await webpush.sendNotification(
        {
          endpoint: subscription.endpoint,
          keys: {
            p256dh: subscription.p256dh,
            auth: subscription.auth,
          },
        },
        body
      );
      sent += 1;
    } catch (error: any) {
      const statusCode = error?.statusCode || error?.status;
      if (statusCode === 404 || statusCode === 410) {
        staleEndpoints.push(subscription.endpoint);
      } else {
        console.warn('[web-push] Failed to deliver push:', statusCode || error?.message || error);
      }
    }
  }

  if (staleEndpoints.length > 0) {
    const next = db.readDB<PushSubscriptionRecord[]>(subscriptionsFile, [])
      .filter(item => !staleEndpoints.includes(item.endpoint));
    db.writeDB(subscriptionsFile, next);
    removed = staleEndpoints.length;
  }

  if (sent > 0 && notificationKey && deliveryLogFile) {
    markServerPushDelivered(db, deliveryLogFile, notificationKey);
  }

  return { sent, removed, skipped: false };
}

export function getPushSubscriptionsFile(dbDir: string): string {
  return path.join(dbDir, 'push-subscriptions.json');
}
