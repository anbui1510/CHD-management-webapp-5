import JSZip from 'jszip';

import type { ConsultSlideAttachment, ConsultSlideExtract } from './types';

const A_T_RE = /<a:t(?:\s[^>]*)?>([^<]*)<\/a:t>/g;

function escapeXml(value: string): string {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function replacePlaceholdersInXml(xml: string, replacements: Record<string, string>): string {
  const matches = [...xml.matchAll(A_T_RE)];
  if (!matches.length) return xml;

  type Run = { full: string; text: string; index: number };
  const runs: Run[] = matches.map(m => ({
    full: m[0],
    text: m[1],
    index: m.index ?? 0,
  }));

  const lengths = runs.map(r => r.text.length);
  let joined = runs.map(r => r.text).join('');

  const sortedKeys = Object.keys(replacements).sort((a, b) => b.length - a.length);
  type Hit = { start: number; end: number; value: string };
  const hits: Hit[] = [];

  for (const key of sortedKeys) {
    const value = escapeXml(replacements[key] ?? '');
    let from = 0;
    while (from <= joined.length) {
      const at = joined.indexOf(key, from);
      if (at < 0) break;
      const overlaps = hits.some(h => !(at + key.length <= h.start || at >= h.end));
      if (!overlaps) hits.push({ start: at, end: at + key.length, value });
      from = at + key.length;
    }
  }

  if (!hits.length) return xml;

  hits.sort((a, b) => a.start - b.start);

  const charToRun: number[] = [];
  for (let i = 0; i < runs.length; i++) {
    for (let c = 0; c < lengths[i]; c++) charToRun.push(i);
  }

  const consumed = new Array(joined.length).fill(false);
  const injectAtRun = new Map<number, string>();
  for (const hit of hits) {
    for (let i = hit.start; i < hit.end; i++) consumed[i] = true;
    const firstRun = charToRun[hit.start] ?? 0;
    injectAtRun.set(firstRun, (injectAtRun.get(firstRun) || '') + hit.value);
  }

  const newTexts = runs.map((_, i) => {
    let next = injectAtRun.get(i) || '';
    const offset = lengths.slice(0, i).reduce((a, b) => a + b, 0);
    for (let c = 0; c < lengths[i]; c++) {
      if (!consumed[offset + c]) next += runs[i].text[c];
    }
    return next;
  });

  // Apply back to XML from end to start
  let result = xml;
  for (let i = runs.length - 1; i >= 0; i--) {
    const run = runs[i];
    const openEnd = run.full.indexOf('>') + 1;
    const replaced = run.full.slice(0, openEnd) + newTexts[i] + '</a:t>';
    result = result.slice(0, run.index) + replaced + result.slice(run.index + run.full.length);
  }
  return result;
}

function replaceAllTextInSlide(xml: string, lines: string[]): string {
  const matches = [...xml.matchAll(A_T_RE)];
  if (!matches.length) return xml;

  const titleKeep = matches[0];
  const bodyText = lines.filter(Boolean).join('\n');
  const escaped = escapeXml(bodyText);

  // Keep first text run (often title), put body into second run if exists else append to first
  let result = xml;
  if (matches.length === 1) {
    const m = matches[0];
    const openEnd = m[0].indexOf('>') + 1;
    const replaced = m[0].slice(0, openEnd) + `${escapeXml(m[1])}\n${escaped}` + '</a:t>';
    return result.slice(0, m.index!) + replaced + result.slice(m.index! + m[0].length);
  }

  // Clear all after first, put content in second
  for (let i = matches.length - 1; i >= 1; i--) {
    const m = matches[i];
    const openEnd = m[0].indexOf('>') + 1;
    const content = i === 1 ? escaped : '';
    const replaced = m[0].slice(0, openEnd) + content + '</a:t>';
    result = result.slice(0, m.index!) + replaced + result.slice(m.index! + m[0].length);
  }
  // Ensure titleKeep unused warning silence
  void titleKeep;
  return result;
}

function setSlideBodyLines(xml: string, titlePrefix: string | null, lines: string[]): string {
  const matches = [...xml.matchAll(A_T_RE)];
  if (!matches.length) {
    return xml;
  }

  // If titlePrefix provided, update first run that starts with it / contains it
  let result = xml;
  if (titlePrefix) {
    const m = matches[0];
    const openEnd = m[0].indexOf('>') + 1;
    const replaced = m[0].slice(0, openEnd) + escapeXml(titlePrefix) + '</a:t>';
    result = result.slice(0, m.index!) + replaced + result.slice(m.index! + m[0].length);
  }

  return replaceAllTextInSlide(result, lines);
}

function extForMime(mime: string): { ext: string; contentType: string } {
  const m = mime.toLowerCase();
  if (m.includes('png')) return { ext: 'png', contentType: 'image/png' };
  if (m.includes('webp')) return { ext: 'png', contentType: 'image/png' };
  if (m.includes('pdf')) return { ext: 'png', contentType: 'image/png' };
  return { ext: 'jpeg', contentType: 'image/jpeg' };
}

async function addImageToSlide(
  zip: JSZip,
  slideIndex: number,
  imageBase64: string,
  mimeType: string
): Promise<void> {
  const slidePath = `ppt/slides/slide${slideIndex}.xml`;
  const relPath = `ppt/slides/_rels/slide${slideIndex}.xml.rels`;
  const slideXml = await zip.file(slidePath)?.async('string');
  const relXml = await zip.file(relPath)?.async('string');
  if (!slideXml || !relXml) return;

  const { ext, contentType } = extForMime(mimeType);
  const mediaName = `consult_slide_${slideIndex}_${Date.now()}.${ext}`;
  const mediaPath = `ppt/media/${mediaName}`;
  const binary = Uint8Array.from(atob(imageBase64), c => c.charCodeAt(0));
  zip.file(mediaPath, binary);

  // Pick new rId
  const existingIds = [...relXml.matchAll(/Id="(rId\d+)"/g)].map(m => Number(m[1].replace('rId', '')));
  const nextId = (existingIds.length ? Math.max(...existingIds) : 2) + 1;
  const rId = `rId${nextId}`;

  const relInsert = `<Relationship Id="${rId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/${mediaName}"/>`;
  const newRelXml = relXml.replace('</Relationships>', `${relInsert}</Relationships>`);
  zip.file(relPath, newRelXml);

  // Content types
  const ctPath = '[Content_Types].xml';
  let ctXml = await zip.file(ctPath)?.async('string');
  if (ctXml && !ctXml.includes(`Extension="${ext}"`)) {
    ctXml = ctXml.replace(
      '</Types>',
      `<Default Extension="${ext}" ContentType="${contentType}"/></Types>`
    );
    zip.file(ctPath, ctXml);
  }

  const picId = 200 + slideIndex;
  const picXml = `
      <p:pic>
        <p:nvPicPr>
          <p:cNvPr id="${picId}" name="ConsultImage${slideIndex}"/>
          <p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr>
          <p:nvPr/>
        </p:nvPicPr>
        <p:blipFill>
          <a:blip r:embed="${rId}"/>
          <a:stretch><a:fillRect/></a:stretch>
        </p:blipFill>
        <p:spPr>
          <a:xfrm>
            <a:off x="457200" y="1200000"/>
            <a:ext cx="8229600" cy="4800600"/>
          </a:xfrm>
          <a:prstGeom prst="rect"><a:avLst/></a:prstGeom>
        </p:spPr>
      </p:pic>`;

  const newSlideXml = slideXml.replace('</p:spTree>', `${picXml}</p:spTree>`);
  zip.file(slidePath, newSlideXml);
}

/** Normalize date to dd/mm/yyyy for slide titles; empty if missing/invalid. */
export function formatSlideDateDdMmYyyy(value?: string): string {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const vn = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (vn) {
    return `${vn[1].padStart(2, '0')}/${vn[2].padStart(2, '0')}/${vn[3]}`;
  }
  const iso = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) {
    return `${iso[3].padStart(2, '0')}/${iso[2].padStart(2, '0')}/${iso[1]}`;
  }
  return raw;
}

function buildPlaceholderMap(
  extract: ConsultSlideExtract,
  requestBy?: string
): Record<string, string> {
  const idLine = [extract.PatientID1, extract.PatientID2].filter(Boolean).join(' – ');
  const dobAge = extract.PatientDOB
    ? `${extract.PatientDOB}${extract.ageLabel ? ` (${extract.ageLabel})` : ''}`
    : extract.ageLabel || '';
  const cathDate = formatSlideDateDdMmYyyy(extract.CathDate);

  return {
    '[PATIENTNAME]': extract.PatientName || '',
    '[PAITENTID1]': extract.PatientID1 || '',
    '[PatientID1]': extract.PatientID1 || '',
    '[PatientID2]': extract.PatientID2 || '',
    '[PatientID1] – [PatientID2]': idLine || '–',
    '[REQUESTEDBY]': requestBy || '',
    '[PatientSex]': extract.PatientSex || '',
    // Full DOB+age token including template instruction suffix — do not leave "x tuổi y tháng = Today – DOB"
    '[DOB – dd/mm/yyyy] (x tuổi y tháng = Today – DOB)': dobAge,
    '[DOB – dd/mm/yyyy]': extract.PatientDOB || '',
    '[PatientAddress]': extract.PatientAddress || '',
    '[PatientWeight]': extract.PatientWeight || '',
    '[PatientHeight]': extract.PatientHeight || '',
    '[DetailDiagnosis]': extract.DetailDiagnosis || '',
    '[OtherPaitentName]': extract.OtherPatientName || '',
    // Empty clinical summary must be blank, never literal "(trống)"
    '(trống)': extract.clinicalSummary || '',
    // CathLab Note titles: replace full title tokens (placeholder is mid-run; avoid mid-run inject)
    'CathLab Note 1 (CathDate – dd/mm/yyyy)': cathDate
      ? `CathLab Note 1 (${cathDate})`
      : 'CathLab Note 1',
    'CathLab Note 2 (CathDate – dd/mm/yyyy)': cathDate
      ? `CathLab Note 2 (${cathDate})`
      : 'CathLab Note 2',
    '(CathDate – dd/mm/yyyy)': cathDate ? `(${cathDate})` : '',
    // title pattern pieces
    '[PATIENTNAME] – [PAITENTID1] – [REQUESTEDBY]': [
      extract.PatientName,
      extract.PatientID1,
      requestBy,
    ]
      .filter(Boolean)
      .join(' – '),
  };
}

export async function fillStaffPptxTemplate(opts: {
  templateBytes: ArrayBuffer | Uint8Array;
  extract: ConsultSlideExtract;
  requestBy?: string;
  attachments?: ConsultSlideAttachment[];
}): Promise<Uint8Array> {
  const zip = await JSZip.loadAsync(opts.templateBytes);
  const map = buildPlaceholderMap(opts.extract, opts.requestBy);

  for (let i = 1; i <= 9; i++) {
    const path = `ppt/slides/slide${i}.xml`;
    const file = zip.file(path);
    if (!file) continue;
    let xml = await file.async('string');
    xml = replacePlaceholdersInXml(xml, map);

    if (i === 3) {
      xml = setSlideBodyLines(xml, 'Tóm tắt bệnh sử', [
        opts.extract.historySummary || opts.extract.clinicalSummary || '',
      ]);
    }

    if (i === 5) {
      const tteTitle = opts.extract.tteDate
        ? `TTE ${opts.extract.tteDate}`
        : 'TTE';
      const lines = [
        ...opts.extract.tteFindings,
        opts.extract.tteConclusion ? `KẾT LUẬN: ${opts.extract.tteConclusion}` : '',
      ].filter(Boolean);
      xml = setSlideBodyLines(xml, tteTitle, lines.length ? lines : ['(Chưa có dữ liệu TTE)']);
    }

    if (i === 4 && opts.extract.cxrNote) {
      xml = setSlideBodyLines(xml, 'CXR', [opts.extract.cxrNote]);
    }

    if (i === 6 && opts.extract.ecgNote) {
      xml = setSlideBodyLines(xml, 'ECG', [opts.extract.ecgNote]);
    }

    if (i === 7 && opts.extract.surgNote) {
      xml = setSlideBodyLines(xml, 'Surg Note', [opts.extract.surgNote]);
    }

    // Slides 8–9 only have a title text run: "CathLab Note N (CathDate – dd/mm/yyyy)".
    // Date is filled via placeholders above — never inject cathNote into the title.

    zip.file(path, xml);
  }

  const attachments = opts.attachments || [];
  const cxr = attachments.find(a => a.kind === 'cxr' && a.mimeType.startsWith('image/'));
  const ecg = attachments.find(a => a.kind === 'ecg' && a.mimeType.startsWith('image/'));
  if (cxr) await addImageToSlide(zip, 4, cxr.base64, cxr.mimeType);
  if (ecg) await addImageToSlide(zip, 6, ecg.base64, ecg.mimeType);

  const out = await zip.generateAsync({ type: 'uint8array' });
  return out;
}

export async function loadTemplateFromUrl(url = '/consult-slide/Template_staff.pptx'): Promise<ArrayBuffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error('Không tải được template PPTX');
  return res.arrayBuffer();
}

export function uint8ToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export function downloadPptxBase64(fileName: string, base64: string) {
  const bin = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
  const blob = new Blob([bin], {
    type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName.endsWith('.pptx') ? fileName : `${fileName}.pptx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
