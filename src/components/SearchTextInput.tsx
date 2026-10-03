import React, { useEffect, useRef, useState } from 'react';
import { setMobileKeyboardOpen } from '../bootstrap/mobileViewport';

export interface SearchTextInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> {
  value: string;
  onChange: (value: string) => void;
  /** Debounce trước khi đẩy giá trị lên parent (lọc nặng). Mặc định 80ms. */
  debounceMs?: number;
}

/**
 * Ô tìm kiếm:
 * - Gõ trên state local để IME tiếng Việt không bị cắt
 * - Vẫn báo parent cả khi đang composition, để bộ lọc chạy
 * - Chỉ nhận value từ parent khi ô không focus (nút Xóa)
 */
export function SearchTextInput({
  value,
  onChange,
  debounceMs = 80,
  onBlur,
  onFocus,
  ...rest
}: SearchTextInputProps) {
  const [localValue, setLocalValue] = useState(value);
  const focusedRef = useRef(false);
  const timerRef = useRef<number | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    if (focusedRef.current) return;
    setLocalValue(value);
  }, [value]);

  useEffect(() => {
    return () => {
      if (timerRef.current != null) window.clearTimeout(timerRef.current);
    };
  }, []);

  const emit = (next: string) => {
    if (timerRef.current != null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    onChangeRef.current(next);
  };

  const schedule = (next: string) => {
    if (timerRef.current != null) window.clearTimeout(timerRef.current);
    if (debounceMs <= 0) {
      emit(next);
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
      onFocus={(event) => {
        focusedRef.current = true;
        setMobileKeyboardOpen(true);
        onFocus?.(event);
      }}
      onChange={(event) => {
        const next = event.target.value;
        setLocalValue(next);
        schedule(next);
      }}
      onCompositionEnd={(event) => {
        const next = event.currentTarget.value;
        setLocalValue(next);
        emit(next);
      }}
      onBlur={(event) => {
        focusedRef.current = false;
        setMobileKeyboardOpen(false);
        emit(localValue);
        onBlur?.(event);
      }}
    />
  );
}

export default SearchTextInput;
