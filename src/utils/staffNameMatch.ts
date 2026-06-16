import type { Staff } from '../types';
import { removeDiacritics } from '../types';

/** Short display name used in RequestBy / PTV fields, e.g. "BS. Ân" */
export function getShortStaffName(fullName: string, staffList: { StaffName: string }[] = []): string {
  if (!fullName) return '';
  let cleaned = fullName.replace(/\s*\(.*?\)\s*/g, '').trim();
  cleaned = cleaned.replace(/^(BS\.|BS)\s+/i, '').trim();
  const parts = cleaned.split(/\s+/);
  if (parts.length === 0) return '';

  const firstName = parts[parts.length - 1];
  if (parts.length === 1) {
    return `BS. ${firstName}`;
  }

  const middleName = parts[parts.length - 2];
  const hasFirstNameDuplicate =
    staffList.length > 0 &&
    staffList.some(s => {
      let sClean = s.StaffName.replace(/\s*\(.*?\)\s*/g, '').trim();
      sClean = sClean.replace(/^(BS\.|BS)\s+/i, '').trim();
      const sParts = sClean.split(/\s+/);
      if (sParts.length <= 1) return false;
      const sFirstName = sParts[sParts.length - 1];
      return s.StaffName !== fullName && sFirstName.toLowerCase() === firstName.toLowerCase();
    });

  if (hasFirstNameDuplicate && middleName) {
    const middleInitial = middleName.charAt(0).toUpperCase();
    return `BS. ${middleInitial}. ${firstName}`;
  }

  return `BS. ${firstName}`;
}

function normalizeNameToken(value: string): string {
  return removeDiacritics(String(value || '').trim().toLowerCase())
    .replace(/^(bs\.?|bs)\s+/i, '')
    .replace(/\s+/g, ' ');
}

export function getStaffNameVariants(staff: Staff, staffList: Staff[] = []): string[] {
  const variants = new Set<string>();
  const push = (value?: string) => {
    const trimmed = String(value || '').trim();
    if (!trimmed) return;
    variants.add(trimmed);
    variants.add(normalizeNameToken(trimmed));
  };

  push(staff.StaffKey);
  push(staff.StaffName);
  push(staff.Name);
  push(getShortStaffName(staff.StaffName, staffList));

  const cleaned = staff.StaffName.replace(/\s*\(.*?\)\s*/g, '').trim();
  const parts = cleaned.split(/\s+/);
  if (parts.length > 0) {
    push(parts[parts.length - 1]);
  }

  return [...variants];
}

export function staffNameMatches(
  candidate: string | undefined | null,
  staff: Staff,
  staffList: Staff[] = []
): boolean {
  const raw = String(candidate || '').trim();
  if (!raw) return false;

  const normalizedCandidate = normalizeNameToken(raw);
  const variants = getStaffNameVariants(staff, staffList);

  return variants.some(variant => {
    const normalizedVariant = normalizeNameToken(variant);
    return (
      normalizedVariant === normalizedCandidate ||
      raw === variant ||
      normalizedCandidate === normalizedVariant
    );
  });
}

export function resolveStaffByNameOrKey(
  candidate: string | undefined | null,
  staffList: Staff[] = []
): Staff | undefined {
  const raw = String(candidate || '').trim();
  if (!raw) return undefined;

  const normalizedCandidate = normalizeNameToken(raw);
  return staffList.find(staff => {
    if (String(staff.StaffKey || '').trim() === raw) return true;
    const variants = getStaffNameVariants(staff, staffList);
    return variants.some(variant => normalizeNameToken(variant) === normalizedCandidate || raw === variant);
  });
}

export function getStaffInitial(staff: Staff): string {
  const parts = staff.StaffName.trim().split(/\s+/);
  const lastName = parts[parts.length - 1] || staff.StaffName.charAt(0) || '?';
  return removeDiacritics(lastName.charAt(0)).toUpperCase();
}
