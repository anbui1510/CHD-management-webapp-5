const fs = require('fs');
const path = require('path');

const rootDir = path.join(__dirname, '..');

function replaceInFile(filePath, replacements) {
  const fullPath = path.join(rootDir, filePath);
  if (!fs.existsSync(fullPath)) return;
  let content = fs.readFileSync(fullPath, 'utf8');
  let originalContent = content;
  
  for (const { search, replace } of replacements) {
    content = content.replace(search, replace);
  }
  
  if (content !== originalContent) {
    fs.writeFileSync(fullPath, content, 'utf8');
    console.log(`Updated ${filePath}`);
  }
}

replaceInFile('server.ts', [
  { search: /StaffKey:/g, replace: 'id:' },
  { search: /PatientKey:/g, replace: 'id:' },
  { search: /ConsultKey:/g, replace: 'id:' },
  { search: /NotificationKey:/g, replace: 'id:' },
  { search: /CathKey:/g, replace: 'id:' },
  { search: /RolePresetID:/g, replace: 'id:' }
]);

replaceInFile('src/components/BellNotificationMenu.tsx', [
  { search: /PatientKey:/g, replace: 'id:' },
  { search: /ConsultKey:/g, replace: 'id:' }
]);

replaceInFile('src/components/CathLabRoomView.tsx', [
  { search: /PatientKey:/g, replace: 'id:' },
  { search: /ConsultKey:/g, replace: 'id:' },
  { search: /StaffKey:/g, replace: 'id:' },
  { search: /CathKey:/g, replace: 'id:' }
]);

replaceInFile('src/components/CathLabSchedulerView.tsx', [
  { search: /PatientKey:/g, replace: 'id:' },
  { search: /ConsultKey:/g, replace: 'id:' },
  { search: /StaffKey:/g, replace: 'id:' }
]);

replaceInFile('src/components/MRIRegisterView.tsx', [
  { search: /PatientKey:/g, replace: 'id:' },
  { search: /StaffKey:/g, replace: 'id:' }
]);

replaceInFile('src/components/MRISchedulerView.tsx', [
  { search: /PatientKey:/g, replace: 'id:' },
  { search: /StaffKey:/g, replace: 'id:' }
]);

replaceInFile('src/components/ResultStaffDrawer.tsx', [
  { search: /ConsultKey:/g, replace: 'id:' },
  { search: /StaffKey:/g, replace: 'id:' }
]);

replaceInFile('src/components/RolePresetMatrixPanel.tsx', [
  { search: /isSystemid/g, replace: 'isSystemRolePreset' }
]);

replaceInFile('src/components/StaffProfileView.tsx', [
  { search: /PatientKey:/g, replace: 'id:' }
]);

replaceInFile('src/components/StaffResultsView.tsx', [
  { search: /PatientKey:/g, replace: 'id:' },
  { search: /ConsultKey:/g, replace: 'id:' },
  { search: /StaffKey:/g, replace: 'id:' }
]);

replaceInFile('src/utils/cathlabReconciliation.ts', [
  { search: /PatientKey:/g, replace: 'id:' },
  { search: /ConsultKey:/g, replace: 'id:' }
]);

console.log('Fixes applied.');
