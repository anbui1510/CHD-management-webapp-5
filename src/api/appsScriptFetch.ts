type SheetData = {
  patients: any[];
  consults: any[];
  staff: any[];
  cathlabs: any[];
  operations: any[];
  cmrs: any[];
  sources: any[];
  rolePresets: any[];
};

type SheetType = 'Patient' | 'Consult' | 'Staff' | 'CathLab' | 'Operation' | 'CMR' | 'Source' | 'RolePreset';

const SCRIPT_URL_STORAGE_KEY = 'chd_apps_script_url';
const viteEnv = (import.meta as any).env || {};
const EMPTY_DATA: SheetData = {
  patients: [],
  consults: [],
  staff: [],
  cathlabs: [],
  operations: [],
  cmrs: [],
  sources: [],
  rolePresets: []
};

const endpointMap: Record<string, { type: SheetType; collection: keyof SheetData; keyField: string; prefix: string }> = {
  patients: { type: 'Patient', collection: 'patients', keyField: 'PatientKey', prefix: 'pat' },
  consults: { type: 'Consult', collection: 'consults', keyField: 'ConsultKey', prefix: 'con' },
  staff: { type: 'Staff', collection: 'staff', keyField: 'StaffKey', prefix: 'staff' },
  cathlabs: { type: 'CathLab', collection: 'cathlabs', keyField: 'CathKey', prefix: 'cath' },
  operations: { type: 'Operation', collection: 'operations', keyField: 'SurgKey', prefix: 'surg' },
  cmrs: { type: 'CMR', collection: 'cmrs', keyField: 'CMRKey', prefix: 'cmr' },
  sources: { type: 'Source', collection: 'sources', keyField: 'DiagnosisID', prefix: 'source' },
  'role-presets': { type: 'RolePreset', collection: 'rolePresets', keyField: 'RolePresetID', prefix: 'preset' }
};

let cache: SheetData | null = null;
let pendingLoad: Promise<SheetData> | null = null;

const getScriptUrl = () =>
  localStorage.getItem(SCRIPT_URL_STORAGE_KEY) ||
  String(viteEnv.VITE_GOOGLE_SCRIPT_URL || '').trim();

const isLocalHost = () => ['localhost', '127.0.0.1', '0.0.0.0'].includes(window.location.hostname);

const setScriptUrl = (scriptUrl: string) => {
  const trimmed = scriptUrl.trim();
  if (trimmed) {
    localStorage.setItem(SCRIPT_URL_STORAGE_KEY, trimmed);
  } else {
    localStorage.removeItem(SCRIPT_URL_STORAGE_KEY);
  }
  cache = null;
  pendingLoad = null;
};

const jsonResponse = (body: unknown, init?: ResponseInit) =>
  new Response(JSON.stringify(body), {
    status: init?.status || 200,
    statusText: init?.statusText,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers || {})
    }
  });

const textResponse = (body: string, init?: ResponseInit) =>
  new Response(body, {
    status: init?.status || 200,
    statusText: init?.statusText,
    headers: {
      'Content-Type': 'text/plain',
      ...(init?.headers || {})
    }
  });

const parseBody = async (init?: RequestInit): Promise<any> => {
  if (!init?.body) return {};
  if (typeof init.body === 'string') return JSON.parse(init.body || '{}');
  return JSON.parse(String(init.body));
};

const normalizeData = (data: Partial<SheetData>): SheetData => ({
  ...EMPTY_DATA,
  ...data,
  patients: Array.isArray(data.patients) ? data.patients : [],
  consults: Array.isArray(data.consults) ? data.consults : [],
  staff: Array.isArray(data.staff) ? data.staff : [],
  cathlabs: Array.isArray(data.cathlabs) ? data.cathlabs : [],
  operations: Array.isArray(data.operations) ? data.operations : [],
  cmrs: Array.isArray(data.cmrs) ? data.cmrs : [],
  sources: Array.isArray(data.sources) ? data.sources : [],
  rolePresets: Array.isArray(data.rolePresets) ? data.rolePresets : []
});

const loadAllData = async (force = false): Promise<SheetData> => {
  const scriptUrl = getScriptUrl();
  if (!scriptUrl) throw new Error('Chưa cấu hình Google Apps Script URL');
  if (cache && !force) return cache;
  if (pendingLoad && !force) return pendingLoad;

  pendingLoad = fetch(`${scriptUrl}?action=getAll`)
    .then(async res => {
      const contentType = res.headers.get('Content-Type') || '';
      const text = await res.text();
      if (!res.ok) throw new Error(`Apps Script trả về HTTP ${res.status}`);
      if (contentType.includes('text/html') || text.trim().startsWith('<')) {
        throw new Error('Apps Script đang trả về HTML. Hãy deploy Web app với quyền truy cập Anyone và copy đúng Web app URL.');
      }
      const parsed = JSON.parse(text);
      cache = normalizeData(parsed);
      return cache;
    })
    .finally(() => {
      pendingLoad = null;
    });

  return pendingLoad;
};

const findCachedRecord = (
  endpoint: string,
  key: string | undefined,
  config: (typeof endpointMap)[string]
) => {
  if (!key || !cache) return undefined;
  const collection = cache[config.collection] as any[];
  return collection.find(item =>
    String(getRecordKey(item, config) || '').trim().toLowerCase() === String(key).trim().toLowerCase() ||
    (endpoint === 'patients' && String(item.PatientID1 || '').trim().toLowerCase() === String(key).trim().toLowerCase())
  );
};

const upsertCachedRecord = (config: (typeof endpointMap)[string], record: any, isInsert: boolean) => {
  if (!cache) {
    cache = { ...EMPTY_DATA };
  }
  const collection = [...(cache[config.collection] as any[])];
  const recordKey = String(getRecordKey(record, config) || '').trim().toLowerCase();
  const index = collection.findIndex(item =>
    String(getRecordKey(item, config) || '').trim().toLowerCase() === recordKey
  );
  if (index >= 0) {
    collection[index] = record;
  } else if (isInsert) {
    collection.push(record);
  } else {
    collection.push(record);
  }
  cache = {
    ...cache,
    [config.collection]: collection
  };
};

const postToScript = async (
  payload: { type: SheetType; action: 'insert' | 'update'; key: string; data: any },
  config: (typeof endpointMap)[string],
  record: any,
  isInsert: boolean
) => {
  const scriptUrl = getScriptUrl();
  if (!scriptUrl) throw new Error('Chưa cấu hình Google Apps Script URL');

  const response = await fetch(scriptUrl, {
    method: 'POST',
    // text/plain avoids a browser preflight, which Apps Script Web Apps do not handle well.
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(payload)
  });

  const text = await response.text();
  if (!response.ok) throw new Error(`Apps Script trả về HTTP ${response.status}`);
  const result = JSON.parse(text);
  if (result.status === 'error') {
    throw new Error(result.message || 'Apps Script không thể ghi dữ liệu');
  }
  upsertCachedRecord(config, record, isInsert);
  return result;
};

const createKey = (prefix: string) => `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

const getRecordKey = (record: any, config: (typeof endpointMap)[string]) => {
  if (config.collection === 'cmrs') return record.CMRKey || record.CMRkey;
  return record[config.keyField];
};

const prepareRecordForInsert = async (endpoint: string, record: any, config: (typeof endpointMap)[string]) => {
  const next = { ...(record || {}) };
  if (!getRecordKey(next, config)) {
    next[config.keyField] = createKey(config.prefix);
  }
  if (endpoint === 'patients') {
    next.PatientCreateTime = next.PatientCreateTime || new Date().toISOString();
  }
  if (endpoint === 'consults') {
    next.ConsultCreateTime = next.ConsultCreateTime || new Date().toISOString();
  }
  if (endpoint === 'cmrs') {
    next.CMRKey = next.CMRKey || next.CMRkey || createKey(config.prefix);
    next.UpdateTime = next.UpdateTime || new Date().toISOString();
  }
  return next;
};

const upsertRecord = async (endpoint: string, keyFromPath: string | undefined, method: string, init?: RequestInit) => {
  const config = endpointMap[endpoint];
  if (!config) return jsonResponse({ error: `Unsupported endpoint: ${endpoint}` }, { status: 404 });

  const incoming = await parseBody(init);
  const isUpdate = method === 'PUT' || method === 'PATCH';
  const key = keyFromPath ? decodeURIComponent(keyFromPath) : getRecordKey(incoming, config);

  let existing = findCachedRecord(endpoint, key, config);
  if (isUpdate && !existing && !cache) {
    await loadAllData();
    existing = findCachedRecord(endpoint, key, config);
  }

  let record = isUpdate
    ? { ...(existing || {}), ...incoming }
    : await prepareRecordForInsert(endpoint, incoming, config);

  if (endpoint === 'cmrs') {
    record.CMRKey = record.CMRKey || record.CMRkey || key || createKey(config.prefix);
    record.UpdateTime = new Date().toISOString();
  }

  const finalKey = getRecordKey(record, config) || key || createKey(config.prefix);
  record[config.keyField] = finalKey;

  const isInsert = !(existing || isUpdate);
  await postToScript(
    {
      type: config.type,
      action: existing || isUpdate ? 'update' : 'insert',
      key: String(finalKey),
      data: record
    },
    config,
    record,
    isInsert
  );

  return jsonResponse(record, { status: existing || isUpdate ? 200 : 201 });
};

const handleApiRequest = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response | null> => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
  const parsed = new URL(url, window.location.origin);
  if (parsed.origin !== window.location.origin || !parsed.pathname.startsWith('/api/')) return null;

  const scriptUrl = getScriptUrl();
  const method = String(init?.method || (input instanceof Request ? input.method : 'GET') || 'GET').toUpperCase();
  const parts = parsed.pathname.replace(/^\/api\/?/, '').split('/').filter(Boolean);
  const endpoint = parts[0] || '';
  const key = parts[1];

  if (endpoint === 'sync-config') {
    if (parts[1] === 'sync' && method === 'POST') {
      cache = null;
      await loadAllData(true);
      return jsonResponse({ message: 'Đã tải lại dữ liệu từ Google Sheets.' });
    }
    if (method === 'GET') {
      return jsonResponse({ scriptUrl, isSynced: !!scriptUrl });
    }
    if (method === 'POST') {
      const body = await parseBody(init);
      const nextUrl = String(body.scriptUrl || '').trim();
      if (nextUrl && !nextUrl.startsWith('https://script.google.com/macros/s/')) {
        return jsonResponse({ error: 'Địa chỉ Apps Script không hợp lệ.' }, { status: 400 });
      }
      setScriptUrl(nextUrl);
      if (nextUrl) {
        await loadAllData(true);
        return jsonResponse({ message: 'Kết nối Google Apps Script thành công!', scriptUrl: nextUrl, isSynced: true });
      }
      return jsonResponse({ message: 'Đã hủy liên kết Google Apps Script.', scriptUrl: '', isSynced: false });
    }
  }

  if (endpoint === 'reset') {
    return jsonResponse({ message: 'Reset local database không khả dụng khi chạy bằng Apps Script.' }, { status: 400 });
  }

  if (endpoint === 'all' && method === 'GET') {
    if (!scriptUrl) {
      if (isLocalHost()) return null;
      return jsonResponse(EMPTY_DATA);
    }
    const allData = await loadAllData();
    return jsonResponse(allData);
  }

  if (endpoint === 'proxy' && parts[1] === 'drive-export') {
    const target = parsed.searchParams.get('url') || '';
    if (!target) return textResponse('Missing url', { status: 400 });
    return fetch(target);
  }

  const config = endpointMap[endpoint];
  if (!config) return jsonResponse({ error: `Unsupported API endpoint: ${endpoint}` }, { status: 404 });

  if (!scriptUrl) {
    if (isLocalHost()) return null;
    if (method === 'GET') return jsonResponse(EMPTY_DATA[config.collection]);
    return jsonResponse({ error: 'Chưa kết nối Google Apps Script URL trong mục Google Sheets.' }, { status: 400 });
  }

  if (method === 'GET') {
    const allData = await loadAllData();
    return jsonResponse(allData[config.collection]);
  }

  if (method === 'POST' || method === 'PUT' || method === 'PATCH') {
    return upsertRecord(endpoint, key, method, init);
  }

  return jsonResponse({ error: `Unsupported method: ${method}` }, { status: 405 });
};

export const installAppsScriptFetchBridge = () => {
  if (typeof window === 'undefined') return;
  if ((window as any).__CHD_APPS_SCRIPT_FETCH_BRIDGE__) return;
  (window as any).__CHD_APPS_SCRIPT_FETCH_BRIDGE__ = true;

  const nativeFetch = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const handled = await handleApiRequest(input, init);
    if (handled) return handled;
    return nativeFetch(input, init);
  };
};
