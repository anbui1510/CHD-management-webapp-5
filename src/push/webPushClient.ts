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

export function clearPushPromptDismiss(): void {
  localStorage.removeItem(PUSH_PROMPT_DISMISSED_KEY);
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

async function pushNativeFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const nativeFetch = (typeof window !== 'undefined' && (window as Window & { __CHD_NATIVE_FETCH__?: typeof fetch }).__CHD_NATIVE_FETCH__)
    || fetch;
  return nativeFetch(input, init);
}

async function fetchVapidPublicKey(): Promise<string> {
  const res = await pushNativeFetch('/api/push/vapid-public-key');
  if (!res.ok) throw new Error('Không lấy được khóa push của hệ thống');
  const data = await res.json() as { publicKey?: string };
  if (!data.publicKey) throw new Error('Khóa push chưa được cấu hình trên server');
  return data.publicKey;
}

export async function registerAppServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) return null;
  return navigator.serviceWorker.register('/sw.js', { scope: '/' });
}

export async function getBrowserPushSubscription(): Promise<PushSubscription | null> {
  if (!isPushSupported() || Notification.permission !== 'granted') return null;
  try {
    const registration = await navigator.serviceWorker.ready;
    return registration.pushManager.getSubscription();
  } catch {
    return null;
  }
}

export async function hasBrowserPushSubscription(): Promise<boolean> {
  return !!(await getBrowserPushSubscription());
}

export async function getPushPermission(): Promise<NotificationPermission> {
  if (!isPushSupported()) return 'denied';
  return Notification.permission;
}

export type SubscribeWebPushResult = {
  subscription: PushSubscription | null;
  testPushWarning?: string;
};

function formatSubscribeTestWarning(testPush?: PushDeliverResult): string {
  if (!testPush) return '';
  if (testPush.skipped) {
    return 'Đã đăng ký thiết bị. Server chưa cấu hình VAPID — liên hệ quản trị.';
  }
  if ((testPush.sent || 0) > 0) return '';
  const detail = testPush.errors?.[0];
  if (detail) {
    return `Đã đăng ký thiết bị. Push thử chưa tới (${detail}). Thu nhỏ app hoặc khóa màn hình rồi bấm "Gửi thử push" trong Hồ sơ.`;
  }
  return 'Đã đăng ký thiết bị. Push thử chưa tới — thu nhỏ app hoặc khóa màn hình rồi bấm "Gửi thử push" trong Hồ sơ.';
}

export async function subscribeToWebPush(staffKey: string): Promise<SubscribeWebPushResult> {
  if (!isPushSupported()) {
    throw new Error('Thiết bị hoặc trình duyệt không hỗ trợ push');
  }
  if (isIosDevice() && !isStandaloneDisplayMode()) {
    throw new Error('Trên iPhone, hãy Thêm vào Màn hình chính trước khi bật push');
  }

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    return { subscription: null };
  }

  const registration = await registerAppServiceWorker();
  if (!registration) {
    throw new Error('Không đăng ký được service worker — thử tải lại app');
  }

  await navigator.serviceWorker.ready;

  const publicKey = await fetchVapidPublicKey();

  let subscription = await registration.pushManager.getSubscription();
  if (subscription) {
    await subscription.unsubscribe().catch(() => undefined);
  }

  try {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Không tạo được push subscription';
    throw new Error(message.includes('not allowed') ? 'iOS chưa cho phép push — kiểm tra Cài đặt → Thông báo' : message);
  }

  const json = subscription.toJSON();
  const token = localStorage.getItem('CHD_AUTH_TOKEN') || '';
  const res = await pushNativeFetch('/api/push/subscribe', {
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
    await subscription.unsubscribe().catch(() => undefined);
    const errBody = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(errBody.error || 'Không thể đăng ký thiết bị nhận thông báo');
  }

  const subscribeData = await res.json().catch(() => ({})) as {
    subscribed?: boolean;
    testPush?: PushDeliverResult;
  };

  return {
    subscription,
    testPushWarning: formatSubscribeTestWarning(subscribeData.testPush),
  };
}

export async function unsubscribeFromWebPush(staffKey: string): Promise<void> {
  if (!('serviceWorker' in navigator)) return;
  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();
  if (!subscription) return;

  const endpoint = subscription.endpoint;
  const token = localStorage.getItem('CHD_AUTH_TOKEN') || '';
  await pushNativeFetch('/api/push/unsubscribe', {
    method: 'DELETE',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ StaffKey: staffKey, endpoint }),
  });

  await subscription.unsubscribe();
}

export async function repairPushRegistration(staffKey: string): Promise<SubscribeWebPushResult> {
  if (!isPushSupported() || Notification.permission !== 'granted') {
    throw new Error('Chưa được phép gửi thông báo trên thiết bị này');
  }

  const existing = await getBrowserPushSubscription();
  if (existing) {
    const synced = await syncExistingPushSubscription(staffKey);
    if (synced) {
      return { subscription: existing };
    }
  }

  return subscribeToWebPush(staffKey);
}

export async function reregisterPushDevice(staffKey: string): Promise<SubscribeWebPushResult> {
  await unsubscribeFromWebPush(staffKey).catch(() => undefined);
  return subscribeToWebPush(staffKey);
}

export async function syncExistingPushSubscription(staffKey: string): Promise<boolean> {
  if (!isPushSupported() || Notification.permission !== 'granted') return false;
  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();
  if (!subscription) return false;

  const json = subscription.toJSON();
  const token = localStorage.getItem('CHD_AUTH_TOKEN') || '';
  const res = await pushNativeFetch('/api/push/subscribe', {
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

export type PushStatusSnapshot = {
  configured: boolean;
  serverSubscribed: boolean;
  browserSubscribed: boolean;
  subscribed: boolean;
  needsReregister: boolean;
  permission: NotificationPermission;
};

export async function fetchPushStatus(staffKey?: string): Promise<PushStatusSnapshot> {
  const permission = isPushSupported() ? Notification.permission : 'denied';
  const browserSubscribed = await hasBrowserPushSubscription();
  const token = localStorage.getItem('CHD_AUTH_TOKEN') || '';
  const staffQuery = staffKey ? `?staffKey=${encodeURIComponent(staffKey)}` : '';
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await pushNativeFetch(`/api/push/status${staffQuery}`, { headers });
  if (!res.ok) {
    return {
      configured: false,
      serverSubscribed: false,
      browserSubscribed,
      subscribed: false,
      needsReregister: false,
      permission,
    };
  }
  const data = await res.json() as { configured?: boolean; subscribed?: boolean };
  const serverSubscribed = !!data.subscribed;
  const subscribed = serverSubscribed && browserSubscribed;
  const needsReregister = permission === 'granted' && serverSubscribed && !browserSubscribed;
  return {
    configured: !!data.configured,
    serverSubscribed,
    browserSubscribed,
    subscribed,
    needsReregister,
    permission,
  };
}

export type PushDeliverResult = {
  sent?: number;
  removed?: number;
  skipped?: boolean;
  attempted?: number;
  needsResubscribe?: boolean;
  errors?: string[];
};

export async function sendTestPush(staffKey: string): Promise<PushDeliverResult> {
  const token = localStorage.getItem('CHD_AUTH_TOKEN') || '';
  const res = await pushNativeFetch('/api/push/test', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ StaffKey: staffKey }),
  });
  const data = await res.json().catch(() => ({})) as PushDeliverResult & { error?: string };
  if (!res.ok) {
    throw new Error(data.error || `HTTP ${res.status}`);
  }
  return data;
}

export function formatPushDeliverIssue(result: PushDeliverResult): string {
  if (result.skipped) {
    return 'Server chưa cấu hình VAPID. Liên hệ quản trị viên.';
  }
  if ((result.attempted || 0) === 0) {
    return 'Chưa đăng ký thiết bị nào. Hãy bấm Bật thông báo lại.';
  }
  if (result.needsResubscribe) {
    return 'Đăng ký push đã hết hạn (thường sau deploy server mới). Hãy Tắt rồi Bật lại thông báo trong Hồ sơ.';
  }
  if ((result.sent || 0) === 0) {
    return result.errors?.[0] || 'Không gửi được push tới thiết bị.';
  }
  return '';
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
