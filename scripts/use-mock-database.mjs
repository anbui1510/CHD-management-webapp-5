import fs from 'fs';
import path from 'path';

const root = process.cwd();
const dataDir = path.join(root, 'data');
const mockPrefix = 'MOCK2025';
const files = ['patients.json', 'consults.json', 'cmrs.json', 'cathlabs.json'];

const readJson = (file) => {
  const fullPath = path.join(dataDir, file);
  if (!fs.existsSync(fullPath)) return [];
  return JSON.parse(fs.readFileSync(fullPath, 'utf8') || '[]');
};

const writeJson = (file, data) => {
  fs.writeFileSync(path.join(dataDir, file), `${JSON.stringify(data, null, 2)}\n`, 'utf8');
};

const getKey = (record) => String(
  record.PatientKey ||
  record.ConsultKey ||
  record.CMRKey ||
  record.CMRkey ||
  record.CathKey ||
  ''
);

const timestamp = new Date()
  .toISOString()
  .replace(/[:.]/g, '-')
  .replace('T', '_')
  .replace('Z', '');
const backupDir = path.join(dataDir, `backup-before-mock-only-${timestamp}`);

fs.mkdirSync(backupDir, { recursive: true });

for (const file of files) {
  const fullPath = path.join(dataDir, file);
  if (fs.existsSync(fullPath)) {
    fs.copyFileSync(fullPath, path.join(backupDir, file));
  }
}

for (const file of files) {
  const data = readJson(file);
  const mockData = data.filter((record) => getKey(record).startsWith(mockPrefix));

  if (file === 'patients.json' && mockData.length !== 100) {
    throw new Error(`Expected 100 mock patients, found ${mockData.length}. Run scripts/generate-mock-patients.mjs first.`);
  }

  writeJson(file, mockData);
  console.log(`${file}: kept ${mockData.length} mock records`);
}

console.log(`Backup created: ${backupDir}`);
