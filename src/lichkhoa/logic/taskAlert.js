const DAY = '(?:T[2-7]|CN)';

function fold(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

/** Missing tasks warn unless the task explicitly turns Cảnh báo off. */
export function taskAlerts(task) {
  return task?.warn !== false;
}

export function isWardAlertTask(task) {
  return fold(`${task?.code || ''} ${task?.name || ''}`).includes('benh phong');
}

/** Code or ward flag named by a schedule warning. Lock clashes stay outside this. */
export function alertSubject(message) {
  const text = String(message || '').trim();
  if (/^Bệnh phòng\b/.test(text)) return { kind: 'ward' };
  const patterns = [
    /^Không xếp được lịch (?:học|dạy) "(.+?)"/,
    /^Không xếp được (.+?) cho /,
    /^BS .+? có lịch ".+?" nhưng phải "(.+?)"/,
    /^Task (.+?) chỉ giao /,
    /^Task (.+) có ngày cố định nhưng chưa chọn Trách nhiệm\.$/,
    new RegExp(`^Task (.+?) ${DAY} .+ chưa chọn Sáng hoặc Chiều\\.$`),
    new RegExp(`^Không xếp được (.+?) ${DAY} `),
    /có "(.+)" nhưng không khớp/
  ];
  for (const pattern of patterns) {
    const hit = text.match(pattern);
    if (hit) return { kind: 'task', code: hit[1].trim() };
  }
  return null;
}

export function alertMuted(message, taskList) {
  const subject = alertSubject(message);
  if (!subject) return false;
  if (subject.kind === 'ward') {
    const ward = (taskList || []).find(isWardAlertTask);
    return !!ward && !taskAlerts(ward);
  }
  const task = (taskList || []).find(item => fold(item.code) === fold(subject.code));
  return !!task && !taskAlerts(task);
}
