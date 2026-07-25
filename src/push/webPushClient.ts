const PUSH_PROMPT_DISMISSED_KEY = 'CHD_PUSH_PROMPT_DISMISSED';
const PWA_INSTALL_DISMISSED_KEY = 'CHD_PWA_INSTALL_DISMISSED';

export function isPushSupported(): boolean {
  return typeof window !== 'undefined'
    && 'serviceWorker' in navigator
    && 'PushManager' in window
    && 'Notification' in window;
}

export function isStandaloneDisplayMode(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(display-mode: standalone)').matches
    || (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
}

export function isIosDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

export function shouldShowIosInstallHint(): boolean {
  return isIosDevice() && !isStandaloneDisplayMode();
}

export function wasPushPromptDismissed(): boolean {
  return localStorage.getItem(PUSH_PROMPT_DISMISSED_KEY) === '1';
}

export function dismissPushPrompt(): void {
  localStorage.setItem(PUSH_PROMPT_DISMISSED_KEY, '1');
}

export function wasPwaInstallDismissed(): boolean {
  return localStorage.getItem(PWA_INSTALL_DISMISSED_KEY) === '1';
}

export function dismissPwaInstallPrompt(): void {
  localStorage.setItem(PWA_INSTALL_DISMISSED_KEY, '1');
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

async function fetchVapidPublicKey(): Promise<string> {
  const res = await fetch('/api/push/vapid-public-key');
  if (!res.ok) throw new Error('Không lấy được khóa push của hệ thống');
  const data = await res.json() as { publicKey?: string };
  if (!data.publicKey) throw new Error('Khóa push chưa được cấu hình trên server');
  return data.publicKey;
}

export async function registerAppServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) return null;
  return navigator.serviceWorker.register('/sw.js', { scope: '/' });
}

export async function getPushPermission(): Promise<NotificationPermission> {
  if (!isPushSupported()) return 'denied';
  return Notification.permission;
}

export async function subscribeToWebPush(staffKey: string): Promise<PushSubscription | null> {
  if (!isPushSupported()) return null;

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return null;

  const registration = await registerAppServiceWorker();
  if (!registration) return null;

  await navigator.serviceWorker.ready;

  let publicKey: string;
  try {
    publicKey = await fetchVapidPublicKey();
  } catch (error) {
    console.warn('[web-push]', error);
    return null;
  }

  let subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    });
  }

  const json = subscription.toJSON();
  const token = localStorage.getItem('CHD_AUTH_TOKEN') || '';
  const res = await fetch('/api/push/subscribe', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      StaffKey: staffKey,
      endpoint: json.endpoint,
      keys: json.keys,
      UserAgent: navigator.userAgent,
    }),
  });

  if (!res.ok) {
    throw new Error('Không thể đăng ký thiết bị nhận thông báo');
  }

  return subscription;
}

export async function unsubscribeFromWebPush(staffKey: string): Promise<void> {
  if (!('serviceWorker' in navigator)) return;
  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();
  if (!subscription) return;

  const endpoint = subscription.endpoint;
  const token = localStorage.getItem('CHD_AUTH_TOKEN') || '';
  await fetch('/api/push/unsubscribe', {
    method: 'DELETE',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ StaffKey: staffKey, endpoint }),
  });

  await subscription.unsubscribe();
}

export async function syncExistingPushSubscription(staffKey: string): Promise<boolean> {
  if (!isPushSupported() || Notification.permission !== 'granted') return false;
  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();
  if (!subscription) return false;

  const json = subscription.toJSON();
  const token = localStorage.getItem('CHD_AUTH_TOKEN') || '';
  const res = await fetch('/api/push/subscribe', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      StaffKey: staffKey,
      endpoint: json.endpoint,
      keys: json.keys,
      UserAgent: navigator.userAgent,
    }),
  });
  return res.ok;
}

export async function fetchPushStatus(): Promise<{ configured: boolean; subscribed: boolean; permission: NotificationPermission }> {
  const permission = isPushSupported() ? Notification.permission : 'denied';
  const token = localStorage.getItem('CHD_AUTH_TOKEN') || '';
  if (!token) {
    return { configured: false, subscribed: false, permission };
  }
  const res = await fetch('/api/push/status', {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    return { configured: false, subscribed: false, permission };
  }
  const data = await res.json() as { configured?: boolean; subscribed?: boolean };
  return {
    configured: !!data.configured,
    subscribed: !!data.subscribed,
    permission,
  };
}

export function parseViewFromLocation(): string | null {
  if (typeof window === 'undefined') return null;
  return new URLSearchParams(window.location.search).get('view');
}

export function clearViewQueryParam(): void {
  if (typeof window === 'undefined') return;
  const url = new URL(window.location.href);
  if (!url.searchParams.has('view')) return;
  url.searchParams.delete('view');
  window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
}
