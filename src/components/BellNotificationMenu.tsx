import React, { useEffect, useMemo, useRef } from 'react';
import { AlertTriangle, Bell, CheckCheck } from 'lucide-react';
import type { Consult, Notification, Patient, Staff } from '../types';
import { formatVNTime } from '../types';
import { sanitizeNotificationFields } from '../utils/workflowMessages';
import { useIsMobile } from '../hooks/useMediaQuery';

const isEqualStaffKey = (keyA: any, keyB: any): boolean => {
  if (!keyA || !keyB) return false;
  return String(keyA).trim().replace(/^0+/, '') === String(keyB).trim().replace(/^0+/, '');
};

interface BellNotificationMenuProps {
  staff: Staff;
  notifications: Notification[];
  patients?: Patient[];
  consults?: Consult[];
  isOpen: boolean;
  onToggle: () => void;
  onClose: () => void;
  onMarkRead: (notificationKey: string) => void;
}

const getNotificationTitleClass = (severity?: Notification['Severity']): string => {
  if (severity === 'critical') return 'text-red-700';
  return 'text-[#d2145a]';
};

export default function BellNotificationMenu({
  staff,
  notifications,
  isOpen,
  onToggle,
  onClose,
  onMarkRead,
}: BellNotificationMenuProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const isMobile = useIsMobile();

  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        onClose();
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen, onClose]);

  const staffNotifications = useMemo(
    () =>
      notifications
        .filter(item => isEqualStaffKey(item.StaffKey, staff.StaffKey) && !item.IsRead)
        .sort((a, b) => String(b.CreatedTime || '').localeCompare(String(a.CreatedTime || ''))),
    [notifications, staff.StaffKey]
  );

  const unreadCount = staffNotifications.filter(item => !item.IsRead).length;

  const formatNotificationMessage = (item: Notification, sanitizedMessage?: string) => {
    return String(sanitizedMessage ?? sanitizeNotificationFields(item).Message).trim();
  };

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        type="button"
        onClick={onToggle}
        className={`relative border p-1.5 rounded-xl text-white transition ${
          isOpen ? 'bg-white/20 border-white/30' : 'bg-white/10 border-white/15 hover:bg-white/15'
        }`}
        title="Thông báo"
      >
        <Bell className="w-4 h-4" />
        {unreadCount > 0 && (
          <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 px-1 rounded-full bg-yellow-300 text-[#d2145a] text-[9px] font-black flex items-center justify-center shadow">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div
          className={
            isMobile
              ? 'fixed inset-x-3 top-[calc(3.25rem+env(safe-area-inset-top))] z-[125] max-h-[min(72dvh,520px)] rounded-2xl border border-slate-200 bg-white text-slate-800 shadow-xl overflow-hidden animate-in fade-in slide-in-from-top-1 duration-150 flex flex-col'
              : 'absolute right-0 top-[calc(100%+8px)] z-[125] w-[330px] max-w-[calc(100vw-24px)] rounded-2xl border border-slate-200 bg-white text-slate-800 shadow-xl overflow-hidden animate-in fade-in slide-in-from-top-1 duration-150'
          }
        >
          <div className="px-3 py-2.5 border-b border-slate-100 flex items-center justify-between gap-2">
            <div>
              <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Thông báo</p>
              <p className="text-xs font-extrabold text-slate-800">{unreadCount} chưa đọc</p>
            </div>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={() => staffNotifications.filter(item => !item.IsRead).forEach(item => onMarkRead(item.NotificationKey))}
                className="text-[10px] font-black text-[#d2145a] hover:bg-pink-50 px-2 py-1 rounded-lg transition flex items-center gap-1"
              >
                <CheckCheck className="w-3.5 h-3.5" />
                Đã đọc hết
              </button>
            )}
          </div>

          <div className={`overflow-y-auto ${isMobile ? 'flex-1 min-h-0' : 'max-h-[360px]'}`}>
            {staffNotifications.length === 0 ? (
              <div className="px-4 py-8 text-center">
                <Bell className="w-8 h-8 mx-auto text-slate-200 mb-2" />
                <p className="text-xs font-bold text-slate-400">Chưa có thông báo.</p>
              </div>
            ) : (
              staffNotifications.slice(0, 30).map(item => {
                const display = sanitizeNotificationFields(item);
                return (
                  <div key={item.NotificationKey} className={`px-3 py-3 border-b border-slate-100 ${item.IsRead ? 'bg-white' : 'bg-pink-50/70'}`}>
                    <div className="flex items-start gap-2">
                      <div className={`mt-0.5 rounded-full p-1 ${item.Severity === 'critical' ? 'bg-red-100 text-red-600' : 'bg-yellow-100 text-yellow-700'}`}>
                        <AlertTriangle className="w-3.5 h-3.5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className={`text-xs font-black leading-snug ${getNotificationTitleClass(item.Severity)}`}>
                          {display.Title}
                        </p>
                        <p className="text-[11px] font-semibold text-slate-600 leading-snug mt-1">{formatNotificationMessage(item, display.Message)}</p>
                        <p className="text-[9px] font-mono font-bold text-slate-400 mt-1">
                          {formatVNTime(item.CreatedTime)}
                        </p>
                      </div>
                      {!item.IsRead && (
                        <button
                          type="button"
                          onClick={() => onMarkRead(item.NotificationKey)}
                          className="text-[9px] font-black text-[#d2145a] hover:bg-white px-1.5 py-1 rounded transition"
                        >
                          Đã đọc
                        </button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
