import { Packer } from 'docx';
import type { ChdBriefContent } from './types';
import { createBriefDocument } from './buildDocxCore';

export async function buildDocxBlob(content: ChdBriefContent): Promise<Blob> {
  const doc = createBriefDocument(content);
  return Packer.toBlob(doc);
}

export async function downloadBriefDocx(content: ChdBriefContent): Promise<void> {
  const blob = await buildDocxBlob(content);
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `CHD_Brief_${content.DATE_ISO}.docx`;
  anchor.click();
  URL.revokeObjectURL(url);
}
