import { useCallback, useRef } from 'react';
import {
  applyMedicalDataBundle,
  AuthRequiredError,
  fetchMedicalDataBundle,
  type MedicalDataSetters,
  type RefreshScope
} from '../api/medicalDataRefresh';

const REFRESH_COOLDOWN_MS = 2500;
const SYNC_TIMEOUT_MS = 20000;

export type MedicalDataLoadPhase = 'idle' | 'loading' | 'syncing' | 'ready' | 'error';

export type MedicalDataLoadState = {
  phase: MedicalDataLoadPhase;
  startedAt: number | null;
  message?: string;
};

export type RefreshMedicalDataOptions = {
  /** Không đổi banner loading/syncing khi app đã sẵn sàng (dùng cho polling nền). */
  silent?: boolean;
};

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms);
    promise
      .then(value => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch(err => {
        clearTimeout(timer);
        reject(err);
      });
  });
}

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

  const refreshMedicalData = useCallback(async (
    scope: RefreshScope = 'clinical',
    force = false,
    options?: RefreshMedicalDataOptions
  ) => {
    const meta = metaRef.current;
    const now = Date.now();
    const silent = options?.silent ?? false;

    if (meta.pending) return meta.pending;
    if (!force && now - meta.lastAt < REFRESH_COOLDOWN_MS) return;

    const shouldShowBanner = !silent && !meta.syncPending;
    if (shouldShowBanner && (meta.phase === 'idle' || meta.phase === 'error')) {
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
        if (shouldShowBanner && !meta.syncPending) {
          emitState({ phase: 'ready', startedAt: null });
        }
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
        if (shouldShowBanner && !meta.syncPending) {
          emitState({
            phase: 'error',
            startedAt: null,
            message: err instanceof Error ? err.message : String(err)
          });
        }
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

    const startedAt = Date.now();
    emitState({
      phase: 'syncing',
      startedAt,
      message: 'Đang đồng bộ dữ liệu mới nhất từ Google Sheets...'
    });

    meta.syncPending = withTimeout(
      fetchMedicalDataBundle(true),
      SYNC_TIMEOUT_MS,
      'Không đồng bộ được Google Sheets sau 20 giây. Kiểm tra mạng hoặc cấu hình Apps Script rồi bấm Đồng bộ lại.'
    )
      .then(bundle => {
        applyMedicalDataBundle(bundle, scope, setters, { allowEmpty: true });
        meta.lastAt = Date.now();
        emitState({ phase: 'ready', startedAt: null });
      })
      .catch(err => {
        console.warn('Background medical data sync failed:', err);
        emitState({
          phase: 'error',
          startedAt: null,
          message: err instanceof Error ? err.message : 'Không đồng bộ được Google Sheets.'
        });
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
