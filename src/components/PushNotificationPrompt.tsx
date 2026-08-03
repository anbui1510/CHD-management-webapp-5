import React from 'react';
import { BellRing, X } from 'lucide-react';

interface PushNotificationPromptProps {
  visible: boolean;
  loading: boolean;
  configured?: boolean;
  error?: string;
  warning?: string;
  isIosStandaloneHint?: boolean;
  onEnable: () => void;
  onDismiss: () => void;
}

export default function PushNotificationPrompt({
  visible,
  loading,
  configured = true,
  error,
  warning,
  isIosStandaloneHint,
  onEnable,
  onDismiss,
}: PushNotificationPromptProps) {
  if (!visible) return null;

  return (
    <div className="fixed top-[calc(4rem+env(safe-area-inset-top))] md:top-20 left-4 right-4 md:left-1/2 md:-translate-x-1/2 md:max-w-lg z-[90] animate-in slide-in-from-top-2">
      <div className="rounded-2xl border border-amber-200 bg-amber-50 shadow-xl overflow-hidden">
        <div className="px-4 py-3 flex items-start gap-3">
          <BellRing className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-black text-amber-900">Bật thông báo điện thoại</p>
            <p className="text-xs text-amber-800 mt-1 leading-relaxed">
              Nhận alert trên màn hình khóa khi có chỉ định mới, nhắc xếp lịch và workflow quan trọng — kể cả khi không mở app.
            </p>
            {isIosStandaloneHint && (
              <p className="text-[11px] text-amber-700 mt-2 leading-relaxed">
                Trên iPhone, cần <strong>Thêm vào Màn hình chính</strong> trước khi push hoạt động (iOS 16.4+).
              </p>
            )}
            {!configured && (
              <p className="text-[11px] text-amber-700 mt-2 leading-relaxed">
                Hệ thống đang khởi tạo push trên server. Nếu vẫn không bật được sau vài phút deploy, báo quản trị kiểm tra Cloudflare Worker.
              </p>
            )}
            {error && (
              <p className="text-[11px] text-rose-700 mt-2 font-semibold">{error}</p>
            )}
            {!error && warning && (
              <p className="text-[11px] text-amber-800 mt-2 font-semibold">{warning}</p>
            )}
            <div className="flex flex-wrap gap-2 mt-3">
              <button
                type="button"
                disabled={loading || !configured}
                onClick={onEnable}
                className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-black disabled:opacity-60"
              >
                {loading ? 'Đang bật...' : configured ? 'Bật thông báo' : 'Chưa sẵn sàng'}
              </button>
              <button
                type="button"
                onClick={onDismiss}
                className="px-4 py-2 rounded-xl border border-amber-300 text-amber-800 text-xs font-bold hover:bg-amber-100"
              >
                Không phải lúc này
              </button>
            </div>
          </div>
          <button type="button" onClick={onDismiss} className="p-1 rounded-lg hover:bg-amber-100 text-amber-700">
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
