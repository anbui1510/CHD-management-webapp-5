import { APP_BUILD_ID } from '../appVersion';
import { clearAppStorage } from './clearAppStorage';

const MIGRATE_RELOAD_KEY = 'CHD_BUILD_MIGRATE_RELOAD';

export async function migrateAppBuild(): Promise<void> {
  if (typeof window === 'undefined') return;

  const activeBuildId = getActiveBuildId();
  const previous = localStorage.getItem('CHD_APP_BUILD_ID');

  if (previous && previous !== activeBuildId) {
    await clearAppStorage({ preserveScriptConfig: true });
    if (!sessionStorage.getItem(MIGRATE_RELOAD_KEY)) {
      sessionStorage.setItem(MIGRATE_RELOAD_KEY, '1');
      localStorage.setItem('CHD_APP_BUILD_ID', activeBuildId);
      window.location.reload();
      return;
    }
    sessionStorage.removeItem(MIGRATE_RELOAD_KEY);
  }

  localStorage.setItem('CHD_APP_BUILD_ID', activeBuildId);
}

function getActiveBuildId(): string {
  if (typeof window !== 'undefined') {
    const htmlBuildId = String((window as any).__CHD_APP_BUILD_ID || '').trim();
    if (htmlBuildId && htmlBuildId !== '__CHD_BUILD_ID__') return htmlBuildId;
  }
  return APP_BUILD_ID;
}
