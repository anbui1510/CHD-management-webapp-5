import { useEffect, useRef } from 'react';
import type { Notification } from '../types';
import { buildWebPushPayload } from '../push/pushPayload';
import {
  getOsPushDeliveredKeys,
  hasOsPushBeenDelivered,
  markOsPushDelivered,
} from '../utils/notificationPushDelivery';

/** Show a local OS banner when new in-app alerts arrive while the PWA is open (iOS foreground). */
export function useForegroundPushAlerts(
  notifications: Notification[],
  staffKey?: string,
  enabled = true,
  dataReady = false
) {
  const prevUnreadKeysRef = useRef<Set<string>>(new Set());
  const hydratedRef = useRef(false);
  const staffKeyRef = useRef<string | undefined>();

  useEffect(() => {
    if (!enabled || !staffKey || typeof Notification === 'undefined') return;
    if (Notification.permission !== 'granted') return;
    if (!dataReady) return;

    if (staffKeyRef.current !== staffKey) {
      staffKeyRef.current = staffKey;
      hydratedRef.current = false;
      prevUnreadKeysRef.current = new Set();
    }

    const deliveredKeys = getOsPushDeliveredKeys();
    const unreadForStaff = notifications.filter(
      item => String(item.StaffKey) === String(staffKey) && !item.IsRead
    );
    const currentKeys = new Set(unreadForStaff.map(item => item.NotificationKey));

    if (!hydratedRef.current) {
      hydratedRef.current = true;
      for (const key of currentKeys) {
        markOsPushDelivered(key);
      }
      prevUnreadKeysRef.current = new Set([...currentKeys, ...deliveredKeys]);
      return;
    }

    const newItems = unreadForStaff.filter(
      item =>
        !prevUnreadKeysRef.current.has(item.NotificationKey) &&
        !hasOsPushBeenDelivered(item.NotificationKey)
    );
    prevUnreadKeysRef.current = new Set([...currentKeys, ...deliveredKeys]);

    if (newItems.length === 0 || document.visibilityState !== 'visible') return;

    for (const item of newItems.slice(0, 3)) {
      try {
        const payload = buildWebPushPayload(item);
        new Notification(payload.title, {
          body: payload.body,
          icon: '/icons/icon.svg',
          tag: payload.notificationKey || item.NotificationKey,
        });
        markOsPushDelivered(item.NotificationKey);
      } catch {
        // ignore Notification API failures
      }
    }
  }, [enabled, notifications, staffKey, dataReady]);
}
