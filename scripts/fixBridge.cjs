const fs = require('fs');
const path = require('path');

const rootDir = path.join(__dirname, '..');
const appsScriptPath = path.join(rootDir, 'src/api/appsScriptFetch.ts');
const supabaseBridgePath = path.join(rootDir, 'src/api/supabaseFetchBridge.ts');

const appsScriptContent = fs.readFileSync(appsScriptPath, 'utf8');
let bridgeContent = fs.readFileSync(supabaseBridgePath, 'utf8');

// 1. Get the helpers block from appsScriptFetch.ts
const startMarker = '// BRIDGE AUTH LAYER';
const endMarker = 'const loadStaffOnly = async';
const startIdx = appsScriptContent.indexOf(startMarker);
const endIdx = appsScriptContent.indexOf(endMarker);

let helpers = appsScriptContent.substring(startIdx - 3, endIdx); // include the // --- line

// Remove getScriptUrl, setScriptUrl, getScriptSecret, setScriptSecret
helpers = helpers.replace(/const getScriptUrl[\s\S]*?const setScriptUrl[\s\S]*?};\n/g, '');
helpers = helpers.replace(/const isLocalHost[\s\S]*?;/g, '');
helpers += '\nconst isLocalHost = () => [\'localhost\', \'127.0.0.1\', \'0.0.0.0\'].includes(window.location.hostname);\n\n';

// 2. We need normalizeData, because it was between textResponse and loadStaffOnly in appsScriptFetch.ts.
// But wait, it might already be in helpers! Let's check appsScriptFetch.ts.
// Yes, normalizeData is defined in appsScriptFetch.ts before loadStaffOnly, so it's ALREADY in helpers!

// 3. Remove whatever broken block is in supabaseFetchBridge currently
// My previous script added `// ` + helpers. Let's just remove everything from `// BRIDGE AUTH LAYER` to `const loadStaffOnly = async`.
// Wait, my previous script added it right before `const loadStaffOnly = async`.
const bridgeStart = bridgeContent.indexOf('// ─────────────────────────────────────────────────────────────────\n// BRIDGE AUTH LAYER');
const bridgeEnd = bridgeContent.indexOf('const loadStaffOnly = async');

if (bridgeStart > -1 && bridgeEnd > -1) {
  bridgeContent = bridgeContent.substring(0, bridgeStart) + helpers + bridgeContent.substring(bridgeEnd);
} else {
  // If it didn't find BRIDGE AUTH LAYER (maybe it got messed up), just insert it before loadStaffOnly
  const loadStaffIdx = bridgeContent.indexOf('const loadStaffOnly = async');
  bridgeContent = bridgeContent.substring(0, loadStaffIdx) + helpers + bridgeContent.substring(loadStaffIdx);
}

fs.writeFileSync(supabaseBridgePath, bridgeContent, 'utf8');
console.log('supabaseFetchBridge.ts fixed');

// Fix server.ts duplicate ids and ts errors
let serverContent = fs.readFileSync(path.join(rootDir, 'server.ts'), 'utf8');
// Fix MarkKey -> id for Omit in DoctorPerformanceMark
serverContent = serverContent.replace(/Omit<DoctorPerformanceMark, 'CreatedTime'\|'MarkKey'\|'Score'\|'CreatedBy'>/g, "Omit<DoctorPerformanceMark, 'CreatedTime'|'id'|'Score'|'CreatedBy'>");
serverContent = serverContent.replace(/Pick<DoctorPerformanceMark, 'CreatedTime'\|'MarkKey'\|'Score'\|'CreatedBy'>/g, "Pick<DoctorPerformanceMark, 'CreatedTime'|'id'|'Score'|'CreatedBy'>");
serverContent = serverContent.replace(/Omit<DoctorPerformanceMark, "CreatedTime" \| "MarkKey" \| "Score" \| "CreatedBy">/g, 'Omit<DoctorPerformanceMark, "CreatedTime" | "id" | "Score" | "CreatedBy">');
serverContent = serverContent.replace(/Pick<DoctorPerformanceMark, "CreatedTime" \| "MarkKey" \| "Score" \| "CreatedBy">/g, 'Pick<DoctorPerformanceMark, "CreatedTime" | "id" | "Score" | "CreatedBy">');
// Fix duplicate id
serverContent = serverContent.replace(/id:\s*patient\.id,\n\s*id:\s*patient\.id,/g, 'id: patient.id,');
serverContent = serverContent.replace(/id:\s*patientKey,\n\s*id:\s*patientKey,/g, 'id: patientKey,');
fs.writeFileSync(path.join(rootDir, 'server.ts'), serverContent, 'utf8');

console.log('server.ts fixed');
