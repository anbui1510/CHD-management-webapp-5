import React, { useRef, useState } from 'react';
import { Trash2, X } from 'lucide-react';
import { useConfirm } from './ConfirmDialog';
import { ModalPortal } from './ModalPortal';
import { taskOptionLabel } from '../logic/taskMatch';

const NEW_CATEGORY_OPTION = '__NEW_CATEGORY__';

const EMPTY_FORM = {
  code: '',
  name: '',
  category: 'THUONG_TRUC',
  scope: 'week',
  dutyRole: '',
  encodeDuty: false,
  buRt: false,
  buVg: false,
  deltaRt: 0,
  deltaVg: 0,
  bgColor: '#3b82f6',
  textColor: '#ffffff',
  description: '',
  fixedDays: [],
  fixedSlots: [],
  locks: [],
  owners: [],
  ownerOrder: [],
  rotate: false,
  warn: true,
  display: 'both'
};

const WEEKDAYS = [
  { id: 0, label: 'T2' },
  { id: 1, label: 'T3' },
  { id: 2, label: 'T4' },
  { id: 3, label: 'T5' },
  { id: 4, label: 'T6' },
  { id: 5, label: 'T7' },
  { id: 6, label: 'CN' }
];

function taskScope(value) {
  return value === 'month' ? 'month' : 'week';
}

function buAmount(value) {
  const stepped = Math.round(Number(value) * 2) / 2;
  if (!Number.isFinite(stepped) || stepped < 0.5) return 0.5;
  if (stepped > 3) return 3;
  return stepped;
}

function formatBu(value) {
  return Number(value).toFixed(1).replace('.', ',');
}

function buFields(task) {
  if (task?.buRt || task?.buVg) {
    return {
      buRt: !!task.buRt,
      buVg: !!task.buVg,
      deltaRt: task.buRt ? buAmount(task.deltaRt) : 0,
      deltaVg: task.buVg ? buAmount(task.deltaVg) : 0
    };
  }
  if (task?.buMode === 'RT') {
    return { buRt: true, buVg: false, deltaRt: buAmount(task.delta), deltaVg: 0 };
  }
  if (task?.buMode === 'VG') {
    return { buRt: false, buVg: true, deltaRt: 0, deltaVg: buAmount(task.delta) };
  }
  return { buRt: false, buVg: false, deltaRt: 0, deltaVg: 0 };
}

function BuStepper({ value, onChange }) {
  return (
    <div className="bu-stepper">
      <span className="bu-arrows">
        <button
          type="button"
          className="bu-step"
          aria-label="Tăng 0,5"
          disabled={value >= 3}
          onClick={() => onChange(buAmount(Number(value) + 0.5))}
        >
          <span className="bu-caret up" />
        </button>
        <button
          type="button"
          className="bu-step"
          aria-label="Giảm 0,5"
          disabled={value <= 0.5}
          onClick={() => onChange(buAmount(value - 0.5))}
        >
          <span className="bu-caret down" />
        </button>
      </span>
      <span className="bu-value">+{formatBu(value)}</span>
      <span className="bu-unit">ngày bù</span>
    </div>
  );
}

function dayList(value) {
  const raw = Array.isArray(value) ? value : [];
  return WEEKDAYS.map(day => day.id).filter(id => raw.includes(id));
}

function legacyDaySessions(task) {
  const spec = String(task?.session || '');
  const sessions = [];
  if (!spec || spec.includes('SANG')) sessions.push('S');
  if (spec.includes('CHIEU') || spec.includes('DEM')) sessions.push('C');
  return sessions.length ? sessions : ['S'];
}

function slotList(task) {
  const days = dayList(task?.fixedDays);
  const saved = Array.isArray(task?.fixedSlots)
    ? task.fixedSlots
      .map(slot => ({
        day: Number(slot?.day),
        session: slot?.session === 'C' ? 'C' : slot?.session === 'S' ? 'S' : ''
      }))
      .filter(slot => slot.session && days.includes(slot.day))
    : null;
  const source = saved || days.flatMap(day => legacyDaySessions(task).map(session => ({ day, session })));
  return WEEKDAYS.flatMap(day => ['S', 'C']
    .filter(session => source.some(slot => slot.day === day.id && slot.session === session))
    .map(session => ({ day: day.id, session })));
}

function hasSlot(slots, day, session) {
  return slots.some(slot => slot.day === day && slot.session === session);
}

function ownerList(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function lockList(value, taskList, selfId) {
  const known = new Set((taskList || []).map(task => task.id).filter(id => id && id !== selfId));
  return ownerList(value).filter(id => known.has(id));
}

function ordinal(index) {
  const n = index + 1;
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  if (n % 10 === 1) return `${n}st`;
  if (n % 10 === 2) return `${n}nd`;
  if (n % 10 === 3) return `${n}rd`;
  return `${n}th`;
}

function buildOwnerOrder(task, staffList) {
  const known = staffList.map(person => person.id);
  const knownSet = new Set(known);
  const saved = ownerList(task?.ownerOrder);
  const selected = ownerList(task?.owners);
  const base = saved.length ? saved : selected;
  return [
    ...base.filter(id => knownSet.has(id)),
    ...known.filter(id => !base.includes(id))
  ];
}

function moveBefore(order, fromId, toId) {
  if (!fromId || !toId || fromId === toId) return order;
  const next = order.filter(id => id !== fromId);
  const index = next.indexOf(toId);
  if (index < 0) return order;
  next.splice(index, 0, fromId);
  return next;
}

/** HTML color inputs only accept #rrggbb. */
function normalizeHexColor(value, fallback = '#3b82f6') {
  const raw = String(value || '').trim();
  if (/^#[0-9a-fA-F]{6}$/.test(raw)) return raw.toLowerCase();
  if (/^#[0-9a-fA-F]{3}$/.test(raw)) {
    const [, a, b, c] = raw;
    return `#${a}${a}${b}${b}${c}${c}`.toLowerCase();
  }
  if (/^[0-9a-fA-F]{6}$/.test(raw)) return `#${raw.toLowerCase()}`;
  return fallback;
}

function taskForm(task, staffList, taskList) {
  const selfId = task.copyOf ? null : task.id;
  return {
    code: task.code || '',
    name: task.name || '',
    category: task.category || 'CHUYEN_MON',
    scope: taskScope(task.scope),
    dutyRole: task.dutyRole || '',
    encodeDuty: !!task.encodeDuty,
    ...buFields(task),
    bgColor: normalizeHexColor(task.bgColor, '#3b82f6'),
    textColor: normalizeHexColor(task.textColor, '#ffffff'),
    description: task.description || '',
    fixedDays: dayList(task.fixedDays),
    fixedSlots: slotList(task),
    locks: lockList(task.locks, taskList, selfId),
    owners: ownerList(task.owners),
    ownerOrder: buildOwnerOrder(task, staffList),
    rotate: !!task.rotate,
    warn: task.warn !== false,
    display: task.display === 'week' || task.display === 'lower' ? task.display : 'both'
  };
}

export function TaskEditorModal({
  title,
  hint,
  taskList,
  categories,
  initialTask,
  submitLabel = 'Lưu Task',
  onClose,
  onSave,
  onAddCategory,
  onDeleteCategory,
  staffList = []
}) {
  const [form, setForm] = useState(() => initialTask ? taskForm(initialTask, staffList, taskList) : { ...EMPTY_FORM, ownerOrder: staffList.map(person => person.id) });
  const dragOwner = useRef({ id: null, moved: false });
  const [linkedTask, setLinkedTask] = useState(null);
  const [suggestFor, setSuggestFor] = useState(null);
  const [formError, setFormError] = useState('');
  const [isAddingCategory, setIsAddingCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [confirm, confirmDialog] = useConfirm();

  const selectedCategory = categories.find(c => c.key === form.category);
  const query = (suggestFor === 'name' ? form.name : form.code).trim().toLowerCase();
  const suggestions = query
    ? taskList.filter(task =>
      task.code.toLowerCase().includes(query) || task.name.toLowerCase().includes(query)
    ).slice(0, 8)
    : [];

  const resetCategoryInput = () => {
    setIsAddingCategory(false);
    setNewCategoryName('');
  };

  const applyTask = (task) => {
    setLinkedTask(task);
    setForm(taskForm(task, staffList, taskList));
    setSuggestFor(null);
    setFormError('');
  };

  const handleCategorySelect = (value) => {
    if (value === NEW_CATEGORY_OPTION) {
      setIsAddingCategory(true);
      setNewCategoryName('');
      return;
    }
    resetCategoryInput();
    setForm(current => ({ ...current, category: value }));
  };

  const handleSaveNewCategory = async () => {
    const label = newCategoryName.trim();
    if (!label) {
      setFormError('Vui lòng nhập tên nhóm nghiệp vụ mới.');
      return;
    }
    if (categories.some(c => c.label.toLowerCase() === label.toLowerCase())) {
      setFormError(`Nhóm nghiệp vụ "${label}" đã tồn tại.`);
      return;
    }
    const ok = await confirm({
      variant: 'primary',
      title: 'Lưu nhóm nghiệp vụ mới',
      message: <>Thêm nhóm <strong>“{label}”</strong> vào danh sách Nhóm Nghiệp Vụ của khoa?</>,
      confirmText: 'Lưu'
    });
    if (!ok) return;
    const key = `CUSTOM_${Date.now()}`;
    onAddCategory({ key, label });
    setForm(current => ({ ...current, category: key }));
    setFormError('');
    resetCategoryInput();
  };

  const handleDeleteCategory = async () => {
    if (!selectedCategory?.custom) return;
    const usedBy = taskList.filter(t => t.category === selectedCategory.key);
    if (usedBy.length > 0) {
      await confirm({
        variant: 'info',
        alertOnly: true,
        title: 'Không thể xóa nhóm nghiệp vụ',
        message: <>Nhóm <strong>“{selectedCategory.label}”</strong> đang có {usedBy.length} task ({usedBy.map(t => t.code).join(', ')}). Hãy chuyển các task này sang nhóm khác trước khi xóa.</>
      });
      return;
    }
    const ok = await confirm({
      variant: 'danger',
      title: 'Xóa nhóm nghiệp vụ',
      message: <>Bạn có chắc muốn xóa nhóm <strong>“{selectedCategory.label}”</strong>?</>,
      confirmText: 'Xóa'
    });
    if (!ok) return;
    onDeleteCategory(selectedCategory.key);
    setForm(current => ({ ...current, category: 'THUONG_TRUC' }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    event.stopPropagation();
    setFormError('');
    const code = form.code.trim();
    const name = form.name.trim();
    if (!code || !name) {
      setFormError('Nhập đủ ký hiệu và tên nghiệp vụ.');
      return;
    }
    if (isAddingCategory) {
      setFormError('Vui lòng Lưu hoặc Hủy nhóm nghiệp vụ mới đang nhập trước khi lưu task.');
      return;
    }
    const duplicate = !linkedTask && taskList.find(t => t.code.toLowerCase() === code.toLowerCase() && t.id !== initialTask?.id);
    if (duplicate) {
      setFormError(`Ký hiệu "${code}" đã được dùng cho task "${duplicate.name}". Chọn task đó trong gợi ý để dùng lại.`);
      setSuggestFor('code');
      return;
    }
    const payload = {
      code,
      name,
      category: form.category,
      scope: taskScope(form.scope),
      dutyRole: form.dutyRole || '',
      encodeDuty: !!form.encodeDuty,
      buRt: !!form.buRt,
      buVg: !!form.buVg,
      deltaRt: form.buRt ? buAmount(form.deltaRt) : 0,
      deltaVg: form.buVg ? buAmount(form.deltaVg) : 0,
      bgColor: normalizeHexColor(form.bgColor, '#3b82f6'),
      textColor: normalizeHexColor(form.textColor, '#ffffff'),
      description: form.description.trim(),
      fixedDays: dayList(form.fixedDays),
      fixedSlots: slotList({ fixedDays: form.fixedDays, fixedSlots: form.fixedSlots }),
      locks: lockList(form.locks, taskList, initialTask?.copyOf ? null : initialTask?.id),
      owners: form.ownerOrder.filter(id => form.owners.includes(id)),
      ownerOrder: form.ownerOrder,
      rotate: taskScope(form.scope) === 'week' && !!form.rotate,
      warn: form.warn !== false,
      display: form.display === 'week' || form.display === 'lower' ? form.display : 'both'
    };
    // Chỉ hỏi lại khi gắn task có sẵn vào khối tuần — nút Lưu đã là xác nhận.
    if (linkedTask) {
      const ok = await confirm({
        variant: 'primary',
        title: 'Dùng task đã có',
        message: <>Thêm <strong>{taskOptionLabel(linkedTask)}</strong> vào cuối mỗi khối tuần?</>,
        confirmText: 'Lưu'
      });
      if (!ok) return;
    }
    onSave(payload, linkedTask);
  };

  return (
    <ModalPortal>
    <div className="modal-overlay" onMouseDown={(event) => event.stopPropagation()}>
      <div className="modal-content" role="dialog" aria-modal="true">
        <div className="modal-header">
          <span>{title}</span>
          <button type="button" className="icon-btn" onClick={onClose} title="Đóng"><X size={18} /></button>
        </div>
        {hint && <p className="form-hint">{hint}</p>}
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="form-grid-2">
            <div className="form-group">
              <label className="form-label">Kí hiệu:</label>
              <input
                className="form-input"
                required
                autoFocus
                value={form.code}
                onChange={(event) => {
                  setLinkedTask(null);
                  setForm({ ...form, code: event.target.value });
                  setFormError('');
                  setSuggestFor('code');
                }}
                onFocus={() => setSuggestFor('code')}
                placeholder="VD: RO, SN, TN..."
              />
              {suggestFor === 'code' && suggestions.length > 0 && (
                <SuggestList tasks={suggestions} onPick={applyTask} />
              )}
            </div>
            <div className="form-group">
              <label className="form-label">Tên Nhiệm vụ:</label>
              <input
                className="form-input"
                required
                value={form.name}
                onChange={(event) => {
                  setLinkedTask(null);
                  setForm({ ...form, name: event.target.value });
                  setSuggestFor('name');
                }}
                onFocus={() => setSuggestFor('name')}
                placeholder="VD: Phòng khám ROBO"
              />
              {suggestFor === 'name' && suggestions.length > 0 && (
                <SuggestList tasks={suggestions} onPick={applyTask} />
              )}
            </div>
          </div>

          <div className="form-grid-2">
            <div className="form-group">
              <label className="form-label">Nhóm Nhiệm vụ:</label>
              <select
                className="form-select"
                value={isAddingCategory ? NEW_CATEGORY_OPTION : form.category}
                onChange={(event) => handleCategorySelect(event.target.value)}
              >
                {categories.map((c, i) => (
                  <option key={c.key} value={c.key}>{i + 1}. {c.label}</option>
                ))}
                <option value={NEW_CATEGORY_OPTION}>＋ Thêm mới nghiệp vụ...</option>
              </select>
              {isAddingCategory && (
                <div className="inline-add-row">
                  <input
                    className="form-input"
                    value={newCategoryName}
                    onChange={(event) => { setNewCategoryName(event.target.value); setFormError(''); }}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') { event.preventDefault(); handleSaveNewCategory(); }
                      if (event.key === 'Escape') { event.preventDefault(); resetCategoryInput(); }
                    }}
                    placeholder="Nhập tên nhóm nghiệp vụ mới"
                  />
                  <button type="button" className="action-btn primary" onClick={handleSaveNewCategory}>Lưu</button>
                  <button type="button" className="action-btn" onClick={resetCategoryInput}>Hủy</button>
                </div>
              )}
              {!isAddingCategory && selectedCategory?.custom && (
                <button type="button" className="link-btn danger" onClick={handleDeleteCategory}>
                  <Trash2 size={13} /> Xóa nhóm “{selectedCategory.label}”
                </button>
              )}
            </div>
            <div className="form-group">
              <label className="form-label">Vai trò trực:</label>
              <select
                className="form-select"
                value={form.dutyRole || ''}
                onChange={(event) => setForm(current => ({ ...current, dutyRole: event.target.value }))}
              >
                <option value="">Không</option>
                <option value="vao_gac">Vào gác</option>
                <option value="ra_truc">Ra trực</option>
                <option value="truc_ngay">Trực ngày</option>
              </select>
              <div className="task-desc">Nhiều task được giữ cùng một vai trò.</div>
            </div>
            <div className="form-group">
              <label className="form-label">Mã hóa vào gác:</label>
              <div className="choice-row">
                <button
                  type="button"
                  className={form.encodeDuty ? 'active' : ''}
                  aria-pressed={form.encodeDuty}
                  onClick={() => setForm(current => ({ ...current, encodeDuty: !current.encodeDuty }))}
                >
                  {form.encodeDuty ? 'Có' : 'Không'}
                </button>
              </div>
              <div className="task-desc">Chiều và tối đổ thành ký hiệu của task vai trò Vào gác đang tắt mã hóa. Sáng đổ thành task trực ngày đang tắt mã hóa. Ngày hôm sau đổ thành task ra trực đang tắt mã hóa. Nhiều task cùng tắt mã hóa thì lấy task đứng trước trong Quản lý Task.</div>
            </div>
            <div className="form-group">
              <label className="form-label">Phân loại thời gian:</label>
              <select
                className="form-select"
                value={form.scope}
                onChange={(event) => setForm(current => ({ ...current, scope: event.target.value }))}
              >
                <option value="week">Lịch tuần</option>
                <option value="month">Lịch tháng</option>
              </select>
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Vào gác / Ra trực có cộng bù?</label>
            <div className="choice-row" role="group" aria-label="Vào gác / Ra trực có cộng bù">
              <button
                type="button"
                className={form.buRt ? 'active' : ''}
                aria-pressed={form.buRt}
                onClick={() => setForm(current => ({
                  ...current,
                  buRt: !current.buRt,
                  deltaRt: current.buRt ? 0 : (current.deltaRt >= 0.5 ? buAmount(current.deltaRt) : 0.5)
                }))}
              >
                RT cộng bù
              </button>
              <button
                type="button"
                className={form.buVg ? 'active' : ''}
                aria-pressed={form.buVg}
                onClick={() => setForm(current => ({
                  ...current,
                  buVg: !current.buVg,
                  deltaVg: current.buVg ? 0 : (current.deltaVg >= 0.5 ? buAmount(current.deltaVg) : 0.5)
                }))}
              >
                VG cộng bù
              </button>
            </div>
          </div>
          {(form.buRt || form.buVg) && (
            <div className="form-grid-2">
              {form.buRt && (
                <div className="form-group">
                  <label className="form-label">{form.buVg ? 'Biến động Bù (RT):' : 'Biến động Bù:'}</label>
                  <BuStepper
                    value={form.deltaRt}
                    onChange={(deltaRt) => setForm(current => ({ ...current, deltaRt }))}
                  />
                </div>
              )}
              {form.buVg && (
                <div className="form-group">
                  <label className="form-label">{form.buRt ? 'Biến động Bù (VG):' : 'Biến động Bù:'}</label>
                  <BuStepper
                    value={form.deltaVg}
                    onChange={(deltaVg) => setForm(current => ({ ...current, deltaVg }))}
                  />
                </div>
              )}
            </div>
          )}
          <div className="form-hint">
            Chọn <strong>RT cộng bù</strong>, <strong>VG cộng bù</strong>, hoặc cả hai.
            Không chọn nút nào thì không cộng bù.
          </div>

          <div className="form-group">
            <label className="form-label">Ngày cố định trong tuần:</label>
            <div className="fixed-week" role="group" aria-label="Ngày cố định">
              {WEEKDAYS.map(day => {
                const dayOn = form.fixedDays.includes(day.id);
                return (
                  <div key={day.id} className={`fixed-day ${dayOn ? 'is-on' : ''}`}>
                    <button
                      type="button"
                      className={dayOn ? 'active' : ''}
                      aria-pressed={dayOn}
                      onClick={() => setForm(current => {
                        if (current.fixedDays.includes(day.id)) {
                          return {
                            ...current,
                            fixedDays: current.fixedDays.filter(id => id !== day.id),
                            fixedSlots: current.fixedSlots.filter(slot => slot.day !== day.id)
                          };
                        }
                        return { ...current, fixedDays: [...current.fixedDays, day.id] };
                      })}
                    >
                      {day.label}
                    </button>
                    <div className="fixed-sessions">
                      {['S', 'C'].map(session => {
                        const on = hasSlot(form.fixedSlots, day.id, session);
                        const label = session === 'S' ? 'Sáng' : 'Chiều';
                        return (
                          <button
                            key={session}
                            type="button"
                            className={on ? 'active' : ''}
                            aria-pressed={on}
                            aria-label={`${day.label} ${label}`}
                            onClick={() => setForm(current => {
                              const selected = hasSlot(current.fixedSlots, day.id, session);
                              return {
                                ...current,
                                fixedDays: current.fixedDays.includes(day.id) ? current.fixedDays : [...current.fixedDays, day.id],
                                fixedSlots: selected
                                  ? current.fixedSlots.filter(slot => !(slot.day === day.id && slot.session === session))
                                  : [...current.fixedSlots, { day: day.id, session }]
                              };
                            })}
                          >
                            {session}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
            <p className="form-hint">Chọn thứ, rồi chọn Sáng [S], Chiều [C], hoặc cả hai. Không chọn buổi thì thứ đó chưa được xếp.</p>
            {form.scope !== 'month' && (
              <div className="day-cal-study-long-row" style={{ marginTop: 10 }}>
                <span>Xoay vòng theo thứ tự trách nhiệm</span>
                <label className="switch" title={form.rotate ? 'Bật' : 'Tắt'}>
                  <input
                    type="checkbox"
                    checked={!!form.rotate}
                    onChange={(event) => setForm(current => ({ ...current, rotate: event.target.checked }))}
                  />
                  <span aria-hidden="true" />
                </label>
              </div>
            )}
            {form.scope !== 'month' && form.rotate && (
              <p className="form-hint">Ngày thứ nhất cho người 1st, ngày kế cho 2nd, rồi 3rd. Cả Sáng và Chiều của ngày đó thuộc một người. Người đó bận thì chỉ ngày đó đôn lên người kế tiếp.</p>
            )}
            {(form.category === 'THU_THUAT' || form.category === 'CHUYEN_MON') && (
              <div style={{ marginTop: 12 }}>
                <label className="form-label">Hiển thị</label>
                <div className="choice-row" role="group" aria-label="Hiển thị">
                  {[
                    ['week', 'Lịch Tuần'],
                    ['lower', 'Trực chuyên môn']
                  ].map(([id, label]) => {
                    const on = id === 'week' ? form.display !== 'lower' : form.display !== 'week';
                    return (
                      <button
                        key={id}
                        type="button"
                        className={on ? 'active' : ''}
                        aria-pressed={on}
                        onClick={() => setForm(current => {
                          const week = current.display !== 'lower';
                          const lower = current.display !== 'week';
                          const next = { week, lower, [id]: id === 'week' ? !week : !lower };
                          if (!next.week && !next.lower) return current;
                          const display = next.week && next.lower ? 'both' : (next.week ? 'week' : 'lower');
                          return { ...current, display };
                        })}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
                <p className="form-hint">Lịch gồm 2 phần: Lịch tuần, task sẽ hiển thị vào ô của BS. Trực chuyên môn, task sẽ hiển thị giống Lịch tháng.</p>
              </div>
            )}
            <label className="day-cal-study-long-row" style={{ marginTop: 10 }}>
              <span>Cảnh báo</span>
              <span className="switch" title={form.warn !== false ? 'Bật' : 'Tắt'}>
                <input
                  type="checkbox"
                  aria-label="Cảnh báo"
                  checked={form.warn !== false}
                  onChange={(event) => setForm(current => ({ ...current, warn: event.target.checked }))}
                />
                <span aria-hidden="true" />
              </span>
            </label>
            <p className="form-hint">Mặc định bật. Tắt khi chưa cần báo thiếu task này trên lịch tuần, ví dụ task giao cho học viên chưa đi học.</p>
          </div>

          <div className="form-group">
            <label className="form-label">Khóa:</label>
            <div className="choice-row" role="group" aria-label="Khóa">
              {taskList.filter(task => task.id !== initialTask?.id || initialTask?.copyOf).map(task => (
                <button
                  key={task.id}
                  type="button"
                  className={form.locks.includes(task.id) ? 'active' : ''}
                  aria-pressed={form.locks.includes(task.id)}
                  title={task.name}
                  onClick={() => setForm(current => ({
                    ...current,
                    locks: current.locks.includes(task.id)
                      ? current.locks.filter(id => id !== task.id)
                      : [...current.locks, task.id]
                  }))}
                >
                  {task.code}
                </button>
              ))}
            </div>
            <p className="form-hint">Người đang làm task này sẽ không được xếp các task đã chọn.</p>
          </div>

          <div className="form-group">
            <label className="form-label">Trách nhiệm:</label>
            <div className="choice-row owners" role="group" aria-label="Trách nhiệm">
              {form.ownerOrder.map((id, index) => {
                const person = staffList.find(item => item.id === id);
                if (!person) return null;
                return (
                  <button
                    key={person.id}
                    type="button"
                    draggable
                    className={`owner-chip ${form.owners.includes(person.id) ? 'active' : ''}`}
                    aria-pressed={form.owners.includes(person.id)}
                    title={`${ordinal(index)} · ${person.name}. Kéo để đổi thứ tự ưu tiên.`}
                    onDragStart={(event) => {
                      dragOwner.current = { id: person.id, moved: false };
                      event.dataTransfer.effectAllowed = 'move';
                      event.dataTransfer.setData('text/plain', person.id);
                    }}
                    onDragOver={(event) => {
                      event.preventDefault();
                      event.dataTransfer.dropEffect = 'move';
                      const fromId = dragOwner.current.id;
                      if (!fromId || fromId === person.id) return;
                      dragOwner.current.moved = true;
                      setForm(current => ({ ...current, ownerOrder: moveBefore(current.ownerOrder, fromId, person.id) }));
                    }}
                    onDrop={(event) => event.preventDefault()}
                    onDragEnd={() => {
                      dragOwner.current.id = null;
                    }}
                    onClick={() => {
                      if (dragOwner.current.moved) {
                        dragOwner.current.moved = false;
                        return;
                      }
                      setForm(current => ({
                        ...current,
                        owners: current.owners.includes(person.id)
                          ? current.owners.filter(ownerId => ownerId !== person.id)
                          : [...current.owners, person.id]
                      }));
                    }}
                  >
                    <span className="owner-rank">{ordinal(index)}</span>
                    {person.shortName}
                  </button>
                );
              })}
            </div>
            <p className="form-hint">Kéo thả để đổi thứ tự ưu tiên. Thẻ đầu tiên là 1st, kế tiếp là 2nd, 3rd, 4th. Bấm thẻ để chọn người được phụ trách.</p>
          </div>

          <div className="form-grid-2">
            <div className="form-group">
              <label className="form-label">Màu Nền Ô:</label>
              <div className="color-field">
                <input
                  type="color"
                  className="form-color"
                  value={normalizeHexColor(form.bgColor, '#3b82f6')}
                  onChange={(event) => setForm({ ...form, bgColor: normalizeHexColor(event.target.value, '#3b82f6') })}
                  aria-label="Chọn màu nền"
                />
                <input
                  type="text"
                  className="form-input"
                  value={form.bgColor}
                  onChange={(event) => setForm({ ...form, bgColor: event.target.value })}
                  onBlur={() => setForm((current) => ({ ...current, bgColor: normalizeHexColor(current.bgColor, '#3b82f6') }))}
                  spellCheck={false}
                  aria-label="Mã màu nền"
                />
                <span
                  className="color-preview"
                  style={{ background: normalizeHexColor(form.bgColor, '#3b82f6'), color: normalizeHexColor(form.textColor, '#ffffff') }}
                >
                  Aa
                </span>
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Màu Chữ:</label>
              <div className="color-field">
                <input
                  type="color"
                  className="form-color"
                  value={normalizeHexColor(form.textColor, '#ffffff')}
                  onChange={(event) => setForm({ ...form, textColor: normalizeHexColor(event.target.value, '#ffffff') })}
                  aria-label="Chọn màu chữ"
                />
                <input
                  type="text"
                  className="form-input"
                  value={form.textColor}
                  onChange={(event) => setForm({ ...form, textColor: event.target.value })}
                  onBlur={() => setForm((current) => ({ ...current, textColor: normalizeHexColor(current.textColor, '#ffffff') }))}
                  spellCheck={false}
                  aria-label="Mã màu chữ"
                />
                <span
                  className="color-preview"
                  style={{ background: normalizeHexColor(form.bgColor, '#3b82f6'), color: normalizeHexColor(form.textColor, '#ffffff') }}
                >
                  Aa
                </span>
              </div>
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Mô tả chi tiết:</label>
            <textarea
              className="form-input"
              rows={4}
              value={form.description}
              onChange={(event) => setForm({ ...form, description: event.target.value })}
              placeholder="VD: Thời gian, địa điểm, yêu cầu chuyên môn, người phối hợp, lưu ý khi thực hiện..."
            />
          </div>

          {formError && <div className="form-error">{formError}</div>}

          <div className="modal-actions">
            <button type="button" className="action-btn" onClick={onClose}>Hủy</button>
            <button type="submit" className="action-btn primary">{submitLabel}</button>
          </div>
        </form>
      </div>
      {confirmDialog}
    </div>
    </ModalPortal>
  );
}

function SuggestList({ tasks, onPick }) {
  return (
    <div className="task-suggest" role="listbox">
      {tasks.map(task => (
        <button key={task.id} type="button" className="task-suggest-item" onMouseDown={(event) => event.preventDefault()} onClick={() => onPick(task)}>
          <span className="code-pill" style={{ background: task.bgColor, color: task.textColor }}>{task.code}</span>
          <span>{task.name}</span>
        </button>
      ))}
    </div>
  );
}
