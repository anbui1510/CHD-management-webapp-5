import React, { useState, useEffect, useMemo } from 'react';
import { Patient, Consult, Staff } from '../types';
import { 
  Database, FileText, Users, Table, Check, ExternalLink, 
  Copy, Unlink, RefreshCw, AlertTriangle, CheckCircle2, Loader2, Info, Code,
  ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight
} from 'lucide-react';
import { GOOGLE_APPS_SCRIPT_CODE } from '../data/appsScriptCode';

interface VirtualSheetsProps {
  patients: Patient[];
  consults: Consult[];
  staff: Staff[];
  cathlabs?: any[];
  operations?: any[];
  cmrs?: any[];
  sourses?: any[];
  onRefreshData?: () => void;
}

export default function VirtualSheets({ patients, consults, staff, cathlabs = [], operations = [], cmrs = [], sourses = [], onRefreshData }: VirtualSheetsProps) {
  const [activeTab, setActiveTab] = useState<'Patient' | 'Consult' | 'Staff' | 'CathLab' | 'Operation' | 'CMR' | 'Sourse'>('Patient');
  
  // Pagination State
  const [currentPage, setCurrentPage] = useState<number>(1);
  const rowsPerPage = 50;

  useEffect(() => {
    // Reset page to 1 when changing tabs
    setCurrentPage(1);
  }, [activeTab]);

  // Real Sync State
  const [syncConfig, setSyncConfig] = useState<{ scriptUrl: string; isSynced: boolean }>({ scriptUrl: '', isSynced: false });
  const [loadingConfig, setLoadingConfig] = useState<boolean>(true);
  const [inputUrl, setInputUrl] = useState<string>('');
  const [actionLoading, setActionLoading] = useState<boolean>(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [copied, setCopied] = useState<boolean>(false);
  const [showInstructions, setShowInstructions] = useState<boolean>(false);

  // Fetch Sync configuration on mount
  useEffect(() => {
    fetchSyncConfig();
  }, []);

  const fetchSyncConfig = () => {
    setLoadingConfig(true);
    fetch('/api/sync-config')
      .then(res => res.json())
      .then(data => {
        setSyncConfig(data);
        if (data.scriptUrl) {
          setInputUrl(data.scriptUrl);
        }
        setLoadingConfig(false);
      })
      .catch(err => {
        console.error('Error fetching sync config:', err);
        setLoadingConfig(false);
      });
  };

  const handleConnect = (e: React.FormEvent) => {
    e.preventDefault();
    setActionError(null);
    setActionSuccess(null);
    
    if (!inputUrl.trim()) {
      setActionError('Vui lòng nhập URL Google Web App!');
      return;
    }

    if (!inputUrl.trim().startsWith('https://script.google.com/macros/s/')) {
      setActionError('Đường link của bạn không đúng định dạng Web App! Vui lòng KHÔNG dán link Editor (link thiết kế có chữ /edit hoặc /home) mà hãy dán đúng link Web App URL được sao chép sau khi nhấn nút "Triển khai" -> "Triển khai mới" (bắt đầu bằng https://script.google.com/macros/s/...)');
      return;
    }

    setActionLoading(true);
    fetch('/api/sync-config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scriptUrl: inputUrl.trim() })
    })
      .then(async res => {
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || 'Yêu cầu kết nối thất bại');
        }
        return data;
      })
      .then(data => {
        setActionLoading(false);
        setActionSuccess(data.message);
        setSyncConfig({ scriptUrl: inputUrl.trim(), isSynced: true });
        if (onRefreshData) {
          onRefreshData(); // Reload parent medical data from new Sheet!
        }
      })
      .catch(err => {
        setActionLoading(false);
        setActionError(err.message || 'Không thể kết nối đến Google Sheets Apps Script.');
      });
  };

  const handleDisconnect = () => {
    if (!window.confirm('Bạn có chắc chắn muốn ngắt kết nối đồng bộ với Google Sheets? Ứng dụng sẽ chuyển lại sử dụng Database độc lập nội bộ.')) {
      return;
    }

    setActionLoading(true);
    setActionError(null);
    setActionSuccess(null);

    fetch('/api/sync-config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scriptUrl: '' })
    })
      .then(res => res.json())
      .then(data => {
        setActionLoading(false);
        setActionSuccess('Đã hủy liên kết thành công!');
        setInputUrl('');
        setSyncConfig({ scriptUrl: '', isSynced: false });
        if (onRefreshData) {
          onRefreshData(); // Redraw with local offline database
        }
      })
      .catch(err => {
        setActionLoading(false);
        setActionError('Có lỗi xảy ra khi ngắt kết nối.');
      });
  };

  const handleForceSync = () => {
    setActionLoading(true);
    setActionError(null);
    setActionSuccess(null);

    fetch('/api/sync-config/sync', {
      method: 'POST'
    })
      .then(async res => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Đồng bộ thất bại');
        return data;
      })
      .then(data => {
        setActionLoading(false);
        setActionSuccess(data.message);
        if (onRefreshData) {
          onRefreshData(); // Refresh patient lists
        }
      })
      .catch(err => {
        setActionLoading(false);
        setActionError(err.message || 'Lỗi đồng bộ dữ liệu.');
      });
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(GOOGLE_APPS_SCRIPT_CODE);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Pagination Logic Helper
  const currentData = useMemo(() => {
    switch (activeTab) {
      case 'Patient': return patients;
      case 'Consult': return consults;
      case 'Staff': return staff;
      case 'CathLab': return cathlabs;
      case 'Operation': return operations;
      case 'CMR': return cmrs;
      case 'Sourse': return sourses;
      default: return [];
    }
  }, [activeTab, patients, consults, staff, cathlabs, operations, cmrs, sourses]);
  
  const totalPages = Math.ceil(currentData.length / rowsPerPage) || 1;
  
  const paginatedPatients = useMemo(() => {
    if (activeTab !== 'Patient') return [];
    const startIndex = (currentPage - 1) * rowsPerPage;
    return patients.slice(startIndex, startIndex + rowsPerPage);
  }, [activeTab, patients, currentPage]);

  const paginatedConsults = useMemo(() => {
    if (activeTab !== 'Consult') return [];
    const startIndex = (currentPage - 1) * rowsPerPage;
    return consults.slice(startIndex, startIndex + rowsPerPage);
  }, [activeTab, consults, currentPage]);

  const paginatedStaff = useMemo(() => {
    if (activeTab !== 'Staff') return [];
    const startIndex = (currentPage - 1) * rowsPerPage;
    return staff.slice(startIndex, startIndex + rowsPerPage);
  }, [activeTab, staff, currentPage]);

  const paginatedCathlabs = useMemo(() => {
    if (activeTab !== 'CathLab') return [];
    const startIndex = (currentPage - 1) * rowsPerPage;
    return cathlabs.slice(startIndex, startIndex + rowsPerPage);
  }, [activeTab, cathlabs, currentPage]);

  const paginatedOperations = useMemo(() => {
    if (activeTab !== 'Operation') return [];
    const startIndex = (currentPage - 1) * rowsPerPage;
    return operations.slice(startIndex, startIndex + rowsPerPage);
  }, [activeTab, operations, currentPage]);

  const paginatedCmrs = useMemo(() => {
    if (activeTab !== 'CMR') return [];
    const startIndex = (currentPage - 1) * rowsPerPage;
    return cmrs.slice(startIndex, startIndex + rowsPerPage);
  }, [activeTab, cmrs, currentPage]);

  return (
    <div className="space-y-4 flex flex-col h-full min-h-0 overflow-hidden">
      {/* Dynamic Sync Status Header Banner */}
      <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
        <div className="bg-emerald-800 text-white px-5 py-4 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-emerald-700/60 rounded-xl border border-emerald-500/30">
              <Database className="w-6 h-6 text-emerald-300" />
            </div>
            <div>
              <h3 className="font-sans font-bold text-base">Đồng bộ Google Sheets thời gian thực</h3>
              <p className="text-xs text-emerald-100 font-medium">
                {syncConfig.isSynced 
                  ? 'Trạng thái: Đã đồng bộ Live với Google Sheets thực tế bằng Apps Script API'
                  : 'Trạng thái: Cơ sở dữ liệu đang hoạt động ngoại tuyến (Offline JSON DB)'
                }
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {loadingConfig ? (
              <span className="text-xs bg-emerald-700 px-3 py-1.5 rounded-lg flex items-center gap-1">
                <Loader2 className="w-3.5 h-3.5 animate-spin" /> Đang kiểm tra...
              </span>
            ) : syncConfig.isSynced ? (
              <div className="flex items-center gap-2">
                <span className="text-xs bg-emerald-700 border border-emerald-600 px-3 py-1.5 rounded-xl font-bold text-emerald-100 flex items-center gap-1.5 shadow-sm">
                  <span className="w-2.5 h-2.5 rounded-full bg-green-400 animate-pulse"></span> Đã kết nối Live
                </span>
                <button
                  type="button"
                  onClick={handleForceSync}
                  disabled={actionLoading}
                  className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-xl px-3 py-1.5 text-xs font-semibold shadow-sm transition flex items-center gap-1 border border-emerald-500"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${actionLoading ? 'animate-spin' : ''}`} />
                  Đồng bộ lại
                </button>
                <button
                  type="button"
                  onClick={handleDisconnect}
                  disabled={actionLoading}
                  className="bg-red-700 hover:bg-red-600 disabled:opacity-50 text-white rounded-xl px-3 py-1.5 text-xs font-semibold shadow-sm transition flex items-center gap-1 border border-red-600"
                >
                  <Unlink className="w-3.5 h-3.5" />
                  Hủy liên kết
                </button>
              </div>
            ) : (
              <span className="text-xs bg-emerald-900 border border-emerald-700/50 px-3 py-1.5 rounded-xl font-bold text-emerald-200 flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-400"></span> Chưa kết nối
              </span>
            )}
          </div>
        </div>

        {/* Global Action Notifications */}
        {(actionError || actionSuccess) && (
          <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between animate-fade-in">
            {actionError && (
              <div className="flex items-center gap-2 text-rose-800 text-xs font-semibold bg-rose-50 px-3 py-2 rounded-xl w-full border border-rose-200">
                <AlertTriangle className="w-4 h-4 text-rose-500 shrink-0" />
                <span>{actionError}</span>
              </div>
            )}
            {actionSuccess && (
              <div className="flex items-center gap-2 text-emerald-900 text-xs font-semibold bg-emerald-50 px-3 py-2 rounded-xl w-full border border-emerald-200">
                <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                <span>{actionSuccess}</span>
              </div>
            )}
          </div>
        )}

        {/* Dynamic Panel: If connected, show spreadsheet URL info or table data */}
        {syncConfig.isSynced && (
          <div className="px-5 py-3 bg-slate-50 border-b border-gray-200 text-xs text-slate-600 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <span className="truncate flex-grow">
              <strong>URL Web App liên kết: </strong>
              <code className="bg-slate-100 p-1 rounded border border-slate-200 font-mono text-slate-700 select-all">{syncConfig.scriptUrl}</code>
            </span>
            <div className="flex items-center gap-3 shrink-0">
              <button
                type="button"
                onClick={() => setShowInstructions(!showInstructions)}
                className="bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-xl px-3 py-1.5 text-xs font-bold shadow-sm transition flex items-center gap-1 cursor-pointer"
              >
                <Code className="w-3.5 h-3.5" />
                {showInstructions ? 'Ẩn Hướng dẫn & Mã Code.gs' : 'Xem Hướng dẫn & Mã Code.gs'}
              </button>
              <span className="text-slate-500 font-mono italic text-[10px]">
                ✓ Đồng bộ 2 chiều
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Main Container - Setup Panel vs Spreadsheet Table */}
      {(!syncConfig.isSynced || showInstructions) ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Instructions Walkthrough (left) */}
          <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm lg:col-span-7 space-y-4">
            <div className="flex items-center gap-2 border-b border-gray-100 pb-3">
              <span className="p-1.5 bg-indigo-50 rounded-lg text-indigo-600">
                <Info className="w-4 h-4" />
              </span>
              <h4 className="font-bold text-sm text-gray-800">Hướng dẫn kết nối Google Sheet của bạn</h4>
            </div>

            <ol className="list-decimal list-inside space-y-3.5 text-xs text-gray-600 font-medium">
              <li>
                Mở Google Sheet của bạn (<a href="https://docs.google.com/spreadsheets/d/1h0gMUUKs5TskzM-6eWkJ_S2bkNkLnAkFgmrwDd0y6wo" target="_blank" rel="noreferrer" className="text-indigo-600 font-sans font-extrabold hover:underline inline-flex items-center gap-0.5">Mở Sheet mẫu đã ghim <ExternalLink className="w-3 h-3" /></a>)
              </li>
              <li>
                Trên thanh menu hàng đầu, chọn <strong className="text-gray-800">Tiện ích mở rộng (Extensions)</strong> &rarr; <strong className="text-gray-800">Apps Script</strong>.
              </li>
              <li>
                Xóa sạch code mặc định trong đó và dán toàn bộ đoạn mã trong ô bên phải vào <code className="bg-gray-100 px-1 py-0.5 rounded font-mono text-pink-600">Code.gs</code>. Nhấp lưu tài liệu.
              </li>
              <li>
                Chọn nút <strong className="text-gray-800">Triển khai (Deploy)</strong> &rarr; <strong className="text-gray-800">Triển khai mới (New deployment)</strong>.
              </li>
              <li>
                Chọn loại cấu hình là <strong className="text-gray-800">Ứng dụng web (Web app)</strong> và điền thông tin:
                <ul className="list-disc list-inside ml-4 mt-1.5 space-y-1 text-slate-500 text-[11px] font-normal">
                  <li>Thực thi dưới quyền: <strong className="text-slate-700">Me (Gmail của bạn)</strong></li>
                  <li>Ai có quyền truy cập: <strong className="text-slate-700">Anyone (Bất kỳ ai)</strong> (*)</li>
                </ul>
                <p className="text-[10px] text-rose-600 italic font-semibold mt-1">(*) Lưu ý bắt buộc chọn "Anyone" để webapp có thể giao tiếp trao đổi dữ liệu an toàn dưới quyền Admin của bạn.</p>
              </li>
              <li>
                Nhấn <strong className="text-green-700 font-bold">Deploy (Triển khai)</strong>, cấp các quyền truy cập cần thiết, sau đó sao chép địa chỉ <strong className="text-indigo-600">Web app URL</strong> được cấp và dán vào ô bên dưới cấu hình kết nối.
                <p className="text-[11px] text-emerald-800 font-bold mt-1">💡 Hệ thống tự động khởi tạo 3 bảng chính (Patient, Consult, Staff) cùng các cột tiêu đề tiêu chuẩn, không cần định dạng thủ công!</p>
              </li>
            </ol>

            {/* Input target URL */}
            <form onSubmit={handleConnect} className="pt-4 border-t border-gray-100 flex flex-col sm:flex-row items-stretch gap-2">
              <div className="relative flex-1">
                <input
                  type="url"
                  placeholder="Dán Web app URL (bắt đầu bằng https://script.google.com/...)"
                  value={inputUrl}
                  onChange={(e) => setInputUrl(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-300 rounded-xl px-3 py-2 text-xs focus:ring-2 focus:ring-emerald-500 focus:bg-white outline-none font-mono"
                  disabled={actionLoading}
                />
              </div>
              <button
                type="submit"
                disabled={actionLoading}
                className="bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 text-white font-extrabold text-xs px-5 py-2 rounded-xl transition shadow flex items-center justify-center gap-1 border-b-2 border-emerald-900"
              >
                {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                Lưu kết nối
              </button>
            </form>
          </div>

          {/* Code Block Copy container */}
          <div className="bg-gray-900 rounded-2xl overflow-hidden text-slate-100 lg:col-span-5 flex flex-col max-h-[500px]">
            <div className="bg-gray-800 px-4 py-2.5 border-b border-gray-700 flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full bg-red-400"></div>
                <div className="w-2.5 h-2.5 rounded-full bg-amber-400"></div>
                <div className="w-2.5 h-2.5 rounded-full bg-green-400"></div>
                <span className="text-xs font-mono text-slate-400 select-none ml-2">Code.gs AppScript</span>
              </div>
              <button
                type="button"
                onClick={copyToClipboard}
                className="bg-gray-700 hover:bg-gray-600 rounded px-2.5 py-1 text-[11px] font-sans font-semibold transition flex items-center gap-1"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
                {copied ? 'Đã sao chép!' : 'Sao chép mã'}
              </button>
            </div>
            <pre className="p-4 overflow-auto text-[10px] font-mono leading-relaxed text-emerald-300 flex-1">
              <code>{GOOGLE_APPS_SCRIPT_CODE}</code>
            </pre>
          </div>
        </div>
      ) : null}

      {/* Spreadsheet Tables Viewer Panel */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm flex-1 flex flex-col min-h-0">
        {/* Title bar mimic Google Sheets database */}
        <div className="bg-slate-50 border-b border-gray-200 px-4 py-2.5 flex items-center justify-between">
          <div className="flex items-center gap-2 text-slate-700">
            <Table className="w-4 h-4 text-emerald-600" />
            <span className="font-bold text-xs uppercase tracking-wider">Trình xem nhanh Google Sheets Database</span>
          </div>
          <span className="text-[10px] font-mono text-slate-400 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
            Total records: {patients.length + consults.length + staff.length + cathlabs.length + operations.length + cmrs.length + sourses.length} entries
          </span>
        </div>

        {/* Sheets Sheet-Tabs Menu */}
        <div className="bg-gray-100 border-b border-gray-200 flex items-center overflow-x-auto text-sm">
          <button
            onClick={() => setActiveTab('Patient')}
            className={`flex items-center gap-1.5 px-4 py-2 text-xs font-semibold uppercase tracking-wider border-r border-gray-200 transition-colors ${
              activeTab === 'Patient'
                ? 'bg-white text-emerald-700 border-t-2 border-t-emerald-600'
                : 'text-gray-600 hover:bg-gray-50'
            }`}
          >
            <Table className="w-3.5 h-3.5" />
            Bảng 1: Patient ({patients.length})
          </button>
          <button
            onClick={() => setActiveTab('Consult')}
            className={`flex items-center gap-1.5 px-4 py-2 text-xs font-semibold uppercase tracking-wider border-r border-gray-200 transition-colors ${
              activeTab === 'Consult'
                ? 'bg-white text-emerald-700 border-t-2 border-t-emerald-600'
                : 'text-gray-600 hover:bg-gray-50'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            Bảng 2: Consult ({consults.length})
          </button>
          <button
            onClick={() => setActiveTab('Staff')}
            className={`flex items-center gap-1.5 px-4 py-2 text-xs font-semibold uppercase tracking-wider border-r border-gray-300 transition-colors ${
              activeTab === 'Staff'
                ? 'bg-white text-emerald-700 border-t-2 border-t-emerald-600'
                : 'text-gray-600 hover:bg-gray-50'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            Bảng 3: Staff ({staff.length})
          </button>
          <button
            onClick={() => setActiveTab('CathLab')}
            className={`flex items-center gap-1.5 px-4 py-2 text-xs font-semibold uppercase tracking-wider border-r border-gray-300 transition-colors ${
              activeTab === 'CathLab'
                ? 'bg-white text-emerald-700 border-t-2 border-t-emerald-600'
                : 'text-gray-600 hover:bg-gray-50'
            }`}
          >
            <Table className="w-3.5 h-3.5" />
            Bảng 4: CathLab ({cathlabs.length})
          </button>
          <button
            onClick={() => setActiveTab('Operation')}
            className={`flex items-center gap-1.5 px-4 py-2 text-xs font-semibold uppercase tracking-wider border-r border-gray-300 transition-colors ${
              activeTab === 'Operation'
                ? 'bg-white text-emerald-700 border-t-2 border-t-emerald-600'
                : 'text-gray-600 hover:bg-gray-50'
            }`}
          >
            <Table className="w-3.5 h-3.5" />
            Bảng 5: Operation ({operations.length})
          </button>
          <button
            onClick={() => setActiveTab('CMR')}
            className={`flex items-center gap-1.5 px-4 py-2 text-xs font-semibold uppercase tracking-wider border-r border-gray-300 transition-colors ${
              activeTab === 'CMR'
                ? 'bg-white text-emerald-700 border-t-2 border-t-emerald-600'
                : 'text-gray-600 hover:bg-gray-50'
            }`}
          >
            <Table className="w-3.5 h-3.5" />
            Bảng 6: CMR ({cmrs.length})
          </button>
          <button
            onClick={() => setActiveTab('Sourse')}
            className={`flex items-center gap-1.5 px-4 py-2 text-xs font-semibold uppercase tracking-wider border-r border-gray-300 transition-colors ${
              activeTab === 'Sourse'
                ? 'bg-white text-emerald-700 border-t-2 border-t-emerald-600'
                : 'text-gray-600 hover:bg-gray-50'
            }`}
          >
            <Table className="w-3.5 h-3.5" />
            Bảng 7: Sourse ({sourses.length})
          </button>
        </div>

        {/* Table Grid details */}
        <div className="flex-1 overflow-x-auto overflow-y-auto min-h-0">
          {currentData.length > 0 ? (
            <div className="min-w-max">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200 text-gray-700 font-mono text-[11px] uppercase tracking-wider">
                    {Object.keys(currentData[0]).map((key) => (
                      <th key={key} className="py-2.5 px-3 border-r border-gray-200 whitespace-nowrap">
                        {key}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 font-mono text-[11px]">
                  {currentData.slice((currentPage - 1) * rowsPerPage, currentPage * rowsPerPage).map((row: any, idx) => (
                    <tr key={idx} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}>
                      {Object.keys(currentData[0]).map((key) => {
                        const val = row[key];
                        return (
                          <td key={key} className="py-2 px-3 border-r border-gray-200 whitespace-nowrap">
                            {typeof val === 'object' ? JSON.stringify(val) : String(val || '')}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="p-8 text-center text-gray-500 font-medium">
              Chưa có dữ liệu cho bảng này.
            </div>
          )}
        </div>

        <div className="bg-white px-4 py-3 flex items-center justify-between border-t border-gray-200">
          <div className="text-xs text-slate-500 font-medium">
            Trang <span className="font-bold text-emerald-800">{currentPage}</span> / <span className="font-bold">{totalPages}</span> (Hiển thị {rowsPerPage} dòng mỗi trang)
          </div>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setCurrentPage(1)}
              disabled={currentPage === 1}
              className="p-1 rounded-lg text-slate-500 hover:bg-slate-100 disabled:opacity-30 disabled:hover:bg-transparent transition"
            >
              <ChevronsLeft className="w-4 h-4" />
            </button>
            <button
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="p-1 rounded-lg text-slate-500 hover:bg-slate-100 disabled:opacity-30 disabled:hover:bg-transparent transition"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <div className="px-2 text-xs font-bold text-slate-700 select-none">
              {currentPage}
            </div>
            <button
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="p-1 rounded-lg text-slate-500 hover:bg-slate-100 disabled:opacity-30 disabled:hover:bg-transparent transition"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
            <button
              onClick={() => setCurrentPage(totalPages)}
              disabled={currentPage === totalPages}
              className="p-1 rounded-lg text-slate-500 hover:bg-slate-100 disabled:opacity-30 disabled:hover:bg-transparent transition"
            >
              <ChevronsRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="bg-gray-50 px-4 py-2.5 text-[11px] text-gray-500 flex items-center justify-between border-t border-gray-200 font-medium font-sans">
          <span>Dữ liệu đồng bộ trực tiếp hai chiều dựa trên nền tảng đám mây Google Sheets</span>
          <span className="text-emerald-700 font-mono flex items-center gap-0.5">
            connected_cloud_synced <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
          </span>
        </div>
      </div>
    </div>
  );
}
