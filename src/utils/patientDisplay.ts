export const formatDateTime = (dateStr?: string) => {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    const pad = (num: number) => String(num).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  } catch {
    return dateStr;
  }
};

export function parsePatientDate(value?: string): Date | null {
  if (!value) return null;
  const trimmed = String(value).trim().split('T')[0];

  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const [year, month, day] = trimmed.split('-').map(Number);
    return new Date(year, month - 1, day);
  }

  const dashParts = trimmed.split('-');
  if (dashParts.length === 3 && dashParts[2].length === 4) {
    return new Date(Number(dashParts[2]), Number(dashParts[1]) - 1, Number(dashParts[0]));
  }

  const slashParts = trimmed.split('/');
  if (slashParts.length === 3) {
    if (slashParts[2].length === 4) {
      return new Date(Number(slashParts[2]), Number(slashParts[1]) - 1, Number(slashParts[0]));
    }
    if (slashParts[0].length === 4) {
      return new Date(Number(slashParts[0]), Number(slashParts[1]) - 1, Number(slashParts[2]));
    }
  }

  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return null;
  return new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
}

export function getReferenceDate(refDateStr?: string): Date {
  const parsed = refDateStr ? parsePatientDate(refDateStr) : null;
  if (parsed) return parsed;
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

/**
 * Pediatric age display:
 * - under 1 month: "X ngày tuổi"
 * - 1 month to < 12 months: "X tháng tuổi"
 * - 1 year+: "X tuổi" or "X tuổi Y tháng"
 */
export function getPatientAgeDescription(dobStr?: string, refDateStr?: string): string {
  const birth = parsePatientDate(dobStr);
  if (!birth) return '';

  const ref = getReferenceDate(refDateStr);
  const diffMs = ref.getTime() - birth.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays < 0) return 'Sơ sinh';
  if (diffDays < 30) return `${diffDays} ngày tuổi`;

  let years = ref.getFullYear() - birth.getFullYear();
  let months = ref.getMonth() - birth.getMonth();
  if (ref.getDate() < birth.getDate()) months--;
  if (months < 0) {
    years--;
    months += 12;
  }

  const totalMonths = years * 12 + months;
  if (totalMonths < 12) return `${totalMonths} tháng tuổi`;

  if (months > 0) return `${years} tuổi ${months} tháng`;
  return `${years} tuổi`;
}

export function getPatientAgeDescriptionParen(dobStr?: string, refDateStr?: string): string {
  const age = getPatientAgeDescription(dobStr, refDateStr);
  return age ? `(${age})` : '';
}

export function formatPatientDobWithAge(
  dobStr?: string,
  refDateStr?: string,
  formatDob?: (dob: string) => string
): string {
  if (!dobStr) return '—';
  const dobFormatted = formatDob ? formatDob(dobStr) : dobStr;
  const age = getPatientAgeDescription(dobStr, refDateStr);
  return age ? `${dobFormatted} (${age})` : dobFormatted;
}

/** @deprecated Use getPatientAgeDescription */
export const getExcelAgeHelper = getPatientAgeDescription;
