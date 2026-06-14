import fs from 'fs';
import path from 'path';

const root = process.cwd();
const dataDir = path.join(root, 'data');

const ALIASES = {
  CoAo: 'CoA',
  'Pulmonary Stenosis': 'PS',
  Arrhythmia: 'SVT',
  'Bệnh lý mạch mẫu': 'Bệnh lý mạch máu',
};

const FIELDS = ['DiagnosisID', 'PostDiagnosisID', 'CMRDiagnosisID', 'CMRDigagnosisID'];

const normalizeValue = (value) => ALIASES[value] || value;

const walk = (value) => {
  if (Array.isArray(value)) return value.map(walk);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, nested]) => {
        if (FIELDS.includes(key) && typeof nested === 'string' && nested.trim()) {
          return [key, normalizeValue(nested.trim())];
        }
        return [key, walk(nested)];
      })
    );
  }
  return value;
};

const files = ['consults.json', 'cathlabs.json', 'cmrs.json', 'sources.json'];
let totalChanges = 0;

for (const file of files) {
  const fullPath = path.join(dataDir, file);
  if (!fs.existsSync(fullPath)) continue;

  const raw = fs.readFileSync(fullPath, 'utf8');
  const data = JSON.parse(raw);
  const normalized = walk(data);
  const nextRaw = `${JSON.stringify(normalized, null, 2)}\n`;

  if (nextRaw !== raw) {
    fs.writeFileSync(fullPath, nextRaw, 'utf8');
    const changes = (raw.match(/CoAo|Pulmonary Stenosis|Arrhythmia|Bệnh lý mạch mẫu/g) || []).length;
    totalChanges += changes;
    console.log(`Updated ${file} (${changes} legacy value(s) replaced)`);
  } else {
    console.log(`No changes in ${file}`);
  }
}

console.log(`Done. ${totalChanges} legacy diagnosis value(s) normalized.`);
