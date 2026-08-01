import { Search, X } from 'lucide-react';
import { DEFAULT_SUBHEADER_SEARCH_PLACEHOLDER } from '../../constants/appHeader';
import { useViewSubheaderContext, type ViewSubheaderConfig } from '../../context/ViewSubheaderContext';

interface DesktopViewSubheaderProps {
  config: ViewSubheaderConfig | null;
}

/** Subheader desktop: trái = tên view, giữa = tìm kiếm, phải = nút chức năng. */
export default function DesktopViewSubheader({ config }: DesktopViewSubheaderProps) {
  if (!config) return null;

  const showSearch =
    config.showSearch !== false &&
    typeof config.onSearchChange === 'function';

  return (
    <div className="hidden md:block shrink-0 bg-white border-b border-slate-200 shadow-sm">
      <div className="px-4 md:px-6 py-2 flex items-center gap-3 min-h-[44px]">
        {/* Trái: tên view */}
        <div className="flex items-center gap-2 min-w-0 shrink-0 max-w-[220px] lg:max-w-[260px]">
          {config.icon ? (
            <span className="shrink-0 text-[#d2145a]">{config.icon}</span>
          ) : null}
          <h2 className="text-xs font-extrabold text-neutral-900 uppercase tracking-tight truncate leading-tight">
            {config.title}
          </h2>
        </div>

        {/* Giữa: ô tìm kiếm */}
        {showSearch ? (
          <div className="flex-1 min-w-0 max-w-xl mx-auto">
            <div className="relative">
              <Search className="h-3.5 w-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={config.searchValue ?? ''}
                onChange={(e) => config.onSearchChange?.(e.target.value)}
                placeholder={config.searchPlaceholder ?? DEFAULT_SUBHEADER_SEARCH_PLACEHOLDER}
                className="w-full pl-8 pr-7 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-[11px] font-semibold focus:outline-none focus:ring-1 focus:ring-pink-400 focus:border-pink-400 font-sans"
              />
              {config.searchValue ? (
                <button
                  type="button"
                  onClick={() => config.onSearchChange?.('')}
                  className="absolute inset-y-0 right-0 flex items-center pr-2 text-slate-400 hover:text-slate-600 cursor-pointer"
                  aria-label="Xóa tìm kiếm"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              ) : null}
            </div>
          </div>
        ) : (
          <div className="flex-1 min-w-0" aria-hidden />
        )}

        {/* Phải: nút chức năng theo view */}
        {config.actions ? (
          <div className="flex items-center justify-end gap-2 shrink-0 min-w-0">
            {config.actions}
          </div>
        ) : null}
      </div>
    </div>
  );
}

/** Đọc config từ context và render subheader desktop. */
export function SubheaderRenderer() {
  const { config } = useViewSubheaderContext();
  return <DesktopViewSubheader config={config} />;
}
