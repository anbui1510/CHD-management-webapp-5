import type { ReactNode } from 'react';
import type { ActiveMenuId } from '../config/navigation';
import { getViewSubheaderTitle } from '../config/viewSubheaderTitles';
import type { ViewSubheaderConfig } from '../context/ViewSubheaderContext';
import { useViewSubheader } from './useViewSubheader';

type ModuleSubheaderOptions = Omit<ViewSubheaderConfig, 'title'>;

/** Đăng ký subheader desktop theo module id. */
export function useModuleSubheader(menuId: ActiveMenuId, options: ModuleSubheaderOptions = {}) {
  useViewSubheader({
    title: getViewSubheaderTitle(menuId),
    ...options,
  });
}

/** Subheader chỉ có tên view (không tìm kiếm). */
export function useModuleSubheaderTitleOnly(menuId: ActiveMenuId, icon?: ReactNode) {
  useModuleSubheader(menuId, { showSearch: false, icon });
}
