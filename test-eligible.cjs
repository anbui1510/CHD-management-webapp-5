const fs = require('fs');
const consults = JSON.parse(fs.readFileSync('data/consults.json', 'utf8'));
const patients = JSON.parse(fs.readFileSync('data/patients.json', 'utf8'));

const ELIGIBLE_RESULTS = [
  "Can thiệp thông tim",
  "Chụp chẩn đoán +/- can thiệp",
  "Chụp chẩn đoán-Đo kháng lực",
  "Chụp chẩn đoán/Đo kháng lực",
  "Tiền Glenn",
  "Tiền Fontan",
  "Điện sinh lý"
];

const getYear = (dateStr) => {
  if (!dateStr) return 0;
  const trimmed = dateStr.trim();
  if (/^\d{4}/.test(trimmed)) {
    return parseInt(trimmed.substring(0, 4), 10);
  }
  return 0;
};

const latestConsultsMap = new Map();
const sorted = [...consults].sort((a, b) => {
  const aDate = a.ConsultDate || '';
  const bDate = b.ConsultDate || '';
  if (aDate !== bDate) return bDate.localeCompare(aDate);
  return (b.ConsultCreateTime || '').localeCompare(a.ConsultCreateTime || '');
});

sorted.forEach(c => {
  if (!c.PatientKey) return;
  if (!latestConsultsMap.has(c.PatientKey)) {
    latestConsultsMap.set(c.PatientKey, c.ConsultKey);
  }
});

const res = consults.filter(c => {
  // if (getYear(c.ConsultDate) < 2026) return false;
  if (latestConsultsMap.get(c.PatientKey) !== c.ConsultKey) return false;
  if (c.Removed === true || c.Removed === 'Có' || c.Removed === 'yes') return false;
  if (c.TransferredToCathLab === true || c.TransferredToCathLab === 'Yes' || c.TransferredToCathLab === 'Có') return false;
  if (!ELIGIBLE_RESULTS.includes(c.ConsultResultID || '')) return false;

  if (
    c.CallStatus === "Đã can thiệp/mổ" || 
    c.CallStatus === "Loại" || 
    c.CallStatus === "Đã làm nơi khác" || 
    c.CallStatus === "Muốn theo dõi nơi khác"
  ) return false;

  const pat = patients.find(p => p.PatientKey === c.PatientKey);
  if (!pat) return false;

  if (pat.Outcome === "Tử vong" || pat.Outcome === "Nặng xin về") return false;
  return true;
});

console.log("Eligible items now:", res.length);
