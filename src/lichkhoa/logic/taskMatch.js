export function taskOptionLabel(task) {
  return `${task.code} — ${task.name}`;
}

export function matchTask(raw, tasks = []) {
  const text = compactLabel(raw);
  if (!text) return null;
  return tasks.find(task => {
    const code = compactLabel(task.code);
    const name = compactLabel(task.name);
    return text === code || text === name || text === `${code} - ${name}`;
  }) || null;
}

export function roleShortLabel(role, tasks = []) {
  const task = taskForRole(role, tasks);
  if (task?.code) return String(task.code);
  const label = String(role?.label || '').trim();
  const code = label.split(/\s*[—–−-]\s+/)[0];
  if (code && code !== label && !/\s/.test(code)) return code;
  return label;
}

function compactLabel(value) {
  return String(value || '').trim().toLowerCase().replace(/\s*[—–−-]\s*/g, ' - ');
}

export function taskForRole(role, tasks = []) {
  if (!role) return null;
  if (role.taskId) {
    const linked = tasks.find(task => task.id === role.taskId);
    if (linked) return linked;
  }
  const direct = matchTask(role.label, tasks);
  if (direct) return direct;
  const code = String(role.label || '').split(/\s*[—–−-]\s+/)[0];
  if (code && code !== String(role.label || '').trim()) return matchTask(code, tasks);
  return null;
}
