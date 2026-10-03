import React, { useEffect, useRef, useState } from 'react';

export interface SearchTextInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> {
  value: string;
  onChange: (value: string) => void;
  /** Debounce trước khi đẩy giá trị lên parent (lọc nặng). Mặc định 180ms. */
  debounceMs?: number;
}

/**
 * Ô tìm kiếm chống giật IME tiếng Việt:
 * - Giữ state local để gõ mượt, không chờ parent re-render
 * - Không flush lên parent khi đang composition
 * - Debounce onChange để lọc danh sách lớn không chạy mỗi phím
 */
export function SearchTextInput({
  value,
  onChange,
  debounceMs = 180,
  onBlur,
  ...rest
}: SearchTextInputProps) {
  const [localValue, setLocalValue] = useState(value);
  const composingRef = useRef(false);
  const timerRef = useRef<number | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    if (composingRef.current) return;
    setLocalValue(value);
  }, [value]);

  useEffect(() => {
    return () => {
      if (timerRef.current != null) window.clearTimeout(timerRef.current);
    };
  }, []);

  const flush = (next: string) => {
    if (timerRef.current != null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (next !== value) onChangeRef.current(next);
  };

  const scheduleFlush = (next: string) => {
    if (timerRef.current != null) window.clearTimeout(timerRef.current);
    if (debounceMs <= 0) {
      flush(next);
      return;
    }
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      onChangeRef.current(next);
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
      onBlur={(event) => {
        if (!composingRef.current) flush(localValue);
        onBlur?.(event);
      }}
    />
  );
}

export default SearchTextInput;
