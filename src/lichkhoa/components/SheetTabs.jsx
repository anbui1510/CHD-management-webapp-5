import React, { useEffect, useRef, useState } from 'react';
import { Plus, ChevronDown, Pencil, Copy, Trash2, ArrowLeft, ArrowRight } from 'lucide-react';
import { useConfirm } from './ConfirmDialog';

const TAB_COLORS = ['#1a73e8', '#188038', '#f9ab00', '#d93025', '#9334e6', '#e8710a', '#12b5cb'];

/**
 * Thanh sheet dưới bảng, cùng kiểu Google Sheets:
 * dấu + và tên sheet nằm một hàng, chuột phải để đổi tên / nhân bản / xóa / đổi màu / đổi thứ tự.
 */
export function SheetTabs({
  sheets,
  activeSheetId,
  onSelect,
  onAdd,
  onRename,
  onDuplicate,
  onDelete,
  onMove,
  onSetColor,
  locked = false
}) {
  const [editingId, setEditingId] = useState(null);
  const [draft, setDraft] = useState('');
  const [menu, setMenu] = useState(null);
  const editingRef = useRef(null);
  const menuRef = useRef(null);
  const [confirm, confirmDialog] = useConfirm();

  useEffect(() => {
    if (!menu) return;
    const handleDown = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenu(null);
    };
    const handleKey = (e) => { if (e.key === 'Escape') setMenu(null); };
    window.addEventListener('mousedown', handleDown);
    window.addEventListener('keydown', handleKey);
    return () => {
      window.removeEventListener('mousedown', handleDown);
      window.removeEventListener('keydown', handleKey);
    };
  }, [menu]);

  const startRename = (sheet) => {
    setMenu(null);
    editingRef.current = sheet.id;
    setEditingId(sheet.id);
    setDraft(sheet.name);
  };

  const cancelRename = () => {
    editingRef.current = null;
    setEditingId(null);
  };

  const commitRename = () => {
    const id = editingRef.current;
    if (!id) return;
    editingRef.current = null;
    setEditingId(null);

    const sheet = sheets.find(s => s.id === id);
    const name = draft.trim();
    if (!sheet || !name || name === sheet.name) return;

    if (sheets.some(s => s.id !== id && s.name.toLowerCase() === name.toLowerCase())) {
      confirm({
        variant: 'info',
        alertOnly: true,
        title: 'Tên sheet đã tồn tại',
        message: <>Đã có sheet tên <strong>“{name}”</strong>. Vui lòng nhập tên khác.</>
      });
      return;
    }
    onRename(id, name);
  };

  const handleDelete = async (sheet) => {
    setMenu(null);
    if (sheets.length <= 1) return;
    const ok = await confirm({
      variant: 'danger',
      title: 'Xóa sheet',
      message: <>Bạn có chắc muốn xóa sheet <strong>“{sheet.label || sheet.name}”</strong>? Toàn bộ dữ liệu lịch trong sheet này sẽ bị mất.</>,
      confirmText: 'Xóa'
    });
    if (ok) onDelete(sheet.id);
  };

  const openMenuAt = (id, x, y) => {
    const width = 230;
    const height = 280;
    const left = Math.max(8, Math.min(x, window.innerWidth - width - 8));
    const top = Math.max(8, y - height);
    setMenu({ id, left, top });
  };

  const menuSheet = menu ? sheets.find(s => s.id === menu.id) : null;
  const menuIndex = menuSheet ? sheets.findIndex(s => s.id === menuSheet.id) : -1;

  return (
    <div className="sheet-tabs-bar">
      {!locked && (
        <button type="button" className="sheet-tab-add" title="Thêm sheet mới" onClick={onAdd}>
          <Plus size={16} />
        </button>
      )}

      <div className="sheet-tabs-scroll">
        {sheets.map(sheet => {
          const isActive = sheet.id === activeSheetId;
          const isEditing = sheet.id === editingId;
          return (
            <div
              key={sheet.id}
              className={`sheet-tab ${isActive ? 'active' : ''} ${sheet.color ? 'has-color' : ''}`}
              style={sheet.color ? { '--tab-color': sheet.color } : undefined}
              onClick={() => !isEditing && onSelect(sheet.id)}
              onDoubleClick={() => { if (!locked) startRename(sheet); }}
              onContextMenu={(e) => {
                e.preventDefault();
                onSelect(sheet.id);
                if (!locked) openMenuAt(sheet.id, e.clientX, e.clientY);
              }}
              title="Nhấp đúp để đổi tên • Chuột phải để xem thêm"
            >
              {isEditing ? (
                <input
                  className="sheet-tab-input"
                  autoFocus
                  value={draft}
                  onFocus={(e) => e.target.select()}
                  onChange={(e) => setDraft(e.target.value)}
                  onClick={(e) => e.stopPropagation()}
                  onDoubleClick={(e) => e.stopPropagation()}
                  onBlur={commitRename}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') commitRename();
                    if (e.key === 'Escape') cancelRename();
                  }}
                  maxLength={40}
                />
              ) : (
                <span className="sheet-tab-name">{sheet.label || sheet.name}</span>
              )}
              {isActive && !isEditing && !locked && (
                <button
                  type="button"
                  className="sheet-tab-caret"
                  title="Tùy chọn sheet"
                  onClick={(e) => {
                    e.stopPropagation();
                    const rect = e.currentTarget.getBoundingClientRect();
                    openMenuAt(sheet.id, rect.left, rect.top);
                  }}
                >
                  <ChevronDown size={14} />
                </button>
              )}
            </div>
          );
        })}
      </div>

      {menu && menuSheet && (
        <div ref={menuRef} className="sheet-context-menu" style={{ left: menu.left, top: menu.top }}>
          <button type="button" className="menu-item danger" disabled={sheets.length <= 1} onClick={() => handleDelete(menuSheet)}>
            <Trash2 size={14} /> Xóa
          </button>
          <button type="button" className="menu-item" onClick={() => { setMenu(null); onDuplicate(menuSheet.id); }}>
            <Copy size={14} /> Nhân bản
          </button>
          <button type="button" className="menu-item" onClick={() => startRename(menuSheet)}>
            <Pencil size={14} /> Đổi tên
          </button>
          <div className="menu-divider" />
          <div className="menu-label">Thay đổi màu</div>
          <div className="menu-colors">
            <button
              type="button"
              className={`tab-color-swatch clear ${!menuSheet.color ? 'selected' : ''}`}
              title="Màu mặc định"
              onClick={() => { onSetColor(menuSheet.id, null); setMenu(null); }}
            />
            {TAB_COLORS.map(color => (
              <button
                key={color}
                type="button"
                className={`tab-color-swatch ${menuSheet.color === color ? 'selected' : ''}`}
                style={{ background: color }}
                title={color}
                onClick={() => { onSetColor(menuSheet.id, color); setMenu(null); }}
              />
            ))}
          </div>
          <div className="menu-divider" />
          <button
            type="button"
            className="menu-item"
            disabled={menuIndex >= sheets.length - 1}
            onClick={() => { setMenu(null); onMove(menuSheet.id, 1); }}
          >
            <ArrowRight size={14} /> Di chuyển sang phải
          </button>
          <button
            type="button"
            className="menu-item"
            disabled={menuIndex <= 0}
            onClick={() => { setMenu(null); onMove(menuSheet.id, -1); }}
          >
            <ArrowLeft size={14} /> Di chuyển sang trái
          </button>
        </div>
      )}

      {confirmDialog}
    </div>
  );
}
