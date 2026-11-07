/** Nhân sự Module 7: CHD Staff vs thêm tay (học viên / hỗ trợ). */

export function isLocalScheduleStaff(person) {
  if (!person) return false;
  if (person.source === 'local') return true;
  if (person.source === 'chd') return false;
  const id = String(person.id || '');
  return id.startsWith('local_') || id.startsWith('doc_');
}

/**
 * HV / hỗ trợ thêm tay trên Module 7 (`local_*`) — giữ khi merge CHD.
 * Không gồm bác sĩ seed/sao lưu `doc_*`.
 */
export function isHandAddedLocalStaff(person) {
  if (!person) return false;
  return String(person.id || '').startsWith('local_');
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

/** Lọc nhân sự lịch: CHD + HV/hỗ trợ `local_*` — bỏ hết `doc_*` / local giả. */
export function rosterStaffOnly(staffList) {
  return purgeBackupImportedStaff(staffList || []);
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

/**
 * Bản đồ ánh xạ bác sĩ mẫu (seed doc_*) sang tên viết tắt/họ tên chuẩn CHD.
 * Giúp gán lại trách nhiệm (task.owners) chính xác khi chuyển từ seed sang roster CHD Staff.
 */
export const LEGACY_DOC_MAP = {
  doc_1: { shortName: 'LỢI', name: 'Phan Tiến Lợi' },
  doc_2: { shortName: 'PHỤNG', name: 'Trần Công Bảo Phụng' },
  doc_3: { shortName: 'THỊNH', name: 'Bùi Đạt Thịnh' },
  doc_4: { shortName: 'NGHI', name: 'Lê Trần Bảo Nghi' },
  doc_5: { shortName: 'TÀI', name: 'Lưu Lâm Thắng Tài' },
  doc_6: { shortName: 'ÂN', name: 'Bùi Tuấn Ân' },
  doc_7: { shortName: 'HIẾU', name: 'Nguyễn Văn Hiếu' },
  doc_8: { shortName: 'TRANG', name: 'Trịnh Thị Linh Trang' },
  doc_1793726363907: { shortName: 'DUY', name: 'Bùi Khánh Duy' },
  doc_9: { shortName: 'THẢO', name: 'Nguyễn Thanh Thảo' },
  doc_10: { shortName: 'HUY', name: 'Nguyễn Quốc Huy' },
};

function foldName(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

/**
 * Tìm nhân sự trong staffList khớp với mã định danh ownerId (id, shortName, hoặc doc_* legacy).
 */
export function findStaffForOwner(id, staffList) {
  if (!id || !Array.isArray(staffList) || !staffList.length) return null;
  const strId = String(id).trim();
  // 1. Khớp chính xác ID hiện tại (StaffKey CHD hoặc local_*)
  let person = staffList.find((p) => String(p.id).trim() === strId);
  if (person) return person;
  // 2. Khớp theo shortName hoặc họ tên (không dấu / chữ hoa thường)
  const foldedId = foldName(strId);
  person = staffList.find((p) => foldName(p.shortName) === foldedId || foldName(p.name) === foldedId);
  if (person) return person;
  // 3. Khớp qua bảng ánh xạ seed doc_*
  const legacy = LEGACY_DOC_MAP[strId];
  if (legacy) {
    const legShort = foldName(legacy.shortName);
    person = staffList.find((p) => {
      const pShort = foldName(p.shortName);
      return pShort === legShort || (legShort === 'nghi' && (pShort === 'nghi' || pShort === 'nghi2'));
    });
    if (person) return person;
    person = staffList.find((p) => foldName(p.name).includes(legShort));
    if (person) return person;
  }
  return null;
}

/**
 * Chuyển đổi task.owners và task.ownerOrder từ ID cũ (doc_*) sang ID thực tế của CHD Staff.
 */
export function migrateTaskOwnerIds(tasks, staffList) {
  if (!Array.isArray(tasks) || !Array.isArray(staffList) || !staffList.length) return tasks || [];
  return tasks.map((task) => {
    let changed = false;
    const owners = (task.owners || []).map((ownerId) => {
      const staff = findStaffForOwner(ownerId, staffList);
      if (staff && staff.id !== ownerId) {
        changed = true;
        return staff.id;
      }
      return ownerId;
    });
    const ownerOrder = (task.ownerOrder || []).map((ownerId) => {
      const staff = findStaffForOwner(ownerId, staffList);
      if (staff && staff.id !== ownerId) {
        changed = true;
        return staff.id;
      }
      return ownerId;
    });
    if (!changed) return task;
    return { ...task, owners, ownerOrder };
  });
}
