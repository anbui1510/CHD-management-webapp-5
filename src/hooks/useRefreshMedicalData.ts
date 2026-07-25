import { useCallback, useRef } from 'react';
import {
  applyMedicalDataBundle,
  AuthRequiredError,
  fetchMedicalDataBundle,
  type MedicalDataSetters,
  type RefreshScope
} from '../api/medicalDataRefresh';

const REFRESH_COOLDOWN_MS = 2500;

export type MedicalDataLoadPhase = 'idle' | 'loading' | 'syncing' | 'ready' | 'error';

export type MedicalDataLoadState = {
  phase: MedicalDataLoadPhase;
  startedAt: number | null;
  message?: string;
};

export function useRefreshMedicalData(
  setters: MedicalDataSetters,
  onLoadStateChange?: (state: MedicalDataLoadState) => void
) {
  const metaRef = useRef({
    pending: null as Promise<void> | null,
    syncPending: null as Promise<void> | null,
    lastAt: 0,
    phase: 'idle' as MedicalDataLoadPhase,
    startedAt: null as number | null
  });

  const emitState = useCallback((patch: Partial<MedicalDataLoadState>) => {
    const meta = metaRef.current;
    if (patch.phase !== undefined) meta.phase = patch.phase;
    if (patch.startedAt !== undefined) meta.startedAt = patch.startedAt;
    onLoadStateChange?.({
      phase: meta.phase,
      startedAt: meta.startedAt,
      message: patch.message
    });
  }, [onLoadStateChange]);

  const refreshMedicalData = useCallback(async (scope: RefreshScope = 'clinical', force = false) => {
    const meta = metaRef.current;
    const now = Date.now();
    if (meta.pending) return meta.pending;
    if (!force && now - meta.lastAt < REFRESH_COOLDOWN_MS) return;

    if (meta.phase === 'idle' || meta.phase === 'ready' || meta.phase === 'error') {
      emitState({
        phase: 'loading',
        startedAt: now,
        message: 'Đang tải dữ liệu...'
      });
    }

    meta.pending = fetchMedicalDataBundle(force)
      .then(bundle => {
        applyMedicalDataBundle(bundle, scope, setters);
        meta.lastAt = Date.now();
        const hasClinical = bundle.patients.length > 0 || bundle.consults.length > 0;
        emitState({
          phase: hasClinical ? 'ready' : 'syncing',
          startedAt: hasClinical ? null : now,
          message: hasClinical ? undefined : 'Đang đồng bộ dữ liệu từ Google Sheets...'
        });
      })
      .catch(err => {
        if (err instanceof AuthRequiredError) {
          emitState({
            phase: 'error',
            startedAt: null,
            message: err.message
          });
          throw err;
        }
        emitState({
          phase: 'error',
          startedAt: null,
          message: err instanceof Error ? err.message : String(err)
        });
        throw err;
      })
      .finally(() => {
        meta.pending = null;
      });

    return meta.pending;
  }, [setters, emitState]);

  const syncMedicalDataInBackground = useCallback((scope: RefreshScope = 'full') => {
    const meta = metaRef.current;
    if (meta.syncPending) return meta.syncPending;

    emitState({
      phase: 'syncing',
      startedAt: Date.now(),
      message: 'Đang đồng bộ dữ liệu mới nhất từ Google Sheets...'
    });

    meta.syncPending = fetchMedicalDataBundle(true)
      .then(bundle => {
        applyMedicalDataBundle(bundle, scope, setters);
        meta.lastAt = Date.now();
        emitState({ phase: 'ready', startedAt: null });
      })
      .catch(err => {
        console.warn('Background medical data sync failed:', err);
        emitState({ phase: 'ready', startedAt: null });
      })
      .finally(() => {
        meta.syncPending = null;
      });

    return meta.syncPending;
  }, [setters, emitState]);

  const loadMedicalDataAfterAuth = useCallback(async (scope: RefreshScope = 'full') => {
    try {
      await refreshMedicalData(scope, false);
    } catch (err) {
      if (err instanceof AuthRequiredError) throw err;
    }
    void syncMedicalDataInBackground(scope);
  }, [refreshMedicalData, syncMedicalDataInBackground]);

  return { refreshMedicalData, syncMedicalDataInBackground, loadMedicalDataAfterAuth };
}
