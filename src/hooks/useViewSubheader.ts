import React, { useEffect, useMemo } from 'react';
import { useViewSubheaderContext, type ViewSubheaderConfig } from '../context/ViewSubheaderContext';

/** View gọi hook này để đăng ký subheader desktop; tự clear khi unmount. */
export function useViewSubheader(input: ViewSubheaderConfig | null) {
  const { setConfig } = useViewSubheaderContext();

  const config = useMemo(() => input, [
    input?.title,
    input?.searchValue,
    input?.searchPlaceholder,
    input?.showSearch,
    input?.icon,
    input?.actions,
    input?.onSearchChange,
  ]);

  useEffect(() => {
    setConfig(config);
    return () => setConfig(null);
  }, [setConfig, config]);
}
