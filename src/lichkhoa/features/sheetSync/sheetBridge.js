import { getChdStaffKey } from '../../auth/chdAuth.js';

/**
 * Bridge calls go through CHD Express proxy — no Google ID token.
 */
async function postBridge(body) {
  const staffKey = getChdStaffKey() || body.staffKey || '';
  let response;
  try {
    response = await fetch('/api/lichkhoa/proxy', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...body, staffKey }),
    });
  } catch (error) {
    const err = new Error('Không kết nối được Sheet bridge lịch khoa.');
    err.status = 0;
    err.cause = error;
    throw err;
  }
  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { error: text || 'Phản hồi không hợp lệ.' };
  }
  if (!response.ok || data?.error) {
    const err = new Error(data?.error || `Lỗi bridge (${response.status}).`);
    err.status = response.status;
    throw err;
  }
  return data;
}

export const sheetBridge = {
  async getProfile(spreadsheetId) {
    return postBridge({ action: 'getProfile', spreadsheetId });
  },
  async pull(spreadsheetId) {
    return postBridge({ action: 'pull', spreadsheetId });
  },
  async push(spreadsheetId, tabs) {
    return postBridge({ action: 'push', spreadsheetId, tabs });
  },
  async bootstrap(spreadsheetId, tabs) {
    return postBridge({ action: 'bootstrap', spreadsheetId, tabs });
  },
};
