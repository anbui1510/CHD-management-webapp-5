import { useCallback, useEffect, useRef, useState } from 'react';
import { isSheetBackend } from '../../config/dataBackend';
import {
  getCloudMeta,
  saveStore,
  setCloudMeta,
  setCloudPushHandler,
  ensureBootstrapAdminStaff,
} from '../../store/dbStore';
import { getSpreadsheetId } from './sheetStorage';
import {
  bootstrapScheduleStore,
  canSyncScheduleStore,
  fetchSheetProfile,
  pullScheduleStore,
  pushScheduleStore,
  pushScheduleStoreIfNotStale,
} from '../scheduleSync/scheduleStoreClient';

const PULL_INTERVAL_MS = 45_000;

/**
 * F-304 — bootstrap Sheet, pull/push, conflict hint.
 */
export function useSheetSync({
  syncAuthReady,
  accountLoading,
  accountEmail,
  accountFullName,
  sheetConnectionRevision,
  setStore,
  storeRef,
  ensureSheets,
}) {
  const [sheetSyncError, setSheetSyncError] = useState('');
  const [sheetSyncNotice, setSheetSyncNotice] = useState('');
  const [sheetSyncAt, setSheetSyncAt] = useState(() => getCloudMeta().updatedAt || '');
  const [bootstrapOpen, setBootstrapOpen] = useState(false);
  const [bootstrapBusy, setBootstrapBusy] = useState(false);
  const forcePullRef = useRef(false);
  const bootstrapCheckedRef = useRef(false);

  const markForcePull = useCallback(() => {
    forcePullRef.current = true;
    bootstrapCheckedRef.current = false;
  }, []);

  const applyRemotePayload = useCallback((remote, force) => {
    if (!remote?.payload?.departments) return false;
    const localMeta = getCloudMeta();
    const remoteTs = new Date(remote.updatedAt).getTime() || 0;
    const localTs = localMeta.updatedAt ? new Date(localMeta.updatedAt).getTime() : 0;
    if (!force && localTs && remoteTs < localTs) return false;
    const next = ensureSheets(remote.payload);
    setStore(next);
    saveStore(next, { skipCloud: true });
    setCloudMeta({ updatedAt: remote.updatedAt });
    setSheetSyncAt(remote.updatedAt);
    setSheetSyncError('');
    return true;
  }, [ensureSheets, setStore]);

  const pullFromSheet = useCallback(async (force = false) => {
    if (!syncAuthReady || !getSpreadsheetId()) return;
    if (!(await canSyncScheduleStore())) return;
    try {
      const remote = await pullScheduleStore(storeRef.current);
      const did = applyRemotePayload(remote, force || forcePullRef.current);
      if (forcePullRef.current) forcePullRef.current = false;
      if (did) setSheetSyncNotice('');
    } catch (error) {
      setSheetSyncError(error?.message || 'Không kéo được dữ liệu từ Sheet.');
    }
  }, [applyRemotePayload, storeRef, syncAuthReady]);

  const runBootstrap = useCallback(async () => {
    if (!syncAuthReady || !getSpreadsheetId()) return;
    setBootstrapBusy(true);
    setSheetSyncError('');
    try {
      let prepared = ensureBootstrapAdminStaff(storeRef.current, {
        email: accountEmail,
        fullName: accountFullName,
      });
      const res = await bootstrapScheduleStore(prepared);
      if (res?.updatedAt) {
        setCloudMeta({ updatedAt: res.updatedAt });
        setSheetSyncAt(res.updatedAt);
      }
      setStore(prepared);
      saveStore(prepared, { skipCloud: true });
      setBootstrapOpen(false);
      bootstrapCheckedRef.current = true;
      await pullFromSheet(true);
    } catch (error) {
      setSheetSyncError(error?.message || 'Thiết lập Sheet thất bại.');
    } finally {
      setBootstrapBusy(false);
    }
  }, [
    accountEmail,
    accountFullName,
    pullFromSheet,
    setStore,
    storeRef,
    syncAuthReady,
  ]);

  // Profile + bootstrap vs pull sau login / đổi sổ
  useEffect(() => {
    if (!isSheetBackend() || accountLoading || !syncAuthReady || !getSpreadsheetId()) {
      return undefined;
    }
    let cancelled = false;
    (async () => {
      try {
        if (!(await canSyncScheduleStore())) return;
        const profile = await fetchSheetProfile();
        if (cancelled) return;
        if (profile?.bootstrapEligible) {
          bootstrapCheckedRef.current = true;
          setBootstrapOpen(true);
          return;
        }
        bootstrapCheckedRef.current = true;
        if (forcePullRef.current || !getCloudMeta().updatedAt) {
          const remote = await pullScheduleStore(storeRef.current);
          if (cancelled) return;
          if (!remote?.payload?.departments) {
            const res = await pushScheduleStore(storeRef.current);
            if (res?.updatedAt) {
              setCloudMeta({ updatedAt: res.updatedAt });
              setSheetSyncAt(res.updatedAt);
            }
            return;
          }
          applyRemotePayload(remote, forcePullRef.current || !getCloudMeta().updatedAt);
          if (forcePullRef.current) forcePullRef.current = false;
        } else {
          await pullFromSheet(forcePullRef.current);
        }
      } catch (error) {
        if (!cancelled) {
          setSheetSyncError(error?.message || 'Lỗi đồng bộ Sheet.');
        }
        if (forcePullRef.current) forcePullRef.current = false;
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    accountLoading,
    syncAuthReady,
    accountEmail,
    sheetConnectionRevision,
    applyRemotePayload,
    pullFromSheet,
    storeRef,
  ]);

  // Push debounced từ saveStore — kiểm tra remote mới hơn trước khi ghi
  useEffect(() => {
    if (!isSheetBackend()) return undefined;
    setCloudPushHandler(async (nextStore) => {
      if (!syncAuthReady) return;
      if (!(await canSyncScheduleStore())) return;
      if (bootstrapOpen) return;
      try {
        const result = await pushScheduleStoreIfNotStale(nextStore);
        if (result?.outcome === 'skipped_remote_newer') {
          setSheetSyncNotice('Sheet Google mới hơn — đã bỏ qua ghi đè. Bấm «Đồng bộ từ Sheet».');
          await pullFromSheet(true);
          return;
        }
        if (result?.outcome === 'pushed' && result.updatedAt) {
          setCloudMeta({ updatedAt: result.updatedAt });
          setSheetSyncAt(result.updatedAt);
          setSheetSyncNotice('');
          setSheetSyncError('');
        }
      } catch (error) {
        setSheetSyncError(error?.message || 'Không ghi được lên Sheet.');
      }
    });
    return () => setCloudPushHandler(null);
  }, [bootstrapOpen, pullFromSheet, storeRef, syncAuthReady]);

  // Pull định kỳ + khi quay lại tab
  useEffect(() => {
    if (!isSheetBackend() || !syncAuthReady || bootstrapOpen) return undefined;

    const onVisible = () => {
      if (document.visibilityState === 'visible') pullFromSheet(false);
    };
    document.addEventListener('visibilitychange', onVisible);
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') pullFromSheet(false);
    }, PULL_INTERVAL_MS);

    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.clearInterval(timer);
    };
  }, [bootstrapOpen, pullFromSheet, syncAuthReady]);

  const manualPull = useCallback(() => {
    forcePullRef.current = true;
    return pullFromSheet(true);
  }, [pullFromSheet]);

  return {
    sheetSyncError,
    sheetSyncNotice,
    sheetSyncAt,
    bootstrapOpen,
    setBootstrapOpen,
    bootstrapBusy,
    runBootstrap,
    manualPull,
    markForcePull,
  };
}
