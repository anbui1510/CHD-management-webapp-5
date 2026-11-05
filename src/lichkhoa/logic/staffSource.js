/** Nhân sự Module 7: CHD Staff vs thêm tay (học viên / hỗ trợ). */

export function isLocalScheduleStaff(person) {
  if (!person) return false;
  if (person.source === 'local') return true;
  if (person.source === 'chd') return false;
  const id = String(person.id || '');
  return id.startsWith('local_') || id.startsWith('doc_');
}

export function markChdScheduleStaff(person) {
  return { ...person, source: 'chd' };
}

export function markLocalScheduleStaff(person) {
  return {
    ...person,
    source: 'local',
    showInLichKhoa: person.showInLichKhoa || 'On',
  };
}

export function newLocalStaffId() {
  return `local_${Date.now()}`;
}
