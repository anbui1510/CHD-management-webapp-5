/**
 * Map CHD Staff session → lichkhoa user shape (no Google login).
 */

export function toLichkhoaUser(currentStaff) {
  if (!currentStaff?.StaffKey) return null;
  return {
    id: String(currentStaff.StaffKey),
    email: String(currentStaff.Email || '').trim(),
    username: String(currentStaff.StaffName || currentStaff.Name || currentStaff.StaffKey),
    fullName: String(currentStaff.StaffName || currentStaff.Name || ''),
    role: currentStaff.Role === 'Admin' ? 'Admin' : 'User',
  };
}

export function isLichkhoaSessionReady(currentStaff) {
  return Boolean(currentStaff?.StaffKey);
}

export function getChdStaffKey() {
  try {
    return localStorage.getItem('CurrentStaffKey')
      || localStorage.getItem('CHD_AUTH_STAFF_KEY')
      || '';
  } catch {
    return '';
  }
}
