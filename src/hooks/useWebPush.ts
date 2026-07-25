import { useCallback, useEffect, useState } from 'react';
import {
  clearPushPromptDismiss,
  dismissPushPrompt,
  fetchPushStatus,
  isPushSupported,
  subscribeToWebPush,
  syncExistingPushSubscription,
  unsubscribeFromWebPush,
  wasPushPromptDismissed,
} from '../push/webPushClient';

export function useWebPush(staffKey?: string) {
  const [permission, setPermission] = useState<NotificationPermission>(() =>
    typeof Notification !== 'undefined' ? Notification.permission : 'denied'
  );
  const [configured, setConfigured] = useState(false);
  const [subscribed, setSubscribed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showPrompt, setShowPrompt] = useState(false);

  const refreshStatus = useCallback(async () => {
    if (!staffKey) {
      setConfigured(false);
      setSubscribed(false);
      return;
    }
    const status = await fetchPushStatus(staffKey);
    setConfigured(status.configured);
    setSubscribed(status.subscribed);
    setPermission(status.permission);
  }, [staffKey]);

  useEffect(() => {
    void refreshStatus();
  }, [refreshStatus]);

  useEffect(() => {
    if (!staffKey || !isPushSupported()) {
      setShowPrompt(false);
      return;
    }
    if (wasPushPromptDismissed()) {
      setShowPrompt(false);
      return;
    }
    if (permission === 'granted' && subscribed) {
      setShowPrompt(false);
      return;
    }
    if (permission === 'denied') {
      setShowPrompt(false);
      return;
    }
    setShowPrompt(true);
  }, [staffKey, permission, subscribed]);

  useEffect(() => {
    if (!staffKey || permission !== 'granted') return;
    void syncExistingPushSubscription(staffKey)
      .then(ok => {
        if (ok) void refreshStatus();
      })
      .catch(() => undefined);
  }, [staffKey, permission, refreshStatus]);

  const enablePush = useCallback(async () => {
    if (!staffKey) return false;
    setLoading(true);
    setError('');
    try {
      const subscription = await subscribeToWebPush(staffKey);
      if (!subscription) {
        setPermission(typeof Notification !== 'undefined' ? Notification.permission : 'denied');
        if (Notification.permission === 'denied') {
          setError('Trình duyệt đã chặn thông báo. Hãy bật lại trong Cài đặt.');
        }
        return false;
      }
      setPermission('granted');
      await refreshStatus();
      setShowPrompt(false);
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không thể bật thông báo điện thoại');
      return false;
    } finally {
      setLoading(false);
    }
  }, [staffKey, refreshStatus]);

  const disablePush = useCallback(async () => {
    if (!staffKey) return;
    setLoading(true);
    setError('');
    try {
      await unsubscribeFromWebPush(staffKey);
      await refreshStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không thể tắt thông báo');
    } finally {
      setLoading(false);
    }
  }, [staffKey, refreshStatus]);

  const dismissPrompt = useCallback(() => {
    dismissPushPrompt();
    setShowPrompt(false);
  }, []);

  const resetDismiss = useCallback(() => {
    clearPushPromptDismiss();
    if (!staffKey || !isPushSupported()) return;
    if (permission === 'granted' && subscribed) return;
    if (permission === 'denied') return;
    setShowPrompt(true);
  }, [staffKey, permission, subscribed]);

  return {
    supported: isPushSupported(),
    configured,
    subscribed,
    permission,
    loading,
    error,
    showPrompt,
    enablePush,
    disablePush,
    dismissPrompt,
    resetDismiss,
    refreshStatus,
  };
}
