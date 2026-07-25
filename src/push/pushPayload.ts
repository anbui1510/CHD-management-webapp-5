import type { Notification } from '../types';

export interface WebPushPayload {
  title: string;
  body: string;
  url: string;
  notificationKey: string;
}

export function resolveNotificationDeepLink(
  notification: Pick<Notification, 'RelatedEntityType' | 'Severity'>
): string {
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
