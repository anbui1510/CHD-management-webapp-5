import { useCallback, useEffect, useState } from 'react';
import type { SheetsSyncStatus } from '../utils/sheetsSyncFeedback';

export function useSheetsSyncStatus(enabled: boolean) {
  const [status, setStatus] = useState<SheetsSyncStatus | null>(null);

  const refreshStatus = useCallback(async () => {
    if (!enabled) {
      setStatus(null);
      return;
    }
    try {
      const res = await fetch('/api/sync/status');
      if (!res.ok) return;
      const data = await res.json();
      setStatus(data as SheetsSyncStatus);
    } catch {
      // ignore polling errors
    }
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    void refreshStatus();
    const interval = setInterval(() => { void refreshStatus(); }, 30000);
    return () => clearInterval(interval);
  }, [enabled, refreshStatus]);

  return { status, refreshStatus };
}
