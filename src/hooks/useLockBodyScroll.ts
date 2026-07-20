import { useEffect, type RefObject } from 'react';

/**
 * Locks page scroll while a modal/drawer is open.
 * Uses position:fixed on body to prevent iOS Safari scroll bleed-through.
 */
export function useLockBodyScroll(active = true): void {
  useEffect(() => {
    if (!active || typeof document === 'undefined') return;

    const scrollY = window.scrollY;
    const { body, documentElement: html } = document;
    const prevBodyOverflow = body.style.overflow;
    const prevBodyPosition = body.style.position;
    const prevBodyTop = body.style.top;
    const prevBodyWidth = body.style.width;
    const prevHtmlOverflow = html.style.overflow;

    body.style.overflow = 'hidden';
    body.style.position = 'fixed';
    body.style.top = `-${scrollY}px`;
    body.style.width = '100%';
    html.style.overflow = 'hidden';

    return () => {
      body.style.overflow = prevBodyOverflow;
      body.style.position = prevBodyPosition;
      body.style.top = prevBodyTop;
      body.style.width = prevBodyWidth;
      html.style.overflow = prevHtmlOverflow;
      window.scrollTo(0, scrollY);
    };
  }, [active]);
}

/**
 * Prevents touch scrolling on the page except inside allowed scroll containers.
 */
export function usePreventBackgroundTouchScroll(
  scrollContainerRef: RefObject<HTMLElement | null>,
  active = true
): void {
  useEffect(() => {
    if (!active || typeof document === 'undefined') return;

    const onTouchMove = (event: TouchEvent) => {
      const container = scrollContainerRef.current;
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (container && (container === target || container.contains(target))) return;
      event.preventDefault();
    };

    document.addEventListener('touchmove', onTouchMove, { passive: false });
    return () => document.removeEventListener('touchmove', onTouchMove);
  }, [active, scrollContainerRef]);
}
