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
      <div className="absolute inset-x-0 bottom-0 max-h-[min(80dvh,640px)] bg-white rounded-t-3xl shadow-2xl border border-slate-200 flex flex-col pb-[env(safe-area-inset-bottom)]">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 shrink-0">
          <div>
            <p className="text-sm font-black text-slate-800 uppercase tracking-wide">Thêm module</p>
            <p className="text-[10px] text-slate-400 font-medium">Các chức năng khác của hệ thống</p>
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
                className={`w-full flex items-center gap-3 px-3 py-3 rounded-2xl text-left transition ${
                  active
                    ? 'bg-pink-50 text-[#d2145a] border border-pink-100'
                    : 'text-slate-700 hover:bg-slate-50 border border-transparent'
                }`}
              >
                <span className={active ? 'text-[#d2145a]' : 'text-slate-400'}>
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
