import { isSheetBackend } from '../../config/dataBackend';
import { exportStoreToTabs, importTabsToStore } from '../../logic/sheetStore';
import { sheetBridge } from '../sheetSync/sheetBridge';
import { getSpreadsheetId } from '../sheetSync/sheetStorage';
import { getCloudMeta } from '../../store/dbStore';
import { scheduleApi } from './scheduleApi';

/** @returns {Promise<{ payload: object, updatedAt: string } | null>} */
export async function pullScheduleStore(baseStore = null) {
  if (isSheetBackend()) {
    const spreadsheetId = getSpreadsheetId();
    if (!spreadsheetId) return null;
    const remote = await sheetBridge.pull(spreadsheetId);
    const payload = importTabsToStore(remote.tabs || {}, baseStore);
    return { payload, updatedAt: remote.updatedAt || new Date().toISOString() };
  }
  return scheduleApi.get();
}

export async function pushScheduleStore(store) {
  if (isSheetBackend()) {
    const spreadsheetId = getSpreadsheetId();
    if (!spreadsheetId) return null;
    const tabs = exportStoreToTabs(store);
    const res = await sheetBridge.push(spreadsheetId, tabs);
    return { updatedAt: res.updatedAt || new Date().toISOString() };
  }
  return scheduleApi.put(store);
}

/** Ép ghi lên Sheet (sau import / hydrate Task) — bỏ qua so sánh stale. */
export async function forcePushScheduleStore(store) {
  if (!isSheetBackend()) {
    const res = await scheduleApi.put(store);
    return { outcome: 'pushed', updatedAt: res?.updatedAt };
  }
  const spreadsheetId = getSpreadsheetId();
  if (!spreadsheetId) return null;
  const profile = await sheetBridge.getProfile(spreadsheetId);
  if (profile?.bootstrapEligible) {
    const res = await bootstrapScheduleStore(store);
    return { outcome: 'bootstrapped', updatedAt: res?.updatedAt };
  }
  const res = await pushScheduleStore(store);
  return { outcome: 'pushed', updatedAt: res?.updatedAt };
}

export async function bootstrapScheduleStore(store) {
  const spreadsheetId = getSpreadsheetId();
  if (!spreadsheetId) return null;
  const tabs = exportStoreToTabs(store);
  const res = await sheetBridge.bootstrap(spreadsheetId, tabs);
  return { updatedAt: res.updatedAt || new Date().toISOString(), actor: res.actor };
}

/** @returns {Promise<{ outcome: 'pushed'|'skipped_remote_newer'|'skipped_bootstrap', updatedAt?: string }|null>} */
export async function pushScheduleStoreIfNotStale(store) {
  if (!isSheetBackend()) {
    const res = await scheduleApi.put(store);
    return { outcome: 'pushed', updatedAt: res?.updatedAt };
  }
  const spreadsheetId = getSpreadsheetId();
  if (!spreadsheetId) return null;
  const profile = await sheetBridge.getProfile(spreadsheetId);
  if (profile?.bootstrapEligible) return { outcome: 'skipped_bootstrap' };
  const localMeta = getCloudMeta();
  const remoteTs = profile?.updatedAt ? new Date(profile.updatedAt).getTime() : 0;
  const localTs = localMeta.updatedAt ? new Date(localMeta.updatedAt).getTime() : 0;
  if (remoteTs && localTs && remoteTs > localTs) {
    try {
      const remote = await sheetBridge.pull(spreadsheetId);
      const mergedStore = importTabsToStore(remote.tabs || {}, store);
      const res = await pushScheduleStore(mergedStore);
      return { outcome: 'pushed', updatedAt: res?.updatedAt, mergedStore };
    } catch (err) {
      console.warn('Auto-merge on stale remote failed:', err);
      return { outcome: 'skipped_remote_newer' };
    }
  }
  const res = await pushScheduleStore(store);
  return { outcome: 'pushed', updatedAt: res?.updatedAt };
}

export async function fetchSheetProfile() {
  const spreadsheetId = getSpreadsheetId();
  if (!spreadsheetId) return null;
  return sheetBridge.getProfile(spreadsheetId);
}

export async function canSyncScheduleStore() {
  if (isSheetBackend()) {
    // Bridge URL is server-side (/api/lichkhoa/proxy); only need spreadsheet id locally.
    return Boolean(getSpreadsheetId());
  }
  return true;
}
