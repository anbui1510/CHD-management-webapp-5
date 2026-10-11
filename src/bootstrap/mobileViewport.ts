/**
 * Mobile viewport helpers: keyboard overlap + optional iOS metrics.
 * Shell height stays CSS `100dvh` — không set chiều cao shell bằng JS (tránh lệch mọi view).
 */

function detectKeyboardOpen(vv: VisualViewport | null, layoutInnerH: number): boolean {
  if (!vv) return false;
  const visibleH = Math.round(vv.height);
  const offsetTop = Math.round(vv.offsetTop);
  const overlap = Math.max(0, layoutInnerH - visibleH - offsetTop);
  return overlap > 80;
}

export function applyMobileViewportMetrics(): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  const root = document.documentElement;
  const vv = window.visualViewport;
  const layoutInnerH = window.innerHeight;
  const visibleH = Math.round(vv?.height ?? layoutInnerH);
  const offsetTop = Math.round(vv?.offsetTop ?? 0);
  const keyboardOpen =
    document.body?.dataset.keyboardOpen === '1' || detectKeyboardOpen(vv, layoutInnerH);

  if (document.body) {
    if (keyboardOpen) document.body.dataset.keyboardOpen = '1';
    else delete document.body.dataset.keyboardOpen;
  }

  root.style.setProperty(
    '--mobile-keyboard-overlap',
    keyboardOpen ? `${Math.max(0, layoutInnerH - visibleH - offsetTop)}px` : '0px'
  );

  /* Không dùng --ios-bottom-gap / padding nav — gây dải trắng lớn dưới tab bar trên PWA. */
  root.style.setProperty('--ios-bottom-gap', '0px');

  const chinFill = '#ffffff';
  root.style.backgroundColor = chinFill;
  if (document.body) {
    document.body.style.backgroundColor = chinFill;
    document.body.style.minHeight = '';
  }

  const standalone =
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
  if (standalone) root.dataset.displayMode = 'standalone';
  else delete root.dataset.displayMode;
}

export function installMobileViewportFix(): () => void {
  if (typeof window === 'undefined') return () => undefined;

  const onResize = () => applyMobileViewportMetrics();
  applyMobileViewportMetrics();

  const timers = [50, 150, 300, 500].map((ms) => window.setTimeout(applyMobileViewportMetrics, ms));

  window.addEventListener('resize', onResize);
  window.addEventListener('orientationchange', onResize);
  window.visualViewport?.addEventListener('resize', onResize);
  window.visualViewport?.addEventListener('scroll', onResize);

  (window as unknown as { __CHD_applyMobileViewport?: () => void }).__CHD_applyMobileViewport =
    applyMobileViewportMetrics;

  return () => {
    timers.forEach((id) => window.clearTimeout(id));
    window.removeEventListener('resize', onResize);
    window.removeEventListener('orientationchange', onResize);
    window.visualViewport?.removeEventListener('resize', onResize);
    window.visualViewport?.removeEventListener('scroll', onResize);
  };
}

export function setMobileKeyboardOpen(open: boolean): void {
  if (typeof document === 'undefined' || !document.body) return;
  if (open) document.body.dataset.keyboardOpen = '1';
  else delete document.body.dataset.keyboardOpen;
  applyMobileViewportMetrics();
}
