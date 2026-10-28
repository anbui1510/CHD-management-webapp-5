const mem = new Map<string, string>();
(globalThis as unknown as { localStorage: Storage }).localStorage = {
  get length() {
    return mem.size;
  },
  clear() {
    mem.clear();
  },
  getItem(key: string) {
    return mem.has(key) ? mem.get(key)! : null;
  },
  setItem(key: string, value: string) {
    mem.set(key, String(value));
  },
  removeItem(key: string) {
    mem.delete(key);
  },
  key() {
    return null;
  },
};

const {
  recordLocalSheetsSyncFailure,
  listSheetsSyncFailures,
  acknowledgeAllLocalSheetsSyncFailures
} = await import('../src/utils/sheetsSyncFailuresStore');

recordLocalSheetsSyncFailure(
  '01378',
  'Consult',
  'con_1',
  'insert',
  { viewLabel: 'Staff', patientName: 'A' },
  'Dữ liệu chưa lên Google Sheets'
);
const list = listSheetsSyncFailures('01378');
if (list.length !== 1) throw new Error(`expected 1 failure, got ${list.length}`);
if (!list[0].Message.includes('chưa lên')) throw new Error('bad message');
acknowledgeAllLocalSheetsSyncFailures('01378');
if (listSheetsSyncFailures('01378').length !== 0) throw new Error('ack failed');
console.log('failures-store: ok');
