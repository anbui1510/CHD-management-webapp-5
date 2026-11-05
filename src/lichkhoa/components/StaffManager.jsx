import React, { useEffect, useState } from 'react';
import { UserPlus, Upload, Trash2, Pencil, X, Plus, ChevronRight } from 'lucide-react';
import { TITLE_OPTIONS, POSITION_OPTIONS, derivePositionFromTitle, getQuotaForTitle } from '../store/constants';
import { ACCESS_LEVELS, ACCESS_TABS, accessRoleLabel, normalizeAccess } from '../logic/access';
import { DUTY_WEEKDAYS, dutyScheduleTask, normalizeDuties } from '../logic/staffDuties';
import { showInLichKhoaLabel } from '../logic/showInLichKhoa.js';
import { useConfirm } from './ConfirmDialog';
import { ModalPortal } from './ModalPortal';

const EMPTY_FORM = {
  name: '',
  shortName: '',
  title: 'BS CK1',
  position: 'BS Cột 2',
  dutyQuota: 6,
  buBalance: 0,
  phepBalance: 12,
  email: '',
  taskDuties: [],
  accessRole: 'admin',
  access: normalizeAccess(null),
  deptId: '',
  deptLabel: ''
};

export function StaffManager({
  staffList,
  taskList = [],
  tenantDepartments = [],
  defaultDeptId = '',
  onAddStaff,
  onUpdateStaff,
  onDeleteStaff,
  onReorderStaff,
  onBulkImport,
  autoOpenAdd,
  onAutoOpenHandled,
  readOnly = false,
  /** When true: roster comes from CHD Staff — no add/delete/bulk; identity fields read-only */
  chdSynced = false,
}) {
  const canMutateRoster = !chdSynced && typeof onAddStaff === 'function';
  // editing: null (đóng) | 'NEW' (thêm mới) | object nhân sự đang sửa
  const [editing, setEditing] = useState(null);
  const [dragId, setDragId] = useState(null);
  const [overId, setOverId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [formError, setFormError] = useState('');
  const [openDuty, setOpenDuty] = useState('');
  const [isBulkModalOpen, setIsBulkModalOpen] = useState(false);
  const [bulkText, setBulkText] = useState('');
  const [confirm, confirmDialog] = useConfirm();

  const isNew = editing === 'NEW';

  const openAdd = () => {
    const fallbackDept = tenantDepartments.find((d) => d.id === defaultDeptId) || tenantDepartments[0];
    setForm({
      ...EMPTY_FORM,
      deptId: fallbackDept?.id || defaultDeptId || '',
      deptLabel: fallbackDept?.name || ''
    });
    setFormError('');
    setEditing('NEW');
  };

  const openEdit = (s) => {
    setForm({
      name: s.name || '',
      shortName: s.shortName || '',
      title: s.title || 'BS CK1',
      position: s.position || derivePositionFromTitle(s.title),
      dutyQuota: s.dutyQuota ?? getQuotaForTitle(s.title),
      buBalance: s.buBalance ?? 0,
      phepBalance: s.phepBalance ?? 0,
      email: s.email || '',
      studyFrom: s.studyFrom || '',
      studyTo: s.studyTo || '',
      taskDuties: normalizeDuties(s.taskDuties),
      accessRole: s.accessRole === 'member' ? 'member' : 'admin',
      access: normalizeAccess(s.access),
      deptId: s.deptId || '',
      deptLabel: s.deptLabel || ''
    });
    setFormError('');
    setEditing(s);
  };

  const closeModal = () => setEditing(null);

  // Mở form Thêm khi bấm nút "+ BS Mới" trên thanh điều hướng
  useEffect(() => {
    if (autoOpenAdd && !readOnly) {
      openAdd();
      onAutoOpenHandled?.();
    }
  }, [autoOpenAdd]);

  const updateDuty = (id, patch) => {
    setForm(current => ({
      ...current,
      taskDuties: current.taskDuties.map(row => (row.id === id ? { ...row, ...patch } : row))
    }));
  };

  const addDuty = () => {
    setForm(current => ({
      ...current,
      taskDuties: [...current.taskDuties, {
        id: `duty_${Date.now()}`,
        taskId: '',
        days: [],
        slots: [],
        substituteId: '',
        enabled: true
      }]
    }));
  };

  const removeDuty = (id) => {
    setForm(current => ({
      ...current,
      taskDuties: current.taskDuties.filter(row => row.id !== id)
    }));
  };

  const handleTitleChange = (title) => {
    setForm(f => ({ ...f, title, dutyQuota: getQuotaForTitle(title, f.dutyQuota) }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const name = form.name.trim();
    const shortName = form.shortName.trim().toUpperCase();
    if (!name || !shortName) return;

    const duplicate = staffList.find(s =>
      s.shortName.toUpperCase() === shortName && (isNew || s.id !== editing.id)
    );
    if (duplicate) {
      setFormError(`Tên viết tắt "${shortName}" đã được dùng cho ${duplicate.name}. Vui lòng chọn tên khác.`);
      return;
    }
    if (form.title === 'Học Viên' && form.studyFrom && form.studyTo && form.studyTo < form.studyFrom) {
      setFormError('Ngày kết thúc đi học phải sau ngày bắt đầu.');
      return;
    }

    const ok = await confirm({
      variant: 'primary',
      title: isNew ? 'Xác nhận thêm nhân sự' : 'Xác nhận lưu thay đổi',
      message: isNew
        ? <>Thêm <strong>{name}</strong> ({shortName}) vào danh sách bác sĩ?</>
        : <>Lưu thay đổi thông tin của <strong>{name}</strong> ({shortName})?</>,
      confirmText: 'Lưu'
    });
    if (!ok) return;

    const payload = {
      name,
      shortName,
      title: form.title,
      position: form.position,
      dutyQuota: Number(form.dutyQuota) || 0,
      buBalance: Number(form.buBalance) || 0,
      phepBalance: Number(form.phepBalance) || 0,
      email: form.email.trim() || `${shortName.toLowerCase()}@hospital.vn`,
      studyFrom: form.title === 'Học Viên' ? (form.studyFrom || '') : (form.studyFrom || ''),
      studyTo: form.title === 'Học Viên' ? (form.studyTo || '') : (form.studyTo || ''),
      taskDuties: normalizeDuties(form.taskDuties).filter(row => row.taskId),
      accessRole: form.accessRole === 'member' ? 'member' : 'admin',
      access: normalizeAccess(form.access),
      deptId: form.deptId || defaultDeptId || '',
      deptLabel: form.deptLabel || tenantDepartments.find((d) => d.id === form.deptId)?.name || ''
    };

    if (isNew) {
      onAddStaff({ id: `doc_${Date.now()}`, ...payload });
    } else {
      onUpdateStaff({ ...editing, ...payload }, editing.shortName);
    }
    closeModal();
  };

  const handleDelete = async (s) => {
    const ok = await confirm({
      variant: 'danger',
      title: 'Xác nhận xóa nhân sự',
      message: <>Bạn có chắc muốn xóa <strong>{s.name}</strong> ({s.shortName}) khỏi danh sách? Thao tác này không thể hoàn tác.</>,
      confirmText: 'Xóa'
    });
    if (ok) onDeleteStaff(s.id);
  };

  const handleBulkSubmit = () => {
    if (!bulkText.trim()) return;
    const lines = bulkText.split('\n');
    const newStaff = [];
    lines.forEach((line, idx) => {
      const parts = line.split('\t').length > 1 ? line.split('\t') : line.split(',');
      if (parts.length >= 2) {
        const name = parts[0].trim();
        const shortName = parts[1].trim().toUpperCase();
        const title = parts[2]?.trim() || 'BS CK1';
        const position = parts[3]?.trim() || derivePositionFromTitle(title);
        if (name && shortName) {
          newStaff.push({
            id: `doc_bulk_${Date.now()}_${idx}`,
            name,
            shortName,
            title,
            position,
            dutyQuota: getQuotaForTitle(title),
            buBalance: 0,
            phepBalance: 12,
            email: `${shortName.toLowerCase()}@hospital.vn`
          });
        }
      }
    });

    if (newStaff.length > 0) {
      onBulkImport(newStaff);
      setBulkText('');
      setIsBulkModalOpen(false);
    }
  };

  const moveStaff = (fromId, toId) => {
    if (!fromId || !toId || fromId === toId || !onReorderStaff) return;
    const moving = staffList.find(person => person.id === fromId);
    if (!moving) return;
    const next = staffList.filter(person => person.id !== fromId);
    const index = next.findIndex(person => person.id === toId);
    if (index < 0) return;
    next.splice(index, 0, moving);
    onReorderStaff(next);
  };

  return (
    <div className="view-container">
      <div className="section-header">
        <div>
          <h2 className="view-title">Quản Lý Bác Sĩ &amp; Nhân Sự</h2>
          <div className="sub-header-info">{staffList.length} nhân sự trong khoa</div>
        </div>

        {!readOnly && canMutateRoster && (
          <div className="manager-toolbar">
            <button
              type="button"
              className="action-btn primary icon-only"
              onClick={openAdd}
              title="Thêm bác sĩ mới"
              aria-label="Thêm bác sĩ mới"
            >
              <UserPlus size={18} />
            </button>
            <button
              type="button"
              className="action-btn"
              onClick={() => setIsBulkModalOpen(true)}
              title="Nhập hàng loạt từ Excel"
              aria-label="Nhập hàng loạt từ Excel"
            >
              <Upload size={16} /> Excel
            </button>
          </div>
        )}
        {chdSynced && (
          <div className="sub-header-info" style={{ marginTop: 4 }}>
            Danh sách từ CHD Staff (ShowInLichKhoa = On). Khoa/Phòng = cột Department trên Sheet Staff; chỉ sửa thuộc tính lịch tại đây.
          </div>
        )}
      </div>

      {/* Staff Table */}
      <div className="table-wrapper">
        <table className="data-table">
          <thead>
            <tr>
              <th className="col-grip" aria-label="Thứ tự" />
              <th>Họ và Tên</th>
              <th>Tên Viết Tắt</th>
              <th>Chức Danh</th>
              <th>Vị Trí</th>
              <th>Định Mức Ca</th>
              <th>Quỹ Bù</th>
              <th>Quỹ Phép</th>
              <th>Email</th>
              <th>Khoa / Phòng</th>
              <th>Hiển thị lịch</th>
              <th>Tài khoản liên kết</th>
              <th>Quyền</th>
              {!readOnly && <th className="col-actions">Thao Tác</th>}
            </tr>
          </thead>
          <tbody>
            {staffList.map(s => (
              <tr
                key={s.id}
                className={`data-row${overId === s.id && dragId !== s.id ? ' task-row-over' : ''}${readOnly ? '' : ' is-editable'}`}
                onClick={(event) => {
                  if (readOnly) return;
                  if (event.target.closest('.col-grip, .col-actions, button, a, input, select, textarea, label')) return;
                  openEdit(s);
                }}
                onDragOver={(event) => {
                  if (readOnly || !dragId) return;
                  event.preventDefault();
                  event.dataTransfer.dropEffect = 'move';
                  if (overId !== s.id) setOverId(s.id);
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  if (readOnly) return;
                  moveStaff(dragId || event.dataTransfer.getData('text/plain'), s.id);
                  setDragId(null);
                  setOverId(null);
                }}
              >
                <td className="col-grip">
                  <button
                    type="button"
                    className={`row-grip ${dragId === s.id ? 'dragging' : ''}`}
                    draggable={!readOnly}
                    title="Kéo để đổi thứ tự"
                    aria-label={`Kéo để đổi thứ tự ${s.shortName}`}
                    onDragStart={(event) => {
                      setDragId(s.id);
                      event.dataTransfer.effectAllowed = 'move';
                      event.dataTransfer.setData('text/plain', s.id);
                    }}
                    onDragEnd={() => {
                      setDragId(null);
                      setOverId(null);
                    }}
                  >
                    <span className="row-grip-dots" aria-hidden="true" />
                  </button>
                </td>
                <td style={{ fontWeight: 600 }}>{s.name}</td>
                <td><span className="code-pill">{s.shortName}</span></td>
                <td>
                  {s.title}
                  {s.title === 'Học Viên' && (s.studyFrom || s.studyTo) && (
                    <div className="text-muted-cell">
                      {s.studyFrom ? s.studyFrom.split('-').reverse().join('/') : '…'}
                      {' – '}
                      {s.studyTo ? s.studyTo.split('-').reverse().join('/') : '…'}
                    </div>
                  )}
                </td>
                <td><span className="position-pill">{s.position || derivePositionFromTitle(s.title)}</span></td>
                <td>{s.dutyQuota} ca/tháng</td>
                <td className="num-positive">{s.buBalance}</td>
                <td className="num-negative">{s.phepBalance}</td>
                <td className="text-muted-cell">{s.email}</td>
                <td className="text-muted-cell">{s.deptLabel || '—'}</td>
                <td>
                  <span className={`role-pill${showInLichKhoaLabel(s.showInLichKhoa) === 'Off' ? ' muted' : ''}`}>
                    {showInLichKhoaLabel(s.showInLichKhoa)}
                  </span>
                </td>
                <td className="text-muted-cell">{s.loginEmail || 'Chưa liên kết'}</td>
                <td><span className="role-pill">{accessRoleLabel(s)}</span></td>
                {!readOnly && (
                  <td className="col-actions">
                    <button className="icon-btn edit" title="Sửa thuộc tính lịch" onClick={() => openEdit(s)}>
                      <Pencil size={15} />
                    </button>
                    {canMutateRoster && (
                      <button className="icon-btn danger" title="Xóa nhân sự" onClick={() => handleDelete(s)}>
                        <Trash2 size={15} />
                      </button>
                    )}
                  </td>
                )}
              </tr>
            ))}
            {staffList.length === 0 && (
              <tr>
                <td colSpan={readOnly ? 13 : 14} className="empty-cell">Chưa có nhân sự nào. Bấm “Thêm Bác Sĩ Mới” để bắt đầu.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Add / Edit Staff Modal */}
      {editing && (
        <ModalPortal>
        <div className="modal-overlay" role="dialog" aria-modal="true">
          <div className="modal-content staff-editor">
            <div className="modal-header">
              <span>{isNew ? 'Thêm Bác Sĩ / Nhân Viên Mới' : `Sửa Thông Tin: ${editing.name}`}</span>
              <button className="icon-btn" onClick={closeModal} title="Đóng"><X size={18} /></button>
            </div>
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div className="form-group">
                <label className="form-label">Họ và Tên Đầy Đủ:</label>
                <input
                  className="form-input"
                  required
                  value={form.name}
                  onChange={e => setForm({ ...form, name: e.target.value })}
                  placeholder="VD: Bùi Đạt Thịnh"
                  readOnly={chdSynced}
                  disabled={chdSynced}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Tên Viết Tắt (Ký hiệu ô Lịch):</label>
                <input
                  className="form-input"
                  required
                  value={form.shortName}
                  onChange={e => { setForm({ ...form, shortName: e.target.value }); setFormError(''); }}
                  placeholder="VD: THỊNH"
                />
              </div>

              <div className="form-grid-2">
                <div className="form-group">
                  <label className="form-label">Chức Danh:</label>
                  <select className="form-select" value={form.title} onChange={e => handleTitleChange(e.target.value)}>
                    {TITLE_OPTIONS.map(t => (
                      <option key={t.value} value={t.value}>{t.value} ({t.quota} ca/tháng)</option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Vị Trí:</label>
                  <select className="form-select" value={form.position} onChange={e => setForm({ ...form, position: e.target.value })}>
                    {POSITION_OPTIONS.map(p => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </select>
                </div>
              </div>

              {form.title === 'Học Viên' && (
                <div className="form-grid-2">
                  <div className="form-group">
                    <label className="form-label">Bắt đầu đi học:</label>
                    <input type="date" className="form-input" value={form.studyFrom || ''} onChange={e => setForm(current => ({ ...current, studyFrom: e.target.value }))} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Kết thúc đi học:</label>
                    <input type="date" className="form-input" value={form.studyTo || ''} onChange={e => setForm(current => ({ ...current, studyTo: e.target.value }))} />
                  </div>
                </div>
              )}
              {form.title === 'Học Viên' && (
                <p className="form-hint">Lịch tuần và phân công bệnh phòng chỉ hiện tên trong khoảng này. Lịch tháng vẫn hiện tên. Để trống ngày bắt đầu thì lịch tuần hiện như hiện tại.</p>
              )}

              <div className="form-grid-3">
                <div className="form-group">
                  <label className="form-label">Định Mức Ca / Tháng:</label>
                  <input type="number" min="0" className="form-input" value={form.dutyQuota} onChange={e => setForm({ ...form, dutyQuota: e.target.value })} />
                </div>
                <div className="form-group">
                  <label className="form-label">Quỹ Bù:</label>
                  <input type="number" step="0.5" className="form-input" value={form.buBalance} onChange={e => setForm({ ...form, buBalance: e.target.value })} />
                </div>
                <div className="form-group">
                  <label className="form-label">Quỹ Phép:</label>
                  <input type="number" step="0.5" className="form-input" value={form.phepBalance} onChange={e => setForm({ ...form, phepBalance: e.target.value })} />
                </div>
              </div>

              {tenantDepartments.length > 0 && (
                <div className="form-group">
                  <label className="form-label">Khoa / phòng (F-305):</label>
                  <select
                    className="form-select"
                    value={form.deptId || ''}
                    onChange={(e) => {
                      const id = e.target.value;
                      const dept = tenantDepartments.find((d) => d.id === id);
                      setForm((current) => ({
                        ...current,
                        deptId: id,
                        deptLabel: dept?.name || ''
                      }));
                    }}
                  >
                    <option value="">— Chọn —</option>
                    {tenantDepartments.map((dept) => (
                      <option key={dept.id} value={dept.id}>{dept.name}</option>
                    ))}
                  </select>
                  <div className="form-hint">Nhân viên đăng nhập Google sẽ vào đúng khoa/phòng (ẩn bộ chọn khoa trên thanh tiêu đề).</div>
                </div>
              )}

              <div className="form-group">
                <label className="form-label">Email Nhận Lịch:</label>
                <input type="email" className="form-input" value={form.email} onChange={e => setForm(current => ({ ...current, email: e.target.value }))} placeholder="thinh.bd@hospital.vn" />
                <div className="form-hint">Email nhận lịch. Tài khoản đăng nhập được gắn khi nhân sự chọn hồ sơ này ở bước Liên kết hồ sơ.</div>
                {editing?.loginEmail && (
                  <div className="form-hint" style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 6 }}>
                    <span>Đang liên kết: {editing.loginEmail}</span>
                    <button
                      type="button"
                      className="action-btn"
                      onClick={async () => {
                        const ok = await confirm({
                          variant: 'danger',
                          title: 'Gỡ liên kết tài khoản',
                          message: <>Gỡ <strong>{editing.loginEmail}</strong> khỏi <strong>{editing.name}</strong>? Người đó sẽ phải chọn lại hồ sơ khi đăng nhập.</>,
                          confirmText: 'Gỡ liên kết'
                        });
                        if (!ok) return;
                        const next = { ...editing, loginEmail: '' };
                        onUpdateStaff(next, editing.shortName);
                        setEditing(next);
                      }}
                    >
                      Gỡ liên kết
                    </button>
                  </div>
                )}
              </div>

              <div className="form-group">
                <label className="form-label">Phân quyền:</label>
                <select
                  className="form-select"
                  value={form.accessRole === 'member' ? 'member' : 'admin'}
                  onChange={e => setForm(current => ({
                    ...current,
                    accessRole: e.target.value,
                    access: normalizeAccess(current.access)
                  }))}
                >
                  <option value="admin">Quản trị — thấy và sửa mọi tab</option>
                  <option value="member">Nhân viên — theo từng tab</option>
                </select>
                {form.accessRole === 'member' && (
                  <div className="access-grid">
                    {ACCESS_TABS.map(tab => {
                      const current = normalizeAccess(form.access)[tab.id];
                      return (
                        <div key={tab.id} className="access-row">
                          <span>{tab.label}</span>
                          <div className="choice-row compact" role="group" aria-label={tab.label}>
                            {ACCESS_LEVELS.map(level => (
                              <button
                                key={level.id}
                                type="button"
                                className={current === level.id ? 'active' : ''}
                                aria-pressed={current === level.id}
                                onClick={() => setForm(prev => ({
                                  ...prev,
                                  access: { ...normalizeAccess(prev.access), [tab.id]: level.id }
                                }))}
                              >
                                {level.label}
                              </button>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="form-group">
                <label className="form-label">Task của nhân sự:</label>
                <p className="form-hint">Bấm &gt; để chọn thứ và mở Sáng [S], Chiều [C]. Thứ chưa có buổi thì chưa đổ vào lịch tuần. Bấm tên thứ để bỏ thứ đó.</p>
                <div className="staff-task-table">
                  <div className="staff-task-head">
                    <span>Task</span>
                    <span>Ngày trong tuần</span>
                    <span>Người thay thế</span>
                    <span>Bật</span>
                  </div>
                  {form.taskDuties.map(row => {
                    const taken = new Set(form.taskDuties.filter(item => item.id !== row.id).map(item => item.taskId));
                    const slots = row.slots || [];
                    const choices = taskList.filter(task => dutyScheduleTask(task) || task.id === row.taskId);
                    const toggleSession = (dayId, session) => {
                      const has = slots.some(slot => slot.day === dayId && slot.session === session);
                      updateDuty(row.id, {
                        days: row.days.includes(dayId) ? row.days : [...row.days, dayId],
                        slots: has
                          ? slots.filter(slot => !(slot.day === dayId && slot.session === session))
                          : [...slots, { day: dayId, session }]
                      });
                    };
                    return (
                      <div key={row.id} className={`staff-task-row ${row.enabled ? '' : 'off'}`}>
                        <select
                          className="form-select"
                          value={row.taskId}
                          onChange={e => updateDuty(row.id, { taskId: e.target.value })}
                        >
                          <option value="">Chọn task</option>
                          {choices.map(task => (
                            <option key={task.id} value={task.id} disabled={taken.has(task.id)}>
                              {task.code} – {task.name}
                            </option>
                          ))}
                        </select>
                        <div className="duty-days" role="group" aria-label="Ngày trong tuần">
                          {DUTY_WEEKDAYS.map(day => {
                            const key = `${row.id}:${day.id}`;
                            const open = openDuty === key;
                            const picked = ['S', 'C'].filter(session => slots.some(slot => slot.day === day.id && slot.session === session));
                            const on = row.days.includes(day.id) || picked.length > 0;
                            return (
                              <div key={day.id} className={`duty-day ${on ? 'on' : ''} ${open ? 'open' : ''}`}>
                                <button
                                  type="button"
                                  className="duty-caret"
                                  aria-expanded={open}
                                  aria-label={open ? `Thu ${day.label}` : `Chọn ${day.label}`}
                                  title={open ? `Thu ${day.label}` : `Chọn ${day.label}`}
                                  onClick={() => {
                                    if (open) {
                                      setOpenDuty('');
                                      return;
                                    }
                                    setOpenDuty(key);
                                    if (!row.days.includes(day.id)) {
                                      updateDuty(row.id, { days: [...row.days, day.id] });
                                    }
                                  }}
                                >
                                  <ChevronRight size={12} />
                                </button>
                                <button
                                  type="button"
                                  className="duty-name"
                                  aria-pressed={on}
                                  title={on ? `Bỏ ${day.label}` : `Chọn ${day.label}`}
                                  onClick={() => {
                                    if (!on) {
                                      setOpenDuty(key);
                                      updateDuty(row.id, { days: [...row.days, day.id] });
                                      return;
                                    }
                                    if (open) setOpenDuty('');
                                    updateDuty(row.id, {
                                      days: row.days.filter(id => id !== day.id),
                                      slots: slots.filter(slot => slot.day !== day.id)
                                    });
                                  }}
                                >
                                  {day.label}
                                  {!open && picked.length > 0 && <em className="duty-mark">{picked.join('')}</em>}
                                </button>
                                {open && ['S', 'C'].map(session => (
                                  <button
                                    key={session}
                                    type="button"
                                    className={`duty-session ${picked.includes(session) ? 'active' : ''}`}
                                    aria-pressed={picked.includes(session)}
                                    aria-label={`${day.label} ${session === 'S' ? 'Sáng' : 'Chiều'}`}
                                    onClick={() => toggleSession(day.id, session)}
                                  >
                                    {session}
                                  </button>
                                ))}
                              </div>
                            );
                          })}
                        </div>
                        <select
                          className="form-select"
                          value={row.substituteId}
                          onChange={e => updateDuty(row.id, { substituteId: e.target.value })}
                        >
                          <option value="">Không</option>
                          {staffList.filter(person => isNew || person.id !== editing.id).map(person => (
                            <option key={person.id} value={person.id}>{person.shortName}</option>
                          ))}
                        </select>
                        <div className="staff-task-switch">
                          <label className="switch" title={row.enabled ? 'Đang bật' : 'Đang tắt'}>
                            <input
                              type="checkbox"
                              checked={row.enabled}
                              onChange={e => updateDuty(row.id, { enabled: e.target.checked })}
                            />
                            <span />
                          </label>
                          <button type="button" className="icon-btn danger" title="Xóa task" onClick={() => removeDuty(row.id)}>
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <button type="button" className="action-btn" onClick={addDuty}>
                  <Plus size={16} /> Thêm task
                </button>
              </div>

              {formError && <div className="form-error">{formError}</div>}

              <div className="modal-actions">
                <button type="button" className="action-btn" onClick={closeModal}>Hủy</button>
                <button type="submit" className="action-btn primary">{isNew ? 'Lưu Nhân Sự' : 'Lưu Thay Đổi'}</button>
              </div>
            </form>
          </div>
        </div>
        </ModalPortal>
      )}

      {/* Bulk Import Modal */}
      {isBulkModalOpen && (
        <ModalPortal>
        <div className="modal-overlay" role="dialog" aria-modal="true">
          <div className="modal-content">
            <div className="modal-header">
              <span>Nhập Hàng Loạt Danh Sách Nhân Viên từ Excel</span>
              <button className="icon-btn" onClick={() => setIsBulkModalOpen(false)} title="Đóng"><X size={18} /></button>
            </div>
            <div className="form-hint">
              Dán dữ liệu copy từ Excel/Google Sheets theo định dạng từng dòng:{' '}
              <code>Họ và Tên [Tab] Tên Viết Tắt [Tab] Chức Danh [Tab] Vị Trí</code>
              {' '}(Chức Danh và Vị Trí có thể bỏ trống).
            </div>
            <textarea
              rows={8}
              className="form-input"
              value={bulkText}
              onChange={e => setBulkText(e.target.value)}
              placeholder={`Bùi Đạt Thịnh\tTHỊNH\tBS CK1\tBS Cột 2\nPhan Tiến Lợi\tLỢI\tTrưởng Khoa\tBS Trưởng Khoa\nLương Hoài Ân\tÂN\tBS Trẻ\tBS Cột 1`}
            />
            <div className="modal-actions">
              <button className="action-btn" onClick={() => setIsBulkModalOpen(false)}>Hủy</button>
              <button className="action-btn primary" onClick={handleBulkSubmit}>Nạp Dữ Liệu Excel</button>
            </div>
          </div>
        </div>
        </ModalPortal>
      )}

      {confirmDialog}
    </div>
  );
}
