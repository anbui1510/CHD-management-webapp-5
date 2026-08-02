const fs = require('fs');
const path = require('path');

const srcDir = path.join(__dirname, '../src');
const serverFile = path.join(__dirname, '../server.ts');

function getAllFiles(dir, filesList = []) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const filePath = path.join(dir, file);
    if (fs.statSync(filePath).isDirectory()) {
      getAllFiles(filePath, filesList);
    } else if (filePath.endsWith('.ts') || filePath.endsWith('.tsx')) {
      filesList.push(filePath);
    }
  }
  return filesList;
}

const allFiles = getAllFiles(srcDir);
if (fs.existsSync(serverFile)) {
  allFiles.push(serverFile);
}

const replaceRules = [
  // StaffKey -> id
  { regex: /\b(staff|currentStaff|s|profileStaff|selectedStaff|draft|localStaff)\.StaffKey\b/g, replacement: '$1.id' },
  { regex: /\b(login)StaffKey\b/g, replacement: '$1StaffId' },
  { regex: /\b(setLogin)StaffKey\b/g, replacement: '$1StaffId' },
  
  // PatientKey -> id
  { regex: /\b(patient|p|selectedPatient|draft|pat|activePatient)\.PatientKey\b/g, replacement: '$1.id' },
  
  // ConsultKey -> id
  { regex: /\b(consult|c|selectedConsult|con|draft|consultData)\.ConsultKey\b/g, replacement: '$1.id' },
  
  // CMRKey -> id
  { regex: /\b(cmr|item|selectedItem|draft)\.CMR[Kk]ey\b/g, replacement: '$1.id' },
  
  // CathKey -> id
  { regex: /\b(cathlab|cath|item|selectedItem|draft)\.CathKey\b/g, replacement: '$1.id' },
  
  // SurgKey -> id
  { regex: /\b(operation|surg|op|item|selectedItem|draft)\.SurgKey\b/g, replacement: '$1.id' },

  // MarkKey -> id
  { regex: /\b(mark|m|draft)\.MarkKey\b/g, replacement: '$1.id' },
  
  // NotificationKey -> id
  { regex: /\b(notif|notification|n)\.NotificationKey\b/g, replacement: '$1.id' },
  
  // RolePresetID -> id
  { regex: /\b(preset|rolePreset|r)\.RolePresetID\b/g, replacement: '$1.id' }
];

let filesModified = 0;

for (const file of allFiles) {
  let content = fs.readFileSync(file, 'utf8');
  let originalContent = content;

  // We are NOT doing global replacement for foreign keys.
  for (const rule of replaceRules) {
    content = content.replace(rule.regex, rule.replacement);
  }

  // Handle some destructuring like { StaffKey }
  content = content.replace(/const\s*{\s*StaffKey\s*}\s*=\s*(staff|currentStaff|s|draft);/g, 'const { id } = $1;');
  content = content.replace(/const\s*{\s*PatientKey\s*}\s*=\s*(patient|p|draft);/g, 'const { id } = $1;');

  if (content !== originalContent) {
    fs.writeFileSync(file, content, 'utf8');
    filesModified++;
    console.log(`Updated: ${path.relative(srcDir, file)}`);
  }
}

console.log(`\nRefactoring complete. ${filesModified} files modified.`);
