import React from 'react';

export default function BootstrapErrorScreen({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div className="min-h-screen bg-neutral-950 text-white flex items-center justify-center p-6 font-sans">
      <div className="w-full max-w-md rounded-3xl border border-neutral-800 bg-neutral-900 p-6 shadow-2xl space-y-4">
        <h1 className="text-lg font-black uppercase tracking-tight text-[#d2145a]">
          Không thể mở ứng dụng
        </h1>
        <p className="text-sm text-neutral-300 leading-relaxed">{message}</p>
        <p className="text-xs text-neutral-500 leading-relaxed">
          Ứng dụng thường tự cập nhật sau mỗi lần deploy. Nếu vẫn lỗi, bấm nút bên dưới để tải lại — không cần gõ link hay thao tác kỹ thuật.
        </p>
        <button
          type="button"
          onClick={onRetry || (() => window.location.reload())}
          className="w-full rounded-xl bg-[#d2145a] hover:bg-pink-700 py-2.5 text-xs font-bold uppercase tracking-wide cursor-pointer"
        >
          Xóa cache &amp; tải lại
        </button>
      </div>
    </div>
  );
}
