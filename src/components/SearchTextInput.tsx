import React, { useEffect, useRef, useState } from 'react';
import { setMobileKeyboardOpen } from '../bootstrap/mobileViewport';

export interface SearchTextInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> {
  value: string;
  onChange: (value: string) => void;
  /** Debounce trước khi đẩy giá trị lên parent. Mặc định 0 — cập nhật ngay như Hồ sơ bệnh án. */
  debounceMs?: number;
}

/**
 * Ô tìm kiếm: state local cho IME, parent nhận giá trị ngay để lọc danh sách.
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

  const pushToParent = (next: string) => {
    onChangeRef.current(next);
  };

  const emit = (next: string) => {
    if (timerRef.current != null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    pushToParent(next);
  };

  const schedule = (next: string) => {
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
        const next = event.currentTarget.value;
        setLocalValue(next);
        emit(next);
        onBlur?.(event);
      }}
    />
  );
}

export default SearchTextInput;
