import { fetchRemoteAppBuildId } from '../appVersion';
import { clearAppRuntimeCaches } from './clearAppStorage';

const STALE_RECOVERY_KEY = 'CHD_STALE_RECOVERY_AT';

export function getActiveBuildIdFromWindow(): string {
  if (typeof window !== 'undefined') {
    const htmlBuildId = String((window as any).__CHD_APP_BUILD_ID || '').trim();
    if (htmlBuildId && htmlBuildId !== '__CHD_BUILD_ID__') return htmlBuildId;
  }
  return '';
}

export function isRecoverableStaleBundleError(message: string): boolean {
  const normalized = message.toLowerCase();
  return (
    normalized.includes('importing a module script failed')
    || normalized.includes('failed to fetch dynamically imported module')
    || normalized.includes('supabaseurl is required')
    || normalized.includes("can't find variable")
    || normalized.includes('cannot find variable')
    || normalized.includes(' is not defined')
    || normalized.includes('unexpected token')
  );
}

function hasRecentRecoveryAttempt(windowMs = 120_000): boolean {
  if (typeof sessionStorage === 'undefined') return false;
  const last = sessionStorage.getItem(STALE_RECOVERY_KEY);
  if (!last) return false;
  return Date.now() - Number(last) < windowMs;
}

/** Clear SW/cache and reload once — keeps login + medical IndexedDB. */
export async function attemptStaleBundleRecovery(triggerMessage?: string): Promise<boolean> {
  if (typeof window === 'undefined') return false;
  if (hasRecentRecoveryAttempt()) return false;

  const remoteBuildId = await fetchRemoteAppBuildId();
  const localBuildId = getActiveBuildIdFromWindow();
  const versionMismatch = !!(remoteBuildId && localBuildId && remoteBuildId !== localBuildId);
  const staleBundleError = triggerMessage ? isRecoverableStaleBundleError(triggerMessage) : false;

  if (!versionMismatch && !staleBundleError) return false;

  sessionStorage.setItem(STALE_RECOVERY_KEY, String(Date.now()));
  await clearAppRuntimeCaches();
  window.location.reload();
  return true;
}
