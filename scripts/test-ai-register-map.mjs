import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

// Lightweight inline mirror of map helpers for smoke (tsx not required).
function removeDiacritics(str) {
  return String(str || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function matchProvinceAddress(ocrAddress, provinceOptions) {
  const raw = String(ocrAddress || '').trim();
  if (!raw) return { value: '', unmatched: false };
  const exact = provinceOptions.find(p => p === raw);
  if (exact) return { value: exact, unmatched: false };
  const norm = removeDiacritics(raw).toLowerCase();
  const caseInsensitive = provinceOptions.find(p => removeDiacritics(p).toLowerCase() === norm);
  if (caseInsensitive) return { value: caseInsensitive, unmatched: false };
  const contains = provinceOptions.find(p => {
    const pn = removeDiacritics(p).toLowerCase();
    return pn.includes(norm) || norm.includes(pn);
  });
  if (contains) return { value: contains, unmatched: false };
  return { value: '', unmatched: true };
}

function findPatientById1(patients, patientId1) {
  const id = String(patientId1 || '').trim().toLowerCase();
  if (!id) return null;
  return (
    patients.find(p => String(p.PatientID1 || '').trim().toLowerCase() === id) ||
    patients.find(p =>
      String(p.PatientID2 || '')
        .split(/[-,/|]/)
        .map(s => s.trim().toLowerCase())
        .filter(Boolean)
        .includes(id)
    ) ||
    null
  );
}

assert.equal(matchProvinceAddress('TP Hồ Chí Minh', ['TP Hồ Chí Minh', 'TP Hà Nội']).value, 'TP Hồ Chí Minh');
assert.equal(matchProvinceAddress('ho chi minh', ['TP Hồ Chí Minh']).value, 'TP Hồ Chí Minh');
assert.equal(matchProvinceAddress('Không tồn tại XYZ', ['TP Hà Nội']).unmatched, true);

const matched = findPatientById1(
  [{ PatientKey: 'p1', PatientID1: '25001234', PatientName: 'A' }],
  '25001234'
);
assert.equal(matched?.PatientKey, 'p1');
assert.equal(findPatientById1([{ PatientKey: 'p1', PatientID1: '1' }], '999'), null);

// Ensure Apps Script prompt builder uses multi-line concat (no single mega return string).
const require = createRequire(import.meta.url);
const fs = require('fs');
const code = fs.readFileSync(new URL('../src/data/appsScriptCode.ts', import.meta.url), 'utf8');
assert.match(code, /function buildConsultSlidePrompt/);
assert.match(code, /return \(/);
assert.match(code, /consult_slide_extract/);
const promptFn = code.slice(code.indexOf('function buildConsultSlidePrompt'), code.indexOf('function consultSlideResolveModels'));
assert.ok(!/return "[^"]{500,}/.test(promptFn), 'prompt must not be one huge quoted string');

console.log('test-ai-register-map: ok');
