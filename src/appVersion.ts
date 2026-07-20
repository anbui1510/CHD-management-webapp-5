export const APP_VERSION = '5.0.0';
export const CHD_APP_BUILD_ID_KEY = 'CHD_APP_BUILD_ID';
export const CHD_DEPLOY_LOGOUT_MSG_KEY = 'CHD_DEPLOY_LOGOUT_MSG';

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
