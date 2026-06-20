import path from 'path';

export const CHD_BRIEF_DIR = path.join(process.cwd(), 'data', 'chd-brief');
export const CHD_BRIEF_INDEX = path.join(CHD_BRIEF_DIR, 'index.json');

export function contentJsonPath(dateIso: string): string {
  return path.join(CHD_BRIEF_DIR, `chd_content_${dateIso}.json`);
}

export function docxPath(dateIso: string): string {
  return path.join(CHD_BRIEF_DIR, `CHD_Brief_${dateIso}.docx`);
}
