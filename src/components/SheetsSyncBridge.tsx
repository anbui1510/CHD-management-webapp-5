import React, { useEffect } from 'react';
import GlobalSheetsSyncAlert from './GlobalSheetsSyncAlert';
import PendingSheetsSyncFailuresModal from './PendingSheetsSyncFailuresModal';
import { useSheetsSyncFeedback } from '../context/SheetsSyncFeedbackContext';

export function SheetsSyncBridge({
  reportRef,
  loadWhenReady
}: {
  reportRef: React.MutableRefObject<(data: unknown, options?: { baseMessage?: string }) => void>;
  loadWhenReady: boolean;
}) {
  const {
    reportMutationResponse,
    globalOverlay,
    dismissGlobalOverlay,
    pendingFailures,
    acknowledgeAllFailures,
    loadPendingFailures
  } = useSheetsSyncFeedback();

  useEffect(() => {
    reportRef.current = reportMutationResponse;
  }, [reportMutationResponse, reportRef]);

  useEffect(() => {
    if (!loadWhenReady) return;
    void loadPendingFailures();
  }, [loadPendingFailures, loadWhenReady]);

  return (
    <>
      {globalOverlay && (
        <GlobalSheetsSyncAlert
          title={globalOverlay.title}
          message={globalOverlay.message}
          onDismiss={dismissGlobalOverlay}
        />
      )}
      <PendingSheetsSyncFailuresModal
        failures={pendingFailures}
        onAcknowledgeAll={() => {
          void acknowledgeAllFailures();
        }}
      />
    </>
  );
}
