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
  /** True when UI already shows cached data and Sheets pull runs in background. */
  backgroundSync?: boolean;
};

export type RefreshMedicalDataOptions = {
  /** Không đổi banner loading/syncing khi app đã sẵn sàng (dùng cho polling nền). */
  silent?: boolean;
};

export type ForceSyncOptions = {
  /** Prefer "Đang đồng bộ…" even when UI already has cached rows. */
  preferSyncingBanner?: boolean;
  /** Không hiện banner — dùng khi app đã sẵn sàng và sync nền hoàn toàn im lặng. */
  silent?: boolean;
  /** Cache đã hiển thị — banner nhẹ, lỗi sync không xóa dữ liệu đang xem. */
  backgroundSync?: boolean;
  onSyncStatus?: (status: SheetsSyncStatus | undefined) => void;
};

export function useRefreshMedicalData(
  setters: MedicalDataSetters,
  onLoadStateChange?: (state: MedicalDataLoadState) => void
) {
  const metaRef = useRef({
    pending: null as Promise<void> | null,
    forcePending: null as Promise<void> | null,
    /** Bumped to abandon an in-flight force pull (safety timeout / user retry). */
    forceGeneration: 0,
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
      message: patch.message,
      backgroundSync: patch.backgroundSync
    });
  }, [onLoadStateChange]);

  /**
   * Safety timeout / hung fetch: UI may show error while forcePending is still set.
   * Without releasing the lock, "Đồng bộ lại" becomes a no-op (returns the stuck promise).
   */
  const releaseForceSyncLock = useCallback(() => {
    const meta = metaRef.current;
    meta.forceGeneration += 1;
    meta.forcePending = null;
    meta.pending = null;
  }, []);

  const markForceSyncTimedOut = useCallback((message: string) => {
    releaseForceSyncLock();
    emitState({
      phase: 'error',
      startedAt: null,
      backgroundSync: false,
      message
    });
  }, [emitState, releaseForceSyncLock]);

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
        startedAt: now,
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
    // Explicit user retry (preferSyncingBanner) must supersede a hung pull;
    // otherwise "Đồng bộ lại" after safety-timeout is a silent no-op.
    const allowSupersede = options?.preferSyncingBanner === true && !options?.silent;
    if (meta.forcePending && !allowSupersede) return meta.forcePending;
    if (meta.forcePending && allowSupersede) {
      releaseForceSyncLock();
    }

    const silent = options?.silent ?? false;
    const backgroundSync = options?.backgroundSync ?? false;
    const startedAt = Date.now();
    if (!silent) {
      emitState({
        phase: bannerPhase,
        startedAt,
        backgroundSync,
        message: backgroundSync
          ? 'Đang đồng bộ ngầm Google Sheets...'
          : bannerPhase === 'loading'
            ? 'Đang tải dữ liệu vào app...'
            : 'Đang đồng bộ dữ liệu mới nhất từ Google Sheets...'
      });
    }

    const runId = ++meta.forceGeneration;
    const work = fetchMedicalDataBundle(true)
      .then(bundle => {
        if (meta.forceGeneration !== runId) return;
        applyMedicalDataBundle(bundle, scope, setters);
        meta.lastAt = Date.now();
        meta.lastForceAt = meta.lastAt;
        options?.onSyncStatus?.(bundle._syncStatus);
        const pullFailed = bundle._syncStatus?.configured && bundle._syncStatus.lastPullOk === false;
        const hasClinicalData = bundle.patients.length > 0 || bundle.consults.length > 0;
        const pullFailMessage =
          bundle._syncStatus?.lastPullMessage
          || 'Không đồng bộ được Google Sheets. Bấm Đồng bộ để thử lại.';

        if (silent || backgroundSync) {
          if (pullFailed && !backgroundSync && !hasClinicalData) {
            emitState({
              phase: 'error',
              startedAt: null,
              backgroundSync: false,
              message: pullFailMessage
            });
          } else if (meta.phase === 'loading' || meta.phase === 'syncing' || meta.phase === 'error') {
            // Soft-fail: keep using cached clinical data, surface warning via message.
            emitState({
              phase: 'ready',
              startedAt: null,
              backgroundSync: false,
              message: pullFailed && hasClinicalData ? pullFailMessage : undefined
            });
          }
          return;
        }
        if (pullFailed) {
          // Hard error only when there is nothing usable to show.
          emitState({
            phase: hasClinicalData ? 'ready' : 'error',
            startedAt: null,
            backgroundSync: false,
            message: pullFailMessage
          });
          return;
        }
        emitState({ phase: 'ready', startedAt: null, backgroundSync: false, message: undefined });
      })
      .catch(async err => {
        if (meta.forceGeneration !== runId) return;
        console.warn('Force medical data sync failed:', err);
        options?.onSyncStatus?.(undefined);
        if (err instanceof AuthRequiredError) {
          emitState({
            phase: 'error',
            startedAt: null,
            backgroundSync: false,
            message: err.message
          });
          throw err;
        }
        const cached = await peekCachedMedicalDataBundle();
        if (meta.forceGeneration !== runId) return;
        const hasCache = !!cached && (cached.patients.length > 0 || cached.consults.length > 0);
        const failMessage = err instanceof Error
          ? err.message
          : 'Không đồng bộ được Google Sheets. Bấm Đồng bộ để thử lại.';
        if (hasCache && cached) {
          applyMedicalDataBundle(cached, scope, setters);
          meta.lastAt = Date.now();
          emitState({
            phase: 'ready',
            startedAt: null,
            backgroundSync: false,
            message: silent ? undefined : failMessage
          });
          return;
        }
        emitState({
          phase: 'error',
          startedAt: null,
          backgroundSync: false,
          message: failMessage
        });
        throw err;
      })
      .finally(() => {
        if (meta.forceGeneration === runId) {
          meta.forcePending = null;
        }
      });

    meta.forcePending = work;
    return work;
  }, [setters, emitState, releaseForceSyncLock]);

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
      try {
        await runSingleForcePull(scope, 'syncing', {
          ...options,
          backgroundSync: true
        });
      } catch (err) {
        if (err instanceof AuthRequiredError) throw err;
      }
      return;
    }

    // Login mới / sau logout: không có cache — banner gắn với force-pull thật, tắt ngay khi xong.
    try {
      await runSingleForcePull(scope, 'loading', options);
    } catch (err) {
      if (err instanceof AuthRequiredError) throw err;
    }
  }, [runSingleForcePull, setters, emitState]);

  const wasRecentlyForceSynced = useCallback(() => {
    const meta = metaRef.current;
    if (meta.forcePending) return true;
    if (meta.phase === 'loading' || meta.phase === 'syncing') return true;
    return Date.now() - meta.lastForceAt < FORCE_SYNC_SETTLE_MS;
  }, []);

  const isSyncInProgress = useCallback(() => {
    const meta = metaRef.current;
    return !!meta.forcePending || meta.phase === 'loading' || meta.phase === 'syncing';
  }, []);

  return {
    refreshMedicalData,
    syncMedicalDataInBackground,
    loadMedicalDataAfterAuth,
    wasRecentlyForceSynced,
    isSyncInProgress,
    releaseForceSyncLock,
    markForceSyncTimedOut
  };
}
