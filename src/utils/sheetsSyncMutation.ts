import type { SheetsSyncContext } from '../types';
import { getModuleLabel, type AppModule } from '../auth/permissions';
import {
  evaluateSheetsSync,
  extractSheetsSync,
  SHEETS_FAILURE_DEFAULT,
  SHEETS_NOT_UPLOADED_TITLE,
  SHEETS_SUCCESS_MESSAGE,
  SHEETS_UNCONFIRMED_MESSAGE
} from './sheetsSyncFeedback';

export function withSyncContext<T extends Record<string, unknown>>(
  body: T,
  context: SheetsSyncContext
): T & { _syncContext: SheetsSyncContext } {
  return { ...body, _syncContext: context };
}

export function buildSyncContext(
  viewModule: AppModule | string,
  options?: {
    patientName?: string;
    patientKey?: string;
    patientID?: string;
    viewLabel?: string;
  }
): SheetsSyncContext {
  const viewLabel = options?.viewLabel || getModuleLabel(viewModule as AppModule);
  return {
    viewModule: String(viewModule),
    viewLabel,
    patientName: options?.patientName,
    patientKey: options?.patientKey,
    patientID: options?.patientID
  };
}

export type SheetsMutationFeedback = {
  kind: 'success' | 'failure' | 'pending' | 'local_only' | 'none';
  bannerMessage: string;
  overlayTitle: string;
  overlayMessage: string;
  isWarning: boolean;
  showOverlay: boolean;
};

export function buildMutationFeedback(
  data: unknown,
  baseMessage?: string
): SheetsMutationFeedback {
  const evaluation = evaluateSheetsSync(data);
  const sync = extractSheetsSync(data);
  const detail = sync?.message || evaluation.message;

  if (evaluation.kind === 'success') {
    return {
      kind: 'success',
      bannerMessage: baseMessage
        ? `${baseMessage} — ${SHEETS_SUCCESS_MESSAGE}`
        : SHEETS_SUCCESS_MESSAGE,
      overlayTitle: '',
      overlayMessage: '',
      isWarning: false,
      showOverlay: false
    };
  }

  if (evaluation.kind === 'failure') {
    return {
      kind: 'failure',
      bannerMessage: baseMessage
        ? `${baseMessage} — ${SHEETS_NOT_UPLOADED_TITLE}`
        : SHEETS_NOT_UPLOADED_TITLE,
      overlayTitle: SHEETS_NOT_UPLOADED_TITLE,
      overlayMessage: detail || SHEETS_FAILURE_DEFAULT,
      isWarning: true,
      showOverlay: true
    };
  }

  if (evaluation.kind === 'pending') {
    return {
      kind: 'pending',
      bannerMessage: baseMessage
        ? `${baseMessage} — đang ghi dữ liệu vào Google Sheets…`
        : 'Đang ghi dữ liệu vào Google Sheets…',
      overlayTitle: '',
      overlayMessage: '',
      isWarning: true,
      showOverlay: false
    };
  }

  if (evaluation.kind === 'local_only') {
    return {
      kind: 'local_only',
      bannerMessage: baseMessage ? `${baseMessage} — ${detail}` : detail,
      overlayTitle: SHEETS_NOT_UPLOADED_TITLE,
      overlayMessage: detail,
      isWarning: true,
      showOverlay: true
    };
  }

  return {
    kind: 'none',
    bannerMessage: baseMessage
      ? `${baseMessage} — ${SHEETS_UNCONFIRMED_MESSAGE}`
      : SHEETS_UNCONFIRMED_MESSAGE,
    overlayTitle: SHEETS_NOT_UPLOADED_TITLE,
    overlayMessage: SHEETS_UNCONFIRMED_MESSAGE,
    isWarning: true,
    showOverlay: false
  };
}

export async function parseMutationResponse<T>(response: Response): Promise<T> {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = (data as { error?: string }).error || `HTTP ${response.status}`;
    throw new Error(message);
  }
  return data as T;
}

export async function persistWithSheetsSync<T>(
  reportMutationResponse: (data: unknown, options?: { baseMessage?: string }) => void,
  url: string,
  init: RequestInit,
  syncContext: SheetsSyncContext,
  options?: { baseMessage?: string }
): Promise<T> {
  let body = init.body;
  if (typeof body === 'string' && body.trim()) {
    try {
      body = JSON.stringify(withSyncContext(JSON.parse(body) as Record<string, unknown>, syncContext));
    } catch {
      // keep original body
    }
  } else if (body && typeof body === 'object' && !(body instanceof FormData)) {
    body = JSON.stringify(withSyncContext(body as Record<string, unknown>, syncContext));
  }

  const response = await fetch(url, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init.headers || {}) },
    body
  });
  const data = await parseMutationResponse<T>(response);
  reportMutationResponse(data, options);
  return data;
}
