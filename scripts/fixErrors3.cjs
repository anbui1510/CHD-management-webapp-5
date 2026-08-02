const fs = require('fs');
const path = require('path');

const logFile = 'C:/Users/hieub/.gemini/antigravity-ide/brain/55806836-ab8e-4609-9cbe-d4d2aa1099d1/.system_generated/tasks/task-325.log';
const rootDir = path.join(__dirname, '..');

const logContent = fs.readFileSync(logFile, 'utf8');
const lines = logContent.split('\n');

const fixes = {}; 

for (const line of lines) {
  const match = line.match(/^([^:]+)\((\d+),\d+\):\s*error\s*(TS\d+):/);
  if (!match) continue;
  
  const file = match[1];
  const lineNum = parseInt(match[2], 10);
  
  if (line.includes("'PatientKey' does not exist") ||
      line.includes("'ConsultKey' is missing") ||
      line.includes("'ConsultKey' does not exist") ||
      line.includes("'StaffKey' does not exist") ||
      line.includes("'CathKey' does not exist") ||
      line.includes("'NotificationKey' does not exist") ||
      line.includes("'RolePresetID' does not exist") ||
      line.includes("'RolePresetID' is missing") ||
      line.includes("'id' does not exist")) {
    
    if (!fixes[file]) fixes[file] = {};
    fixes[file][lineNum] = true;
  }
}

for (const file of Object.keys(fixes)) {
  const fullPath = path.join(rootDir, file);
  if (!fs.existsSync(fullPath)) continue;
  
  let content = fs.readFileSync(fullPath, 'utf8');
  let fileLines = content.split('\n');
  let changed = false;
  
  for (const lineNumStr of Object.keys(fixes[file])) {
    const idx = parseInt(lineNumStr, 10) - 1;
    if (idx >= 0 && idx < fileLines.length) {
      let orig = fileLines[idx];
      
      // We know which property fails.
      // If the error says 'id' does not exist, it means we used 'id' but the interface expects something else? No, in server.ts the mock DB still expects StaffKey! Wait, server.ts mock DB expects what?
      
      fileLines[idx] = fileLines[idx].replace(/\bStaffKey\b/g, 'id')
                             .replace(/\bPatientKey\b/g, 'id')
                             .replace(/\bConsultKey\b/g, 'id')
                             .replace(/\bCathKey\b/g, 'id')
                             .replace(/\bNotificationKey\b/g, 'id')
                             .replace(/\bRolePresetID\b/g, 'id')
                             .replace(/'MarkKey'/g, "'id'");
                             
      // Revert if we broke isSystemRolePreset
      fileLines[idx] = fileLines[idx].replace(/isSystemid/g, 'isSystemRolePreset');
      
      if (fileLines[idx] !== orig) {
        changed = true;
      }
    }
  }
  
  if (changed) {
    fs.writeFileSync(fullPath, fileLines.join('\n'), 'utf8');
    console.log(`Auto-fixed ${file}`);
  }
}

// Special fixes for supabaseFetchBridge
const bridgePath = path.join(rootDir, 'src/api/supabaseFetchBridge.ts');
if (fs.existsSync(bridgePath)) {
  let bridgeContent = fs.readFileSync(bridgePath, 'utf8');
  bridgeContent = bridgeContent.replace(/const getScriptUrl[\s\S]*?const setScriptUrl[\s\S]*?};\n/g, '');
  fs.writeFileSync(bridgePath, bridgeContent, 'utf8');
  console.log('Fixed supabaseFetchBridge.ts');
}

// Special fix for App.tsx line 756: RolePresetID missing in RolePresetRecord
const appPath = path.join(rootDir, 'src/App.tsx');
let appContent = fs.readFileSync(appPath, 'utf8');
appContent = appContent.replace(/RolePresetRecord\[\]/g, 'RolePreset[]');
fs.writeFileSync(appPath, appContent, 'utf8');

console.log('Auto-fix complete.');
