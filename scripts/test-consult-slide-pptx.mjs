/**
 * Smoke test: fill Template_staff.pptx placeholders without Gemini.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import JSZip from 'jszip';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

// Dynamic import of compiled TS via tsx isn't needed — duplicate minimal replace for smoke,
// or run through tsx importing the module.
const { fillStaffPptxTemplate } = await import('../src/consultSlide/fillPptx.ts');
const { resolveStaffSlideDriveTarget, buildStaffSlideFileName } = await import(
  '../src/consultSlide/driveFolders.ts'
);
const { mergeSlideExtract, formatAgeLabel } = await import('../src/consultSlide/mergeExtract.ts');

const templatePath = path.join(root, 'public/consult-slide/Template_staff.pptx');
const templateBytes = fs.readFileSync(templatePath);

const extract = mergeSlideExtract({
  patient: {
    PatientName: 'MAI CHI THANH',
    PatientID1: '2610011808',
    PatientSex: 'Nam',
    PatientDOB: '26/06/2026',
    PatientAddress: 'TP Can Tho',
  },
  consult: {
    ConsultType: 'Staff thông',
    ConsultDate: '26/10/2026',
    DetailDiagnosis: 'Hep van dong mach phoi',
    PatientWeight: '7.6',
    PatientHeight: '67.5',
    ConsultResultID: 'Can thiệp thông tim',
    DetailConsultResult: 'Nong van DMP',
  },
  extract: {
    tteFindings: ['Situs solitus', 'Hep van DMP Gd 60mmHg'],
    tteConclusion: 'Hep van DMP trung binh nang',
    tteDate: '26/10/2026',
    historySummary: 'BN 4 thang, phat hien hep van DMP',
    ecgNote: 'Sinus',
    cxrNote: '',
    clinicalSummary: '',
    CathDate: '2026-10-26',
    cathNote: 'KHONG-HIEN-TREN-TIEU-DE',
  },
});

const out = await fillStaffPptxTemplate({
  templateBytes,
  extract,
  requestBy: 'BS. Test',
});

const outPath = path.join(root, '/tmp/consult-slide-smoke.pptx');
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, out);

const zip = await JSZip.loadAsync(out);
const slide1 = await zip.file('ppt/slides/slide1.xml').async('string');
const slide2 = await zip.file('ppt/slides/slide2.xml').async('string');
const slide5 = await zip.file('ppt/slides/slide5.xml').async('string');
const slide8 = await zip.file('ppt/slides/slide8.xml').async('string');
const slide9 = await zip.file('ppt/slides/slide9.xml').async('string');

const checks = [
  ['slide1 has name', slide1.includes('MAI CHI THANH')],
  ['slide1 no placeholder PATIENTNAME', !slide1.includes('[PATIENTNAME]')],
  ['slide2 has weight', slide2.includes('7.6')],
  ['slide2 no DOB instruction leftover', !slide2.includes('Today – DOB') && !slide2.includes('x tuổi y tháng')],
  ['slide2 no (trống)', !slide2.includes('(trống)')],
  ['slide5 has conclusion', slide5.includes('Hep van DMP') || slide5.includes('KẾT LUẬN')],
  ['slide8 CathDate only', slide8.includes('(26/10/2026)') && !slide8.includes('KHONG-HIEN-TREN-TIEU-DE') && !slide8.includes('CathDate')],
  ['slide9 CathDate only', slide9.includes('(26/10/2026)') && !slide9.includes('KHONG-HIEN-TREN-TIEU-DE') && !slide9.includes('CathDate')],
];

const targetThong = resolveStaffSlideDriveTarget('Staff thông', '26/10/2026');
const targetMo = resolveStaffSlideDriveTarget('Staff mổ', '05/01/2026');
checks.push([
  'thong year folder',
  targetThong.yearFolderName === 'Slide staff thông - 2026',
]);
checks.push([
  'thong month folder',
  targetThong.monthFolderName === 'Staff thông - Tháng 10 - 2026',
]);
checks.push(['mo year folder', targetMo.yearFolderName === 'Slide mổ tim 2026']);
checks.push(['mo month folder', targetMo.monthFolderName === 'Staff mổ - Tháng 1 - 2026']);
checks.push(['age label', Boolean(formatAgeLabel('26/06/2026'))]);
checks.push([
  'file name',
  buildStaffSlideFileName({
    patientName: 'MAI CHI THANH',
    patientId: '2610011808',
    consultDate: '26/10/2026',
  }).endsWith('.pptx'),
]);

let failed = 0;
for (const [label, ok] of checks) {
  console.log(ok ? 'OK ' : 'FAIL ', label);
  if (!ok) failed += 1;
}
console.log('Wrote', outPath, 'bytes', out.length);
if (failed) process.exit(1);
console.log('All consult-slide smoke checks passed');
