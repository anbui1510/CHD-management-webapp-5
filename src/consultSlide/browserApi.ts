import { mergeSlideExtract } from './mergeExtract';
import type { ConsultSlideExtract } from './types';
import { buildStaffSlideFileName, resolveStaffSlideDriveTarget } from './driveFolders';
import {
  downloadPptxBase64,
  fillStaffPptxTemplate,
  loadTemplateFromUrl,
  uint8ToBase64,
} from './fillPptx';
import type {
  ConsultSlideAttachment,
  ConsultSlideConsultContext,
  ConsultSlidePatientContext,
} from './types';

const OCR_POLL_INTERVAL_MS = 2500;
const OCR_POLL_MAX_MS = 3 * 60 * 1000;

function parseAppsScriptProxyPayload(
  text: string,
  res: Response
): {
  status?: string;
  message?: string;
  error?: string;
  extract?: ConsultSlideExtract;
  jobId?: string;
  jobStatus?: string;
  model?: string;
} {
  const trimmed = text.trim();
  if (
    trimmed.startsWith('<!DOCTYPE') ||
    trimmed.startsWith('<html') ||
    trimmed.startsWith('<!doctype')
  ) {
    throw new Error(
      `Apps Script trả về trang HTML (HTTP ${res.status}), không phải JSON. URL Web app sai, chưa deploy quyền Anyone, hoặc đang trỏ deployment cũ. Hãy dán lại URL /exec mới và Lưu kết nối Virtual Google Sheets.`
    );
  }
  try {
    return JSON.parse(text) as {
      status?: string;
      message?: string;
      error?: string;
      extract?: ConsultSlideExtract;
      jobId?: string;
      jobStatus?: string;
      model?: string;
    };
  } catch {
    const preview = trimmed.length > 220 ? `${trimmed.slice(0, 220)}…` : trimmed;
    if (res.status === 524 || /error code:\s*524/i.test(trimmed)) {
      throw new Error(
        'HTTP 524: Cloudflare cắt kết nối vì đọc AI quá lâu. App đã chuyển sang xếp hàng async — hãy paste Code.gs mới (enqueue/status) và Deploy New version, rồi thử lại với ≤3 ảnh.'
      );
    }
    throw new Error(
      `Apps Script trả về không phải JSON (HTTP ${res.status}). Kiểm tra URL /exec và deploy mới (action consult_slide_extract). Chi tiết: ${preview}`
    );
  }
}

function appsScriptErrorMessage(
  data: { status?: string; message?: string; error?: string },
  res: Response
): string {
  const fromBody =
    String(data.message || data.error || '').trim() ||
    (data.status === 'error' ? 'Apps Script báo lỗi nhưng không gửi message.' : '');
  if (fromBody) return fromBody;
  if (!res.ok) {
    return `Proxy Sheets thất bại (HTTP ${res.status}). Kiểm tra URL Web app và khóa API_KEY khớp Script properties.`;
  }
  return 'Gọi Gemini qua Apps Script thất bại. Mở Apps Script → Executions để xem chi tiết; kiểm tra GEMINI_API_KEY và deploy New version.';
}

async function postSheetsProxy(payload: Record<string, unknown>) {
  const res = await fetch('/api/sheets/proxy', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      kind: 'post',
      payload,
    }),
  });
  const text = await res.text();
  const data = parseAppsScriptProxyPayload(text, res);
  if (!res.ok || data.status === 'error') {
    throw new Error(appsScriptErrorMessage(data, res));
  }
  return data;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function requestConsultSlideExtractViaAppsScript(opts: {
  patient: ConsultSlidePatientContext;
  consult: ConsultSlideConsultContext;
  attachments: ConsultSlideAttachment[];
  onStatus?: (message: string) => void;
}): Promise<ConsultSlideExtract> {
  opts.onStatus?.('Đang xếp hàng đọc AI…');
  const slimAttachments = opts.attachments.slice(0, 3);
  const enqueued = await postSheetsProxy({
    action: 'consult_slide_extract_enqueue',
    patient: opts.patient,
    consult: opts.consult,
    attachments: slimAttachments,
  });
  const jobId = String(enqueued.jobId || '').trim();
  if (!jobId) {
    // Older Apps Script without enqueue — fall back to sync extract once.
    if (enqueued.extract) return enqueued.extract;
    const sync = await postSheetsProxy({
      action: 'consult_slide_extract',
      patient: opts.patient,
      consult: opts.consult,
      attachments: slimAttachments,
    });
    if (!sync.extract) throw new Error('Apps Script không trả dữ liệu extract.');
    return sync.extract;
  }

  const started = Date.now();
  let ticks = 0;
  while (Date.now() - started < OCR_POLL_MAX_MS) {
    ticks += 1;
    const elapsedSec = Math.round((Date.now() - started) / 1000);
    opts.onStatus?.(
      ticks <= 2
        ? 'Đang đọc AI… (có thể 30–90 giây)'
        : `Đang đọc AI… đã chờ ~${elapsedSec}s`
    );
    await sleep(OCR_POLL_INTERVAL_MS);
    const status = await postSheetsProxy({
      action: 'consult_slide_extract_status',
      jobId,
    });
    const jobStatus = String(status.jobStatus || '').toLowerCase();
    if (jobStatus === 'done' && status.extract) {
      return status.extract;
    }
    if (jobStatus === 'error') {
      throw new Error(status.message || 'Đọc AI thất bại (job error).');
    }
  }
  throw new Error(
    'Đọc AI quá lâu (>3 phút). Thử lại với ít ảnh hơn (hành chính + TTE), hoặc kiểm tra Apps Script Executions.'
  );
}

/** Prefer Apps Script (tránh lỗi vùng Cloudflare Worker); fallback Worker khi dev local. */
export async function requestConsultSlideExtract(opts: {
  patient: ConsultSlidePatientContext;
  consult: ConsultSlideConsultContext;
  attachments: ConsultSlideAttachment[];
  preferOcr?: boolean;
  onStatus?: (message: string) => void;
}): Promise<ConsultSlideExtract> {
  let rawExtract: ConsultSlideExtract;
  try {
    rawExtract = await requestConsultSlideExtractViaAppsScript(opts);
  } catch (appsErr) {
    opts.onStatus?.('Thử dự phòng Worker…');
    const res = await fetch('/api/consult-slide/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        patient: opts.patient,
        consult: opts.consult,
        attachments: opts.attachments.slice(0, 3),
        preferOcr: opts.preferOcr,
      }),
    });
    const text = await res.text();
    let data: { success?: boolean; extract?: ConsultSlideExtract; error?: string };
    try {
      data = JSON.parse(text);
    } catch {
      throw appsErr instanceof Error ? appsErr : new Error(String(appsErr));
    }
    if (!res.ok || !data.success || !data.extract) {
      const workerMsg = data.error || `Tạo slide thất bại (HTTP ${res.status})`;
      const appsMsg = appsErr instanceof Error ? appsErr.message : String(appsErr);
      throw new Error(`${appsMsg}\n\n(Dự phòng Worker: ${workerMsg})`);
    }
    rawExtract = data.extract;
  }

  return mergeSlideExtract({
    patient: opts.patient,
    consult: opts.consult,
    extract: rawExtract,
    preferOcr: Boolean(opts.preferOcr),
  });
}

export async function buildStaffPptxBase64(opts: {
  extract: ConsultSlideExtract;
  requestBy?: string;
  consultDate?: string;
  attachments?: ConsultSlideAttachment[];
}): Promise<{ fileName: string; base64: string }> {
  const templateBytes = await loadTemplateFromUrl('/consult-slide/Template_staff.pptx');
  const bytes = await fillStaffPptxTemplate({
    templateBytes,
    extract: opts.extract,
    requestBy: opts.requestBy,
    attachments: opts.attachments,
  });
  const fileName = buildStaffSlideFileName({
    patientName: opts.extract.PatientName,
    patientId: opts.extract.PatientID1,
    consultDate: opts.consultDate,
  });
  return { fileName, base64: uint8ToBase64(bytes) };
}

export { downloadPptxBase64, resolveStaffSlideDriveTarget, buildStaffSlideFileName };

/** Resize image File to JPEG base64 (no data-URL prefix). PDFs returned as-is. */
export async function prepareAttachmentFile(
  file: File,
  kind: ConsultSlideAttachment['kind'],
  maxEdge = 1600,
  quality = 0.72
): Promise<ConsultSlideAttachment> {
  const mime = file.type || 'application/octet-stream';
  if (mime === 'application/pdf' || kind === 'pdf') {
    const buf = await file.arrayBuffer();
    const bytes = new Uint8Array(buf);
    let binary = '';
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
    }
    return {
      kind: kind === 'pdf' ? 'pdf' : kind,
      mimeType: 'application/pdf',
      base64: btoa(binary),
      fileName: file.name,
    };
  }

  if (!mime.startsWith('image/')) {
    throw new Error(`Định dạng không hỗ trợ: ${file.name}`);
  }

  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Không đọc được ảnh'));
    reader.readAsDataURL(file);
  });

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error('Không giải mã được ảnh'));
    el.src = dataUrl;
  });

  const scale = Math.min(1, maxEdge / Math.max(img.width, img.height));
  const w = Math.max(1, Math.round(img.width * scale));
  const h = Math.max(1, Math.round(img.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas không khả dụng');
  ctx.drawImage(img, 0, 0, w, h);
  const jpegUrl = canvas.toDataURL('image/jpeg', quality);
  const base64 = jpegUrl.replace(/^data:[^;]+;base64,/, '');

  return {
    kind,
    mimeType: 'image/jpeg',
    base64,
    fileName: file.name,
  };
}

/** Smaller JPEG for AI register OCR (faster Apps Script → Gemini). */
export async function prepareAiRegisterAttachmentFile(
  file: File,
  kind: ConsultSlideAttachment['kind']
): Promise<ConsultSlideAttachment> {
  return prepareAttachmentFile(file, kind, 1024, 0.55);
}
