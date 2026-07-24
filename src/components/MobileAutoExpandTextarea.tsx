import { useCallback, useEffect, useRef } from 'react';
import { useIsMobile } from '../hooks/useMediaQuery';

type MobileAutoExpandTextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement> & {
  minRows?: number;
};

export function MobileAutoExpandTextarea({
  minRows = 2,
  className = '',
  value,
  onChange,
  rows,
  ...rest
}: MobileAutoExpandTextareaProps) {
  const isMobile = useIsMobile();
  const ref = useRef<HTMLTextAreaElement>(null);

  const adjustHeight = useCallback(() => {
    const el = ref.current;
    if (!el || !isMobile) return;

    el.style.height = 'auto';
    const styles = window.getComputedStyle(el);
    const lineHeight = Number.parseFloat(styles.lineHeight) || 20;
    const paddingTop = Number.parseFloat(styles.paddingTop) || 0;
    const paddingBottom = Number.parseFloat(styles.paddingBottom) || 0;
    const minHeight = lineHeight * minRows + paddingTop + paddingBottom;
    el.style.height = `${Math.max(el.scrollHeight, minHeight)}px`;
  }, [isMobile, minRows]);

  useEffect(() => {
    adjustHeight();
  }, [adjustHeight, value]);

  const mobileClassName = isMobile ? 'resize-none overflow-hidden' : 'resize-y';

  return (
    <textarea
      ref={ref}
      rows={rows ?? minRows}
      value={value}
      onChange={(event) => {
        onChange?.(event);
        if (isMobile) {
          requestAnimationFrame(adjustHeight);
        }
      }}
      className={`${className} ${mobileClassName}`.trim()}
      {...rest}
    />
  );
}
