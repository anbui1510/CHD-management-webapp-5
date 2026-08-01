import { useCallback, useEffect, useRef, type TextareaHTMLAttributes } from 'react';
import { useIsMobile } from '../hooks/useMediaQuery';

type MobileAutoExpandTextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  /** Minimum visible rows on mobile (default 2). */
  minRows?: number;
  /** Minimum visible rows on desktop (default 1). */
  desktopMinRows?: number;
};

export function MobileAutoExpandTextarea({
  minRows = 2,
  desktopMinRows = 1,
  className = '',
  value,
  onChange,
  rows,
  ...rest
}: MobileAutoExpandTextareaProps) {
  const isMobile = useIsMobile();
  const ref = useRef<HTMLTextAreaElement>(null);
  const effectiveMinRows = isMobile ? minRows : desktopMinRows;

  const adjustHeight = useCallback(() => {
    const el = ref.current;
    if (!el) return;

    el.style.height = 'auto';
    const styles = window.getComputedStyle(el);
    const lineHeight = Number.parseFloat(styles.lineHeight) || 20;
    const paddingTop = Number.parseFloat(styles.paddingTop) || 0;
    const paddingBottom = Number.parseFloat(styles.paddingBottom) || 0;
    const minHeight = lineHeight * effectiveMinRows + paddingTop + paddingBottom;
    el.style.height = `${Math.max(el.scrollHeight, minHeight)}px`;
  }, [effectiveMinRows]);

  useEffect(() => {
    adjustHeight();
  }, [adjustHeight, value, isMobile]);

  return (
    <textarea
      ref={ref}
      rows={rows ?? effectiveMinRows}
      value={value}
      onChange={(event) => {
        onChange?.(event);
        requestAnimationFrame(adjustHeight);
      }}
      className={`${className} resize-none overflow-hidden`.trim()}
      {...rest}
    />
  );
}
