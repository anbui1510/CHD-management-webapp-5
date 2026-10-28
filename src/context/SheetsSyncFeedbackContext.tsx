import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { SheetsSyncContext, SheetsSyncFailure } from '../types';
import type { AppModule } from '../auth/permissions';
import {
  buildMutationFeedback,
  buildSyncContext,
  parseMutationResponse,
  withSyncContext
} from '../utils/sheetsSyncMutation';

export const CHD_SHEETS_PUSH_RESULT_EVENT = 'chd-sheets-push-result';

type SheetsSyncFeedbackContextValue = {
  globalOverlay: { title: string; message: string } | null;
  dismissGlobalOverlay: () => void;
  reportMutationResponse: (data: unknown, options?: { baseMessage?: string }) => void;
  buildSyncContext: (
    viewModule: AppModule | string,
    options?: {
      patientName?: string;
      patientKey?: string;
      patientID?: string;
      viewLabel?: string;
    }
  ) => SheetsSyncContext;
  withSyncContext: typeof withSyncContext;
  mutateJson: <T>(
    url: string,
    init: RequestInit | undefined,
    syncContext: SheetsSyncContext,
    options?: { baseMessage?: string }
  ) => Promise<T>;
  pendingFailures: SheetsSyncFailure[];
  setPendingFailures: React.Dispatch<React.SetStateAction<SheetsSyncFailure[]>>;
  loadPendingFailures: () => Promise<SheetsSyncFailure[]>;
  acknowledgeFailure: (failureKey: string) => Promise<void>;
  acknowledgeAllFailures: () => Promise<void>;
};

const SheetsSyncFeedbackContext = createContext<SheetsSyncFeedbackContextValue | null>(null);

export function SheetsSyncFeedbackProvider({
  children,
  onSuccessBanner,
  onRefreshNotifications,
  onRefreshSheetsStatus
}: {
  children: React.ReactNode;
  onSuccessBanner: (message: string, isWarning?: boolean) => void;
  onRefreshNotifications: () => void;
  onRefreshSheetsStatus: () => void;
}) {
  const [globalOverlay, setGlobalOverlay] = useState<{ title: string; message: string } | null>(null);
  const [pendingFailures, setPendingFailures] = useState<SheetsSyncFailure[]>([]);

  const loadPendingFailures = useCallback(async () => {
    try {
      const response = await fetch('/api/sheets-sync/failures', { credentials: 'include' });
      if (!response.ok) return [];
      const data = (await response.json()) as SheetsSyncFailure[];
      setPendingFailures(data);
      return data;
    } catch (err) {
      console.error('Failed to load sheets sync failures:', err);
      return [];
    }
  }, []);

  const reportMutationResponse = useCallback(
    (data: unknown, options?: { baseMessage?: string }) => {
      const feedback = buildMutationFeedback(data, options?.baseMessage);
      void onRefreshSheetsStatus();

      if (feedback.bannerMessage) {
        onSuccessBanner(feedback.bannerMessage, feedback.isWarning);
      }

      if (feedback.showOverlay && feedback.overlayTitle) {
        setGlobalOverlay({
          title: feedback.overlayTitle,
          message: feedback.overlayMessage
        });
      }

      if (feedback.kind === 'failure' || feedback.kind === 'pending') {
        void loadPendingFailures();
        void onRefreshNotifications();
      }
    },
    [loadPendingFailures, onRefreshNotifications, onRefreshSheetsStatus, onSuccessBanner]
  );

  useEffect(() => {
    const onPushResult = (event: Event) => {
      const detail = (event as CustomEvent<{ data?: unknown; baseMessage?: string }>).detail;
      if (!detail?.data) return;
      reportMutationResponse(detail.data, { baseMessage: detail.baseMessage });
    };
    window.addEventListener(CHD_SHEETS_PUSH_RESULT_EVENT, onPushResult);
    return () => window.removeEventListener(CHD_SHEETS_PUSH_RESULT_EVENT, onPushResult);
  }, [reportMutationResponse]);

  const acknowledgeFailure = useCallback(async (failureKey: string) => {
    await fetch(`/api/sheets-sync/failures/${encodeURIComponent(failureKey)}/acknowledge`, {
      method: 'PUT',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' }
    }).catch(err => console.error(err));
    setPendingFailures(prev => prev.filter(item => item.FailureKey !== failureKey));
  }, []);

  const acknowledgeAllFailures = useCallback(async () => {
    await fetch('/api/sheets-sync/failures/acknowledge-all', {
      method: 'PUT',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' }
    }).catch(err => console.error(err));
    setPendingFailures([]);
  }, []);

  const mutateJson = useCallback(
    async <T,>(
      url: string,
      init: RequestInit | undefined,
      syncContext: SheetsSyncContext,
      options?: { baseMessage?: string }
    ): Promise<T> => {
      const rawBody = init?.body;
      let nextInit = init || {};
      if (rawBody && typeof rawBody === 'string') {
        try {
          const parsed = JSON.parse(rawBody) as Record<string, unknown>;
          nextInit = {
            ...nextInit,
            headers: { 'Content-Type': 'application/json', ...(nextInit.headers || {}) },
            body: JSON.stringify(withSyncContext(parsed, syncContext))
          };
        } catch {
          // keep original body
        }
      } else if (rawBody && typeof rawBody === 'object' && !(rawBody instanceof FormData)) {
        nextInit = {
          ...nextInit,
          headers: { 'Content-Type': 'application/json', ...(nextInit.headers || {}) },
          body: JSON.stringify(withSyncContext(rawBody as unknown as Record<string, unknown>, syncContext))
        };
      }

      const response = await fetch(url, nextInit);
      const data = await parseMutationResponse<T>(response);
      reportMutationResponse(data, options);
      return data;
    },
    [reportMutationResponse]
  );

  const value = useMemo(
    () => ({
      globalOverlay,
      dismissGlobalOverlay: () => setGlobalOverlay(null),
      reportMutationResponse,
      buildSyncContext,
      withSyncContext,
      mutateJson,
      pendingFailures,
      setPendingFailures,
      loadPendingFailures,
      acknowledgeFailure,
      acknowledgeAllFailures
    }),
    [
      acknowledgeAllFailures,
      acknowledgeFailure,
      globalOverlay,
      loadPendingFailures,
      mutateJson,
      pendingFailures,
      reportMutationResponse
    ]
  );

  return (
    <SheetsSyncFeedbackContext.Provider value={value}>
      {children}
    </SheetsSyncFeedbackContext.Provider>
  );
}

export function useSheetsSyncFeedback(): SheetsSyncFeedbackContextValue {
  const ctx = useContext(SheetsSyncFeedbackContext);
  if (!ctx) {
    throw new Error('useSheetsSyncFeedback must be used within SheetsSyncFeedbackProvider');
  }
  return ctx;
}

export function useOptionalSheetsSyncFeedback(): SheetsSyncFeedbackContextValue | null {
  return useContext(SheetsSyncFeedbackContext);
}
