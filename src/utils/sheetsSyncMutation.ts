import type { SheetsSyncContext } from '../types';
import { getModuleLabel, type AppModule } from '../auth/permissions';
import { evaluateSheetsSync, extractSheetsSync, SHEETS_SUCCESS_MESSAGE } from './sheetsSyncFeedback';

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
  kind: 'success' | 'failure' | 'local_only' | 'none';
  bannerMessage: string;
  overlayMessage: string;
  isFailure: boolean;
};

export function buildMutationFeedback(
  data: unknown,
  baseMessage?: string
): SheetsMutationFeedback {
  const evaluation = evaluateSheetsSync(data);
  const sync = extractSheetsSync(data);

  if (evaluation.kind === 'success') {
    return {
      kind: 'success',
      bannerMessage: SHEETS_SUCCESS_MESSAGE,
      overlayMessage: '',
      isFailure: false
    };
  }

  if (evaluation.kind === 'failure') {
    const detail = sync?.message || evaluation.message;
    return {
      kind: 'failure',
      bannerMessage: baseMessage ? `${baseMessage} — ${detail}` : detail,
      overlayMessage: detail,
      isFailure: true
    };
  }

  if (evaluation.kind === 'local_only') {
    return {
      kind: 'local_only',
      bannerMessage: baseMessage ? `${baseMessage}. ${evaluation.message}` : evaluation.message,
      overlayMessage: '',
      isFailure: false
    };
  }

  return {
    kind: 'none',
    bannerMessage: baseMessage || 'Đã lưu trên máy chủ app',
    overlayMessage: '',
    isFailure: false
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
