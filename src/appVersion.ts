export const APP_VERSION = '5.0.0';
export const CHD_APP_BUILD_ID_KEY = 'CHD_APP_BUILD_ID';
export const CHD_DEPLOY_LOGOUT_MSG_KEY = 'CHD_DEPLOY_LOGOUT_MSG';
export const CHD_DEPLOY_RELOAD_AT_KEY = 'CHD_DEPLOY_RELOAD_AT';
export const CHD_BUILD_MISMATCH_RELOAD_KEY = 'CHD_BUILD_MISMATCH_RELOAD';

declare const __APP_BUILD_ID__: string | undefined;

/** Build id baked into the current frontend bundle at compile time. */
export const APP_BUILD_ID: string =
  typeof __APP_BUILD_ID__ !== 'undefined' ? __APP_BUILD_ID__ : 'dev';

export type AppVersionPayload = {
  version: string;
  buildId: string;
  /** Alias kept for older clients polling buildTime. */
  buildTime: string;
};

export function getAppVersionPayload(buildId: string = APP_BUILD_ID): AppVersionPayload {
  return {
    version: APP_VERSION,
    buildId,
    buildTime: buildId,
  };
}

export function isAppBuildIdMismatch(
  storedBuildId: string | null | undefined,
  currentBuildId: string = APP_BUILD_ID
): boolean {
  return !!storedBuildId && storedBuildId !== currentBuildId;
}

export function shouldBlockDeployReload(windowMs = 120_000): boolean {
  if (typeof sessionStorage === 'undefined') return false;
  const last = sessionStorage.getItem(CHD_DEPLOY_RELOAD_AT_KEY);
  if (!last) return false;
  return Date.now() - Number(last) < windowMs;
}

export function markDeployReload(): void {
  if (typeof sessionStorage === 'undefined') return;
  sessionStorage.setItem(CHD_DEPLOY_RELOAD_AT_KEY, String(Date.now()));
}

export async function activateWaitingServiceWorker(): Promise<void> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  const registration = await navigator.serviceWorker.getRegistration();
  if (!registration) return;
  await registration.update().catch(() => undefined);
  if (registration.waiting) {
    registration.waiting.postMessage({ type: 'SKIP_WAITING' });
  }
}

export async function fetchRemoteAppBuildId(): Promise<string | null> {
  try {
    const versionRes = await fetch(`/version.json?_=${Date.now()}`, { cache: 'no-store' });
    if (versionRes.ok) {
      const data = await versionRes.json();
      return String(data.buildId || data.buildTime || '').trim() || null;
    }
  } catch {
    // fall through to /api/version
  }

  try {
    const apiRes = await fetch('/api/version', { cache: 'no-store' });
    if (apiRes.ok) {
      const data = await apiRes.json();
      return String(data.buildId || data.buildTime || '').trim() || null;
    }
  } catch {
    // ignore
  }

  return null;
}
