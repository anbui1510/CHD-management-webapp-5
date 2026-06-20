import fs from 'fs';
import type { BriefIndex, ChdBriefContent, PipelineResult, PipelineStatus } from './types';
import { getTopicForDate, formatDateISO } from './topics';
import { searchPubMedForTopic } from './pubmed';
import { filterAndRankArticles } from './filterArticles';
import { generateBriefContent } from './generateContent';
import { buildDocx } from './buildDocx';
import { CHD_BRIEF_DIR, CHD_BRIEF_INDEX, contentJsonPath, docxPath } from './paths';

let currentStatus: PipelineStatus = {
  stage: 'idle',
  message: 'Sẵn sàng',
  date: formatDateISO(),
  running: false,
};

export function getPipelineStatus(): PipelineStatus {
  return { ...currentStatus };
}

function ensureDir(): void {
  if (!fs.existsSync(CHD_BRIEF_DIR)) fs.mkdirSync(CHD_BRIEF_DIR, { recursive: true });
}

function readIndex(): BriefIndex {
  ensureDir();
  if (!fs.existsSync(CHD_BRIEF_INDEX)) return { entries: [] };
  try {
    return JSON.parse(fs.readFileSync(CHD_BRIEF_INDEX, 'utf8'));
  } catch {
    return { entries: [] };
  }
}

function writeIndex(index: BriefIndex): void {
  ensureDir();
  fs.writeFileSync(CHD_BRIEF_INDEX, JSON.stringify(index, null, 2), 'utf8');
}

function updateIndexEntry(dateIso: string, topic: string, status: 'success' | 'error', error?: string): void {
  const index = readIndex();
  index.entries = index.entries.filter(e => e.date !== dateIso);
  index.entries.unshift({
    date: dateIso,
    topic,
    createdAt: new Date().toISOString(),
    status,
    error,
  });
  writeIndex(index);
}

export function loadBriefContent(dateIso: string): ChdBriefContent | null {
  const jsonPath = contentJsonPath(dateIso);
  if (!fs.existsSync(jsonPath)) return null;
  try {
    return JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  } catch {
    return null;
  }
}

export function getBriefHistory(): BriefIndex {
  return readIndex();
}

function setStatus(stage: PipelineStatus['stage'], message: string, dateIso: string, error?: string): void {
  currentStatus = { stage, message, date: dateIso, running: stage !== 'idle' && stage !== 'done' && stage !== 'error', error };
}

export async function runPipeline(options: { force?: boolean; date?: Date } = {}): Promise<PipelineResult> {
  const date = options.date ?? new Date();
  const dateIso = formatDateISO(date);
  const topic = getTopicForDate(date);
  const jsonPath = contentJsonPath(dateIso);
  const docxOut = docxPath(dateIso);

  if (!options.force && fs.existsSync(jsonPath) && fs.existsSync(docxOut)) {
    const content = loadBriefContent(dateIso);
    setStatus('done', 'Đã có bản tin hôm nay', dateIso);
    return { success: true, content: content ?? undefined, jsonPath, docxPath: docxOut, skipped: true };
  }

  try {
    setStatus('pubmed', 'Đang tra cứu PubMed...', dateIso);
    const rawArticles = await searchPubMedForTopic(topic);
    if (rawArticles.length === 0) throw new Error('Không tìm thấy bài trên PubMed');

    setStatus('filter', 'Đang lọc và chọn 5 bài chất lượng cao...', dateIso);
    const selected = filterAndRankArticles(rawArticles, 5);
    if (selected.length === 0) throw new Error('Không đủ bài sau khi lọc');

    setStatus('generate', 'AI đang viết nội dung tiếng Việt...', dateIso);
    const content = await generateBriefContent(topic, selected, date);

    ensureDir();
    fs.writeFileSync(jsonPath, JSON.stringify(content, null, 2), 'utf8');

    setStatus('docx', 'Đang xuất file Word...', dateIso);
    const docxOutPath = await buildDocx(content);

    updateIndexEntry(dateIso, topic.topic, 'success');
    setStatus('done', 'Hoàn thành', dateIso);

    return { success: true, content, jsonPath, docxPath: docxOutPath };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    updateIndexEntry(dateIso, topic.topic, 'error', message);
    setStatus('error', message, dateIso, message);
    return { success: false, error: message };
  }
}

export function markAutoRunToday(): void {
  const index = readIndex();
  index.lastAutoRunDate = formatDateISO();
  writeIndex(index);
}

export function wasAutoRunToday(): boolean {
  const index = readIndex();
  return index.lastAutoRunDate === formatDateISO();
}
