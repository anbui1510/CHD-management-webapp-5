import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface GlobalSheetsSyncAlertProps {
  title: string;
  message: string;
  onDismiss: () => void;
}

export default function GlobalSheetsSyncAlert({
  title,
  message,
  onDismiss
}: GlobalSheetsSyncAlertProps) {
  return (
    <AnimatePresence>
      <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm z-[110] flex items-center justify-center p-4">
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.95, opacity: 0 }}
          className="bg-white rounded-xl max-w-md w-full p-6 shadow-2xl border border-amber-100 text-center space-y-4 font-sans"
        >
          <div className="mx-auto bg-amber-50 text-amber-600 rounded-full w-12 h-12 flex items-center justify-center">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <h3 className="text-sm font-black text-slate-800 uppercase tracking-tight">
            {title}
          </h3>
          <p className="text-xs text-slate-600 font-semibold leading-relaxed whitespace-pre-wrap">
            {message}
          </p>
          <button
            type="button"
            onClick={onDismiss}
            className="w-full bg-primary hover:bg-pink-700 text-white font-extrabold uppercase py-2.5 rounded-2xl transition shadow-md cursor-pointer text-xs"
          >
            Đã hiểu
          </button>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
