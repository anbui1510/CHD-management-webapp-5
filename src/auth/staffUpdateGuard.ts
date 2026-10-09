export interface StaffActor {
  StaffKey: string;
  Role?: string;
}

const PRIVILEGED_FIELDS = ['Role', 'Permissions', 'StaffRolePreset', 'FireDate', 'StaffKey'] as const;

export function isAdminRole(role: unknown): boolean {
  return String(role || '').trim().toLowerCase() === 'admin';
}

/** Non-admins may update their own profile, not another account and not their role. */
export function assertStaffMutation(
  actor: StaffActor,
  targetKey: string,
  action: string,
  data: Record<string, unknown> | null | undefined
): string | null {
  const normalizedAction = String(action || 'update').toLowerCase();
  if (isAdminRole(actor.Role)) return null;

  if (normalizedAction === 'insert' || normalizedAction === 'delete') {
    return 'Chỉ Admin mới được tạo hoặc xóa nhân viên.';
  }

  if (String(actor.StaffKey || '') !== String(targetKey || '')) {
    return 'Bạn chỉ được sửa hồ sơ của chính mình.';
  }

  const record = data || {};
  for (const field of PRIVILEGED_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(record, field)) {
      return 'Bạn không được đổi quyền, vai trò hoặc trạng thái nghỉ việc.';
    }
  }
  return null;
}

export function denialForSheetsPayload(
  actor: StaffActor,
  payload: Record<string, unknown> | null | undefined
): string | null {
  if (!payload) return null;
  const action = String(payload.action || '');
  const type = String(payload.type || '');
  if (type === 'Staff') {
    const data = (payload.data && typeof payload.data === 'object')
      ? payload.data as Record<string, unknown>
      : {};
    return assertStaffMutation(actor, String(payload.key || data.StaffKey || ''), action || 'update', data);
  }

  if (action === 'batch' && Array.isArray(payload.operations)) {
    for (const operation of payload.operations) {
      if (!operation || String(operation.type || '') !== 'Staff') continue;
      const data = (operation.data && typeof operation.data === 'object')
        ? operation.data as Record<string, unknown>
        : {};
      const denial = assertStaffMutation(
        actor,
        String(operation.key || data.StaffKey || ''),
        String(operation.action || 'update'),
        data
      );
      if (denial) return denial;
    }
  }
  return null;
}
