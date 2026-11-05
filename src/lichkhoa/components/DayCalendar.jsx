import React, { useEffect, useRef, useState } from 'react';
import { useConfirm } from './ConfirmDialog';
import {
  WEEK_SHORT,
  addDays,
  cleanRepeat,
  leaveAfterRemoval,
  monthlyDateLabel,
  monthlyWeekdayLabel,
  presetRule,
  repeatPresetOf,
  repeatSummary,
  retargetRepeat,
  seriesLeave,
  weeklyLabel,
  weekdayIndex,
  yearlyLabel,
  leaveCovers
} from '../logic/leaveRepeat';

const WEEKDAYS = ['Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7', 'Chủ nhật'];
const LEAVE_TYPES = [
  { id: 'P', label: 'Nghỉ Phép (P)' },
  { id: 'CT', label: 'Công tác (CT)' },
  { id: 'H', label: 'Học (H)' }
];
const SESSIONS = [
  { id: 'S', label: 'Sáng' },
  { id: 'C', label: 'Chiều' }
];

function monthCells(monthKey) {
  const [year, month] = monthKey.split('-').map(Number);
  const first = new Date(year, month - 1, 1);
  const lead = (first.getDay() + 6) % 7;
  const count = new Date(year, month, 0).getDate();
  const cells = [];
  for (let index = 0; index < lead; index += 1) cells.push(null);
  for (let day = 1; day <= count; day += 1) {
    cells.push(`${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`);
  }
  while (cells.length % 7) cells.push(null);
  return cells;
}

function vnDate(iso) {
  const [year, month, day] = String(iso || '').split('-');
  if (!year || !month || !day) return '';
  return `${day}/${month}/${year}`;
}

function todayIso() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function covers(entry, iso) {
  return leaveCovers(entry, iso);
}

function ordered(entries, iso) {
  return (entries || [])
    .filter(item => covers(item, iso))
    .slice()
    .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0) || String(a.id).localeCompare(String(b.id)));
}

function sessionIds(entry) {
  if (Array.isArray(entry?.sessions)) {
    return SESSIONS.map(item => item.id).filter(id => entry.sessions.includes(id));
  }
  if (entry?.session === 'C' || entry?.session === 'S') return [entry.session];
  return [];
}

function sessionText(entry) {
  return sessionIds(entry).map(id => (id === 'C' ? 'Chiều' : 'Sáng')).join(', ');
}

function defaultRange(monthKey) {
  const today = todayIso();
  const start = today.startsWith(monthKey) ? today : `${monthKey}-01`;
  return { from: start, to: start };
}

function blankLong(monthKey, mode) {
  const range = defaultRange(monthKey);
  return { ...blankForm(range.from, mode), long: true, from: range.from, to: range.to };
}

function blankForm(iso, mode) {
  const isLeave = mode === 'leave';
  return {
    iso,
    from: iso,
    to: iso,
    shortName: '',
    type: isLeave ? 'P' : '',
    taskId: '',
    topic: '',
    note: '',
    session: '',
    sessions: [],
    plannedLong: false
  };
}

function foldTeach(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

function teachTasksOf(taskList) {
  const rank = (task) => {
    const code = foldTeach(task.code);
    if (code === 'day sv') return 0;
    if (code === 'day sv ht' || foldTeach(task.name).includes('hoi truong')) return 1;
    if (code.replace(/\s+/g, '').includes('12')) return 2;
    if (code.includes('cme') || code.includes('tmcb')) return 3;
    return 4;
  };
  return (taskList || [])
    .filter(task => task.category === 'GIANG_DAY' && String(task.code || '').trim())
    .slice()
    .sort((a, b) => rank(a) - rank(b) || String(a.code).localeCompare(String(b.code), 'vi'));
}

function teachLabel(task) {
  const code = String(task?.code || '').trim();
  const name = String(task?.name || '').trim();
  if (!name || foldTeach(name) === foldTeach(code)) return code;
  return `${code} — ${name}`;
}

function teachTaskOf(row, tasks) {
  if (!row) return null;
  return tasks.find(task => task.id === row.taskId)
    || tasks.find(task => foldTeach(task.code) === foldTeach(row.topic) || foldTeach(task.name) === foldTeach(row.topic))
    || null;
}

function plannedLongFlag(row) {
  return Boolean(row?.plannedLong ?? row?.studyLong);
}

function leaveModalTitle(draft, leave) {
  if (leave) {
    if (draft.id) return 'Sửa đăng ký Lịch nghỉ';
    if (draft.long) return 'Đăng ký Lịch nghỉ dài hạn';
    return 'Đăng ký Lịch nghỉ';
  }
  if (draft.id) return 'Sửa đăng ký Lịch dạy học';
  if (draft.long) return 'Đăng ký Lịch dạy học dài hạn';
  return 'Đăng ký Lịch dạy học';
}

export function DayCalendar({ mode, monthKey, entries, staffList, taskList = [], onSave, onDelete, longNonce = 0, readOnly = false, hidden = false }) {
  const [draft, setDraft] = useState(null);
  const [focusIso, setFocusIso] = useState(null);
  const [repeatEdit, setRepeatEdit] = useState(null);
  const [seriesRemove, setSeriesRemove] = useState(null);
  const [confirm, confirmDialog] = useConfirm();
  const seenLong = useRef(0);
  const cells = monthCells(monthKey);
  const today = todayIso();
  const leave = mode === 'leave';
  const teachTasks = teachTasksOf(taskList);
  const pickedSessions = sessionIds(draft);

  useEffect(() => {
    if (readOnly || !longNonce || longNonce === seenLong.current) return;
    seenLong.current = longNonce;
    setDraft(blankLong(monthKey, mode));
  }, [longNonce, monthKey, mode, readOnly]);

  const toggleSession = (id) => {
    const next = pickedSessions.includes(id)
      ? pickedSessions.filter(item => item !== id)
      : [...pickedSessions, id];
    setDraft({ ...draft, sessions: next, session: next[0] || '' });
  };

  const removeEntry = async (row, iso) => {
    const stored = (entries || []).find(item => item.id === row.id) || row;
    const day = iso || focusIso || stored.from || stored.iso;
    if (seriesLeave(stored) && day) {
      setSeriesRemove({ row: stored, iso: day, scope: 'one' });
      return;
    }
    const ok = await confirm({
      variant: 'danger',
      title: leave ? 'Xóa đăng ký nghỉ' : 'Xóa đăng ký dạy học',
      message: `Xóa đăng ký của ${row.shortName || 'mục này'}?`,
      confirmText: 'Xóa',
      cancelText: 'Hủy'
    });
    if (!ok) return;
    onDelete(row.id);
    setDraft(current => (current?.id === row.id ? null : current));
    setFocusIso(null);
  };

  const applySeriesRemove = () => {
    const { row, iso, scope } = seriesRemove;
    const next = leaveAfterRemoval(row, iso, scope);
    if (!next) onDelete(row.id);
    else onSave(next);
    setSeriesRemove(null);
    setRepeatEdit(null);
    setDraft(current => (current?.id === row.id ? null : current));
    setFocusIso(null);
  };

  const commit = (event) => {
    event.preventDefault();
    const shortName = draft.shortName.trim();
    if (!shortName) return;
    const sessions = sessionIds(draft);
    if (!sessions.length) return;
    const task = leave ? null : teachTaskOf({ taskId: draft.type, topic: draft.topic }, teachTasks);
    if (!leave && !task) return;
    const from = draft.from || draft.iso;
    const to = draft.to || from;
    if (!from || !to || from > to) return;
    const repeat = cleanRepeat(draft.repeat, from);
    onSave({
      id: draft.id || `${leave ? 'leave' : 'study'}_${Date.now()}`,
      iso: from,
      from,
      to,
      shortName,
      type: leave ? draft.type : task.id,
      ...(leave ? {} : { taskId: task.id }),
      topic: leave ? '' : task.code,
      note: draft.note.trim(),
      session: sessions[0],
      sessions,
      plannedLong: plannedLongFlag(draft),
      ...(repeat ? { repeat } : {}),
      ...((Array.isArray(draft.exdates) && draft.exdates.some(day => day >= from))
        ? { exdates: draft.exdates.filter(day => day >= from) }
        : {}),
      createdAt: draft.createdAt || Date.now()
    });
    setDraft(null);
    setRepeatEdit(null);
    setFocusIso(null);
  };

  const fromIso = draft?.from || draft?.iso || todayIso();
  const repeatValue = draft?.repeat?.freq ? (draft.repeat.preset || 'custom') : 'none';

  const chooseRepeat = (value) => {
    if (value === 'custom') {
      openRepeat();
      return;
    }
    setDraft({ ...draft, repeat: value === 'none' ? null : presetRule(value, fromIso) });
  };

  const openRepeat = () => {
    const current = draft.repeat?.freq ? draft.repeat : presetRule('weekly', fromIso);
    setRepeatEdit({
      freq: current.freq || 'week',
      interval: current.interval || 1,
      byDay: current.byDay?.length ? [...current.byDay] : [weekdayIndex(fromIso)],
      monthMode: current.monthMode || 'date',
      end: current.end || 'never',
      until: current.until || addDays(fromIso, 30),
      count: current.count || 13
    });
  };

  const finishRepeat = () => {
    let next = { ...repeatEdit, preset: 'custom' };
    if (next.end === 'until' && (!next.until || next.until < fromIso)) next = { ...next, until: fromIso };
    const cleaned = cleanRepeat(next, fromIso);
    if (cleaned) cleaned.preset = repeatPresetOf(cleaned, fromIso);
    setDraft({ ...draft, repeat: cleaned });
    setRepeatEdit(null);
  };

  const toggleRepeatDay = (day) => {
    const current = repeatEdit.byDay || [];
    const next = current.includes(day) ? current.filter(item => item !== day) : [...current, day];
    setRepeatEdit({ ...repeatEdit, byDay: next.length ? next : [day] });
  };

  return (
    <div className="day-cal" hidden={hidden || undefined}>
      <div className="day-cal-week">
        {WEEKDAYS.map(label => <div key={label}>{label}</div>)}
      </div>
      <div className="day-cal-grid">
        {cells.map((iso, index) => {
          if (!iso) return <div key={`empty-${index}`} className="day-cal-cell is-empty" />;
          const rows = ordered(entries, iso);
          const day = Number(iso.slice(8));
          return (
            <div key={iso} className={`day-cal-cell ${iso === today ? 'is-today' : ''}`}>
              <div className="day-cal-head">
                {!readOnly ? (
                  <button type="button" className="day-cal-add" title="Thêm" onClick={() => { setFocusIso(iso); setDraft(blankForm(iso, mode)); }}>+</button>
                ) : <span />}
                <div className="day-cal-num">{day}</div>
              </div>
              <div className="day-cal-rows">
                {rows.map(row => {
                  const teach = leave ? null : teachTaskOf(row, teachTasks);
                  return (
                  <div key={`${row.id}-${iso}`} className={`day-cal-row type-${leave ? row.type : 'study'}`}>
                    <button type="button" className="day-cal-row-main" onClick={() => {
                      if (readOnly) return;
                      setFocusIso(iso);
                      setDraft({
                      ...row,
                      from: row.from || row.iso,
                      to: row.to || row.from || row.iso,
                      type: leave ? row.type : (teach?.id || ''),
                      sessions: sessionIds(row),
                      plannedLong: plannedLongFlag(row)
                    });
                    }}>
                      <b>{row.shortName}</b>
                      <span>{(leave ? row.type : (teach?.code || row.topic))}{row.repeat ? ' ↻' : ''}</span>
                      <span>{sessionText(row)}</span>
                      {row.note ? <span className="day-cal-note">{row.note}</span> : null}
                    </button>
                    {!readOnly && (
                      <button type="button" className="day-cal-remove" title="Xóa" onClick={() => removeEntry(row, iso)}>×</button>
                    )}
                  </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {draft && (
        <div className="modal-overlay" onMouseDown={() => { setDraft(null); setRepeatEdit(null); setFocusIso(null); }}>
          <form className="modal-content day-cal-form" onMouseDown={(event) => event.stopPropagation()} onSubmit={commit}>
            <div className="modal-header">
              <span>{leaveModalTitle(draft, leave)}</span>
              <button type="button" className="day-cal-close" onClick={() => { setDraft(null); setFocusIso(null); }}>×</button>
            </div>
            <label className="form-group">
              {leave ? 'Nhân viên đăng ký nghỉ' : 'Người được phân công'}
              <input
                list="day-cal-staff"
                value={draft.shortName}
                onChange={(event) => setDraft({ ...draft, shortName: event.target.value })}
                required
                autoFocus
              />
              <datalist id="day-cal-staff">
                {staffList.map(person => <option key={person.id} value={person.shortName}>{person.name}</option>)}
              </datalist>
            </label>
            {leave ? (
              <label className="form-group">
                Loại nghỉ phép
                <select value={draft.type} onChange={(event) => setDraft({ ...draft, type: event.target.value })}>
                  {LEAVE_TYPES.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
                </select>
              </label>
            ) : (
              <label className="form-group">
                Phân loại
                <select value={draft.type || ''} required onChange={(event) => setDraft({ ...draft, type: event.target.value })}>
                  <option value="">Chọn task giảng dạy</option>
                  {teachTasks.map(task => <option key={task.id} value={task.id}>{teachLabel(task)}</option>)}
                </select>
                {!teachTasks.length ? (
                  <p className="day-cal-study-long-hint">Chưa có task giảng dạy. Thêm trong Quản lý Task, nhóm Giảng dạy.</p>
                ) : null}
              </label>
            )}
            <div className="day-cal-range">
                <label className="form-group">
                  Từ ngày
                  <input type="date" value={draft.from || ''} required onChange={(event) => {
                    const from = event.target.value;
                    setDraft({
                      ...draft,
                      from,
                      to: draft.to && draft.to < from ? from : draft.to,
                      repeat: retargetRepeat(draft.repeat, from)
                    });
                  }} />
                </label>
                <label className="form-group">
                  Đến ngày
                  <input type="date" value={draft.to || ''} min={draft.from || undefined} required onChange={(event) => setDraft({ ...draft, to: event.target.value })} />
                </label>
            </div>
            <div className="form-group">
                Buổi
                <div className="session-choice" role="group" aria-label="Buổi">
                  {SESSIONS.map(item => (
                    <button
                      key={item.id}
                      type="button"
                      className={pickedSessions.includes(item.id) ? 'active' : ''}
                      aria-pressed={pickedSessions.includes(item.id)}
                      onClick={() => toggleSession(item.id)}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
                <p className="day-cal-study-long-hint">Chọn Sáng, Chiều, hoặc cả hai. Chưa chọn thì chưa lưu được.</p>
              </div>
            <div className="form-group">
                Lặp lại
                <select value={repeatValue} onChange={(event) => chooseRepeat(event.target.value)}>
                  <option value="none">Không lặp lại</option>
                  <option value="daily">Hàng ngày</option>
                  <option value="weekly">{weeklyLabel(fromIso)}</option>
                  <option value="monthly">{monthlyWeekdayLabel(fromIso)}</option>
                  <option value="yearly">{yearlyLabel(fromIso)}</option>
                  <option value="weekdays">Mỗi ngày trong tuần (từ thứ Hai tới thứ Sáu)</option>
                  <option value="custom">Tùy chỉnh...</option>
                </select>
                {draft.repeat?.freq ? (
                  <p className="day-cal-study-long-hint">{repeatSummary(draft.repeat, fromIso)}. Đến ngày là độ dài một lần {leave ? 'nghỉ' : 'dạy'}.</p>
                ) : null}
                {draft.repeat?.freq ? (
                  <button type="button" className="day-cal-repeat-edit" onClick={openRepeat}>Sửa cách lặp</button>
                ) : null}
              </div>
            <div className="form-group day-cal-study-long">
                <div className="day-cal-study-long-row">
                  <span>{leave ? 'Nghỉ dài hạn có kế hoạch' : 'Dạy dài hạn có kế hoạch'}</span>
                  <label className="switch" title={plannedLongFlag(draft) ? 'Bật' : 'Tắt'}>
                    <input
                      type="checkbox"
                      checked={plannedLongFlag(draft)}
                      onChange={(event) => setDraft({ ...draft, plannedLong: event.target.checked })}
                    />
                    <span aria-hidden="true" />
                  </label>
                </div>
                <p className="day-cal-study-long-hint">
                  {leave
                    ? 'Học/nghỉ dài hạn có kế hoạch trước sẽ không hiện cảnh báo khi xếp lịch'
                    : 'Dạy dài hạn có kế hoạch trước sẽ không ghi đè ô đã có lịch và không hiện cảnh báo'}
                </p>
              </div>
            <label className="form-group">
              Ghi chú
              <input value={draft.note} onChange={(event) => setDraft({ ...draft, note: event.target.value })} />
            </label>
            <div className="day-cal-actions">
              {draft.id && (
                <button type="button" className="action-btn" onClick={() => removeEntry(draft, focusIso)}>Xóa</button>
              )}
              <button type="submit" className="action-btn primary" disabled={!pickedSessions.length || (!leave && !draft.type)}>Lưu</button>
            </div>
          </form>
        </div>
      )}
      {repeatEdit && (
        <div className="modal-overlay repeat-overlay" onMouseDown={() => setRepeatEdit(null)}>
          <div className="modal-content day-cal-form repeat-dialog" onMouseDown={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <span>Lặp lại tùy chỉnh</span>
              <button type="button" className="day-cal-close" onClick={() => setRepeatEdit(null)}>×</button>
            </div>
            <div className="form-group">
              Lặp lại mỗi
              <div className="repeat-every">
                <input
                  type="number"
                  min="1"
                  max="99"
                  value={repeatEdit.interval}
                  onChange={(event) => setRepeatEdit({ ...repeatEdit, interval: Math.max(1, Number(event.target.value) || 1) })}
                />
                <select
                  value={repeatEdit.freq}
                  onChange={(event) => {
                    const freq = event.target.value;
                    setRepeatEdit({
                      ...repeatEdit,
                      freq,
                      byDay: freq === 'week' && !(repeatEdit.byDay || []).length ? [weekdayIndex(fromIso)] : repeatEdit.byDay
                    });
                  }}
                >
                  <option value="day">ngày</option>
                  <option value="week">tuần</option>
                  <option value="month">tháng</option>
                  <option value="year">năm</option>
                </select>
              </div>
            </div>
            {repeatEdit.freq === 'week' && (
              <div className="form-group">
                Lặp lại vào
                <div className="repeat-days" role="group" aria-label="Ngày trong tuần">
                  {WEEK_SHORT.map((label, day) => (
                    <button
                      key={label}
                      type="button"
                      className={(repeatEdit.byDay || []).includes(day) ? 'active' : ''}
                      aria-pressed={(repeatEdit.byDay || []).includes(day)}
                      onClick={() => toggleRepeatDay(day)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {repeatEdit.freq === 'month' && (
              <label className="form-group">
                Cách lặp trong tháng
                <select value={repeatEdit.monthMode} onChange={(event) => setRepeatEdit({ ...repeatEdit, monthMode: event.target.value })}>
                  <option value="date">{monthlyDateLabel(fromIso)}</option>
                  <option value="weekday">{monthlyWeekdayLabel(fromIso)}</option>
                </select>
              </label>
            )}
            <fieldset className="form-group repeat-end">
              <legend>Kết thúc</legend>
              <label>
                <input type="radio" name="repeat-end" checked={repeatEdit.end === 'never'} onChange={() => setRepeatEdit({ ...repeatEdit, end: 'never' })} />
                Không bao giờ
              </label>
              <label>
                <input type="radio" name="repeat-end" checked={repeatEdit.end === 'until'} onChange={() => setRepeatEdit({ ...repeatEdit, end: 'until' })} />
                Vào ngày
                <input
                  type="date"
                  value={repeatEdit.until || ''}
                  min={fromIso}
                  disabled={repeatEdit.end !== 'until'}
                  onChange={(event) => setRepeatEdit({ ...repeatEdit, until: event.target.value, end: 'until' })}
                />
              </label>
              <label>
                <input type="radio" name="repeat-end" checked={repeatEdit.end === 'count'} onChange={() => setRepeatEdit({ ...repeatEdit, end: 'count' })} />
                Sau
                <input
                  type="number"
                  min="1"
                  max="500"
                  value={repeatEdit.count}
                  disabled={repeatEdit.end !== 'count'}
                  onChange={(event) => setRepeatEdit({ ...repeatEdit, count: Math.max(1, Number(event.target.value) || 1), end: 'count' })}
                />
                <span>lần</span>
              </label>
            </fieldset>
            <div className="day-cal-actions">
              <button type="button" className="action-btn" onClick={() => setRepeatEdit(null)}>Hủy</button>
              <button type="button" className="action-btn primary" onClick={finishRepeat}>Xong</button>
            </div>
          </div>
        </div>
      )}
      {seriesRemove && (
        <div className="modal-overlay series-remove-overlay" onMouseDown={() => setSeriesRemove(null)}>
          <div className="modal-content day-cal-form series-remove-dialog" role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <span>{seriesRemove.row.repeat?.freq
                ? (leave ? 'Xóa ngày nghỉ định kỳ' : 'Xóa ngày dạy định kỳ')
                : (leave ? 'Xóa nghỉ dài hạn' : 'Xóa dạy dài hạn')}</span>
              <button type="button" className="day-cal-close" onClick={() => setSeriesRemove(null)}>×</button>
            </div>
            <p className="day-cal-study-long-hint">
              {seriesRemove.row.shortName ? `${seriesRemove.row.shortName} · ` : ''}{vnDate(seriesRemove.iso)}
            </p>
            <fieldset className="form-group repeat-end">
              <label>
                <input type="radio" name="series-remove" checked={seriesRemove.scope === 'one'} onChange={() => setSeriesRemove({ ...seriesRemove, scope: 'one' })} />
                {leave ? 'Ngày nghỉ này' : 'Ngày dạy này'}
              </label>
              <label>
                <input type="radio" name="series-remove" checked={seriesRemove.scope === 'following'} onChange={() => setSeriesRemove({ ...seriesRemove, scope: 'following' })} />
                {leave ? 'Ngày nghỉ này và các ngày tiếp theo' : 'Ngày dạy này và các ngày tiếp theo'}
              </label>
              <label>
                <input type="radio" name="series-remove" checked={seriesRemove.scope === 'all'} onChange={() => setSeriesRemove({ ...seriesRemove, scope: 'all' })} />
                {leave ? 'Tất cả ngày nghỉ' : 'Tất cả ngày dạy'}
              </label>
            </fieldset>
            <div className="day-cal-actions">
              <button type="button" className="action-btn" onClick={() => setSeriesRemove(null)}>Hủy</button>
              <button type="button" className="action-btn danger" onClick={applySeriesRemove}>Xóa</button>
            </div>
          </div>
        </div>
      )}
      {confirmDialog}
    </div>
  );
}
