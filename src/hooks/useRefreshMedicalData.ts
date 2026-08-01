import { useCallback, useRef } from 'react';
import {
  applyMedicalDataBundle,
  AuthRequiredError,
  fetchMedicalDataBundle,
  peekCachedMedicalDataBundle,
  type MedicalDataSetters,
  type RefreshScope
} from '../api/medicalDataRefresh';
import type { SheetsSyncStatus } from '../utils/sheetsSyncFeedback';

const REFRESH_COOLDOWN_MS = 2500;
/** Ignore bridge force-apply storms right after an intentional force sync. */
const FORCE_SYNC_SETTLE_MS = 5000;

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

export type ForceSyncOptions = {
  /** Prefer "Đang đồng bộ…" even when UI already has cached rows. */
  preferSyncingBanner?: boolean;
  onSyncStatus?: (status: SheetsSyncStatus | undefined) => void;
};

export function useRefreshMedicalData(
  setters: MedicalDataSetters,
  onLoadStateChange?: (state: MedicalDataLoadState) => void
) {
  const metaRef = useRef({
    pending: null as Promise<void> | null,
    forcePending: null as Promise<void> | null,
    lastAt: 0,
    lastForceAt: 0,
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

    if (force && meta.forcePending) return meta.forcePending;
    if (meta.forcePending) return; // soft refresh waits — force pull is source of truth
    if (!force && meta.pending) return meta.pending;
    if (!force && now - meta.lastAt < REFRESH_COOLDOWN_MS) return;

    const shouldShowBanner = !silent && !meta.forcePending;
    if (shouldShowBanner && (meta.phase === 'idle' || meta.phase === 'error' || meta.phase === 'ready')) {
      emitState({
        phase: force ? 'syncing' : 'loading',
        startedAt: meta.startedAt ?? now,
        message: force ? 'Đang đồng bộ dữ liệu mới nhất từ Google Sheets...' : 'Đang tải dữ liệu...'
      });
    }

    const work = fetchMedicalDataBundle(force)
      .then(bundle => {
        applyMedicalDataBundle(bundle, scope, setters);
        meta.lastAt = Date.now();
        if (force) meta.lastForceAt = meta.lastAt;
        if (shouldShowBanner) {
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
        if (shouldShowBanner) {
          emitState({
            phase: 'error',
            startedAt: null,
            message: err instanceof Error ? err.message : String(err)
          });
        }
        throw err;
      });

    if (force) {
      meta.forcePending = work.finally(() => {
        meta.forcePending = null;
      });
      return meta.forcePending;
    }

    meta.pending = work.finally(() => {
      meta.pending = null;
    });
    return meta.pending;
  }, [setters, emitState]);

  const runSingleForcePull = useCallback(async (
    scope: RefreshScope,
    bannerPhase: 'loading' | 'syncing',
    options?: ForceSyncOptions
  ) => {
    const meta = metaRef.current;
    if (meta.forcePending) return meta.forcePending;

    const startedAt = meta.startedAt ?? Date.now();
    emitState({
      phase: bannerPhase,
      startedAt,
      message: bannerPhase === 'loading'
        ? 'Đang tải dữ liệu vào app...'
        : 'Đang đồng bộ dữ liệu mới nhất từ Google Sheets...'
    });

    meta.forcePending = fetchMedicalDataBundle(true)
      .then(bundle => {
        applyMedicalDataBundle(bundle, scope, setters);
        meta.lastAt = Date.now();
        meta.lastForceAt = meta.lastAt;
        options?.onSyncStatus?.(bundle._syncStatus);
        emitState({ phase: 'ready', startedAt: null });
      })
      .catch(err => {
        console.warn('Force medical data sync failed:', err);
        options?.onSyncStatus?.(undefined);
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
          message: err instanceof Error ? err.message : 'Không đồng bộ được Google Sheets. Bấm Đồng bộ để thử lại.'
        });
        throw err;
      })
      .finally(() => {
        meta.forcePending = null;
      });

    return meta.forcePending;
  }, [setters, emitState]);

  const syncMedicalDataInBackground = useCallback((
    scope: RefreshScope = 'full',
    options?: ForceSyncOptions
  ) => {
    return runSingleForcePull(scope, 'syncing', {
      preferSyncingBanner: true,
      ...options
    });
  }, [runSingleForcePull]);

  const loadMedicalDataAfterAuth = useCallback(async (
    scope: RefreshScope = 'full',
    options?: ForceSyncOptions
  ) => {
    const cached = await peekCachedMedicalDataBundle();
    const hasCache = !!cached && (cached.patients.length > 0 || cached.consults.length > 0);
    if (hasCache && cached) {
      applyMedicalDataBundle(cached, scope, setters);
    }

    try {
      await runSingleForcePull(scope, hasCache ? 'syncing' : 'loading', options);
    } catch (err) {
      if (err instanceof AuthRequiredError) throw err;
      // Cached rows already on screen; keep error banner for the failed pull.
    }
  }, [runSingleForcePull, setters]);

  const wasRecentlyForceSynced = useCallback(() => {
    const meta = metaRef.current;
    if (meta.forcePending) return true;
    if (meta.phase === 'loading' || meta.phase === 'syncing') return true;
    return Date.now() - meta.lastForceAt < FORCE_SYNC_SETTLE_MS;
  }, []);

  return {
    refreshMedicalData,
    syncMedicalDataInBackground,
    loadMedicalDataAfterAuth,
    wasRecentlyForceSynced
  };
}
