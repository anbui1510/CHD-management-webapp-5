const SPLIT_CATEGORIES = new Set(['THU_THUAT', 'CHUYEN_MON']);

/** Where a procedure or specialty task is drawn. Other tasks stay on the week grid. */
export function taskDisplay(task) {
  if (!SPLIT_CATEGORIES.has(task?.category)) return 'both';
  if (task.display === 'week' || task.display === 'lower') return task.display;
  return 'both';
}

export function showsOnWeek(task) {
  return taskDisplay(task) !== 'lower';
}

export function showsBelow(task) {
  return taskDisplay(task) !== 'week';
}
