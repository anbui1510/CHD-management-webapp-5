import { useCallback, useEffect, useState } from 'react';
import { getClientSheetsSyncStatus } from '../api/appsScriptFetch';
import type { SheetsSyncStatus } from '../utils/sheetsSyncFeedback';

export function useSheetsSyncStatus(enabled: boolean) {
  const [status, setStatus] = useState<SheetsSyncStatus | null>(null);

  const applyStatus = useCallback((next: SheetsSyncStatus | null | undefined) => {
    if (!next) return;
    setStatus(next);
  }, []);

  const refreshStatus = useCallback(async () => {
    if (!enabled) {
      setStatus(null);
      return;
    }
    try {
      const res = await fetch('/api/sync/status');
      if (res.ok) {
        const data = await res.json() as SheetsSyncStatus;
        setStatus(data);
        return;
      }
    } catch {
      // fall through to client status
    }
    try {
      setStatus(getClientSheetsSyncStatus());
    } catch {
      // ignore
    }
  }, [enabled]);

  const reportPullResult = useCallback((syncStatus?: SheetsSyncStatus | null) => {
    if (syncStatus) {
      setStatus(syncStatus);
      return;
    }
    try {
      setStatus(getClientSheetsSyncStatus());
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    if (!enabled) {
      setStatus(null);
      return;
    }
    void refreshStatus();
    const interval = setInterval(() => { void refreshStatus(); }, 30000);
    return () => clearInterval(interval);
  }, [enabled, refreshStatus]);

  return { status, refreshStatus, reportPullResult, applyStatus };
}
