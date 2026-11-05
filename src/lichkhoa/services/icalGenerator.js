// ==========================================================================
// iCALENDAR (.ICS) FEED GENERATOR FOR GOOGLE CALENDAR SYNC
// ==========================================================================

/**
 * Generates an iCalendar (.ics) string for a doctor's personal schedule
 */
export function generateICalFeed({ doctor, days, grid, taskList }) {
  const events = [];

  const taskMap = {};
  taskList.forEach(t => {
    taskMap[t.code] = t;
  });

  days.forEach((day, dIdx) => {
    const shiftData = grid[doctor.shortName] ? grid[doctor.shortName][dIdx] : null;
    if (!shiftData) return;

    const dateObj = day.dateObj;
    const year = dateObj.getFullYear();
    const month = String(dateObj.getMonth() + 1).padStart(2, '0');
    const date = String(dateObj.getDate()).padStart(2, '0');
    const dateStr = `${year}${month}${date}`;

    // Session Morning (07:30 - 11:30)
    if (shiftData.S && shiftData.S !== '0') {
      const taskCode = shiftData.S.split(',')[0].trim();
      const taskInfo = taskMap[taskCode] || { name: taskCode };
      events.push({
        summary: `[SÁNG] ${taskCode} - ${taskInfo.name}`,
        start: `${dateStr}T073000`,
        end: `${dateStr}T113000`,
        description: `Ca Sáng Khoa Phòng: ${taskInfo.name} (${doctor.name})`
      });
    }

    // Session Afternoon/Night (13:30 - 17:00 / 07:30 next day)
    if (shiftData.C && shiftData.C !== '0') {
      const taskCode = shiftData.C.split(',')[0].trim();
      const taskInfo = taskMap[taskCode] || { name: taskCode };
      const isNight = taskCode.includes('VG') || taskCode.includes('TN');
      
      events.push({
        summary: `[${isNight ? 'TRỰC ĐÊM' : 'CHIỀU'}] ${taskCode} - ${taskInfo.name}`,
        start: `${dateStr}T133000`,
        end: isNight ? `${dateStr}T235900` : `${dateStr}T170000`,
        description: `Ca ${isNight ? 'Trực Đêm' : 'Chiều'} Khoa Phòng: ${taskInfo.name} (${doctor.name})`
      });
    }
  });

  // Build ICS Format
  let icsLines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Smart Hospital Scheduler//LichKhoa Webapp//VI',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:Lịch Khoa - BS ${doctor.name}`
  ];

  events.forEach((evt, idx) => {
    icsLines.push('BEGIN:VEVENT');
    icsLines.push(`UID:evt-${doctor.id}-${idx}@lichkhoa.vn`);
    icsLines.push(`DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').split('.')[0]}Z`);
    icsLines.push(`DTSTART:${evt.start}`);
    icsLines.push(`DTEND:${evt.end}`);
    icsLines.push(`SUMMARY:${evt.summary}`);
    icsLines.push(`DESCRIPTION:${evt.description}`);
    icsLines.push('END:VEVENT');
  });

  icsLines.push('END:VCALENDAR');
  return icsLines.join('\r\n');
}

/**
 * Downloads the .ics file directly in browser
 */
export function downloadICalFile(doctor, icsContent) {
  const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', `LichKhoa_BS_${doctor.shortName}.ics`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
