import React, { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Paintbrush, Undo2, Redo2, Minus, Plus, Bold, Italic, Underline,
  Baseline, PaintBucket, AlignLeft, AlignCenter, AlignRight,
  AlignVerticalJustifyStart, AlignVerticalJustifyCenter, AlignVerticalJustifyEnd,
  WrapText, ChevronDown, Clock, Filter
} from 'lucide-react';
import { DownloadMenu } from './DownloadMenu';
import { COLOR_ROWS, DEFAULT_FONT, ZOOM_STEPS, cleanStyle, expandSharedTaskStyles, pushFormatUndo } from '../logic/cellFormat';
import { DAY_SESSIONS, normalizeDaySessions } from '../logic/monthSchedule';

function AutoScheduleIcon() {
  const gradId = useId().replace(/:/g, '');
  return (
    <svg className="tb-auto-icon" width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <defs>
        <linearGradient id={gradId} x1="4" y1="2" x2="20" y2="22" gradientUnits="userSpaceOnUse">
          <stop stopColor="#4285F4" />
          <stop offset="0.5" stopColor="#9B72CB" />
          <stop offset="1" stopColor="#D96570" />
        </linearGradient>
      </defs>
      <path
        fill={`url(#${gradId})`}
        d="M11.5 2.2a1 1 0 0 1 1 0l1.1 3.8 3.9 1.1a1 1 0 0 1 .5 1.6l-3.2 2.4 1.2 3.9a1 1 0 0 1-1.5 1.1L12 14.4l-3.4 2.7a1 1 0 0 1-1.5-1.1l1.2-3.9-3.2-2.4a1 1 0 0 1 .5-1.6l3.9-1.1 1.1-3.8ZM4.2 11.1a.85.85 0 0 1 1.2.3l.8 2.7 2.7.8a.85.85 0 0 1 0 1.6l-2.7.8-.8 2.7a.85.85 0 0 1-1.6 0l-.8-2.7-2.7-.8a.85.85 0 0 1 0-1.6l2.7-.8.8-2.7a.85.85 0 0 1 .4-.3Zm15.1 0a.85.85 0 0 1 1.2-.3l.8 2.7 2.7.8a.85.85 0 0 1 0 1.6l-2.7.8-.8 2.7a.85.85 0 0 1-1.6 0l-.8-2.7-2.7-.8a.85.85 0 0 1 0-1.6l2.7-.8.8-2.7a.85.85 0 0 1 .4-.3ZM12 16.8a.85.85 0 0 1 .8.6l.7 2.4 2.4.7a.85.85 0 0 1 0 1.6l-2.4.7-.7 2.4a.85.85 0 0 1-1.6 0l-.7-2.4-2.4-.7a.85.85 0 0 1 0-1.6l2.4-.7.7-2.4a.85.85 0 0 1 .8-.6Z"
      />
    </svg>
  );
}

/**
 * Portal ra body — tránh bị .mobile-body / .view-container overflow:hidden
 * (và sheet-toolbar-track overflow-x:auto) cắt menu trên iOS/WebKit.
 * stopPropagation pointerdown để listener đóng menu không unmount trước onClick.
 */
function FloatingMenuPanel({ open, anchorRef, className, alignRight, children }) {
  const panelRef = useRef(null);
  const [style, setStyle] = useState(null);

  useLayoutEffect(() => {
    if (!open) {
      setStyle(null);
      return undefined;
    }
    const place = () => {
      const anchor = anchorRef.current;
      const panel = panelRef.current;
      if (!anchor || !panel) return;

      const margin = 8;
      const gap = 6;
      const rect = anchor.getBoundingClientRect();
      const width = panel.offsetWidth || 200;
      const height = panel.offsetHeight || 160;

      let left = alignRight ? rect.right - width : rect.left;
      let top = rect.bottom + gap;

      if (left + width > window.innerWidth - margin) {
        left = window.innerWidth - width - margin;
      }
      if (left < margin) left = margin;

      if (top + height > window.innerHeight - margin) {
        top = Math.max(margin, rect.top - height - gap);
      }

      setStyle({
        position: 'fixed',
        top: `${Math.round(top)}px`,
        left: `${Math.round(left)}px`,
        zIndex: 9000
      });
    };

    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open, alignRight, children, anchorRef]);

  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <div
      ref={panelRef}
      className={`tb-floating-menu ${className || ''}`}
      style={style || { position: 'fixed', visibility: 'hidden', zIndex: 9000 }}
      role="menu"
      onPointerDown={(event) => event.stopPropagation()}
      onMouseDown={(event) => event.stopPropagation()}
      onTouchStart={(event) => event.stopPropagation()}
    >
      {children}
    </div>,
    document.body
  );
}

function FreezeIcon() {
  return (
    <svg className="tb-freeze-icon" width="16" height="16" viewBox="0 0 18 18" aria-hidden="true">
      <rect x="1.15" y="1.15" width="15.7" height="15.7" rx="1.3" fill="none" stroke="currentColor" strokeWidth="1.35" />
      <path d="M1.15 6.15h15.7M1.15 11.15h15.7M6.15 1.15v15.7M11.85 6.15v10.7" fill="none" stroke="currentColor" strokeWidth="1.15" />
      <rect x="1.7" y="1.7" width="4.15" height="14.6" fill="currentColor" opacity="0.28" />
    </svg>
  );
}

export function SheetToolbar({
  bridge,
  patchRef,
  formatCtl,
  painting,
  setPainting,
  zoom,
  onZoom,
  activeStyle,
  onActiveStyle,
  daySessions,
  onDaySessions,
  onFreeze,
  onAutoSchedule,
  onDownload,
  locked = false,
  groupFilter = null
}) {
  const [menu, setMenu] = useState(null);
  const barRef = useRef(null);
  const freezeBtnRef = useRef(null);
  const sessionBtnRef = useRef(null);
  const groupBtnRef = useRef(null);
  const style = activeStyle || {};

  useEffect(() => {
    if (!menu) return undefined;
    // Đăng ký sau tick để click mở menu không bị coi là outside-close.
    let close = null;
    const timer = window.setTimeout(() => {
      close = (event) => {
        const target = event.target;
        if (barRef.current?.contains(target)) return;
        if (target?.closest?.('.tb-floating-menu')) return;
        setMenu(null);
      };
      window.addEventListener('pointerdown', close);
    }, 0);
    return () => {
      window.clearTimeout(timer);
      if (close) window.removeEventListener('pointerdown', close);
    };
  }, [menu]);

  useEffect(() => {
    if (!painting) return undefined;
    const cancel = (event) => {
      if (event.key === 'Escape') {
        formatCtl.current.armed = false;
        setPainting(false);
      }
    };
    window.addEventListener('keydown', cancel);
    return () => window.removeEventListener('keydown', cancel);
  }, [painting, formatCtl, setPainting]);

  const resolveEntries = () => {
    let entries = bridge.current.getSelectedEntries?.() || [];
    if (!entries.length) {
      const active = bridge.current.getActiveEntry?.();
      if (active) entries = [active];
    }
    // Mobile: tap toolbar có thể làm Handsontable mất selection trước khi format chạy.
    if (!entries.length && bridge.current.lastEntries?.length) {
      entries = bridge.current.lastEntries;
    }
    return entries;
  };

  const withSelection = (mutator) => {
    if (locked) return;
    const hot = bridge.current.hot;
    const describe = bridge.current.describe;
    if (!hot || !describe) return;
    const entries = resolveEntries();
    if (!entries.length) return;
    const prev = {};
    const next = {};
    entries.forEach((entry) => {
      // Re-read live style from bridge map if present
      const live = bridge.current.styles?.[entry.key] || entry.style || null;
      prev[entry.key] = live ? { ...live } : null;
      next[entry.key] = cleanStyle(mutator({ ...(live || {}) }));
    });
    expandSharedTaskStyles(bridge.current.styles || {}, prev, next);
    pushFormatUndo(hot, prev, next, (map) => patchRef.current(map));
    const activeKey = bridge.current.getActiveEntry?.()?.key || bridge.current.lastActive?.key;
    if (activeKey && Object.prototype.hasOwnProperty.call(next, activeKey)) {
      onActiveStyle?.(next[activeKey]);
    }
    setMenu(null);
  };

  const every = (prop, value) => {
    const entries = resolveEntries();
    return entries.length > 0 && entries.every((entry) => {
      const live = bridge.current.styles?.[entry.key] || entry.style;
      return value == null ? !!live?.[prop] : live?.[prop] === value;
    });
  };

  const undo = () => {
    if (locked) return;
    bridge.current.hot?.getPlugin?.('undoRedo')?.undo?.();
  };
  const redo = () => {
    if (locked) return;
    bridge.current.hot?.getPlugin?.('undoRedo')?.redo?.();
  };

  const copyFormat = () => {
    if (locked) return;
    const entry = bridge.current.getActiveEntry?.();
    formatCtl.current = { armed: true, style: entry?.style ? { ...entry.style } : {} };
    setPainting(true);
    setMenu(null);
  };

  const fontSize = style.fontSize || DEFAULT_FONT;

  const readFreeze = () => {
    const settings = bridge.current.hot?.getSettings?.() || {};
    return {
      rows: Number(settings.fixedRowsTop) || 0,
      cols: Number(settings.fixedColumnsStart ?? settings.fixedColumnsLeft) || 0
    };
  };

  const selectionCount = (axis) => {
    const hot = bridge.current.hot;
    const selected = hot?.getSelectedLast?.();
    if (!hot || !selected) return null;
    const start = selected[axis === 'row' ? 0 : 1];
    const end = selected[axis === 'row' ? 2 : 3];
    if (start == null || start < 0) return null;
    const index = Math.max(start, end ?? start);
    const limit = axis === 'row' ? hot.countRows() : hot.countCols();
    const count = Math.max(0, Math.min(index + 1, limit));
    const visual = axis === 'row' ? hot.getRowHeader?.(index) : count;
    return { count, label: visual == null || visual === '' ? count : visual };
  };

  const applyFreeze = (patch) => {
    if (locked) return;
    const hot = bridge.current.hot;
    if (!hot) return;
    const current = readFreeze();
    const rows = Math.max(0, Math.min(patch.rows ?? current.rows, hot.countRows()));
    const cols = Math.max(0, Math.min(patch.cols ?? current.cols, hot.countCols()));
    hot.updateSettings({ fixedRowsTop: rows, fixedColumnsStart: cols });
    onFreeze?.({ rows, cols });
    setMenu(null);
  };

  const frozen = menu === 'freeze' ? readFreeze() : { rows: 0, cols: 0 };
  const rowTarget = menu === 'freeze' ? selectionCount('row') : null;
  const colTarget = menu === 'freeze' ? selectionCount('col') : null;
  const selectedSessions = normalizeDaySessions(daySessions);
  const toggleSession = (id) => {
    if (locked) return;
    const next = selectedSessions.includes(id)
      ? selectedSessions.filter(item => item !== id)
      : [...selectedSessions, id];
    if (!next.length) return;
    onDaySessions?.(next);
  };

  return (
    <div className={`sheet-toolbar sheet-icon-bar ${painting ? 'is-painting' : ''} ${locked ? 'is-locked' : ''}`} ref={barRef}>
      <div className="sheet-toolbar-track">
      {onAutoSchedule && (
        <>
          <button
            type="button"
            className="tb-btn tb-auto"
            title="Tự động xếp lịch (AI)"
            aria-label="Tự động xếp lịch"
            onClick={onAutoSchedule}
          >
            <AutoScheduleIcon />
          </button>
          <span className="tb-sep" />
        </>
      )}
      <button
        type="button"
        className={`tb-btn ${painting ? 'active' : ''}`}
        title="Sao chép định dạng"
        aria-label="Sao chép định dạng"
        onClick={copyFormat}
      >
        <Paintbrush size={16} />
      </button>
      <span className="tb-sep" />
      <button type="button" className="tb-btn" title="Hoàn tác (Ctrl+Z)" onClick={undo}>
        <Undo2 size={16} />
      </button>
      <button type="button" className="tb-btn" title="Làm lại (Ctrl+Y)" onClick={redo}>
        <Redo2 size={16} />
      </button>
      <span className="tb-sep" />
      <label className="tb-zoom" title="Thu phóng">
        <select value={zoom} onChange={(event) => onZoom(Number(event.target.value))} aria-label="Thu phóng">
          {ZOOM_STEPS.map(step => (
            <option key={step} value={step}>{step}%</option>
          ))}
        </select>
      </label>
      <span className="tb-sep" />
      <button
        type="button"
        className="tb-btn"
        title="Giảm cỡ chữ"
        onClick={() => withSelection(current => ({ ...current, fontSize: Math.max(8, (current.fontSize || DEFAULT_FONT) - 1) }))}
      >
        <Minus size={14} />
      </button>
      <span className="tb-font-size" title="Cỡ chữ">{fontSize}</span>
      <button
        type="button"
        className="tb-btn"
        title="Tăng cỡ chữ"
        onClick={() => withSelection(current => ({ ...current, fontSize: Math.min(36, (current.fontSize || DEFAULT_FONT) + 1) }))}
      >
        <Plus size={14} />
      </button>
      <span className="tb-sep" />
      <button type="button" className={`tb-btn ${style.bold ? 'active' : ''}`} title="In đậm" onClick={() => withSelection(current => ({ ...current, bold: !every('bold') }))}>
        <Bold size={16} />
      </button>
      <button type="button" className={`tb-btn ${style.italic ? 'active' : ''}`} title="In nghiêng" onClick={() => withSelection(current => ({ ...current, italic: !every('italic') }))}>
        <Italic size={16} />
      </button>
      <button type="button" className={`tb-btn ${style.underline ? 'active' : ''}`} title="Gạch dưới" onClick={() => withSelection(current => ({ ...current, underline: !every('underline') }))}>
        <Underline size={16} />
      </button>
      <ColorButton
        title="Màu văn bản"
        icon={<Baseline size={16} />}
        marker={style.color || '#f8fafc'}
        open={menu === 'text'}
        onToggle={() => setMenu(menu === 'text' ? null : 'text')}
        onPick={(color) => withSelection(current => ({ ...current, color: color || undefined }))}
      />
      <ColorButton
        title="Màu ô"
        icon={<PaintBucket size={16} />}
        marker={style.bg || 'transparent'}
        open={menu === 'fill'}
        onToggle={() => setMenu(menu === 'fill' ? null : 'fill')}
        onPick={(color) => withSelection(current => ({ ...current, bg: color || undefined }))}
      />
      <span className="tb-sep" />
      <MenuButton
        title="Căn ngang"
        open={menu === 'h'}
        onToggle={() => setMenu(menu === 'h' ? null : 'h')}
        icon={style.hAlign === 'left' ? <AlignLeft size={16} /> : style.hAlign === 'right' ? <AlignRight size={16} /> : <AlignCenter size={16} />}
      >
        <button type="button" onClick={() => withSelection(current => ({ ...current, hAlign: 'left' }))}><AlignLeft size={15} /> Căn trái</button>
        <button type="button" onClick={() => withSelection(current => ({ ...current, hAlign: 'center' }))}><AlignCenter size={15} /> Căn giữa</button>
        <button type="button" onClick={() => withSelection(current => ({ ...current, hAlign: 'right' }))}><AlignRight size={15} /> Căn phải</button>
      </MenuButton>
      <MenuButton
        title="Căn dọc"
        open={menu === 'v'}
        onToggle={() => setMenu(menu === 'v' ? null : 'v')}
        icon={style.vAlign === 'top' ? <AlignVerticalJustifyStart size={16} /> : style.vAlign === 'bottom' ? <AlignVerticalJustifyEnd size={16} /> : <AlignVerticalJustifyCenter size={16} />}
      >
        <button type="button" onClick={() => withSelection(current => ({ ...current, vAlign: 'top' }))}><AlignVerticalJustifyStart size={15} /> Đầu</button>
        <button type="button" onClick={() => withSelection(current => ({ ...current, vAlign: 'middle' }))}><AlignVerticalJustifyCenter size={15} /> Giữa</button>
        <button type="button" onClick={() => withSelection(current => ({ ...current, vAlign: 'bottom' }))}><AlignVerticalJustifyEnd size={15} /> Dưới cùng</button>
      </MenuButton>
      <MenuButton
        title="Xuống dòng"
        open={menu === 'w'}
        onToggle={() => setMenu(menu === 'w' ? null : 'w')}
        icon={<WrapText size={16} />}
      >
        <button type="button" onClick={() => withSelection(current => ({ ...current, wrap: 'overflow' }))}>Tràn</button>
        <button type="button" onClick={() => withSelection(current => ({ ...current, wrap: 'wrap' }))}>Xuống dòng</button>
        <button type="button" onClick={() => withSelection(current => ({ ...current, wrap: 'clip' }))}>Cắt bớt</button>
      </MenuButton>
      <span className="tb-sep" />
      <div className="tb-pop">
        <button
          ref={freezeBtnRef}
          type="button"
          className={`tb-btn tb-caret ${menu === 'freeze' ? 'active' : ''}`}
          title="Cố định hàng hoặc cột"
          onClick={() => setMenu(menu === 'freeze' ? null : 'freeze')}
        >
          <FreezeIcon />
          <ChevronDown size={12} />
        </button>
        <FloatingMenuPanel
          open={menu === 'freeze'}
          anchorRef={freezeBtnRef}
          className="tb-menu tb-freeze"
          alignRight
        >
          <div className="tb-menu-note">Đang ghim {frozen.rows} hàng, {frozen.cols} cột</div>
          <div className="tb-menu-label">Hàng</div>
          <button type="button" className={frozen.rows === 0 ? 'is-current' : ''} onClick={() => applyFreeze({ rows: 0 })}>Không ghim hàng</button>
          <button type="button" className={frozen.rows === 1 ? 'is-current' : ''} onClick={() => applyFreeze({ rows: 1 })}>1 hàng</button>
          <button type="button" className={frozen.rows === 2 ? 'is-current' : ''} onClick={() => applyFreeze({ rows: 2 })}>2 hàng</button>
          <button type="button" disabled={!rowTarget} onClick={() => applyFreeze({ rows: rowTarget.count })}>
            {rowTarget ? `Đến hàng ${rowTarget.label}` : 'Đến hàng đang chọn'}
          </button>
          <div className="tb-menu-label">Cột</div>
          <button type="button" className={frozen.cols === 0 ? 'is-current' : ''} onClick={() => applyFreeze({ cols: 0 })}>Không ghim cột</button>
          <button type="button" className={frozen.cols === 1 ? 'is-current' : ''} onClick={() => applyFreeze({ cols: 1 })}>1 cột</button>
          <button type="button" className={frozen.cols === 2 ? 'is-current' : ''} onClick={() => applyFreeze({ cols: 2 })}>2 cột</button>
          <button type="button" disabled={!colTarget} onClick={() => applyFreeze({ cols: colTarget.count })}>
            {colTarget ? `Đến cột ${colTarget.label}` : 'Đến cột đang chọn'}
          </button>
        </FloatingMenuPanel>
      </div>
      <div className="session-menu tb-pop">
        <button
          ref={sessionBtnRef}
          type="button"
          className={`tb-btn tb-caret ${menu === 'sessions' ? 'active' : ''}`}
          title="Chọn buổi hiển thị trên lịch"
          onClick={() => setMenu(menu === 'sessions' ? null : 'sessions')}
        >
          <Clock size={15} />
          <ChevronDown size={12} />
        </button>
        <FloatingMenuPanel
          open={menu === 'sessions'}
          anchorRef={sessionBtnRef}
          className="session-menu-list"
        >
          {DAY_SESSIONS.map(item => (
            <label key={item.id}>
              <input
                type="checkbox"
                checked={selectedSessions.includes(item.id)}
                disabled={selectedSessions.length === 1 && selectedSessions.includes(item.id)}
                onChange={() => toggleSession(item.id)}
              />
              {item.label}
            </label>
          ))}
        </FloatingMenuPanel>
      </div>
      {groupFilter && (
        <>
          <span className="tb-sep" />
          <div className="tb-pop">
            <button
              ref={groupBtnRef}
              type="button"
              className={`tb-btn tb-caret ${menu === 'groups' || groupFilter.selected != null ? 'active' : ''}`}
              title="Lọc theo nhóm nhiệm vụ"
              aria-label="Lọc theo nhóm nhiệm vụ"
              aria-expanded={menu === 'groups'}
              onClick={() => setMenu(menu === 'groups' ? null : 'groups')}
            >
              <Filter size={15} />
              <ChevronDown size={12} />
            </button>
            <FloatingMenuPanel
              open={menu === 'groups'}
              anchorRef={groupBtnRef}
              className="session-menu-list tb-group-filter"
              alignRight
            >
              <div className="tb-menu-label">Nhóm nhiệm vụ</div>
              {groupFilter.groups.length === 0 && (
                <div className="tb-menu-note">Chưa có nhiệm vụ trên lịch tháng.</div>
              )}
              {groupFilter.groups.map(group => {
                const checked = groupFilter.selected == null || groupFilter.selected.includes(group.key);
                return (
                  <label key={group.key || 'none'}>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => groupFilter.onToggle(group.key)}
                    />
                    {group.label}
                  </label>
                );
              })}
              <button
                type="button"
                className="tb-filter-reset"
                disabled={groupFilter.selected == null}
                onClick={groupFilter.onReset}
              >
                Hiện tất cả
              </button>
            </FloatingMenuPanel>
          </div>
        </>
      )}
      {onDownload && (
        <>
          <span className="tb-sep" />
          <DownloadMenu onPick={onDownload} variant="toolbar" />
        </>
      )}
      </div>
    </div>
  );
}

function MenuButton({ title, icon, open, onToggle, children, alignRight }) {
  const anchorRef = useRef(null);
  return (
    <div className="tb-pop">
      <button
        ref={anchorRef}
        type="button"
        className={`tb-btn tb-caret ${open ? 'active' : ''}`}
        title={title}
        aria-label={title}
        aria-expanded={open}
        onClick={onToggle}
      >
        {icon}
        <ChevronDown size={12} />
      </button>
      <FloatingMenuPanel open={open} anchorRef={anchorRef} className="tb-menu" alignRight={alignRight}>
        {children}
      </FloatingMenuPanel>
    </div>
  );
}

function ColorButton({ title, icon, marker, open, onToggle, onPick }) {
  const anchorRef = useRef(null);
  return (
    <div className="tb-pop">
      <button
        ref={anchorRef}
        type="button"
        className={`tb-btn tb-color ${open ? 'active' : ''}`}
        title={title}
        aria-label={title}
        aria-expanded={open}
        onClick={onToggle}
      >
        {icon}
        <i style={{ background: marker }} />
      </button>
      <FloatingMenuPanel open={open} anchorRef={anchorRef} className="tb-menu tb-colors">
        <button type="button" className="tb-reset" onClick={() => onPick(null)}>Đặt lại</button>
        {COLOR_ROWS.map((row, index) => (
          <div key={index} className="tb-color-row">
            {row.map(color => (
              <button
                key={color}
                type="button"
                className="tb-swatch"
                style={{ background: color }}
                title={color}
                onClick={() => onPick(color)}
              />
            ))}
          </div>
        ))}
      </FloatingMenuPanel>
    </div>
  );
}
