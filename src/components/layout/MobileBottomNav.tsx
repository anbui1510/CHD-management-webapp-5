import React from 'react';
import { MoreHorizontal } from 'lucide-react';
import {
  ActiveMenuId,
  getMobileNavItem,
  getNavIcon,
  isBottomTabActive,
  isMoreMenuActive,
} from '../../config/navigation';

interface MobileBottomNavProps {
  activeMenu: ActiveMenuId;
  onNavigate: (menuId: ActiveMenuId) => void;
  onOpenMore: () => void;
  pendingStaffCount?: number;
  quickTabIds?: ActiveMenuId[];
}

export default function MobileBottomNav({
  activeMenu,
  onNavigate,
  onOpenMore,
  pendingStaffCount = 0,
  quickTabIds = [],
}: MobileBottomNavProps) {
  const moreActive = isMoreMenuActive(activeMenu, quickTabIds);

  return (
    <nav
      className="mobile-bottom-nav md:hidden fixed bottom-0 inset-x-0 z-40 bg-background border-t border-border pb-[var(--mobile-safe-bottom)]"
      aria-label="Điều hướng chính"
    >
      <div
        className="grid grid-cols-5 items-stretch"
        style={{ height: 'var(--mobile-bottom-nav-content)' }}
      >
        <button
          type="button"
          onClick={() => onNavigate('home')}
          className={`relative flex flex-col items-center justify-end gap-0.5 px-1 pt-1.5 pb-1 text-[10px] font-bold leading-none transition ${
            isBottomTabActive(activeMenu, 'home') ? 'text-primary' : 'text-muted-foreground'
          }`}
        >
          <span className={isBottomTabActive(activeMenu, 'home') ? 'text-primary' : 'text-muted-foreground'}>
            {getNavIcon('home', 'w-5 h-5')}
          </span>
          <span className="truncate max-w-full">Home</span>
        </button>

        {quickTabIds.map(tabId => {
          const tab = getMobileNavItem(tabId);
          const active = isBottomTabActive(activeMenu, tabId);
          return (
            <button
              key={tabId}
              type="button"
              onClick={() => onNavigate(tabId)}
              className={`relative flex flex-col items-center justify-end gap-0.5 px-1 pt-1.5 pb-1 text-[10px] font-bold leading-none transition ${
                active ? 'text-primary' : 'text-muted-foreground'
              }`}
            >
              <span className={active ? 'text-primary' : 'text-muted-foreground'}>
                {getNavIcon(tabId, 'w-5 h-5')}
              </span>
              <span className="truncate max-w-full">{tab.shortLabel || tab.label}</span>
              {tabId === 'results-staff' && pendingStaffCount > 0 && (
                <span className="absolute top-0.5 right-2 min-w-[16px] h-4 px-1 rounded-full bg-primary text-primary-foreground text-[8px] font-medium flex items-center justify-center">
                  {pendingStaffCount > 99 ? '99+' : pendingStaffCount}
                </span>
              )}
            </button>
          );
        })}

        <button
          type="button"
          onClick={onOpenMore}
          className={`relative flex flex-col items-center justify-end gap-0.5 px-1 pt-1.5 pb-1 text-[10px] font-bold leading-none transition ${
            moreActive ? 'text-primary' : 'text-muted-foreground'
          }`}
        >
          <span className={moreActive ? 'text-primary' : 'text-muted-foreground'}>
            <MoreHorizontal className="w-5 h-5" />
          </span>
          <span>Thêm</span>
        </button>
      </div>
    </nav>
  );
}
