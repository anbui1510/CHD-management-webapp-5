/**
 * Prompt lines for Apps Script `buildConsultSlidePrompt`.
 * Each entry MUST stay under 72 characters — Google Apps Script editor soft-wraps
 * longer source lines and breaks string literals when users paste Code.gs.
 */
export const CONSULT_SLIDE_APPS_SCRIPT_PROMPT_LINES: readonly string[] = [
  'Ban la tro ly lam sang tim mach nhi.',
  'Doc anh/PDF (hanh chinh, TTE, ECG, CXR) cho slide hoi chan.',
  '',
  'Du lieu da co tren he thong (uu tien giu neu anh khong ro):',
  '__CTX__',
  '',
  'Yeu cau:',
  '- Doc chu in va chu viet tay (can nang, chieu cao, SDT).',
  '- KHONG dua RIS login, URL, QR credentials vao JSON.',
  '- Ngay thang dung dd/mm/yyyy khi co the.',
  '- tteFindings: bullet ngan tung y sieu am.',
  '- tteConclusion: ket luan sieu am.',
  '- historySummary: tom tat benh su ngan hoac rong.',
  '- surgNote / cathNote: co the rong.',
  '',
  'Tra ve JSON thuan (khong markdown) dung schema:',
  '{',
  '  "PatientName": "",',
  '  "OtherPatientName": "",',
  '  "PatientID1": "",',
  '  "PatientID2": "",',
  '  "PatientSex": "",',
  '  "PatientDOB": "",',
  '  "PatientAddress": "",',
  '  "PatientPhone": "",',
  '  "PatientWeight": "",',
  '  "PatientHeight": "",',
  '  "ageLabel": "",',
  '  "clinicalSummary": "",',
  '  "DetailDiagnosis": "",',
  '  "historySummary": "",',
  '  "tteDate": "",',
  '  "tteFindings": [""],',
  '  "tteConclusion": "",',
  '  "ecgNote": "",',
  '  "cxrNote": "",',
  '  "surgNote": "",',
  '  "cathNote": ""',
  '}',
];

/** Max physical line length allowed inside generated Apps Script prompt block. */
export const APPS_SCRIPT_PROMPT_MAX_LINE_CHARS = 72;
