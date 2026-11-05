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

export type LichKhoaSheetVerifyResult = {
  error: string | null;
  /** Apps Script cũ chưa có verifySpreadsheet — vẫn cho lưu cấu hình. */
  legacyScript?: boolean;
  warning?: string;
};

const LEGACY_VERIFY_HINT =
  'Đã lưu cấu hình. Hãy dán Code.gs mới trong Apps Script → Deploy → Manage deployments → New version (Web app), rồi bấm Lưu & kết nối lại để xác minh Sheet.';

function isLegacyVerifyFailure(message: string): boolean {
  return (
    message.includes('Thiếu staffKey') ||
    message.includes('verifySpreadsheet') ||
    message.includes('action không hợp lệ') ||
    message.includes('chưa hỗ trợ verifySpreadsheet')
  );
}

/** Kiểm tra mở Sheet qua Apps Script GET (không cần staffKey). */
export async function verifyLichKhoaSpreadsheetAccess(
  scriptUrl: string,
  scriptSecret: string,
  spreadsheetId: string
): Promise<LichKhoaSheetVerifyResult> {
  const trimmed = String(scriptUrl || '').trim().replace(/\/+$/, '').split('?')[0].split('#')[0];
  if (!trimmed.startsWith('https://script.google.com/')) {
    return { error: 'URL Apps Script lịch khoa không hợp lệ.' };
  }

  let verifyUrl = `${trimmed}?action=verifySpreadsheet&spreadsheetId=${encodeURIComponent(spreadsheetId)}`;
  if (scriptSecret) verifyUrl += `&apiKey=${encodeURIComponent(scriptSecret)}`;
  verifyUrl += `&_ts=${Date.now()}`;

  const upstream = await fetch(verifyUrl, { redirect: 'follow' });
  const text = await upstream.text();

  if (text.startsWith('<!') || text.startsWith('<html')) {
    return { error: 'Apps Script trả HTML — kiểm tra deploy Web app (Anyone) và URL.' };
  }

  try {
    const data = JSON.parse(text) as {
      status?: string;
      ok?: boolean;
      error?: string;
      title?: string;
    };

    if (data.status === 'success' && !data.error) {
      return { error: null };
    }

    const errMsg = data.error || '';
    if (errMsg && isLegacyVerifyFailure(errMsg)) {
      return { error: null, legacyScript: true, warning: LEGACY_VERIFY_HINT };
    }

    // Script cũ: doGet chỉ trả { ok: true, service: ... } — chưa verify Sheet.
    if (data.ok && !data.status && !data.error) {
      return { error: null, legacyScript: true, warning: LEGACY_VERIFY_HINT };
    }

    if (errMsg) return { error: errMsg };
    return {
      error:
        'Không xác minh được Sheet lịch khoa. Deploy lại Code.gs mới (Web app) rồi thử Lưu & kết nối lại.',
    };
  } catch {
    return { error: 'Phản hồi Apps Script không hợp lệ khi kiểm tra Spreadsheet ID.' };
  }
}
