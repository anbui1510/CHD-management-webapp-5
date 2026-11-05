function fold(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

export function isTrainee(person) {
  return fold(person?.title) === 'hoc vien';
}

function bounds(person) {
  if (!isTrainee(person)) return null;
  const from = String(person?.studyFrom || '').trim();
  const to = String(person?.studyTo || '').trim();
  if (!from && !to) return null;
  return { from, to };
}

/** A trainee with a study period is on the week only on days inside that period. */
export function traineeCovers(person, iso) {
  const limit = bounds(person);
  if (!limit) return true;
  const day = String(iso || '');
  if (!day) return true;
  if (limit.from && day < limit.from) return false;
  if (limit.to && day > limit.to) return false;
  return true;
}

export function traineeOnWeek(person, days) {
  const limit = bounds(person);
  if (!limit) return true;
  return (days || []).some(day => traineeCovers(person, day?.iso));
}
