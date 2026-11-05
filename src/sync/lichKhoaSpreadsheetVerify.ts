export function normalizeLichKhoaSpreadsheetId(raw: string): string | null {
  const text = String(raw || '').trim();
  if (!text) return null;
  const fromUrl = text.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
  const candidate = fromUrl ? fromUrl[1] : text;
  const re44 = /^[a-zA-Z0-9_-]{44}$/;
  if (re44.test(candidate)) return candidate;
  if (candidate.length > 44 && re44.test(candidate.slice(0, 44))) return candidate.slice(0, 44);
  if (candidate.length >= 20 && candidate.length <= 50 && /^[a-zA-Z0-9_-]+$/.test(candidate)) {
    return candidate;
  }
  return null;
}

export async function verifyLichKhoaSpreadsheetAccess(
  scriptUrl: string,
  scriptSecret: string,
  spreadsheetId: string
): Promise<string | null> {
  const trimmed = String(scriptUrl || '').trim().replace(/\/+$/, '').split('?')[0].split('#')[0];
  if (!trimmed.startsWith('https://script.google.com/')) {
    return 'URL Apps Script lịch khoa không hợp lệ.';
  }
  const payload = {
    action: 'verifySpreadsheet',
    spreadsheetId,
    apiKey: scriptSecret || '',
  };
  const upstream = await fetch(trimmed, {
    method: 'POST',
    redirect: 'follow',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(payload),
  });
  const text = await upstream.text();
  try {
    const data = JSON.parse(text) as { status?: string; error?: string; title?: string };
    if (!upstream.ok || data.error) {
      return data.error || `Không mở được Sheet lịch khoa (HTTP ${upstream.status}).`;
    }
    if (data.status !== 'success') {
      return 'Apps Script chưa hỗ trợ verifySpreadsheet — hãy deploy lại Code.gs mới từ tab Virtual Google Sheets.';
    }
    return null;
  } catch {
    if (text.startsWith('<!') || text.startsWith('<html')) {
      return 'Apps Script trả HTML — kiểm tra deploy Web app (Anyone) và URL.';
    }
    return 'Phản hồi Apps Script không hợp lệ khi kiểm tra Spreadsheet ID.';
  }
}
