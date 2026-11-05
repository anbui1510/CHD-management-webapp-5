import React, { useEffect, useRef, useState } from 'react';
import { Plus, Trash2, Pencil, Copy, FileSpreadsheet, Download, Upload } from 'lucide-react';
import { DEPARTMENT_TEMPLATES, downloadStoreBackup, loadTimMachSeedStore, parseImportedStore } from '../store/dbStore';
import timMachSeed from '../data/tim-mach-seed.json';
import { useConfirm } from './ConfirmDialog';
import { TaskEditorModal } from './TaskEditorModal';

export function TaskManager({
  taskList,
  categories,
  onAddTask,
  onUpdateTask,
  onDeleteTask,
  onLoadTemplate,
  onAddCategory,
  onDeleteCategory,
  onReorderTasks,
  staffList = [],
  autoOpenAdd,
  onAutoOpenHandled,
  readOnly = false,
  store = null,
  onImportStore
}) {
  const importInputRef = useRef(null);
  const templateMenuRef = useRef(null);
  const [editing, setEditing] = useState(null);
  const [dragId, setDragId] = useState(null);
  const [overId, setOverId] = useState(null);
  const [templateMenuOpen, setTemplateMenuOpen] = useState(false);
  const [confirm, confirmDialog] = useConfirm();
  const isNew = editing === 'NEW' || editing?.copyOf;

  useEffect(() => {
    if (!templateMenuOpen) return undefined;
    const onDoc = (event) => {
      if (templateMenuRef.current && !templateMenuRef.current.contains(event.target)) {
        setTemplateMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('touchstart', onDoc);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('touchstart', onDoc);
    };
  }, [templateMenuOpen]);

  const categoryLabel = (key) => {
    const idx = categories.findIndex(c => c.key === key);
    return idx >= 0 ? `${idx + 1}. ${categories[idx].label}` : key;
  };

  useEffect(() => {
    if (autoOpenAdd && !readOnly) {
      setEditing('NEW');
      onAutoOpenHandled?.();
    }
  }, [autoOpenAdd]);

  const handleSave = (payload, linkedTask) => {
    if (isNew && linkedTask) {
      onUpdateTask({ ...linkedTask, ...payload });
    } else if (isNew) {
      onAddTask({ id: `task_${Date.now()}`, ...payload });
    } else {
      onUpdateTask({ ...editing, ...payload });
    }
    setEditing(null);
  };

  const uniqueCode = (code) => {
    const base = String(code || '').trim();
    const taken = new Set(taskList.map(task => task.code.toLowerCase()));
    if (!taken.has(base.toLowerCase())) return base;
    for (let i = 2; i < 100; i += 1) {
      const candidate = `${base}${i}`;
      if (!taken.has(candidate.toLowerCase())) return candidate;
    }
    return `${base}-${Date.now()}`;
  };

  const handleCopy = (task) => {
    setEditing({
      copyOf: task.id,
      sourceCode: task.code,
      code: uniqueCode(task.code),
      name: task.name,
      category: task.category,
      scope: task.scope,
      dutyRole: task.dutyRole || '',
      encodeDuty: task.encodeDuty,
      buRt: task.buRt,
      buVg: task.buVg,
      deltaRt: task.deltaRt,
      deltaVg: task.deltaVg,
      buMode: task.buMode,
      delta: task.delta,
      bgColor: task.bgColor,
      textColor: task.textColor,
      description: task.description,
      fixedDays: task.fixedDays,
      fixedSlots: task.fixedSlots,
      session: task.session,
      locks: task.locks,
      owners: task.owners,
      ownerOrder: task.ownerOrder,
      rotate: !!task.rotate,
      warn: task.warn !== false,
      display: task.display
    });
  };

  const handleDelete = async (t) => {
    const ok = await confirm({
      variant: 'danger',
      title: 'Xác nhận xóa task',
      message: <>Bạn có chắc muốn xóa task <strong>{t.code} – {t.name}</strong>? Thao tác này không thể hoàn tác.</>,
      confirmText: 'Xóa'
    });
    if (ok) onDeleteTask(t.id);
  };

  const moveTask = (fromId, toId) => {
    if (!fromId || !toId || fromId === toId || !onReorderTasks) return;
    const moving = taskList.find(task => task.id === fromId);
    if (!moving) return;
    const next = taskList.filter(task => task.id !== fromId);
    const index = next.findIndex(task => task.id === toId);
    if (index < 0) return;
    next.splice(index, 0, moving);
    onReorderTasks(next);
  };

  const handleLoadTemplate = async (template, label) => {
    const ok = await confirm({
      variant: 'danger',
      title: `Nạp mẫu ${label}`,
      message: <>Toàn bộ <strong>{taskList.length} task</strong> hiện tại sẽ bị thay thế bằng danh mục mẫu của {label}. Tiếp tục?</>,
      confirmText: 'Nạp mẫu'
    });
    if (ok) onLoadTemplate(template.tasks);
  };

  const handleExportBackup = () => {
    if (!store) return;
    downloadStoreBackup(store, 'lichkhoa-tim-mach');
  };

  const handleImportPick = () => {
    importInputRef.current?.click();
  };

  const handleImportFile = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
      const text = await file.text();
      const imported = parseImportedStore(text);
      const deptCount = imported.departments?.length || 0;
      const taskCount = imported.departments?.reduce((sum, dept) => sum + (dept.tasks?.length || 0), 0) || 0;
      const ok = await confirm({
        variant: 'danger',
        title: 'Nhập sao lưu',
        message: <>Thay toàn bộ dữ liệu hiện tại bằng file này ({deptCount} khoa, {taskCount} task)?</>,
        confirmText: 'Nhập'
      });
      if (ok) onImportStore?.(imported);
    } catch (error) {
      await confirm({
        title: 'Không đọc được file',
        message: String(error?.message || error),
        confirmText: 'Đóng'
      });
    }
  };

  const handleLoadBundledTimMach = async () => {
    const staffCount = timMachSeed?.department?.staff?.length || 0;
    const taskCount = timMachSeed?.department?.tasks?.length || 0;
    const ok = await confirm({
      variant: 'danger',
      title: 'Nạp nhân sự & task Tim Mạch',
      message: <>Thay danh sách nhân sự và task Khoa Tim Mạch bằng bản trong repo ({staffCount} nhân sự, {taskCount} task). Lịch tuần/tháng hiện tại giữ nguyên.</>,
      confirmText: 'Nạp'
    });
    if (ok) onImportStore?.(loadTimMachSeedStore(store));
  };

  return (
    <div className="view-container">
      <div className="section-header">
        <div>
          <h2 className="view-title">Quản Lý Danh Mục Task &amp; Nghiệp Vụ</h2>
          <div className="sub-header-info">{taskList.length} task • {categories.length} nhóm nghiệp vụ</div>
        </div>

        {!readOnly && (
          <div className="manager-toolbar">
            <button type="button" className="action-btn" onClick={handleExportBackup} disabled={!store} title="Xuất sao lưu">
              <Download size={16} /> Sao lưu
            </button>
            <button type="button" className="action-btn" onClick={handleImportPick} title="Nhập sao lưu">
              <Upload size={16} /> Sao lưu
            </button>
            <input ref={importInputRef} type="file" accept="application/json,.json" hidden onChange={handleImportFile} />
            <button type="button" className="action-btn primary" onClick={() => setEditing('NEW')} title="Thêm task mới">
              <Plus size={16} /> Task
            </button>
            <div className="manager-menu" ref={templateMenuRef}>
              <button
                type="button"
                className="action-btn"
                aria-expanded={templateMenuOpen}
                aria-haspopup="menu"
                onClick={() => setTemplateMenuOpen((open) => !open)}
              >
                <FileSpreadsheet size={16} /> Nạp mẫu
              </button>
              {templateMenuOpen && (
                <div className="manager-menu-panel" role="menu">
                  <button
                    type="button"
                    role="menuitem"
                    className="manager-menu-item"
                    onClick={() => {
                      setTemplateMenuOpen(false);
                      handleLoadTemplate(DEPARTMENT_TEMPLATES.TIM_MACH, 'Khoa Tim Mạch');
                    }}
                  >
                    Khoa Tim Mạch
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    className="manager-menu-item"
                    onClick={() => {
                      setTemplateMenuOpen(false);
                      handleLoadTemplate(DEPARTMENT_TEMPLATES.TIEU_HOA, 'Khoa Tiêu Hóa');
                    }}
                  >
                    Khoa Tiêu Hóa
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    className="manager-menu-item"
                    onClick={() => {
                      setTemplateMenuOpen(false);
                      handleLoadBundledTimMach();
                    }}
                  >
                    NS &amp; task Tim Mạch (repo)
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="table-wrapper">
        <table className="data-table">
          <thead>
            <tr>
              <th className="col-grip" aria-label="Thứ tự" />
              <th>Ký Hiệu</th>
              <th>Tên Nghiệp Vụ</th>
              <th>Nhóm Nghiệp Vụ</th>
              <th>Phân loại</th>
              <th>Cộng bù</th>
              <th>Biến động Bù</th>
              <th>Hiển Thị Màu</th>
              {!readOnly && <th className="col-actions">Thao Tác</th>}
            </tr>
          </thead>
          <tbody>
            {taskList.map(t => (
              <tr
                key={t.id}
                className={`data-row${overId === t.id && dragId !== t.id ? ' task-row-over' : ''}${readOnly ? '' : ' is-editable'}`}
                onClick={(event) => {
                  if (readOnly) return;
                  if (event.target.closest('.col-grip, .col-actions, button, a, input, select, textarea, label')) return;
                  setEditing(t);
                }}
                onDragOver={(event) => {
                  if (readOnly || !dragId) return;
                  event.preventDefault();
                  event.dataTransfer.dropEffect = 'move';
                  if (overId !== t.id) setOverId(t.id);
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  if (!readOnly) moveTask(dragId || event.dataTransfer.getData('text/plain'), t.id);
                  setDragId(null);
                  setOverId(null);
                }}
              >
                <td className="col-grip">
                  <button
                    type="button"
                    className={`row-grip ${dragId === t.id ? 'dragging' : ''}`}
                    draggable={!readOnly}
                    title="Kéo để đổi thứ tự"
                    aria-label={`Kéo để đổi thứ tự ${t.code}`}
                    onDragStart={(event) => {
                      setDragId(t.id);
                      event.dataTransfer.effectAllowed = 'move';
                      event.dataTransfer.setData('text/plain', t.id);
                    }}
                    onDragEnd={() => {
                      setDragId(null);
                      setOverId(null);
                    }}
                  >
                    <span className="row-grip-dots" aria-hidden="true" />
                  </button>
                </td>
                <td><span className="code-pill">{t.code}</span></td>
                <td>
                  <div style={{ fontWeight: 500 }}>{t.name}</div>
                  {t.description && <div className="task-desc" title={t.description}>{t.description}</div>}
                </td>
                <td className="text-muted-cell">{categoryLabel(t.category)}</td>
                <td>
                  {t.scope === 'month' ? 'Lịch tháng' : 'Lịch tuần'}
                  {t.warn === false && <div className="task-desc">Tắt cảnh báo</div>}
                  {t.dutyRole === 'vao_gac' && <div className="task-desc">Vai trò vào gác</div>}
                  {t.dutyRole === 'ra_truc' && <div className="task-desc">Vai trò ra trực</div>}
                  {t.dutyRole === 'truc_ngay' && <div className="task-desc">Vai trò trực ngày</div>}
                  {t.encodeDuty && <div className="task-desc">Mã hóa vào gác</div>}
                </td>
                <td>{[t.buRt && 'RT cộng bù', t.buVg && 'VG cộng bù'].filter(Boolean).join(', ') || <span className="text-muted-cell">Không</span>}</td>
                <td>{[t.buRt && `RT +${Number(t.deltaRt).toFixed(1).replace('.', ',')} ngày bù`, t.buVg && `VG +${Number(t.deltaVg).toFixed(1).replace('.', ',')} ngày bù`].filter(Boolean).join(' · ') || '0'}</td>
                <td>
                  <span className="color-preview" style={{ background: t.bgColor || '#374151', color: t.textColor || '#fff' }}>
                    {t.code} - {t.name}
                  </span>
                </td>
                {!readOnly && (
                  <td className="col-actions">
                    <button className="icon-btn edit" title="Sửa task" onClick={() => setEditing(t)}>
                      <Pencil size={15} />
                    </button>
                    <button className="icon-btn" title="Sao chép task" onClick={() => handleCopy(t)}>
                      <Copy size={15} />
                    </button>
                    <button className="icon-btn danger" title="Xóa task" onClick={() => handleDelete(t)}>
                      <Trash2 size={15} />
                    </button>
                  </td>
                )}
              </tr>
            ))}
            {taskList.length === 0 && (
              <tr>
                <td colSpan={readOnly ? 8 : 9} className="empty-cell">Chưa có task nào. Bấm “Thêm Task Mới” hoặc nạp danh mục mẫu.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {editing && !readOnly && (
        <TaskEditorModal
          title={editing === 'NEW' ? 'Thêm Nghiệp Vụ / Task Mới' : (editing.copyOf ? `Sao chép Task: ${editing.sourceCode}` : `Sửa Task: ${editing.code}`)}
          hint={editing?.copyOf ? 'Bản sao giữ nguyên thông tin task gốc. Đổi ký hiệu nếu cần, rồi lưu thành task mới.' : undefined}
          initialTask={editing === 'NEW' ? null : editing}
          submitLabel={isNew ? 'Lưu Task' : 'Lưu Thay Đổi'}
          taskList={taskList}
          categories={categories}
          staffList={staffList}
          onClose={() => setEditing(null)}
          onSave={handleSave}
          onAddCategory={onAddCategory}
          onDeleteCategory={onDeleteCategory}
        />
      )}

      {confirmDialog}
    </div>
  );
}
