/** Nhân sự Module 7: CHD Staff vs thêm tay (học viên / hỗ trợ). */

export function isLocalScheduleStaff(person) {
  if (!person) return false;
  if (person.source === 'local') return true;
  if (person.source === 'chd') return false;
  const id = String(person.id || '');
  return id.startsWith('local_') || id.startsWith('doc_');
}

/** Bác sĩ từ file sao lưu JSON cũ (`doc_*`), trùng CHD Staff — khác HV thêm tay `local_*`. */
export function isBackupImportedStaff(person) {
  if (!person || person.source === 'chd') return false;
  const id = String(person.id || '');
  if (id.startsWith('doc_')) return true;
  if (person.source === 'local' && !id.startsWith('local_')) return true;
  return false;
}

export function purgeBackupImportedStaff(staffList) {
  return (staffList || []).filter((person) => !isBackupImportedStaff(person));
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
