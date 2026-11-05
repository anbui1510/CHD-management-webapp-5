import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, ChevronRight, Download } from 'lucide-react';

const OPTIONS = [
  { id: 'xlsx', label: 'Microsoft Excel (.xlsx)' },
  { id: 'pdf', label: 'PDF (.pdf)' }
];

export function DownloadMenu({ onPick, disabled, variant = 'default' }) {
  const isToolbar = variant === 'toolbar';
  const [open, setOpen] = useState(false);
  const [panelStyle, setPanelStyle] = useState(null);
  const rootRef = useRef(null);
  const triggerRef = useRef(null);
  const panelRef = useRef(null);

  useLayoutEffect(() => {
    if (!open) {
      setPanelStyle(null);
      return undefined;
    }

    const place = () => {
      const trigger = triggerRef.current;
      const panel = panelRef.current;
      if (!trigger || !panel) return;

      const margin = 8;
      const gap = 6;
      const tr = trigger.getBoundingClientRect();
      const width = panel.offsetWidth || 220;
      const height = panel.offsetHeight || 88;

      let left;
      let top;
      let flipX = false;

      if (isToolbar) {
        left = tr.left;
        top = tr.bottom + gap;
        if (left + width > window.innerWidth - margin) {
          left = Math.max(margin, tr.right - width);
        }
        if (top + height > window.innerHeight - margin) {
          top = Math.max(margin, tr.top - height - gap);
        }
      } else {
        left = tr.right + gap;
        top = tr.top;
        if (left + width > window.innerWidth - margin) {
          left = tr.left - width - gap;
          flipX = true;
        }
        if (left < margin) left = margin;
        if (top + height > window.innerHeight - margin) {
          top = Math.max(margin, window.innerHeight - height - margin);
        }
      }

      setPanelStyle({
        position: 'fixed',
        top: `${Math.round(top)}px`,
        left: `${Math.round(left)}px`,
        zIndex: 9000,
        '--flip-x': flipX ? '1' : '0'
      });
    };

    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open, isToolbar]);

  useEffect(() => {
    if (!open) return undefined;
    let close = null;
    // Sau tick — tránh mousedown/pointerdown mở menu bị coi là outside-close.
    const timer = window.setTimeout(() => {
      close = (event) => {
        const target = event.target;
        if (rootRef.current?.contains(target)) return;
        if (panelRef.current?.contains(target)) return;
        if (target?.closest?.('.tb-floating-menu')) return;
        setOpen(false);
      };
      window.addEventListener('pointerdown', close);
    }, 0);
    const onKey = (event) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.clearTimeout(timer);
      if (close) window.removeEventListener('pointerdown', close);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const pick = (id) => {
    setOpen(false);
    onPick?.(id);
  };

  const panel = open && typeof document !== 'undefined'
    ? createPortal(
      <div
        ref={panelRef}
        className="download-menu-panel tb-floating-menu"
        role="menu"
        style={panelStyle || { position: 'fixed', visibility: 'hidden', zIndex: 9000 }}
        onPointerDown={(event) => event.stopPropagation()}
        onMouseDown={(event) => event.stopPropagation()}
        onTouchStart={(event) => event.stopPropagation()}
      >
        {OPTIONS.map(option => (
          <button
            key={option.id}
            type="button"
            role="menuitem"
            className="download-menu-item"
            onClick={() => pick(option.id)}
          >
            {option.label}
          </button>
        ))}
      </div>,
      document.body
    )
    : null;

  return (
    <div className={`download-menu ${isToolbar ? 'download-menu--toolbar' : ''} ${open ? 'is-open' : ''}`} ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        className={isToolbar ? 'tb-btn tb-caret download-menu-trigger' : 'action-btn download-menu-trigger'}
        disabled={disabled}
        title="Tải xuống"
        aria-label="Tải xuống"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(current => !current)}
      >
        <Download size={16} />
        {isToolbar ? (
          <ChevronDown size={12} className="download-menu-caret" aria-hidden />
        ) : (
          <ChevronRight size={14} className="download-menu-caret" aria-hidden />
        )}
      </button>
      {panel}
    </div>
  );
}
