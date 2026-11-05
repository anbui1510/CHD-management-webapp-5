/** localStorage key to force mobile or desktop chrome. */
export const UI_MODE_STORAGE_KEY = 'lichkhoa_ui_mode';

/** Default breakpoint for phone / narrow tablets (px). */
export const MOBILE_BREAKPOINT_PX = 768;

/**
 * Best-effort CSS viewport width.
 * On iOS "Request Desktop Website", layout width can look wide while
 * `screen.width` stays phone-sized — prefer the smaller phone signal.
 */
export function readViewportWidth(win = typeof window !== 'undefined' ? window : null) {
  if (!win) return 1200;
  const docEl = win.document?.documentElement;
  const candidates = [
    win.innerWidth,
    docEl?.clientWidth,
    win.visualViewport?.width
  ].filter((n) => Number.isFinite(n) && n > 0);
  let width = candidates.length ? Math.min(...candidates) : 1200;
  const screenW = win.screen?.width;
  if (Number.isFinite(screenW) && screenW > 0 && screenW <= MOBILE_BREAKPOINT_PX) {
    width = Math.min(width, screenW);
  }
  return width;
}

/**
 * @param {{ width: number, forced?: string|null, coarsePointer?: boolean }} input
 * @returns {'mobile'|'desktop'}
 */
export function resolveUiMode({ width, forced, coarsePointer } = {}) {
  const mode = String(forced || '').trim().toLowerCase();
  if (mode === 'mobile' || mode === 'desktop') return mode;
  const w = Number(width);
  if (!Number.isFinite(w)) return 'desktop';
  if (w <= MOBILE_BREAKPOINT_PX) return 'mobile';
  // Large phone / small tablet in landscape with touch
  if (coarsePointer && w <= 1024) return 'mobile';
  return 'desktop';
}

export function readForcedUiMode(storage = typeof localStorage !== 'undefined' ? localStorage : null) {
  try {
    return storage?.getItem(UI_MODE_STORAGE_KEY) || null;
  } catch {
    return null;
  }
}

export function writeForcedUiMode(mode, storage = typeof localStorage !== 'undefined' ? localStorage : null) {
  try {
    if (!storage) return;
    if (mode === 'mobile' || mode === 'desktop') storage.setItem(UI_MODE_STORAGE_KEY, mode);
    else storage.removeItem(UI_MODE_STORAGE_KEY);
  } catch {
    /* ignore quota / private mode */
  }
}
