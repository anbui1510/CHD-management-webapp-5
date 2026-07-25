import webpush from 'web-push';
import path from 'path';
import type { Notification } from './src/types';

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

export interface WebPushPayload {
  title: string;
  body: string;
  url: string;
  notificationKey: string;
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

export function resolveNotificationDeepLink(notification: Pick<Notification, 'RelatedEntityType' | 'Severity'>): string {
  const entityType = String(notification.RelatedEntityType || '').trim().toLowerCase();
  if (entityType === 'consult') return '/?view=schedule-tt';
  if (entityType === 'patient') return '/?view=patients';
  if (entityType === 'cathlab') return '/?view=cathlab-room';
  return '/?view=home';
}

export function buildWebPushPayload(notification: Notification): WebPushPayload {
  return {
    title: notification.Title || 'CHD Management',
    body: notification.Message || 'Bạn có thông báo mới',
    url: resolveNotificationDeepLink(notification),
    notificationKey: notification.NotificationKey,
  };
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
): PushSubscriptionRecord | null {
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
    return subscriptions[existingIndex];
  }

  const record: PushSubscriptionRecord = {
    PushSubKey: db.createUniqueKey('pushsub', subscriptions.map(item => item.PushSubKey)),
    ...normalized,
    CreatedTime: now,
    UpdatedTime: now,
  };
  subscriptions.push(record);
  db.writeDB(subscriptionsFile, subscriptions);
  return record;
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

export async function sendWebPushToStaff(
  db: ReadWriteDb,
  subscriptionsFile: string,
  staffKey: string,
  payload: WebPushPayload
): Promise<{ sent: number; removed: number; skipped: boolean }> {
  if (!isWebPushConfigured()) {
    return { sent: 0, removed: 0, skipped: true };
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

  return { sent, removed, skipped: false };
}

export function getPushSubscriptionsFile(dbDir: string): string {
  return path.join(dbDir, 'push-subscriptions.json');
}
