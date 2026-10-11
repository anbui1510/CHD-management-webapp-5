import React, { useEffect, useState } from 'react';
import { Download, Share, Smartphone, X } from 'lucide-react';
import {
  dismissPwaInstallPrompt,
  isIosDevice,
  isStandaloneDisplayMode,
  shouldShowIosInstallHint,
  wasPwaInstallDismissed,
} from '../push/webPushClient';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export default function PwaInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [visible, setVisible] = useState(false);
  const [isIos] = useState(() => shouldShowIosInstallHint());

  useEffect(() => {
    if (wasPwaInstallDismissed() || isStandaloneDisplayMode()) return;

    const onBeforeInstall = (event: Event) => {
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
      setVisible(true);
    };

    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    if (isIosDevice() && !isStandaloneDisplayMode()) {
      setVisible(true);
    }

    return () => window.removeEventListener('beforeinstallprompt', onBeforeInstall);
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    setDeferredPrompt(null);
    setVisible(false);
  };

  const handleDismiss = () => {
    dismissPwaInstallPrompt();
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div className="fixed left-4 right-4 pwa-install-anchor md:bottom-6 md:left-auto md:right-6 md:max-w-sm z-[90] animate-in slide-in-from-bottom-4 max-h-[min(70dvh,calc(var(--app-layout-vh,100svh)*0.7))] overflow-y-auto">
      <div className="rounded-2xl border border-indigo-200 bg-white shadow-2xl overflow-hidden">
        <div className="px-4 py-3 bg-indigo-600 text-white flex items-center gap-2">
          <Smartphone className="w-4 h-4 shrink-0" />
          <p className="text-sm font-black">Cài CHD lên màn hình chính</p>
          <button type="button" onClick={handleDismiss} className="ml-auto p-1 rounded-lg hover:bg-white/10">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-4 space-y-3">
          {isIos ? (
            <div className="text-xs text-slate-600 leading-relaxed space-y-2">
              <p className="font-semibold text-slate-800">iPhone / iPad</p>
              <p className="flex items-start gap-2"><Share className="w-4 h-4 shrink-0 mt-0.5" /> Bấm <strong>Chia sẻ</strong> trong Safari</p>
              <p className="flex items-start gap-2"><Download className="w-4 h-4 shrink-0 mt-0.5" /> Chọn <strong>Thêm vào Màn hình chính</strong></p>
              <p>Sau khi cài, bật thông báo để nhận alert trên màn hình khóa (iOS 16.4+).</p>
            </div>
          ) : (
            <p className="text-xs text-slate-600 leading-relaxed">
              Cài như app native để mở nhanh hơn và nhận thông báo hệ thống khi có ca mới, nhắc xếp lịch, workflow quan trọng.
            </p>
          )}
          {!isIos && deferredPrompt && (
            <button
              type="button"
              onClick={handleInstall}
              className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-black transition"
            >
              Cài ứng dụng
            </button>
          )}
          <button
            type="button"
            onClick={handleDismiss}
            className="w-full py-2 rounded-xl border border-slate-200 text-slate-500 text-xs font-bold hover:bg-slate-50"
          >
            Để sau
          </button>
        </div>
      </div>
    </div>
  );
}
