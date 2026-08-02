const fs = require('fs');
const path = require('path');

const logFile = 'C:/Users/hieub/.gemini/antigravity-ide/brain/55806836-ab8e-4609-9cbe-d4d2aa1099d1/.system_generated/tasks/task-247.log';
const rootDir = path.join(__dirname, '..');

const logContent = fs.readFileSync(logFile, 'utf8');
const lines = logContent.split('\n');

const fixes = {}; // file -> { lineNum: newContent }

for (const line of lines) {
  // src/components/CathLabRoomView.tsx(811,29): error TS2339: Property 'ConsultKey' does not exist...
  // server.ts(151,5): error TS2561: Object literal may only specify known properties, but 'PatientKey' does not exist in type 'Patient'.
  // src/components/CathLabRoomView.tsx(1095,38): error TS2352: Conversion of type '{ ConsultKey: string; ... }' to type 'Consult'
  
  const match = line.match(/^([^:]+)\((\d+),\d+\):\s*error\s*(TS\d+):/);
  if (!match) continue;
  
  const file = match[1];
  const lineNum = parseInt(match[2], 10);
  const tsCode = match[3];
  
  if (line.includes("'PatientKey' does not exist on type 'Patient'") ||
      line.includes("'PatientKey' does not exist in type 'Patient'") ||
      line.includes("'ConsultKey' does not exist on type 'Consult'") ||
      line.includes("'ConsultKey' does not exist in type 'Consult'") ||
      line.includes("'StaffKey' does not exist on type 'Staff'") ||
      line.includes("'StaffKey' does not exist in type 'Staff'") ||
      line.includes("'CathKey' does not exist on type 'CathLab'") ||
      line.includes("'CathKey' does not exist in type 'CathLab'") ||
      line.includes("'NotificationKey' does not exist in type 'Notification'") ||
      line.includes("'NotificationKey' does not exist on type 'Notification'") ||
      line.includes("'RolePresetID' does not exist on type 'RolePreset'") ||
      line.includes("'RolePresetID' does not exist in type 'RolePreset'")) {
    
    if (!fixes[file]) fixes[file] = {};
    fixes[file][lineNum] = true;
  }
}

for (const file of Object.keys(fixes)) {
  const fullPath = path.join(rootDir, file);
  if (!fs.existsSync(fullPath)) continue;
  
  let content = fs.readFileSync(fullPath, 'utf8');
  let lines = content.split('\n');
  let changed = false;
  
  for (const lineNumStr of Object.keys(fixes[file])) {
    const idx = parseInt(lineNumStr, 10) - 1;
    if (idx >= 0 && idx < lines.length) {
      let orig = lines[idx];
      // Replace only the key at that specific line
      lines[idx] = lines[idx].replace(/\bStaffKey\b/, 'id')
                             .replace(/\bPatientKey\b/, 'id')
                             .replace(/\bConsultKey\b/, 'id')
                             .replace(/\bCathKey\b/, 'id')
                             .replace(/\bNotificationKey\b/, 'id')
                             .replace(/\bRolePresetID\b/, 'id');
      if (lines[idx] !== orig) {
        changed = true;
      }
    }
  }
  
  if (changed) {
    fs.writeFileSync(fullPath, lines.join('\n'), 'utf8');
    console.log(`Auto-fixed ${file}`);
  }
}

console.log('Auto-fix complete.');
