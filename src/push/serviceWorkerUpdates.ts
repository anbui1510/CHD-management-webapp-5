import { markDeployReload, shouldBlockDeployReload } from '../appVersion';
import { isStandaloneDisplayMode } from './webPushClient';

let reloadScheduled = false;

export async function setupServiceWorkerUpdates(): Promise<void> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloadScheduled || shouldBlockDeployReload()) return;
    if (isStandaloneDisplayMode() && !navigator.serviceWorker.controller) return;
    reloadScheduled = true;
    markDeployReload();
    window.location.reload();
  });

  const registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => null);
  if (!registration) return;

  registration.addEventListener('updatefound', () => {
    const installing = registration.installing;
    if (!installing) return;
    installing.addEventListener('statechange', () => {
      if (installing.state !== 'installed') return;
      if (!navigator.serviceWorker.controller) return;
      installing.postMessage({ type: 'SKIP_WAITING' });
    });
  });

  await registration.update().catch(() => undefined);
}
