import { useCallback, useEffect, useState } from 'react';
import {
  clearPushPromptDismiss,
  dismissPushPrompt,
  fetchPushStatus,
  formatPushDeliverIssue,
  isPushSupported,
  repairPushRegistration,
  reregisterPushDevice,
  sendTestPush,
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
  const [serverSubscribed, setServerSubscribed] = useState(false);
  const [browserSubscribed, setBrowserSubscribed] = useState(false);
  const [needsReregister, setNeedsReregister] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [warning, setWarning] = useState('');
  const [showPrompt, setShowPrompt] = useState(false);

  const refreshStatus = useCallback(async () => {
    if (!staffKey) {
      setConfigured(false);
      setSubscribed(false);
      setServerSubscribed(false);
      setBrowserSubscribed(false);
      setNeedsReregister(false);
      return;
    }
    const status = await fetchPushStatus(staffKey);
    setConfigured(status.configured);
    setSubscribed(status.subscribed);
    setServerSubscribed(status.serverSubscribed);
    setBrowserSubscribed(status.browserSubscribed);
    setNeedsReregister(status.needsReregister);
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

  useEffect(() => {
    if (!staffKey || permission !== 'granted' || !needsReregister || loading) return;
    void repairPushRegistration(staffKey)
      .then(result => {
        if (result.subscription) {
          if (result.testPushWarning) {
            setWarning(result.testPushWarning);
          }
          void refreshStatus();
        }
      })
      .catch(() => undefined);
  }, [staffKey, permission, needsReregister, loading, refreshStatus]);

  const applySubscribeResult = useCallback(async (result: Awaited<ReturnType<typeof subscribeToWebPush>>) => {
    if (!result.subscription) {
      setPermission(typeof Notification !== 'undefined' ? Notification.permission : 'denied');
      if (Notification.permission === 'denied') {
        setError('Trình duyệt đã chặn thông báo. Hãy bật lại trong Cài đặt.');
      }
      return false;
    }
    setPermission('granted');
    await refreshStatus();
    if (result.testPushWarning) {
      setWarning(result.testPushWarning);
    }
    setShowPrompt(false);
    return true;
  }, [refreshStatus]);

  const enablePush = useCallback(async () => {
    if (!staffKey) return false;
    setLoading(true);
    setError('');
    setWarning('');
    try {
      const result = await subscribeToWebPush(staffKey);
      return applySubscribeResult(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không thể bật thông báo điện thoại');
      return false;
    } finally {
      setLoading(false);
    }
  }, [staffKey, applySubscribeResult]);

  const reregisterPush = useCallback(async () => {
    if (!staffKey) return false;
    setLoading(true);
    setError('');
    setWarning('');
    try {
      const result = await reregisterPushDevice(staffKey);
      return applySubscribeResult(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không thể đăng ký lại thiết bị nhận thông báo');
      return false;
    } finally {
      setLoading(false);
    }
  }, [staffKey, applySubscribeResult]);

  const disablePush = useCallback(async () => {
    if (!staffKey) return;
    setLoading(true);
    setError('');
    setWarning('');
    try {
      await unsubscribeFromWebPush(staffKey);
      await refreshStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không thể tắt thông báo');
    } finally {
      setLoading(false);
    }
  }, [staffKey, refreshStatus]);

  const testPush = useCallback(async () => {
    if (!staffKey) return false;
    setLoading(true);
    setError('');
    setWarning('');
    try {
      const result = await sendTestPush(staffKey);
      const issue = formatPushDeliverIssue(result);
      if (issue) {
        setError(issue);
        if (result.needsResubscribe) {
          setSubscribed(false);
          setNeedsReregister(true);
        }
        return false;
      }
      setError('');
      setWarning('');
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không gửi được push thử');
      return false;
    } finally {
      setLoading(false);
    }
  }, [staffKey]);

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
    serverSubscribed,
    browserSubscribed,
    needsReregister,
    permission,
    loading,
    error,
    warning,
    showPrompt,
    enablePush,
    reregisterPush,
    disablePush,
    testPush,
    dismissPrompt,
    resetDismiss,
    refreshStatus,
  };
}
