import { parseSpreadsheetId } from '../logic/sheetStore/parseSpreadsheetId.js';

const PAGES_DEV_SUFFIX = '-lichkhoa-webapp.pages.dev';

function env(key) {
  try {
    return import.meta.env?.[key];
  } catch {
    return undefined;
  }
}

function parseJsonEnv(raw) {
  const text = String(raw || '').trim();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function slugFromHostname(hostname) {
  const host = String(hostname || '').trim().toLowerCase();
  if (!host) return '';
  if (host === 'localhost' || host === '127.0.0.1' || host === '::1') return '';
  // IPv4 / IPv6 — không lấy octet đầu làm tenant slug
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.includes(':')) return '';
  if (host.endsWith(PAGES_DEV_SUFFIX)) {
    const prefix = host.slice(0, -PAGES_DEV_SUFFIX.length);
    return prefix || '';
  }
  const parts = host.split('.');
  if (parts.length >= 3) return parts[0];
  return '';
}

function normalizeDepartments(list, fallbackId, fallbackName) {
  if (Array.isArray(list) && list.length) {
    return list
      .map((d) => ({
        id: String(d?.id || '').trim(),
        name: String(d?.name || d?.label || '').trim()
      }))
      .filter((d) => d.id && d.name);
  }
  if (fallbackId && fallbackName) {
    return [{ id: fallbackId, name: fallbackName }];
  }
  return [];
}

function entryFromEnvSingle() {
  const slug = String(env('VITE_TENANT_SLUG') || '').trim().toLowerCase();
  const label = String(env('VITE_TENANT_LABEL') || '').trim();
  const sheetRaw = String(
    env('VITE_DEFAULT_SPREADSHEET_ID')
    || env('VITE_DEFAULT_SPREADSHEET_URL')
    || ''
  ).trim();
  const spreadsheetId = parseSpreadsheetId(sheetRaw) || sheetRaw;
  const deptList = parseJsonEnv(env('VITE_TENANT_DEPARTMENTS'));
  const deptId = slug ? `dept_${slug.replace(/-/g, '_')}` : 'dept_default';
  return {
    slug: slug || 'default',
    label: label || 'Lịch khoa',
    spreadsheetId,
    departments: normalizeDepartments(deptList, deptId, label || 'Khoa')
  };
}

function findRegistryEntry(slug) {
  const registry = parseJsonEnv(env('VITE_TENANT_REGISTRY'));
  if (!Array.isArray(registry)) return null;
  const key = String(slug || '').trim().toLowerCase();
  if (!key) return registry.length === 1 ? registry[0] : null;
  return registry.find((item) => String(item?.slug || '').trim().toLowerCase() === key) || null;
}

function normalizeEntry(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const slug = String(raw.slug || '').trim().toLowerCase() || 'default';
  const label = String(raw.label || raw.name || '').trim() || slug;
  const sheetRaw = String(raw.spreadsheetId || raw.spreadsheetUrl || raw.sheetId || '').trim();
  const spreadsheetId = parseSpreadsheetId(sheetRaw) || sheetRaw;
  const departments = normalizeDepartments(
    raw.departments,
    `dept_${slug.replace(/-/g, '_')}`,
    label
  );
  return { slug, label, spreadsheetId, departments };
}

/** F-305 — tenant hiện tại (build-time env + hostname runtime). */
export function resolveTenant(hostname = typeof window !== 'undefined' ? window.location.hostname : '') {
  const hostSlug = slugFromHostname(hostname);
  const fromRegistry = normalizeEntry(findRegistryEntry(hostSlug));
  if (fromRegistry) return fromRegistry;

  const single = entryFromEnvSingle();
  if (hostSlug && single.slug === 'default') {
    return {
      ...single,
      slug: hostSlug,
      label: single.label === 'Lịch khoa' ? hostSlug : single.label,
      departments: normalizeDepartments(
        parseJsonEnv(env('VITE_TENANT_DEPARTMENTS')),
        `dept_${hostSlug.replace(/-/g, '_')}`,
        single.label
      )
    };
  }
  return single;
}

export function tenantSpreadsheetId() {
  return resolveTenant().spreadsheetId || '';
}

export function tenantDepartmentOptions() {
  return resolveTenant().departments || [];
}
