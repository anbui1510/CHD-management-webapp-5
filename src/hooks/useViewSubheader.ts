import { useEffect, useRef } from 'react';
import { useViewSubheaderContext, type ViewSubheaderConfig } from '../context/ViewSubheaderContext';

/** View gọi hook này để đăng ký subheader desktop; chỉ clear khi unmount view. */
export function useViewSubheader(input: ViewSubheaderConfig | null) {
  const { setConfig } = useViewSubheaderContext();
  const inputRef = useRef(input);
  inputRef.current = input;

  useEffect(() => {
    setConfig(inputRef.current);
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

  useEffect(() => {
    return () => setConfig(null);
  }, [setConfig]);
}
