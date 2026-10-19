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
  pendingScheduleCount?: number;
  quickTabIds?: ActiveMenuId[];
}

export default function MobileBottomNav({
  activeMenu,
  onNavigate,
  onOpenMore,
  pendingStaffCount = 0,
  pendingScheduleCount = 0,
  quickTabIds = [],
}: MobileBottomNavProps) {
  const moreActive = isMoreMenuActive(activeMenu, quickTabIds);

  return (
    <nav
      className="mobile-bottom-nav md:hidden fixed bottom-0 inset-x-0 z-40 bg-white border-t border-slate-200 shadow-[0_-4px_20px_rgba(15,23,42,0.08)] pb-[var(--mobile-safe-bottom)]"
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
            isBottomTabActive(activeMenu, 'home') ? 'text-[#d2145a]' : 'text-slate-500'
          }`}
        >
          <span className={isBottomTabActive(activeMenu, 'home') ? 'text-[#d2145a]' : 'text-slate-400'}>
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
                active ? 'text-[#d2145a]' : 'text-slate-500'
              }`}
            >
              <span className={active ? 'text-[#d2145a]' : 'text-slate-400'}>
                {getNavIcon(tabId, 'w-5 h-5')}
              </span>
              <span className="truncate max-w-full">{tab.shortLabel || tab.label}</span>
              {tabId === 'results-staff' && pendingStaffCount > 0 && (
                <span className="absolute top-0.5 right-2 min-w-[16px] h-4 px-1 rounded-full bg-[#d2145a] text-white text-[8px] font-black flex items-center justify-center">
                  {pendingStaffCount > 99 ? '99+' : pendingStaffCount}
                </span>
              )}
              {tabId === 'schedule-tt' && pendingScheduleCount > 0 && (
                <span className="absolute top-1 right-2 min-w-[16px] h-4 px-1 rounded-full bg-[#d2145a] text-white text-[8px] font-black flex items-center justify-center">
                  {pendingScheduleCount > 99 ? '99+' : pendingScheduleCount}
                </span>
              )}
            </button>
          );
        })}

        <button
          type="button"
          onClick={onOpenMore}
          className={`relative flex flex-col items-center justify-end gap-0.5 px-1 pt-1.5 pb-1 text-[10px] font-bold leading-none transition ${
            moreActive ? 'text-[#d2145a]' : 'text-slate-500'
          }`}
        >
          <span className={moreActive ? 'text-[#d2145a]' : 'text-slate-400'}>
            <MoreHorizontal className="w-5 h-5" />
          </span>
          <span>Thêm</span>
        </button>
      </div>
    </nav>
  );
}
