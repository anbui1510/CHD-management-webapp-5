import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';

export interface ViewSubheaderConfig {
  title: string;
  icon?: React.ReactNode;
  searchValue?: string;
  onSearchChange?: (value: string) => void;
  searchPlaceholder?: string;
  /** Mặc định true khi có onSearchChange. */
  showSearch?: boolean;
  actions?: React.ReactNode;
}

interface ViewSubheaderContextValue {
  config: ViewSubheaderConfig | null;
  setConfig: (config: ViewSubheaderConfig | null) => void;
}

const ViewSubheaderContext = createContext<ViewSubheaderContextValue | null>(null);

export function ViewSubheaderProvider({ children }: { children: React.ReactNode }) {
  const [config, setConfigState] = useState<ViewSubheaderConfig | null>(null);

  const setConfig = useCallback((next: ViewSubheaderConfig | null) => {
    setConfigState(next);
  }, []);

  const value = useMemo(() => ({ config, setConfig }), [config, setConfig]);

  return (
    <ViewSubheaderContext.Provider value={value}>
      {children}
    </ViewSubheaderContext.Provider>
  );
}

export function useViewSubheaderContext() {
  const ctx = useContext(ViewSubheaderContext);
  if (!ctx) {
    throw new Error('useViewSubheaderContext must be used within ViewSubheaderProvider');
  }
  return ctx;
}
