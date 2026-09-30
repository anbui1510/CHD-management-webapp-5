/**
 * iOS PWA (Add to Home Screen) often reports a “lying” viewport shorter than
 * the physical screen, leaving a chin below position:fixed bottom bars. The
 * chin paints with the document background (#0a0a0a in our boot CSS) — the
 * black strip under Home/Thêm. This module:
 *  1) measures that gap and exposes --app-vh / --ios-bottom-gap
 *  2) paints html/body white so the chin matches the tab bar (Facebook-like)
 */

function isStandaloneDisplayMode(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function readSafeAreaInsetBottomPx(): number {
  const probe = document.createElement('div');
  probe.style.cssText =
    'position:fixed;bottom:0;left:0;visibility:hidden;padding-bottom:env(safe-area-inset-bottom,0px);pointer-events:none;';
  document.body.appendChild(probe);
  const px = parseFloat(getComputedStyle(probe).paddingBottom) || 0;
  probe.remove();
  return px;
}

export function applyMobileViewportMetrics(): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  const root = document.documentElement;
  const vv = window.visualViewport;
  let layoutVh = Math.round(vv?.height ?? window.innerHeight);
  const offsetTop = Math.round(vv?.offsetTop ?? 0);
  const isPortrait = window.innerHeight >= window.innerWidth;
  let bottomGap = 0;

  if (isStandaloneDisplayMode() && isPortrait && !document.body?.dataset.keyboardOpen) {
    // Physical CSS pixel height of the short edge…long edge pair in portrait.
    const physicalH = Math.round(Math.max(window.screen.height || 0, window.screen.width || 0));
    const reported = layoutVh + offsetTop;
    const gap = physicalH > 0 ? physicalH - reported : 0;
    // Known WebKit chin is typically ~34–80px; ignore keyboard-sized gaps.
    if (gap > 12 && gap < 100) {
      bottomGap = gap;
      layoutVh += gap;
    }
  }

  root.style.setProperty('--app-vh', `${layoutVh}px`);

  // Only expose ios-gap when safe-area is missing/too small (avoid double inset).
  const safeBottom = readSafeAreaInsetBottomPx();
  const effectiveGap = bottomGap > safeBottom + 4 ? bottomGap : 0;
  root.style.setProperty('--ios-bottom-gap', `${effectiveGap}px`);

  // Keep document chin the same white as the tab bar (never boot black).
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

  // Re-measure after first paints — iOS often lies on cold start.
  const timers = [50, 150, 300, 500, 800, 1200].map((ms) =>
    window.setTimeout(applyMobileViewportMetrics, ms)
  );

  window.addEventListener('resize', onResize);
  window.addEventListener('orientationchange', onResize);
  window.visualViewport?.addEventListener('resize', onResize);
  window.visualViewport?.addEventListener('scroll', onResize);

  // Expose for debugging / future keyboard hooks
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

/** Optional: call when virtual keyboard opens so we do not inflate --app-vh. */
export function setMobileKeyboardOpen(open: boolean): void {
  if (typeof document === 'undefined' || !document.body) return;
  if (open) document.body.dataset.keyboardOpen = '1';
  else delete document.body.dataset.keyboardOpen;
  applyMobileViewportMetrics();
}

export function getSafeAreaInsetBottomPx(): number {
  if (typeof document === 'undefined') return 0;
  try {
    return readSafeAreaInsetBottomPx();
  } catch {
    return 0;
  }
}
