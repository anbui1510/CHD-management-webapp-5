import { GoogleGenAI } from '@google/genai';

import {
  formatGeminiUserError,
  isGeminiQuotaError,
  parseRetryDelayMs,
  resolveGeminiModels,
  sleep,
} from '../chdDailyBrief/geminiModels';
import { buildConsultSlideExtractPrompt } from './buildPrompt';
import type {
  ConsultSlideAttachment,
  ConsultSlideConsultContext,
  ConsultSlideExtract,
  ConsultSlidePatientContext,
} from './types';

function extractJson(text: string): string {
  const trimmed = text.trim();
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) return fence[1].trim();
  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start >= 0 && end > start) return trimmed.slice(start, end + 1);
  return trimmed;
}

function asStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(v => String(v || '').trim()).filter(Boolean);
  if (typeof value === 'string' && value.trim()) {
    return value
      .split(/\n|•|;/)
      .map(s => s.trim())
      .filter(Boolean);
  }
  return [];
}

function validateExtract(data: unknown): ConsultSlideExtract {
  if (!data || typeof data !== 'object') throw new Error('Invalid JSON from Gemini');
  const obj = data as Record<string, unknown>;
  return {
    PatientName: String(obj.PatientName || '').trim(),
    OtherPatientName: String(obj.OtherPatientName || '').trim(),
    PatientID1: String(obj.PatientID1 || '').trim(),
    PatientID2: String(obj.PatientID2 || '').trim(),
    PatientSex: String(obj.PatientSex || '').trim(),
    PatientDOB: String(obj.PatientDOB || '').trim(),
    PatientAddress: String(obj.PatientAddress || '').trim(),
    PatientPhone: String(obj.PatientPhone || '').trim(),
    PatientWeight: String(obj.PatientWeight || '').trim(),
    PatientHeight: String(obj.PatientHeight || '').trim(),
    ageLabel: String(obj.ageLabel || '').trim(),
    clinicalSummary: String(obj.clinicalSummary || '').trim(),
    DetailDiagnosis: String(obj.DetailDiagnosis || '').trim(),
    historySummary: String(obj.historySummary || '').trim(),
    tteDate: String(obj.tteDate || '').trim(),
    tteFindings: asStringArray(obj.tteFindings),
    tteConclusion: String(obj.tteConclusion || '').trim(),
    ecgNote: String(obj.ecgNote || '').trim(),
    cxrNote: String(obj.cxrNote || '').trim(),
    surgNote: String(obj.surgNote || '').trim(),
    cathNote: String(obj.cathNote || '').trim(),
  };
}

function buildPrompt(
  patient: ConsultSlidePatientContext,
  consult: ConsultSlideConsultContext
): string {
  return buildConsultSlideExtractPrompt(patient, consult);
}

async function generateWithModel(
  ai: GoogleGenAI,
  model: string,
  prompt: string,
  attachments: ConsultSlideAttachment[]
): Promise<ConsultSlideExtract> {
  const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [
    { text: prompt },
  ];

  for (const att of attachments) {
    if (!att.base64 || !att.mimeType) continue;
    parts.push({
      inlineData: {
        mimeType: att.mimeType,
        data: att.base64,
      },
    });
    parts.push({ text: `[File loại: ${att.kind}${att.fileName ? `, tên: ${att.fileName}` : ''}]` });
  }

  const response = await ai.models.generateContent({
    model,
    contents: [{ role: 'user', parts }],
    config: { responseMimeType: 'application/json' },
  });

  const text = response.text ?? '';
  const parsed = JSON.parse(extractJson(text));
  return validateExtract(parsed);
}

export async function extractConsultSlideContent(
  patient: ConsultSlidePatientContext,
  consult: ConsultSlideConsultContext,
  attachments: ConsultSlideAttachment[],
  options?: { apiKey?: string; model?: string }
): Promise<ConsultSlideExtract> {
  const apiKey = options?.apiKey || process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY chưa được cấu hình');
  if (!attachments.length) throw new Error('Cần ít nhất một ảnh hoặc PDF để tạo slide');

  const models = resolveGeminiModels(options?.model || process.env.GEMINI_MODEL);
  const ai = new GoogleGenAI({ apiKey });
  const prompt = buildPrompt(patient, consult);
  const errors: string[] = [];

  for (const model of models) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        return await generateWithModel(ai, model, prompt, attachments);
      } catch (err) {
        const friendly = formatGeminiUserError(err, model);
        errors.push(friendly);
        if (isGeminiQuotaError(err)) {
          const delay = parseRetryDelayMs(err);
          if (delay > 0 && delay <= 15000 && attempt === 0) {
            await sleep(delay);
            continue;
          }
          break;
        }
      }
    }
  }

  throw new Error(errors[errors.length - 1] ?? 'Gemini generation failed');
}
