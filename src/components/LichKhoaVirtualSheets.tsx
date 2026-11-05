import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Code,
  Database,
  ExternalLink,
  Info,
  Loader2,
  RefreshCw,
  Unlink,
} from 'lucide-react';
import { LICH_KHOA_APPS_SCRIPT_CODE } from '../data/lichKhoaAppsScriptCode';
import { setSpreadsheetConnection, clearSpreadsheetConnection } from '../lichkhoa/features/sheetSync/sheetStorage';
import { parseSpreadsheetId, spreadsheetIdValidationMessage } from '../lichkhoa/logic/sheetStore/parseSpreadsheetId';

function extractWebAppDeploymentId(scriptUrl: string): string | null {
  const m = String(scriptUrl || '').match(/\/macros\/s\/([a-zA-Z0-9_-]+)/);
  return m ? m[1] : null;
}

function resolveSpreadsheetIdInput(raw: string): string {
  return parseSpreadsheetId(raw) || String(raw || '').trim();
}

type SyncState = {
  scriptUrl: string;
  spreadsheetId: string;
  hasSecret: boolean;
  isSynced: boolean;
};

export default function LichKhoaVirtualSheets() {
  const [syncConfig, setSyncConfig] = useState<SyncState>({
    scriptUrl: '',
    spreadsheetId: '',
    hasSecret: false,
    isSynced: false,
  });
  const [loadingConfig, setLoadingConfig] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState('');
  const [actionSuccess, setActionSuccess] = useState('');
  const [showInstructions, setShowInstructions] = useState(true);
  const [inputUrl, setInputUrl] = useState('');
  const [inputSecret, setInputSecret] = useState('');
  const [inputSheetId, setInputSheetId] = useState('');

  const loadConfig = useCallback(async () => {
    setLoadingConfig(true);
    try {
      const res = await fetch('/api/lichkhoa/sync-config', { credentials: 'include' });
      const data = await res.json();
      const next: SyncState = {
        scriptUrl: data.scriptUrl || '',
        spreadsheetId: data.spreadsheetId || '',
        hasSecret: !!data.hasSecret,
        isSynced: !!data.isSynced,
      };
      setSyncConfig(next);
      setInputUrl(next.scriptUrl);
      setInputSheetId(next.spreadsheetId);
      if (next.spreadsheetId) {
        try {
          setSpreadsheetConnection(next.spreadsheetId);
        } catch {
          /* ignore */
        }
      }
      setShowInstructions(!next.isSynced);
    } catch {
      setActionError('Không tải được cấu hình Sheet lịch khoa.');
    } finally {
      setLoadingConfig(false);
    }
  }, []);

  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  const handleConnect = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionLoading(true);
    setActionError('');
    setActionSuccess('');
    try {
      const scriptUrl = inputUrl.trim();
      const spreadsheetId = resolveSpreadsheetIdInput(inputSheetId);
      const deployId = extractWebAppDeploymentId(scriptUrl);
      if (!spreadsheetId) {
        throw new Error('Thiếu Spreadsheet ID lịch khoa.');
      }
      if (deployId && spreadsheetId === deployId) {
        throw new Error(
          'Spreadsheet ID đang trùng mã deploy trong Web App URL. Hãy copy ID từ URL Google Sheet (docs.google.com/spreadsheets/d/…/edit), không phải đoạn trong script.google.com/macros/s/…'
        );
      }
      const trimHint = spreadsheetIdValidationMessage(inputSheetId);
      if (trimHint && trimHint.includes('cắt bớt')) {
        setActionSuccess(trimHint);
      }
      const res = await fetch('/api/lichkhoa/sync-config', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scriptUrl,
          scriptSecret: inputSecret.trim(),
          spreadsheetId,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Không kết nối được.');
      setSpreadsheetConnection(spreadsheetId);
      setActionSuccess(data.message || 'Kết nối thành công.');
      await loadConfig();
    } catch (err: any) {
      setActionError(err.message || 'Lỗi kết nối.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleDisconnect = async () => {
    setActionLoading(true);
    setActionError('');
    try {
      await fetch('/api/lichkhoa/sync-config', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ disconnect: true }),
      });
      clearSpreadsheetConnection();
      setActionSuccess('Đã hủy liên kết Sheet lịch khoa.');
      await loadConfig();
    } catch (err: any) {
      setActionError(err.message || 'Không hủy được liên kết.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleForceSync = async () => {
    setActionLoading(true);
    setActionError('');
    try {
      // Pull is driven by schedule module; here we just re-validate config.
      await loadConfig();
      setActionSuccess('Cấu hình Sheet lịch khoa còn hiệu lực. Mở thẻ Xếp lịch để đồng bộ dữ liệu.');
    } finally {
      setActionLoading(false);
    }
  };

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(LICH_KHOA_APPS_SCRIPT_CODE);
      setActionSuccess('Đã copy Code.gs lịch khoa vào clipboard.');
    } catch {
      setActionError('Không copy được — hãy chọn thủ công trong ô mã.');
    }
  };

  return (
    <div className="space-y-4 flex flex-col h-full min-h-0 overflow-auto p-2 sm:p-4">
      <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
        <div className="bg-emerald-800 text-white px-5 py-4 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-emerald-700/60 rounded-xl border border-emerald-500/30">
              <Database className="w-6 h-6 text-emerald-300" />
            </div>
            <div>
              <h3 className="font-sans font-bold text-base">Virtual Google Sheets — Lịch khoa</h3>
              <p className="text-xs text-emerald-100 font-medium">
                {syncConfig.isSynced
                  ? 'Đã liên kết Sheet lịch riêng (tách khỏi Sheet y tế CHD)'
                  : 'Chưa kết nối — cấu hình Apps Script + Spreadsheet ID bên dưới'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {loadingConfig ? (
              <span className="text-xs bg-emerald-700 px-3 py-1.5 rounded-lg flex items-center gap-1">
                <Loader2 className="w-3.5 h-3.5 animate-spin" /> Đang kiểm tra...
              </span>
            ) : syncConfig.isSynced ? (
              <>
                <span className="text-xs bg-emerald-700 border border-emerald-600 px-3 py-1.5 rounded-xl font-bold text-emerald-100 flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-green-400 animate-pulse" /> Live
                </span>
                <button
                  type="button"
                  onClick={handleForceSync}
                  disabled={actionLoading}
                  className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-xl px-3 py-1.5 text-xs font-semibold flex items-center gap-1"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${actionLoading ? 'animate-spin' : ''}`} />
                  Kiểm tra lại
                </button>
                <button
                  type="button"
                  onClick={handleDisconnect}
                  disabled={actionLoading}
                  className="bg-red-700 hover:bg-red-600 disabled:opacity-50 text-white rounded-xl px-3 py-1.5 text-xs font-semibold flex items-center gap-1"
                >
                  <Unlink className="w-3.5 h-3.5" />
                  Hủy liên kết
                </button>
              </>
            ) : (
              <span className="text-xs bg-emerald-900 border border-emerald-700/50 px-3 py-1.5 rounded-xl font-bold text-emerald-200">
                Chưa kết nối
              </span>
            )}
          </div>
        </div>

        {(actionError || actionSuccess) && (
          <div className="px-5 py-3 border-b border-gray-100">
            {actionError && (
              <div className="flex items-center gap-2 text-rose-800 text-xs font-semibold bg-rose-50 px-3 py-2 rounded-xl border border-rose-200">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                {actionError}
              </div>
            )}
            {actionSuccess && (
              <div className="flex items-center gap-2 text-emerald-900 text-xs font-semibold bg-emerald-50 px-3 py-2 rounded-xl border border-emerald-200">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                {actionSuccess}
              </div>
            )}
          </div>
        )}

        {syncConfig.isSynced && (
          <div className="px-5 py-3 bg-slate-50 border-b border-gray-200 text-xs text-slate-600 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <span className="truncate">
              <strong>Spreadsheet ID: </strong>
              <code className="bg-slate-100 p-1 rounded border font-mono">{syncConfig.spreadsheetId}</code>
            </span>
            <button
              type="button"
              onClick={() => setShowInstructions(!showInstructions)}
              className="bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-xl px-3 py-1.5 text-xs font-bold flex items-center gap-1"
            >
              <Code className="w-3.5 h-3.5" />
              {showInstructions ? 'Ẩn hướng dẫn & Code.gs' : 'Xem hướng dẫn & Code.gs'}
            </button>
          </div>
        )}
      </div>

      {(!syncConfig.isSynced || showInstructions) && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm lg:col-span-7 space-y-4">
            <div className="flex items-center gap-2 border-b border-gray-100 pb-3">
              <span className="p-1.5 bg-indigo-50 rounded-lg text-indigo-600">
                <Info className="w-4 h-4" />
              </span>
              <h4 className="font-bold text-sm text-gray-800">Hướng dẫn kết nối Sheet lịch khoa</h4>
            </div>
            <ol className="list-decimal list-inside space-y-3 text-xs text-gray-600 font-medium">
              <li>
                Tạo Google Spreadsheet mới (riêng, khác Sheet y tế CHD). Tạo tab:{' '}
                <code className="font-mono text-[10px]">_meta, NhanSu, Task, LichTuan, LichThang</code>.
              </li>
              <li>
                Extensions → Apps Script → dán toàn bộ Code.gs bên phải → Lưu.
              </li>
              <li>
                Deploy → New deployment → Web app · Execute as Me · Anyone → copy URL. Sau khi sửa Code.gs phải{' '}
                <strong>Manage deployments → New version</strong> (không chỉ Save trong editor).
              </li>
              <li>
                Copy <strong>Spreadsheet ID</strong> từ URL file Sheet (
                <code className="font-mono text-[10px]">docs.google.com/spreadsheets/d/ID/…</code>
                ), không dùng đoạn trong Web App URL (
                <code className="font-mono text-[10px]">macros/s/…</code>).
              </li>
              <li>Dán URL, API Key và Spreadsheet ID vào form dưới → Lưu &amp; kết nối.</li>
            </ol>

            <form onSubmit={handleConnect} className="pt-4 border-t border-gray-100 space-y-3">
              <div className="space-y-1">
                <label className="text-[11px] font-bold text-gray-700">Web App URL</label>
                <input
                  type="url"
                  required
                  placeholder="https://script.google.com/macros/s/.../exec"
                  value={inputUrl}
                  onChange={(e) => setInputUrl(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-300 rounded-xl px-3 py-2 text-xs font-mono focus:ring-2 focus:ring-emerald-500 outline-none"
                  disabled={actionLoading}
                />
              </div>
              <div className="space-y-1">
                <label className="text-[11px] font-bold text-gray-700 flex items-center justify-between">
                  <span>API Key</span>
                  <button
                    type="button"
                    className="text-[10px] text-emerald-700 font-bold hover:underline"
                    onClick={() => {
                      const rand = Array.from(crypto.getRandomValues(new Uint8Array(16)))
                        .map((b) => b.toString(16).padStart(2, '0'))
                        .join('');
                      setInputSecret(rand);
                    }}
                  >
                    Tự sinh mã
                  </button>
                </label>
                <input
                  type="text"
                  placeholder="Để trống nếu giữ khóa đã lưu trên server"
                  value={inputSecret}
                  onChange={(e) => setInputSecret(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-300 rounded-xl px-3 py-2 text-xs font-mono focus:ring-2 focus:ring-emerald-500 outline-none"
                  disabled={actionLoading}
                />
              </div>
              <div className="space-y-1">
                <label className="text-[11px] font-bold text-gray-700">Spreadsheet ID</label>
                <input
                  type="text"
                  required
                  placeholder="ID trong URL docs.google.com/spreadsheets/d/…/edit (khác mã macros/s/…)"
                  value={inputSheetId}
                  onChange={(e) => setInputSheetId(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-300 rounded-xl px-3 py-2 text-xs font-mono focus:ring-2 focus:ring-emerald-500 outline-none"
                  disabled={actionLoading}
                />
              </div>
              <div className="pt-2 flex justify-end">
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 text-white font-extrabold text-xs px-5 py-2.5 rounded-xl flex items-center gap-1.5"
                >
                  {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                  Lưu &amp; Thiết lập kết nối
                </button>
              </div>
            </form>
          </div>

          <div className="bg-white border border-gray-200 rounded-2xl p-4 shadow-sm lg:col-span-5 flex flex-col min-h-[320px]">
            <div className="flex items-center justify-between mb-2">
              <h4 className="font-bold text-sm text-gray-800">Code.gs lịch khoa</h4>
              <button
                type="button"
                onClick={copyCode}
                className="text-[10px] font-bold text-emerald-700 hover:underline flex items-center gap-1"
              >
                <ExternalLink className="w-3 h-3" /> Copy
              </button>
            </div>
            <textarea
              readOnly
              value={LICH_KHOA_APPS_SCRIPT_CODE}
              className="flex-1 w-full min-h-[280px] font-mono text-[10px] bg-slate-950 text-emerald-100 rounded-xl p-3 border border-slate-800"
            />
          </div>
        </div>
      )}
    </div>
  );
}
