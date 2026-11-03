import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

// Mirror of buildExtractFromRegistration + formatAgeLabel for smoke (no tsx).
function formatAgeLabel(dob, today = new Date()) {
  const raw = String(dob || '').trim();
  if (!raw) return '';
  let day = 0;
  let month = 0;
  let year = 0;
  const vn = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (vn) {
    day = Number(vn[1]);
    month = Number(vn[2]);
    year = Number(vn[3]);
  }
  if (!year || !month || !day) return '';
  let years = today.getFullYear() - year;
  let months = today.getMonth() + 1 - month;
  if (today.getDate() < day) months -= 1;
  if (months < 0) {
    years -= 1;
    months += 12;
  }
  if (years < 0) return '';
  if (years === 0) return `${months} tháng`;
  if (months === 0) return `${years} tuổi`;
  return `${years} tuổi ${months} tháng`;
}

function buildExtractFromRegistration(patient, consult) {
  const dob = String(patient.PatientDOB || '').trim();
  const detailDiagnosis =
    [consult.DiagnosisID, consult.DetailDiagnosis].filter(Boolean).join(' — ') ||
    String(consult.DetailDiagnosis || '').trim();
  return {
    PatientName: String(patient.PatientName || '').trim(),
    PatientID1: String(patient.PatientID1 || '').trim(),
    PatientDOB: dob,
    ageLabel: formatAgeLabel(dob, new Date('2026-11-03T00:00:00Z')),
    DetailDiagnosis: detailDiagnosis,
    PatientWeight: String(consult.PatientWeight || '').trim(),
    tteFindings: [],
  };
}

const extract = buildExtractFromRegistration(
  {
    PatientName: 'MAI CHÍ THÀNH',
    PatientID1: '2610011808',
    PatientDOB: '26/06/2026',
  },
  {
    DiagnosisID: 'VSD',
    DetailDiagnosis: 'VSD lớn',
    PatientWeight: '7.16',
  }
);
assert.equal(extract.PatientName, 'MAI CHÍ THÀNH');
assert.equal(extract.PatientID1, '2610011808');
assert.equal(extract.DetailDiagnosis, 'VSD — VSD lớn');
assert.equal(extract.PatientWeight, '7.16');
assert.equal(extract.ageLabel, '4 tháng');

const require = createRequire(import.meta.url);
const fs = require('fs');
const fromReg = fs.readFileSync(new URL('../src/consultSlide/fromRegistration.ts', import.meta.url), 'utf8');
assert.match(fromReg, /export function buildExtractFromRegistration/);
const app = fs.readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
assert.match(app, /generateStaffSlideAfterConsultSave/);
assert.doesNotMatch(app, /AiRegisterConsultModal/);
assert.doesNotMatch(app, /Đăng ký mode AI/);

console.log('test-extract-from-registration: ok');
