import * as fs from 'fs';

const consults = [
  {
    ConsultKey: "con_001",
    PatientKey: "pat_002",
    ConsultType: "Staff mổ",
    ConsultDate: "2026-06-01",
    ConsultResultID: "",
    ConsultCreateTime: "2026-05-30T10:00:00Z"
  },
  {
    ConsultKey: "con_002",
    PatientKey: "pat_001",
    ConsultType: "Staff thông",
    ConsultDate: "2026-05-15",
    ConsultCreateTime: "2026-05-10T11:00:00Z",
    ConsultResultID: "Can thiệp thông tim",
  }
];

const patients = [
  { PatientKey: "pat_001", Outcome: "Đã mổ" },
  { PatientKey: "pat_002", Outcome: "Chờ chỉ định" }
];

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

const map = new Map();
const sorted = [...consults].sort((a, b) => {
  const aDate = a.ConsultDate || '';
  const bDate = b.ConsultDate || '';
  if (aDate !== bDate) return bDate.localeCompare(aDate);
  return (b.ConsultCreateTime || '').localeCompare(a.ConsultCreateTime || '');
});

sorted.forEach(c => {
  if (!c.PatientKey) return;
  if (!map.has(c.PatientKey)) {
    map.set(c.PatientKey, c.ConsultKey);
  }
});

console.log("Map:", map);

const res = consults.filter(c => {
  if (getYear(c.ConsultDate) < 2026) return false;
  if (map.get(c.PatientKey) !== c.ConsultKey) return false;
  if (c.Removed === true || c.Removed === 'Có' || c.Removed === 'yes') return false;
  if (c.TransferredToCathLab === true || c.TransferredToCathLab === 'Yes' || c.TransferredToCathLab === 'Có') return false;
  if (!ELIGIBLE_RESULTS.includes(c.ConsultResultID || '')) return false;
  const pat = patients.find(p => p.PatientKey === c.PatientKey);
  if (!pat) return false;
  if (pat.Outcome === "Tử vong" || pat.Outcome === "Nặng xin về") return false;
  return true;
});

console.log("Eligible:", res);
