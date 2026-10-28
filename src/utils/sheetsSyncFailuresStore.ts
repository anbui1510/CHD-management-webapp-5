import type { SheetsSyncContext, SheetsSyncFailure } from '../types';

const STORAGE_KEY = 'chd_sheets_sync_failures_v1';

function readAll(): SheetsSyncFailure[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as SheetsSyncFailure[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeAll(items: SheetsSyncFailure[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch {
    // ignore quota / private mode
  }
}

function failureKey(staffKey: string, entityType: string, entityKey: string): string {
  return `${staffKey}|${entityType}|${entityKey}`;
}

export function listSheetsSyncFailures(staffKey: string): SheetsSyncFailure[] {
  const key = String(staffKey || '').trim();
  if (!key) return [];
  return readAll().filter(item => item.StaffKey === key && !item.IsAcknowledged);
}

export function recordLocalSheetsSyncFailure(
  staffKey: string,
  entityType: string,
  entityKey: string,
  action: 'insert' | 'update' | 'delete',
  syncContext: SheetsSyncContext | undefined,
  message: string
): SheetsSyncFailure {
  const staff = String(staffKey || '').trim() || 'unknown';
  const key = failureKey(staff, entityType, entityKey);
  const next: SheetsSyncFailure = {
    FailureKey: key,
    StaffKey: staff,
    EntityType: entityType,
    EntityKey: entityKey,
    Action: action,
    ViewModule: String(syncContext?.viewModule || ''),
    ViewLabel: String(syncContext?.viewLabel || ''),
    PatientName: String(syncContext?.patientName || ''),
    PatientKey: syncContext?.patientKey,
    PatientID: syncContext?.patientID,
    Message: message,
    CreatedTime: new Date().toISOString(),
    IsAcknowledged: false,
  };
  const others = readAll().filter(item => item.FailureKey !== key);
  writeAll([next, ...others].slice(0, 80));
  return next;
}

export function clearLocalSheetsSyncFailure(
  staffKey: string,
  entityType: string,
  entityKey: string
): void {
  const key = failureKey(String(staffKey || '').trim(), entityType, entityKey);
  writeAll(readAll().filter(item => item.FailureKey !== key));
}

export function acknowledgeLocalSheetsSyncFailure(failureKeyValue: string): void {
  writeAll(
    readAll().map(item =>
      item.FailureKey === failureKeyValue ? { ...item, IsAcknowledged: true } : item
    )
  );
}

export function acknowledgeAllLocalSheetsSyncFailures(staffKey: string): void {
  const staff = String(staffKey || '').trim();
  writeAll(
    readAll().map(item =>
      item.StaffKey === staff ? { ...item, IsAcknowledged: true } : item
    )
  );
}
