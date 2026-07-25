import { useEffect, useRef } from 'react';
import type { Notification } from '../types';
import { buildWebPushPayload } from '../push/pushPayload';

/** Show a local OS banner when new in-app alerts arrive while the PWA is open (iOS foreground). */
export function useForegroundPushAlerts(
  notifications: Notification[],
  staffKey?: string,
  enabled = true
) {
  const prevUnreadKeysRef = useRef<Set<string>>(new Set());
  const initializedRef = useRef(false);

  useEffect(() => {
    if (!enabled || !staffKey || typeof Notification === 'undefined') return;
    if (Notification.permission !== 'granted') return;

    const unreadForStaff = notifications.filter(
      item => String(item.StaffKey) === String(staffKey) && !item.IsRead
    );
    const currentKeys = new Set(unreadForStaff.map(item => item.NotificationKey));

    if (!initializedRef.current) {
      prevUnreadKeysRef.current = currentKeys;
      initializedRef.current = true;
      return;
    }

    const newItems = unreadForStaff.filter(item => !prevUnreadKeysRef.current.has(item.NotificationKey));
    prevUnreadKeysRef.current = currentKeys;

    if (newItems.length === 0 || document.visibilityState !== 'visible') return;

    for (const item of newItems.slice(0, 3)) {
      try {
        const payload = buildWebPushPayload(item);
        new Notification(payload.title, {
          body: payload.body,
          icon: '/icons/icon.svg',
          tag: payload.notificationKey || item.NotificationKey,
        });
      } catch {
        // ignore Notification API failures
      }
    }
  }, [enabled, notifications, staffKey]);
}
