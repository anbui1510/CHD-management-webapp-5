const fs = require('fs');
const path = require('path');

const srcDir = path.join(__dirname, '../src');

function replaceInFile(filePath, replacements) {
  const fullPath = path.join(srcDir, filePath);
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

// StaffManagementView.tsx
replaceInFile('components/StaffManagementView.tsx', [
  { search: /StaffKey: '',/g, replace: "id: ''," }
]);

// StaffResultsView.tsx
replaceInFile('components/StaffResultsView.tsx', [
  { search: /PatientKey:/g, replace: 'id:' },
  { search: /ConsultKey:/g, replace: 'id:' },
  { search: /StaffKey:/g, replace: 'id:' }
]);

// ResultStaffDrawer.tsx
replaceInFile('components/ResultStaffDrawer.tsx', [
  { search: /ConsultKey: draft.id/g, replace: 'id: draft.id' },
  { search: /ConsultKey: ''/g, replace: "id: ''" },
  { search: /StaffKey:/g, replace: 'id:' }
]);

// CathLabRoomView.tsx
replaceInFile('components/CathLabRoomView.tsx', [
  { search: /ConsultKey: ''/g, replace: "id: ''" },
  { search: /CathKey:/g, replace: 'id:' },
  { search: /PatientKey: ''/g, replace: "id: ''" }
]);

// CathLabSchedulerView.tsx
replaceInFile('components/CathLabSchedulerView.tsx', [
  { search: /PatientKey: ''/g, replace: "id: ''" },
  { search: /ConsultKey: ''/g, replace: "id: ''" },
  { search: /StaffKey:/g, replace: 'id:' }
]);

// MRIRegisterView.tsx
replaceInFile('components/MRIRegisterView.tsx', [
  { search: /PatientKey: ''/g, replace: "id: ''" },
  { search: /StaffKey:/g, replace: 'id:' }
]);

// MRISchedulerView.tsx
replaceInFile('components/MRISchedulerView.tsx', [
  { search: /PatientKey: ''/g, replace: "id: ''" },
  { search: /StaffKey:/g, replace: 'id:' }
]);

// StaffProfileView.tsx
replaceInFile('components/StaffProfileView.tsx', [
  { search: /PatientKey:/g, replace: 'id:' }
]);

// utils/cathlabReconciliation.ts
replaceInFile('utils/cathlabReconciliation.ts', [
  { search: /PatientKey:/g, replace: 'id:' },
  { search: /ConsultKey:/g, replace: 'id:' }
]);

console.log('Fixes applied.');
