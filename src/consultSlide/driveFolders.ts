import type { StaffSlideDriveTarget } from './types';

/** 1.6. SLIDE STAFF MỔ TIM */
export const STAFF_MO_SLIDE_ROOT_FOLDER_ID = '1RrkjFvHzUmCT1-2570o_-_ql8AM7X3Es';

/** 1.7 SLIDE STAFF THÔNG TIM */
export const STAFF_THONG_SLIDE_ROOT_FOLDER_ID = '14JUtNx5VW10cnnyur9ud7V9ELV2ny1a2';

function parseConsultDateParts(consultDate?: string): { year: number; month: number } {
  const raw = String(consultDate || '').trim();
  const now = new Date();
  if (!raw) return { year: now.getFullYear(), month: now.getMonth() + 1 };

  // dd/mm/yyyy
  const vn = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (vn) {
    return { year: Number(vn[3]), month: Number(vn[2]) };
  }

  // yyyy-mm-dd
  const iso = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) {
    return { year: Number(iso[1]), month: Number(iso[2]) };
  }

  const d = new Date(raw);
  if (!Number.isNaN(d.getTime())) {
    return { year: d.getFullYear(), month: d.getMonth() + 1 };
  }

  return { year: now.getFullYear(), month: now.getMonth() + 1 };
}

export function resolveStaffSlideDriveTarget(
  consultType: string | undefined,
  consultDate?: string
): StaffSlideDriveTarget {
  const { year, month } = parseConsultDateParts(consultDate);
  const isThong = String(consultType || '').trim().toLowerCase() === 'staff thông';

  if (isThong) {
    return {
      rootFolderId: STAFF_THONG_SLIDE_ROOT_FOLDER_ID,
      yearFolderName: `Slide staff thông - ${year}`,
      monthFolderName: `Staff thông - Tháng ${month} - ${year}`,
      year,
      month,
    };
  }

  return {
    rootFolderId: STAFF_MO_SLIDE_ROOT_FOLDER_ID,
    yearFolderName: `Slide mổ tim ${year}`,
    monthFolderName: `Staff mổ - Tháng ${month} - ${year}`,
    year,
    month,
  };
}

export function buildStaffSlideFileName(opts: {
  patientName?: string;
  patientId?: string;
  consultDate?: string;
}): string {
  const safe = (v?: string) =>
    String(v || '')
      .trim()
      .replace(/[\\/:*?"<>|]+/g, '_')
      .replace(/\s+/g, ' ')
      .slice(0, 80);
  const name = safe(opts.patientName) || 'BN';
  const id = safe(opts.patientId) || 'ID';
  const date = safe(opts.consultDate).replace(/\//g, '-') || 'nodate';
  return `${name}_${id}_${date}.pptx`;
}
