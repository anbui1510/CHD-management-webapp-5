import * as XLSX from 'xlsx';
import { removeDiacritics } from '../types';

export const DEFAULT_HIS_PATIENT_ADDRESS = 'TP Hồ Chí Minh';
export const HIS_ADDRESS_WARNING =
  'BN được tạo tự động từ import HIS, địa chỉ đang mặc định là TP Hồ Chí Minh. Cần cập nhật lại địa chỉ hành chính chính xác.';
export const HIS_IMPORT_BATCH_SIZE = 15;

export const SCHEDULING_ELIGIBLE_RESULTS = [
  'Can thiệp thông tim',
  'Chụp chẩn đoán +/- can thiệp',
  'Chụp chẩn đoán-Đo kháng lực',
  'Chụp chẩn đoán/Đo kháng lực',
  'Tiền Glenn',
  'Tiền Fontan',
  'Điện sinh lý',
];

export type BatchWriteOperation = {
  endpoint: string;
  method: 'POST' | 'PUT' | 'PATCH';
  key?: string;
  data: Record<string, any>;
};

export const normalizeHisText = (value: unknown): string =>
  String(value ?? '').trim().replace(/\s+/g, ' ');

export const normalizeHisHeader = (value: unknown): string =>
  removeDiacritics(normalizeHisText(value)).toLowerCase().replace(/[^a-z0-9]/g, '');

export const normalizeHisKey = (value: unknown): string => normalizeHisText(value).toLowerCase();

export const normalizeRefKey = (value: unknown): string => String(value ?? '').trim().toLowerCase();

export const parseHisDateOnly = (value: unknown): string => {
  if (!value) return '';
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().split('T')[0];
  }
  if (typeof value === 'number') {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (parsed) {
      const month = String(parsed.m).padStart(2, '0');
      const day = String(parsed.d).padStart(2, '0');
      return `${parsed.y}-${month}-${day}`;
    }
  }

  const raw = normalizeHisText(value).split(/\s+/)[0];
  const rawFull = normalizeHisText(value);
  const numericValue = Number(rawFull);
  if (/^\d+(\.\d+)?$/.test(rawFull) && numericValue > 20000) {
    const parsed = XLSX.SSF.parse_date_code(numericValue);
    if (parsed) {
      const month = String(parsed.m).padStart(2, '0');
      const day = String(parsed.d).padStart(2, '0');
      return `${parsed.y}-${month}-${day}`;
    }
  }
  if (/[a-zA-Z]/.test(rawFull)) {
    const parsedTime = Date.parse(rawFull);
    if (!Number.isNaN(parsedTime)) return new Date(parsedTime).toISOString().split('T')[0];
  }
  const parts = raw.includes('/') ? raw.split('/') : raw.split('-');
  if (parts.length !== 3) return raw;

  const [first, second, third] = parts.map(part => part.trim());
  if (first.length === 4) {
    return `${first}-${second.padStart(2, '0')}-${third.padStart(2, '0')}`;
  }
  return `${third}-${second.padStart(2, '0')}-${first.padStart(2, '0')}`;
};

export const normalizeHisSex = (value: unknown): 'Nam' | 'Nữ' => {
  const normalized = removeDiacritics(normalizeHisText(value)).toLowerCase();
  return normalized.includes('nu') ? 'Nữ' : 'Nam';
};

export const normalizeHisDoctor = (value: unknown): string => {
  const cleaned = normalizeHisText(value)
    .replace(/\([^)]*\)/g, '')
    .replace(/^(bsckii|bscki|ths|th\.s|ts|bs|bác sĩ)\.?\s+/i, '')
    .trim();
  if (!cleaned) return '';
  const parts = cleaned.split(/\s+/);
  return `BS. ${parts[parts.length - 1]}`;
};

export const getHisCell = (row: unknown[], headerMap: Map<string, number>, aliases: string[]): string => {
  for (const alias of aliases) {
    const index = headerMap.get(alias);
    if (index !== undefined) return normalizeHisText(row[index]);
  }
  return '';
};

export const getDateDistanceDays = (a?: string, b?: string) => {
  if (!a || !b) return Number.POSITIVE_INFINITY;
  const timeA = new Date(`${parseHisDateOnly(a)}T00:00:00`).getTime();
  const timeB = new Date(`${parseHisDateOnly(b)}T00:00:00`).getTime();
  if (Number.isNaN(timeA) || Number.isNaN(timeB)) return Number.POSITIVE_INFINITY;
  return Math.abs(timeA - timeB) / (1000 * 60 * 60 * 24);
};

export const chunkArray = <T,>(items: T[], size: number): T[][] => {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
};

export const buildCathImportKey = (patientId: string, cathDate: string, cathMethod: string) =>
  `${normalizeHisKey(patientId)}|${cathDate}|${removeDiacritics(cathMethod).toLowerCase().trim()}`;

export const readHisWorkbookRows = async (file: File): Promise<unknown[][]> => {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
  const worksheet = workbook.Sheets[workbook.SheetNames[0]];
  return XLSX.utils.sheet_to_json(worksheet, { header: 1, raw: true }) as unknown[][];
};
