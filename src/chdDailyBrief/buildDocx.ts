import { Packer } from 'docx';
import fs from 'fs';
import type { ChdBriefContent } from './types';
import { docxPath } from './paths';
import { createBriefDocument } from './buildDocxCore';

export async function buildDocx(content: ChdBriefContent): Promise<string> {
  const outPath = docxPath(content.DATE_ISO);
  const buf = await Packer.toBuffer(createBriefDocument(content));
  fs.writeFileSync(outPath, buf);
  const stat = fs.statSync(outPath);
  if (stat.size <= 0) throw new Error('DOCX file is empty');
  return outPath;
}
