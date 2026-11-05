import { COMMON_TASK_TEMPLATE, DEFAULT_KHOA_RULES } from './commonTaskTemplate.js';

/** Store ban đầu khoa mới (F-304): 0 nhân sự + task mẫu chung. */
export function createEmptyTenantStore(tenantMeta = {}) {
  const slug = String(tenantMeta.slug || 'default').trim().toLowerCase();
  const deptId = tenantMeta.id || `dept_${slug.replace(/-/g, '_')}`;
  const name = tenantMeta.name || tenantMeta.label || 'Lịch khoa';
  const code = tenantMeta.code || slug.toUpperCase().replace(/-/g, '_') || 'KHOA';

  return {
    departments: [{
      id: deptId,
      name,
      code,
      staff: [],
      tasks: COMMON_TASK_TEMPLATE.map((t) => ({ ...t })),
      rules: { ...DEFAULT_KHOA_RULES },
      customCategories: [],
      leaveEntries: [],
      studyEntries: [],
    }],
    activeDeptId: deptId,
    sheetsByDept: {},
    weeklySchedules: {},
    monthlySchedules: {},
  };
}

/** Đảm bảo có admin với loginEmail Gmail trước khi bootstrap Sheet. */
export function ensureBootstrapAdminStaff(store, { email, fullName = '' }) {
  const loginEmail = String(email || '').trim().toLowerCase();
  if (!loginEmail) return store;

  const deptId = store.activeDeptId || store.departments?.[0]?.id;
  const departments = (store.departments || []).map((dept) => {
    if (dept.id !== deptId) return dept;
    let staff = [...(dept.staff || [])];
    const byLogin = staff.find((s) => String(s.loginEmail || '').trim().toLowerCase() === loginEmail);
    if (byLogin) {
      if (!byLogin.accessRole || byLogin.accessRole === 'member') {
        staff = staff.map((s) => (s.id === byLogin.id ? { ...s, accessRole: 'admin' } : s));
      }
      return { ...dept, staff };
    }
    if (staff.length > 0) {
      const lead = staff.find((s) => /trưởng/i.test(String(s.title || ''))) || staff[0];
      staff = staff.map((s) => (
        s.id === lead.id
          ? { ...s, loginEmail, accessRole: 'admin' }
          : s
      ));
      return { ...dept, staff };
    }
    const adminId = `admin_${loginEmail.split('@')[0].replace(/\W/g, '_') || 'bootstrap'}`;
    const display = String(fullName || loginEmail.split('@')[0] || 'Quản trị').trim();
    const shortName = display.split(/\s+/).pop()?.slice(0, 6).toUpperCase() || 'TK';
    staff.push({
      id: adminId,
      name: display,
      shortName,
      title: 'Trưởng Khoa',
      dutyQuota: 0,
      buBalance: 0,
      phepBalance: 0,
      email: loginEmail,
      loginEmail,
      position: 'BS Trưởng Khoa',
      accessRole: 'admin',
    });
    return { ...dept, staff };
  });

  return { ...store, departments };
}
