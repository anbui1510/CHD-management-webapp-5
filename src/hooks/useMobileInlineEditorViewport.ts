import { useEffect, useState, type RefObject } from 'react';
import { setMobileKeyboardOpen } from '../bootstrap/mobileViewport';
import { useMobileKeyboardInset } from './useMobileKeyboardInset';

type Options = {
  /** When false, skips listeners and returns idle metrics. */
  active: boolean;
  /** Element whose top edge anchors available height (usually the editor column shell). */
  anchorRef: RefObject<HTMLElement | null>;
  /** Scroll container for form fields (single scroll region). */
  scrollRef: RefObject<HTMLElement | null>;
  /** Optional footer inside the panel (action bar) — kept visible above the keyboard. */
  footerSelector?: string;
};

/**
 * Mobile inline form editor: constrain panel height above the virtual keyboard and
 * scroll focused fields into the visible region (avoids iOS layout “jump” + white gap).
 */
export function useMobileInlineEditorViewport({
  active,
  anchorRef,
  scrollRef,
  footerSelector = '[data-mobile-editor-footer]',
}: Options) {
  const { keyboardInset, viewportHeight } = useMobileKeyboardInset(active);
  const keyboardOpen = active && keyboardInset > 80;
  const [panelMaxHeight, setPanelMaxHeight] = useState<number | undefined>();

  useEffect(() => {
    if (!active) {
      setPanelMaxHeight(undefined);
      return;
    }

    const measure = () => {
      const anchor = anchorRef.current;
      if (!anchor) return;
      const vv = window.visualViewport;
      const visibleBottom = vv ? vv.offsetTop + vv.height : window.innerHeight;
      const top = anchor.getBoundingClientRect().top;
      const next = Math.floor(visibleBottom - top - 2);
      setPanelMaxHeight(keyboardOpen ? Math.max(next, 160) : undefined);
    };

    measure();
    const vv = window.visualViewport;
    vv?.addEventListener('resize', measure);
    vv?.addEventListener('scroll', measure);
    window.addEventListener('resize', measure);
    return () => {
      vv?.removeEventListener('resize', measure);
      vv?.removeEventListener('scroll', measure);
      window.removeEventListener('resize', measure);
    };
  }, [active, anchorRef, keyboardOpen, viewportHeight]);

  useEffect(() => {
    if (!active) return;
    const scrollEl = scrollRef.current;
    if (!scrollEl) return;

    const onFocusIn = (event: FocusEvent) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      if (!target.matches('input, textarea, select')) return;

      setMobileKeyboardOpen(true);

      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const vv = window.visualViewport;
          const visibleTop = vv?.offsetTop ?? 0;
          const visibleBottom = (vv?.offsetTop ?? 0) + (vv?.height ?? window.innerHeight);
          const rect = target.getBoundingClientRect();
          const footer = scrollEl.parentElement?.querySelector(footerSelector);
          const footerTop = footer?.getBoundingClientRect().top ?? visibleBottom;
          const safeBottom = Math.min(footerTop, visibleBottom) - 12;

          if (rect.bottom > safeBottom) {
            scrollEl.scrollTop += rect.bottom - safeBottom;
          }
          if (rect.top < visibleTop + 8) {
            scrollEl.scrollTop -= visibleTop + 8 - rect.top;
          }
        });
      });
    };

    const onFocusOut = () => {
      window.setTimeout(() => {
        const activeEl = document.activeElement;
        if (activeEl instanceof HTMLElement && scrollEl.contains(activeEl)) {
          if (activeEl.matches('input, textarea, select')) return;
        }
        setMobileKeyboardOpen(false);
      }, 120);
    };

    scrollEl.addEventListener('focusin', onFocusIn);
    scrollEl.addEventListener('focusout', onFocusOut);
    return () => {
      scrollEl.removeEventListener('focusin', onFocusIn);
      scrollEl.removeEventListener('focusout', onFocusOut);
    };
  }, [active, scrollRef, footerSelector]);

  useEffect(() => {
    if (!active) {
      setMobileKeyboardOpen(false);
    }
  }, [active]);

  return { keyboardOpen, keyboardInset, viewportHeight, panelMaxHeight };
}
