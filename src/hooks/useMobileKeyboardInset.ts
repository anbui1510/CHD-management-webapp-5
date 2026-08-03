import { useEffect, useState } from 'react';
import { useIsMobile } from './useMediaQuery';

export type MobileViewportMetrics = {
  /** Estimated keyboard overlap height in px (0 when keyboard closed). */
  keyboardInset: number;
  /** Visible viewport height in px (`visualViewport.height` or `window.innerHeight`). */
  viewportHeight: number;
  /** Top offset of the visible viewport (`visualViewport.offsetTop`). */
  viewportOffsetTop: number;
};

/**
 * Tracks iOS/Android virtual keyboard overlap via the Visual Viewport API.
 * Used to pin bottom-aligned modals directly above the keyboard.
 */
export function useMobileKeyboardInset(active = true): MobileViewportMetrics {
  const isMobile = useIsMobile();
  const [metrics, setMetrics] = useState<MobileViewportMetrics>({
    keyboardInset: 0,
    viewportHeight: typeof window !== 'undefined' ? window.innerHeight : 0,
    viewportOffsetTop: 0
  });

  useEffect(() => {
    if (!active || !isMobile || typeof window === 'undefined') {
      setMetrics({
        keyboardInset: 0,
        viewportHeight: window.innerHeight,
        viewportOffsetTop: 0
      });
      return;
    }

    const update = () => {
      const vv = window.visualViewport;
      if (!vv) {
        setMetrics({
          keyboardInset: 0,
          viewportHeight: window.innerHeight,
          viewportOffsetTop: 0
        });
        return;
      }

      const keyboardInset = Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop));
      setMetrics({
        keyboardInset,
        viewportHeight: Math.round(vv.height),
        viewportOffsetTop: Math.round(vv.offsetTop)
      });
    };

    update();
    const vv = window.visualViewport;
    vv?.addEventListener('resize', update);
    vv?.addEventListener('scroll', update);
    window.addEventListener('orientationchange', update);

    return () => {
      vv?.removeEventListener('resize', update);
      vv?.removeEventListener('scroll', update);
      window.removeEventListener('orientationchange', update);
    };
  }, [active, isMobile]);

  return metrics;
}
