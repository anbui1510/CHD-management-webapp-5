import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import type { SheetsSyncFailure } from '../types';

interface PendingSheetsSyncFailuresModalProps {
  failures: SheetsSyncFailure[];
  onAcknowledgeAll: () => void;
}

export default function PendingSheetsSyncFailuresModal({
  failures,
  onAcknowledgeAll
}: PendingSheetsSyncFailuresModalProps) {
  if (failures.length === 0) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 bg-slate-950/75 backdrop-blur-sm z-[120] flex items-center justify-center p-4">
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.95, opacity: 0 }}
          className="bg-white rounded-xl max-w-lg w-full p-6 shadow-2xl border border-rose-100 space-y-4 font-sans max-h-[85vh] overflow-y-auto"
        >
          <div className="flex items-start gap-3">
            <div className="bg-rose-50 text-rose-600 rounded-full w-11 h-11 flex items-center justify-center shrink-0">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-black text-slate-900 uppercase tracking-tight">
                Dữ liệu chưa lên Google Sheets
              </h3>
              <p className="text-xs text-slate-600 font-semibold mt-1 leading-relaxed">
                Có thay đổi đã lưu tạm trên app nhưng chưa ghi lên Google Sheets thành công. Máy khác / danh sách chung có thể chưa thấy — kiểm tra và bấm Đồng bộ lại.
              </p>
            </div>
          </div>

          <div className="space-y-2">
            {failures.map(item => (
              <div
                key={item.FailureKey}
                className="rounded-2xl border border-rose-100 bg-rose-50/70 px-3 py-2.5 text-xs text-slate-700 font-semibold leading-relaxed"
              >
                {item.Message}
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={onAcknowledgeAll}
            className="w-full bg-primary hover:bg-pink-700 text-white font-extrabold uppercase py-2.5 rounded-2xl transition shadow-md cursor-pointer text-xs"
          >
            Đã hiểu — tiếp tục sử dụng app
          </button>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
