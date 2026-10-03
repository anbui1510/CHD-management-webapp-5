import React, { useEffect, useRef, useState } from 'react';
import { setMobileKeyboardOpen } from '../bootstrap/mobileViewport';

export interface SearchTextInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> {
  value: string;
  onChange: (value: string) => void;
  /** Debounce trước khi đẩy giá trị lên parent (lọc nặng). Mặc định 0 = cập nhật ngay. */
  debounceMs?: number;
}

/**
 * Ô tìm kiếm chống giật IME tiếng Việt:
 * - Giữ state local để gõ mượt, không chờ parent re-render
 * - Không flush lên parent khi đang composition
 * - Debounce tùy chọn (mặc định tắt) — parent nên dùng useDeferredValue khi lọc nặng
 */
export function SearchTextInput({
  value,
  onChange,
  debounceMs = 0,
  onBlur,
  onFocus,
  ...rest
}: SearchTextInputProps) {
  const [localValue, setLocalValue] = useState(value);
  const composingRef = useRef(false);
  const focusedRef = useRef(false);
  const timerRef = useRef<number | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    if (composingRef.current || focusedRef.current) return;
    setLocalValue(value);
  }, [value]);

  useEffect(() => {
    return () => {
      if (timerRef.current != null) window.clearTimeout(timerRef.current);
    };
  }, []);

  const pushToParent = (next: string) => {
    onChangeRef.current(next);
  };

  const flush = (next: string) => {
    if (timerRef.current != null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (next !== value) pushToParent(next);
  };

  const scheduleFlush = (next: string) => {
    if (debounceMs <= 0) {
      pushToParent(next);
      return;
    }
    if (timerRef.current != null) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      pushToParent(next);
    }, debounceMs);
  };

  return (
    <input
      {...rest}
      value={localValue}
      onChange={(event) => {
        const next = event.target.value;
        setLocalValue(next);
        if (!composingRef.current) scheduleFlush(next);
      }}
      onCompositionStart={() => {
        composingRef.current = true;
      }}
      onCompositionEnd={(event) => {
        composingRef.current = false;
        const next = event.currentTarget.value;
        setLocalValue(next);
        flush(next);
      }}
      onFocus={(event) => {
        focusedRef.current = true;
        setMobileKeyboardOpen(true);
        onFocus?.(event);
      }}
      onBlur={(event) => {
        focusedRef.current = false;
        setMobileKeyboardOpen(false);
        if (!composingRef.current) flush(localValue);
        onBlur?.(event);
      }}
    />
  );
}

export default SearchTextInput;
