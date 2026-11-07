import { useCallback, useEffect, useRef, useState } from 'react';
import { isSheetBackend } from '../../config/dataBackend';
import {
  getCloudMeta,
  saveStore,
  setCloudMeta,
  setCloudPushHandler,
  ensureBootstrapAdminStaff,
  fillEmptyTasksFromSeed,
} from '../../store/dbStore';
import { getSpreadsheetId } from './sheetStorage';
import {
  bootstrapScheduleStore,
  canSyncScheduleStore,
  fetchSheetProfile,
  forcePushScheduleStore,
  pullScheduleStore,
  pushScheduleStore,
  pushScheduleStoreIfNotStale,
} from '../scheduleSync/scheduleStoreClient';

function deptTaskCount(store) {
  return (store?.departments || []).reduce((sum, dept) => sum + (dept.tasks?.length || 0), 0);
}

const PULL_INTERVAL_MS = 45_000;

/**
 * F-304 — bootstrap Sheet, pull/push, conflict hint.
 */
function isMissingNhanSuStaffKeyError(message) {
  return /StaffKey chưa có trong NhanSu/i.test(String(message || ''));
}

export function useSheetSync({
  syncAuthReady,
  accountLoading,
  accountEmail,
  accountFullName,
  accountStaffKey = '',
  accountRole = '',
  sheetConnectionRevision,
  setStore,
  storeRef,
  ensureSheets,
}) {
  const isChdAdmin = String(accountRole || '').trim().toLowerCase() === 'admin';
  const [sheetSyncError, setSheetSyncError] = useState('');
  const [sheetSyncNotice, setSheetSyncNotice] = useState('');
  const [sheetSyncAt, setSheetSyncAt] = useState(() => getCloudMeta().updatedAt || '');
  const [bootstrapOpen, setBootstrapOpen] = useState(false);
  const [bootstrapBusy, setBootstrapBusy] = useState(false);
  const forcePullRef = useRef(false);
  const bootstrapCheckedRef = useRef(false);
  const taskHydratePushedRef = useRef(false);

  const markForcePull = useCallback(() => {
    forcePullRef.current = true;
    bootstrapCheckedRef.current = false;
    taskHydratePushedRef.current = false;
  }, []);

  const applyRemotePayload = useCallback((remote, force) => {
    if (!remote?.payload?.departments) return false;
    const localMeta = getCloudMeta();
    const remoteTs = new Date(remote.updatedAt).getTime() || 0;
    const localTs = localMeta.updatedAt ? new Date(localMeta.updatedAt).getTime() : 0;
    // remoteTs === localTs cũng bỏ qua — tránh pull ngay sau push xóa format vừa tô (~1–3s).
    if (!force && localTs && remoteTs && remoteTs <= localTs) return false;
    // importTabsToStore đã merge từ baseStore; truyền lại storeRef để chắc cellStyles local không mất.
    let next = ensureSheets(remote.payload);
    // Sheet Task trống (trước lần push đầu) → giữ task local / seed, rồi hydrate lên Sheet.
    if (!deptTaskCount(next) && deptTaskCount(storeRef.current)) {
      next = ensureSheets({
        ...next,
        departments: next.departments.map((dept) => {
          const local = storeRef.current.departments?.find((d) => d.id === dept.id)
            || storeRef.current.departments?.[0];
          return {
            ...dept,
            tasks: (local?.tasks || []).length ? local.tasks : dept.tasks,
          };
        }),
      });
    }
    if (!deptTaskCount(next)) {
      next = ensureSheets(fillEmptyTasksFromSeed(next));
    }
    // Safeguard: Đảm bảo không bao giờ làm mất monthGrid/monthRoles local nếu remote bị trống
    const prevSheetsByDept = storeRef.current?.sheetsByDept || {};
    if (next?.sheetsByDept) {
      Object.entries(next.sheetsByDept).forEach(([deptId, deptState]) => {
        const prevSheets = prevSheetsByDept[deptId]?.sheets || [];
        (deptState.sheets || []).forEach((sh) => {
          const prevSh = prevSheets.find((p) => p.id === sh.id) || prevSheets[0];
          if (prevSh?.monthGrid && Object.keys(prevSh.monthGrid).length > 0) {
            if (!sh.monthGrid || Object.keys(sh.monthGrid).length === 0) {
              sh.monthGrid = { ...prevSh.monthGrid };
            } else {
              Object.entries(prevSh.monthGrid).forEach(([k, v]) => {
                if (v !== undefined && v !== null && String(v).trim() !== '') {
                  const curVal = sh.monthGrid[k];
                  if (curVal === undefined || curVal === null || String(curVal).trim() === '') {
                    sh.monthGrid[k] = v;
                  }
                }
              });
            }
          }
          if (prevSh?.monthRoles?.length && (!sh.monthRoles || !sh.monthRoles.length)) {
            sh.monthRoles = [...prevSh.monthRoles];
          }
          if (prevSh?.monthKey && !sh.monthKey) {
            sh.monthKey = prevSh.monthKey;
          }
        });
      });
    }
    setStore(next);
    saveStore(next, { skipCloud: true });
    setCloudMeta({ updatedAt: remote.updatedAt });
    setSheetSyncAt(remote.updatedAt);
    setSheetSyncError('');
    return true;
  }, [ensureSheets, setStore, storeRef]);

  const persistStoreToSheet = useCallback(async (store, { notice } = {}) => {
    if (!syncAuthReady || !getSpreadsheetId()) return null;
    if (!(await canSyncScheduleStore())) return null;
    const res = await forcePushScheduleStore(store);
    if (res?.updatedAt) {
      setCloudMeta({ updatedAt: res.updatedAt });
      setSheetSyncAt(res.updatedAt);
      setSheetSyncError('');
      if (notice) setSheetSyncNotice(notice);
    }
    return res;
  }, [syncAuthReady]);

  const ensureSelfThenPush = useCallback(async () => {
    const prepared = ensureBootstrapAdminStaff(storeRef.current, {
      email: accountEmail,
      fullName: accountFullName,
      staffKey: accountStaffKey,
    });
    setStore(prepared);
    saveStore(prepared, { skipCloud: true });
    storeRef.current = prepared;
    const res = await pushScheduleStore(prepared);
    if (res?.updatedAt) {
      setCloudMeta({ updatedAt: res.updatedAt });
      setSheetSyncAt(res.updatedAt);
    }
    return prepared;
  }, [accountEmail, accountFullName, accountStaffKey, setStore, storeRef]);

  const pullFromSheet = useCallback(async (force = false) => {
    if (!syncAuthReady || !getSpreadsheetId()) return;
    if (!(await canSyncScheduleStore())) return;
    try {
      const remote = await pullScheduleStore(storeRef.current);
      const remoteTasks = deptTaskCount(remote?.payload);
      const did = applyRemotePayload(remote, force || forcePullRef.current);
      if (forcePullRef.current) forcePullRef.current = false;
      if (did) setSheetSyncNotice('');
      if (!remoteTasks && deptTaskCount(storeRef.current) && !taskHydratePushedRef.current) {
        taskHydratePushedRef.current = true;
        await persistStoreToSheet(storeRef.current, {
          notice: 'Đã ghi danh mục Task Tim mạch lên Google Sheet.',
        });
      }
    } catch (error) {
      const message = error?.message || 'Không kéo được dữ liệu từ Sheet.';
      if (isChdAdmin && isMissingNhanSuStaffKeyError(message)) {
        try {
          await ensureSelfThenPush();
          const remote = await pullScheduleStore(storeRef.current);
          applyRemotePayload(remote, true);
          setSheetSyncError('');
          setSheetSyncNotice('Đã ghi StaffKey hiện tại vào NhanSu và đồng bộ lại.');
          return;
        } catch (retryError) {
          setSheetSyncError(retryError?.message || message);
          return;
        }
      }
      setSheetSyncError(message);
    }
  }, [applyRemotePayload, ensureSelfThenPush, isChdAdmin, persistStoreToSheet, storeRef, syncAuthReady]);

  const runBootstrap = useCallback(async () => {
    if (!syncAuthReady || !getSpreadsheetId()) return;
    setBootstrapBusy(true);
    setSheetSyncError('');
    try {
      let prepared = ensureBootstrapAdminStaff(storeRef.current, {
        email: accountEmail,
        fullName: accountFullName,
        staffKey: accountStaffKey,
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
    accountStaffKey,
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
        let profile;
        try {
          profile = await fetchSheetProfile();
        } catch (profileError) {
          if (cancelled) return;
          const message = profileError?.message || 'Lỗi đồng bộ Sheet.';
          if (isChdAdmin && isMissingNhanSuStaffKeyError(message)) {
            await ensureSelfThenPush();
            if (cancelled) return;
            profile = await fetchSheetProfile();
            setSheetSyncNotice('Đã ghi StaffKey Admin vào NhanSu Sheet lịch.');
          } else {
            throw profileError;
          }
        }
        if (cancelled) return;
        if (profile?.bootstrapEligible) {
          bootstrapCheckedRef.current = true;
          setBootstrapOpen(true);
          return;
        }
        bootstrapCheckedRef.current = true;
        let remoteTaskCount = 0;
        if (forcePullRef.current || !getCloudMeta().updatedAt) {
          const remote = await pullScheduleStore(storeRef.current);
          if (cancelled) return;
          remoteTaskCount = deptTaskCount(remote?.payload);
          if (!remote?.payload?.departments) {
            const res = await forcePushScheduleStore(storeRef.current);
            if (res?.updatedAt) {
              setCloudMeta({ updatedAt: res.updatedAt });
              setSheetSyncAt(res.updatedAt);
            }
            return;
          }
          applyRemotePayload(remote, forcePullRef.current || !getCloudMeta().updatedAt);
          if (forcePullRef.current) forcePullRef.current = false;
        } else {
          const remote = await pullScheduleStore(storeRef.current);
          if (cancelled) return;
          remoteTaskCount = deptTaskCount(remote?.payload);
          applyRemotePayload(remote, forcePullRef.current);
          if (forcePullRef.current) forcePullRef.current = false;
        }
        // Sheet Task trống: đẩy seed/task local lên Sheet (tránh mất sau deploy).
        if (!cancelled && !remoteTaskCount && deptTaskCount(storeRef.current) && !taskHydratePushedRef.current) {
          taskHydratePushedRef.current = true;
          await persistStoreToSheet(storeRef.current, {
            notice: 'Đã ghi danh mục Task Tim mạch lên Google Sheet.',
          });
        }
        if (!cancelled) setSheetSyncError('');
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
    accountStaffKey,
    isChdAdmin,
    sheetConnectionRevision,
    applyRemotePayload,
    ensureSelfThenPush,
    persistStoreToSheet,
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
          // Không force-pull ngay: pull đè sẽ làm mất format/ô vừa sửa trong ~2–3s sau khi tô.
          // User bấm «Đồng bộ từ Sheet» khi muốn lấy bản Sheet.
          setSheetSyncNotice('Sheet Google mới hơn — đã giữ bản máy này. Bấm «Đồng bộ từ Sheet» nếu muốn lấy bản Sheet.');
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

  /** Ghi store hiện tại lên Sheet rồi kéo lại — dùng sau xóa / khi bấm Đồng bộ Module 7. */
  const manualSync = useCallback(async () => {
    if (!syncAuthReady || !getSpreadsheetId()) return;
    setSheetSyncError('');
    try {
      await persistStoreToSheet(storeRef.current, {
        notice: 'Đã ghi lịch khoa lên Google Sheet.',
      });
      forcePullRef.current = true;
      await pullFromSheet(true);
    } catch (error) {
      setSheetSyncError(error?.message || 'Đồng bộ Sheet lịch khoa thất bại.');
    }
  }, [persistStoreToSheet, pullFromSheet, storeRef, syncAuthReady]);

  const dismissNotice = useCallback(() => {
    setSheetSyncNotice('');
  }, []);

  const forcePushLocalToSheet = useCallback(async () => {
    if (!syncAuthReady || !getSpreadsheetId()) return;
    setSheetSyncError('');
    try {
      const res = await persistStoreToSheet(storeRef.current, {
        notice: 'Đã ghi đè toàn bộ dữ liệu máy này lên Google Sheet thành công.',
      });
      if (res?.updatedAt) {
        setSheetSyncNotice('');
      }
    } catch (error) {
      setSheetSyncError(error?.message || 'Không ghi đè được lên Sheet.');
    }
  }, [persistStoreToSheet, storeRef, syncAuthReady]);

  return {
    sheetSyncError,
    sheetSyncNotice,
    sheetSyncAt,
    bootstrapOpen,
    setBootstrapOpen,
    bootstrapBusy,
    runBootstrap,
    manualPull,
    manualSync,
    markForcePull,
    persistStoreToSheet,
    forcePushLocalToSheet,
    dismissNotice,
  };
}
