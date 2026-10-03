import React, { useEffect, useRef, useState } from 'react';

export interface SearchTextInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> {
  value: string;
  onChange: (value: string) => void;
  /** Debounce trước khi đẩy giá trị lên parent (lọc nặng). Mặc định 120ms. */
  debounceMs?: number;
}

/**
 * Ô tìm kiếm chống giật IME tiếng Việt:
 * - Giữ state local để gõ mượt, không chờ parent re-render
 * - Không flush lên parent khi đang composition
 * - Debounce onChange để lọc danh sách lớn không chạy mỗi phím
 * - Flush giá trị đang chờ khi unmount (tránh mất search)
 */
export function SearchTextInput({
  value,
  onChange,
  debounceMs = 120,
  onBlur,
  ...rest
}: SearchTextInputProps) {
  const [localValue, setLocalValue] = useState(value);
  const composingRef = useRef(false);
  const timerRef = useRef<number | null>(null);
  const pendingRef = useRef(value);
  const valueRef = useRef(value);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  valueRef.current = value;

  useEffect(() => {
    // Chỉ sync từ parent khi không còn debounce pending (vd. bấm Xóa).
    if (composingRef.current) return;
    if (timerRef.current != null) return;
    if (value === pendingRef.current && value === localValue) return;
    pendingRef.current = value;
    setLocalValue(value);
  }, [value, localValue]);

  useEffect(() => {
    return () => {
      if (timerRef.current != null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
        const pending = pendingRef.current;
        if (pending !== valueRef.current) {
          onChangeRef.current(pending);
        }
      }
    };
  }, []);

  const flush = (next: string) => {
    if (timerRef.current != null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    pendingRef.current = next;
    if (next !== valueRef.current) {
      onChangeRef.current(next);
    }
  };

  const scheduleFlush = (next: string) => {
    pendingRef.current = next;
    if (timerRef.current != null) window.clearTimeout(timerRef.current);
    if (debounceMs <= 0) {
      flush(next);
      return;
    }
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      const pending = pendingRef.current;
      if (pending !== valueRef.current) {
        onChangeRef.current(pending);
      }
    }, debounceMs);
  };

  return (
    <input
      {...rest}
      value={localValue}
      onChange={(event) => {
        const next = event.target.value;
        pendingRef.current = next;
        setLocalValue(next);
        if (!composingRef.current) scheduleFlush(next);
      }}
      onCompositionStart={() => {
        composingRef.current = true;
      }}
      onCompositionEnd={(event) => {
        composingRef.current = false;
        const next = event.currentTarget.value;
        pendingRef.current = next;
        setLocalValue(next);
        flush(next);
      }}
      onBlur={(event) => {
        if (!composingRef.current) flush(pendingRef.current);
        onBlur?.(event);
      }}
    />
  );
}

export default SearchTextInput;
