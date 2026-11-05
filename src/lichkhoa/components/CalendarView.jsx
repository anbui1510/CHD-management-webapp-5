import React, { useEffect, useRef, useState } from 'react';
import { Calendar as CalIcon, Download, Filter, Moon, Sun, UserCheck } from 'lucide-react';
import { generateICalFeed, downloadICalFile } from '../services/icalGenerator';

function linkedDoctorName(staffList, linkedShortName) {
  const name = String(linkedShortName || '').trim();
  if (!name) return 'ALL';
  return (staffList || []).some(person => person.shortName === name) ? name : 'ALL';
}

export function CalendarView({ 
  dept, 
  staffList, 
  taskList, 
  scheduleData,
  linkedShortName = ''
}) {
  const calRef = useRef(null);
  const fullCalendarInstanceRef = useRef(null);
  const preferredDoctor = linkedDoctorName(staffList, linkedShortName);
  const [selectedDoctor, setSelectedDoctor] = useState(preferredDoctor);

  useEffect(() => {
    setSelectedDoctor(preferredDoctor);
  }, [preferredDoctor]);

  const { days, grid } = scheduleData;

  // Build Events Array for FullCalendar
  const events = [];
  const taskMap = {};
  taskList.forEach(t => {
    taskMap[t.code] = t;
  });

  staffList.forEach(s => {
    if (selectedDoctor !== 'ALL' && selectedDoctor !== s.shortName) return;

    days.forEach((day, dIdx) => {
      const sData = grid[s.shortName] ? grid[s.shortName][dIdx] : null;
      if (!sData) return;

      const dateObj = day.dateObj;
      const y = dateObj.getFullYear();
      const m = String(dateObj.getMonth() + 1).padStart(2, '0');
      const d = String(dateObj.getDate()).padStart(2, '0');
      const dateStr = `${y}-${m}-${d}`;

      if (sData.S && sData.S !== '0') {
        const code = sData.S.split(',')[0].trim();
        const tInfo = taskMap[code] || { name: code, bgColor: '#3b82f6', textColor: '#ffffff' };
        events.push({
          id: `evt-${s.shortName}-${dIdx}-S`,
          title: `[S] ${s.shortName}: ${code}`,
          start: `${dateStr}T07:30:00`,
          end: `${dateStr}T11:30:00`,
          backgroundColor: tInfo.bgColor || '#3b82f6',
          textColor: tInfo.textColor || '#ffffff',
          extendedProps: { doctor: s, taskCode: code, session: 'Sáng' }
        });
      }

      if (sData.C && sData.C !== '0') {
        const code = sData.C.split(',')[0].trim();
        const tInfo = taskMap[code] || { name: code, bgColor: '#f59e0b', textColor: '#ffffff' };
        events.push({
          id: `evt-${s.shortName}-${dIdx}-C`,
          title: `[C] ${s.shortName}: ${code}`,
          start: `${dateStr}T13:30:00`,
          end: `${dateStr}T17:00:00`,
          backgroundColor: tInfo.bgColor || '#f59e0b',
          textColor: tInfo.textColor || '#ffffff',
          extendedProps: { doctor: s, taskCode: code, session: 'Chiều' }
        });
      }
    });
  });

  useEffect(() => {
    if (!calRef.current || !window.FullCalendar) return;

    if (fullCalendarInstanceRef.current) {
      fullCalendarInstanceRef.current.destroy();
    }

    const calendar = new window.FullCalendar.Calendar(calRef.current, {
      initialView: 'dayGridMonth',
      headerToolbar: {
        left: 'prev,next today',
        center: 'title',
        right: 'dayGridMonth,timeGridWeek,timeGridDay'
      },
      events: events,
      editable: true,
      droppable: true,
      eventClick: function(info) {
        alert(`Bác sĩ: ${info.event.extendedProps.doctor.name}\nCa: ${info.event.extendedProps.session}\nNghiệp vụ: ${info.event.extendedProps.taskCode}`);
      }
    });

    calendar.render();
    fullCalendarInstanceRef.current = calendar;

    return () => {
      if (fullCalendarInstanceRef.current) {
        fullCalendarInstanceRef.current.destroy();
      }
    };
  }, [events, selectedDoctor]);

  const handleExportICal = () => {
    const doc = staffList.find(s => s.shortName === selectedDoctor) || staffList[0];
    const icsData = generateICalFeed({ doctor: doc, days, grid, taskList });
    downloadICalFile(doc, icsData);
  };

  return (
    <div className="view-container">
      <div className="view-header">
        <div>
          <h2 className="view-title">Lịch Trực Trực Quan (Google Calendar Style)</h2>
          <div className="sub-header-info">
            <span>Đồng bộ 2 chiều với Sheet View</span>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {/* Doctor Filter */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--bg-secondary)', padding: '6px 12px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}>
            <Filter size={14} color="var(--text-muted)" />
            <select
              style={{ background: 'transparent', border: 'none', color: 'var(--text-primary)', fontSize: '0.85rem', fontWeight: 600, outline: 'none' }}
              value={selectedDoctor}
              onChange={(e) => setSelectedDoctor(e.target.value)}
            >
              <option value="ALL">-- Tất cả Bác sĩ Khoa --</option>
              {staffList.map(s => (
                <option key={s.id} value={s.shortName}>BS {s.shortName} ({s.name})</option>
              ))}
            </select>
          </div>

          <button className="action-btn primary" onClick={handleExportICal}>
            <Download size={16} /> Tải iCal (.ics) Google Sync
          </button>
        </div>
      </div>

      {/* FullCalendar Mounting Element */}
      <div ref={calRef} style={{ flex: 1, minHeight: '550px' }} />
    </div>
  );
}
