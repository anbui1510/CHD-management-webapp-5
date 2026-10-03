/**
 * iOS PWA (Add to Home Screen) often reports a “lying” viewport shorter than
 * the physical screen, leaving a chin below position:fixed bottom bars. The
 * chin paints with the document background (#0a0a0a in boot CSS) — the black
 * strip under Home/Thêm. This module:
 *  1) measures that gap and exposes --app-vh / --ios-bottom-gap
 *  2) paints html/body white so the chin matches the tab bar
 *  3) when the virtual keyboard is open, keeps layout height stable and hides bottom nav inset
 */

function isStandaloneDisplayMode(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function readSafeAreaInsetBottomPx(): number {
  if (typeof document === 'undefined' || !document.body) return 0;
  const probe = document.createElement('div');
  probe.style.cssText =
    'position:fixed;bottom:0;left:0;visibility:hidden;padding-bottom:env(safe-area-inset-bottom,0px);pointer-events:none;';
  document.body.appendChild(probe);
  const px = parseFloat(getComputedStyle(probe).paddingBottom) || 0;
  probe.remove();
  return px;
}

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

  const isPortrait = layoutInnerH >= window.innerWidth;
  let bottomGap = 0;

  // Khi bàn phím mở: giữ chiều cao layout (innerHeight) để header/ô tìm không bị ép mất.
  let layoutVh = keyboardOpen ? layoutInnerH : visibleH;

  if (!keyboardOpen && isStandaloneDisplayMode() && isPortrait) {
    const physicalH = Math.round(Math.max(window.screen.height || 0, window.screen.width || 0));
    const reported = visibleH + offsetTop;
    const gap = physicalH > 0 ? physicalH - reported : 0;
    // Known WebKit chin is typically ~34–80px; ignore keyboard-sized gaps.
    if (gap > 12 && gap < 100) {
      bottomGap = gap;
      layoutVh += gap;
    }
  }

  root.style.setProperty('--app-vh', `${layoutVh}px`);
  root.style.setProperty(
    '--mobile-keyboard-overlap',
    keyboardOpen ? `${Math.max(0, layoutInnerH - visibleH - offsetTop)}px` : '0px'
  );

  // Only expose ios-gap when safe-area is missing/too small (avoid double inset).
  const safeBottom = readSafeAreaInsetBottomPx();
  const effectiveGap = bottomGap > safeBottom + 4 ? bottomGap : 0;
  root.style.setProperty('--ios-bottom-gap', `${effectiveGap}px`);

  const chinFill = '#ffffff';
  root.style.backgroundColor = chinFill;
  if (document.body) {
    document.body.style.backgroundColor = chinFill;
    document.body.style.minHeight = 'var(--app-vh, 100dvh)';
  }
}

export function installMobileViewportFix(): () => void {
  if (typeof window === 'undefined') return () => undefined;

  const onResize = () => applyMobileViewportMetrics();
  applyMobileViewportMetrics();

  const timers = [50, 150, 300, 500, 800, 1200].map((ms) =>
    window.setTimeout(applyMobileViewportMetrics, ms)
  );

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
