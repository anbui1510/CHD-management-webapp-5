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

async function requestConsultSlideExtractViaAppsScript(opts: {
  patient: ConsultSlidePatientContext;
  consult: ConsultSlideConsultContext;
  attachments: ConsultSlideAttachment[];
}): Promise<ConsultSlideExtract> {
  const res = await fetch('/api/sheets/proxy', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      kind: 'post',
      payload: {
        action: 'consult_slide_extract',
        patient: opts.patient,
        consult: opts.consult,
        attachments: opts.attachments,
      },
    }),
  });

  const text = await res.text();
  let data: {
    status?: string;
    message?: string;
    extract?: ConsultSlideExtract;
  };
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(
      'Apps Script trả về không phải JSON khi đọc ảnh AI. Hãy deploy lại Apps Script (action consult_slide_extract).'
    );
  }
  if (!res.ok || data.status === 'error') {
    throw new Error(
      data.message ||
        'Gọi Gemini qua Apps Script thất bại. Kiểm tra GEMINI_API_KEY trong Script properties và deploy Apps Script mới.'
    );
  }
  if (!data.extract) {
    throw new Error('Apps Script không trả dữ liệu extract.');
  }
  return data.extract;
}

/** Prefer Apps Script (tránh lỗi vùng Cloudflare Worker); fallback Worker khi dev local. */
export async function requestConsultSlideExtract(opts: {
  patient: ConsultSlidePatientContext;
  consult: ConsultSlideConsultContext;
  attachments: ConsultSlideAttachment[];
  preferOcr?: boolean;
}): Promise<ConsultSlideExtract> {
  let rawExtract: ConsultSlideExtract;
  try {
    rawExtract = await requestConsultSlideExtractViaAppsScript(opts);
  } catch (appsErr) {
    const res = await fetch('/api/consult-slide/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        patient: opts.patient,
        consult: opts.consult,
        attachments: opts.attachments,
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
