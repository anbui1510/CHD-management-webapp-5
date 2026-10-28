import React from 'react';
import { X } from 'lucide-react';
import { ActiveMenuId, NavMenuItem, getNavIcon } from '../../config/navigation';

interface MobileMoreMenuProps {
  isOpen: boolean;
  onClose: () => void;
  items: NavMenuItem[];
  activeMenu: ActiveMenuId;
  onNavigate: (menuId: ActiveMenuId) => void;
}

export default function MobileMoreMenu({
  isOpen,
  onClose,
  items,
  activeMenu,
  onNavigate,
}: MobileMoreMenuProps) {
  if (!isOpen) return null;

  return (
    <div className="md:hidden fixed inset-0 z-50">
      <button
        type="button"
        className="absolute inset-0 bg-slate-900/50 backdrop-blur-[1px]"
        aria-label="Đóng menu"
        onClick={onClose}
      />
      <div className="absolute inset-x-0 bottom-0 max-h-[min(80dvh,640px)] bg-background rounded-t-xl shadow-lg border border-border flex flex-col pb-[var(--mobile-safe-bottom)]">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
          <div>
            <p className="text-sm font-semibold text-foreground">Thêm module</p>
            <p className="text-xs text-muted-foreground">Chọn module — sẽ ghim vào thanh dưới</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl hover:bg-slate-100 text-slate-500"
            aria-label="Đóng"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="overflow-y-auto p-3 space-y-1">
          {items.map(item => {
            const active = activeMenu === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onNavigate(item.id)}
                className={`w-full flex items-center gap-3 px-3 py-3 rounded-md text-left transition ${
                  active
                    ? 'bg-accent text-primary'
                    : 'text-foreground hover:bg-muted'
                }`}
              >
                <span className={active ? 'text-primary' : 'text-muted-foreground'}>
                  {getNavIcon(item.id, 'w-5 h-5')}
                </span>
                <span className="text-sm font-semibold">{item.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
