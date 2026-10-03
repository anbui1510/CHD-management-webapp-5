import React, { useEffect, useRef } from 'react';
import { useViewSubheaderContext, type ViewSubheaderConfig } from '../context/ViewSubheaderContext';

/** View gọi hook này để đăng ký subheader desktop; chỉ clear khi unmount view. */
export function useViewSubheader(input: ViewSubheaderConfig | null) {
  const { setConfig } = useViewSubheaderContext();
  const inputRef = useRef(input);
  inputRef.current = input;

  // Cập nhật config khi nội dung đổi — không set null giữa chừng (tránh unmount ô search / mất debounce).
  useEffect(() => {
    setConfig(input);
  }, [
    setConfig,
    input?.title,
    input?.searchValue,
    input?.searchPlaceholder,
    input?.showSearch,
    input?.icon,
    input?.actions,
    input?.onSearchChange,
  ]);

  // Chỉ clear khi view thực sự unmount.
  useEffect(() => {
    return () => setConfig(null);
  }, [setConfig]);
}
