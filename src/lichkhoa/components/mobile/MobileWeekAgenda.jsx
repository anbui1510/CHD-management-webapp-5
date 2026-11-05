import React, { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, CalendarDays } from 'lucide-react';
import {
  buildDayAgenda,
  pickInitialDayIndex,
  todayIso
} from '../../logic/mobileAgenda';
import { leaveCovers } from '../../logic/leaveRepeat';

const WEEKDAY_LONG = ['Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7', 'Chủ nhật'];

function leaveTypeLabel(entry) {
  const type = String(entry?.type || '').toUpperCase();
  if (type === 'P') return 'Nghỉ phép';
  if (type === 'CT') return 'Công tác';
  if (type === 'H') return 'Đi học';
  return entry?.type || 'Nghỉ';
}

export function MobileWeekAgenda({
  scheduleData,
  staffList,
  taskList,
  linkedShortName = '',
  currentStartDate,
  onDateChange,
  onGoCurrentWeek,
  leaveEntries = [],
  studyEntries = []
}) {
  const { days = [], grid = {}, daySessions } = scheduleData || {};
  const hasMine = Boolean(String(linkedShortName || '').trim());
  const [filterMine, setFilterMine] = useState(hasMine);
  const [dayIndex, setDayIndex] = useState(() => pickInitialDayIndex(days, todayIso()));

  useEffect(() => {
    setDayIndex(pickInitialDayIndex(days, todayIso()));
  }, [currentStartDate, days]);

  useEffect(() => {
    if (!hasMine) setFilterMine(false);
  }, [hasMine]);

  const filterShortName = filterMine && hasMine ? linkedShortName : '';

  const agenda = useMemo(
    () => buildDayAgenda({
      days,
      grid,
      staffList,
      taskList,
      dayIndex,
      daySessions,
      filterShortName,
      leaveEntries,
      studyEntries
    }),
    [days, grid, staffList, taskList, dayIndex, daySessions, filterShortName, leaveEntries, studyEntries]
  );

  const weekLabel = days.length
    ? `${days[0].dateStr} – ${days[6].dateStr}`
    : '';

  const totalItems = agenda.sessions.reduce((sum, block) => sum + block.items.length, 0)
    + agenda.leaves.length
    + agenda.studies.length;

  const shiftWeek = (deltaDays) => {
    if (!onDateChange) return;
    onDateChange(deltaDays);
  };

  return (
    <div className="mobile-agenda">
      <div className="mobile-week-bar">
        <button type="button" className="mobile-icon-btn" aria-label="Tuần trước" onClick={() => shiftWeek(-7)}>
          <ChevronLeft size={20} />
        </button>
        <div className="mobile-week-meta">
          <span className="mobile-week-range">{weekLabel || 'Tuần này'}</span>
          {onGoCurrentWeek && (
            <button type="button" className="mobile-text-btn" onClick={onGoCurrentWeek}>
              <CalendarDays size={14} /> Tuần hiện tại
            </button>
          )}
        </div>
        <button type="button" className="mobile-icon-btn" aria-label="Tuần sau" onClick={() => shiftWeek(7)}>
          <ChevronRight size={20} />
        </button>
      </div>

      <div className="mobile-day-strip" role="tablist" aria-label="Chọn ngày">
        {days.map((day, index) => {
          const active = index === dayIndex;
          const busy = (staffList || []).some((person) => {
            if (filterShortName && person.shortName !== filterShortName) return false;
            const cell = grid?.[person.shortName]?.[index];
            if (!cell) return false;
            return ['S', 'R', 'C', 'T'].some((id) => {
              const v = String(cell[id] || '').trim();
              return v && v !== '0';
            });
          }) || (leaveEntries || []).some((e) => leaveCovers(e, day.iso))
            || (studyEntries || []).some((e) => leaveCovers(e, day.iso));
          return (
            <button
              key={day.iso || index}
              type="button"
              role="tab"
              aria-selected={active}
              className={`mobile-day-chip${active ? ' active' : ''}${day.isHoliday ? ' holiday' : ''}`}
              onClick={() => setDayIndex(index)}
            >
              <span className="mobile-day-name">{day.dayName}</span>
              <span className="mobile-day-num">{day.dateStr?.split('/')[0]}</span>
              {busy ? <span className="mobile-day-dot" aria-hidden /> : null}
            </button>
          );
        })}
      </div>

      {hasMine && (
        <div className="mobile-filter-row">
          <button
            type="button"
            className={`mobile-filter-chip${!filterMine ? ' active' : ''}`}
            onClick={() => setFilterMine(false)}
          >
            Cả khoa
          </button>
          <button
            type="button"
            className={`mobile-filter-chip${filterMine ? ' active' : ''}`}
            onClick={() => setFilterMine(true)}
          >
            Tôi ({linkedShortName})
          </button>
        </div>
      )}

      <div className="mobile-day-heading">
        <h2>
          {agenda.day ? WEEKDAY_LONG[dayIndex] : 'Ngày'}
          {agenda.day ? ` · ${agenda.day.fullDateStr || agenda.day.dateStr}` : ''}
        </h2>
        {agenda.day?.holidayName ? (
          <p className="mobile-holiday">{agenda.day.holidayName}</p>
        ) : null}
      </div>

      <p className="mobile-edit-hint">Xem trên điện thoại · Sửa ô lịch trên máy tính</p>

      {totalItems === 0 ? (
        <div className="mobile-empty">
          <p>Chưa có lịch trong ngày này{filterShortName ? ` cho ${filterShortName}` : ''}.</p>
        </div>
      ) : (
        <div className="mobile-session-list">
          {agenda.sessions.map((block) => (
            block.items.length ? (
              <section key={block.id} className="mobile-session-block">
                <header className="mobile-session-head">
                  <h3>{block.label}</h3>
                  <span>{block.items.length}</span>
                </header>
                <ul className="mobile-assign-list">
                  {block.items.map((item, idx) => (
                    <li key={`${item.shortName}-${item.code}-${idx}`} className="mobile-assign-row">
                      <div className="mobile-assign-who">
                        <strong>{item.shortName}</strong>
                        <span>{item.staffName}</span>
                      </div>
                      <span
                        className="mobile-task-chip"
                        style={{ background: item.bgColor, color: item.textColor }}
                        title={item.taskName}
                      >
                        {item.code}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null
          ))}

          {agenda.leaves.length > 0 && (
            <section className="mobile-session-block">
              <header className="mobile-session-head">
                <h3>Nghỉ / vắng</h3>
                <span>{agenda.leaves.length}</span>
              </header>
              <ul className="mobile-assign-list">
                {agenda.leaves.map((entry) => (
                  <li key={entry.id || `${entry.shortName}-${entry.from}`} className="mobile-assign-row">
                    <div className="mobile-assign-who">
                      <strong>{entry.shortName}</strong>
                      <span>{leaveTypeLabel(entry)}</span>
                    </div>
                    <span className="mobile-task-chip leave">{entry.type || 'P'}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {agenda.studies.length > 0 && (
            <section className="mobile-session-block">
              <header className="mobile-session-head">
                <h3>Dạy học</h3>
                <span>{agenda.studies.length}</span>
              </header>
              <ul className="mobile-assign-list">
                {agenda.studies.map((entry) => (
                  <li key={entry.id || `${entry.shortName}-${entry.topic}`} className="mobile-assign-row">
                    <div className="mobile-assign-who">
                      <strong>{entry.shortName}</strong>
                      <span>{entry.topic || entry.taskId || 'Dạy'}</span>
                    </div>
                    <span className="mobile-task-chip study">Dạy</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
