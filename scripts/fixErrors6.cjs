const fs = require('fs');

function replaceFile(path, search, replace) {
  let content = fs.readFileSync(path, 'utf8');
  content = content.replace(search, replace);
  fs.writeFileSync(path, content, 'utf8');
}

// 1. server.ts
let serverContent = fs.readFileSync('server.ts', 'utf8');
serverContent = serverContent.replace(/item\.RolePresetID/g, 'item.id');
serverContent = serverContent.replace(/Omit<DoctorPerformanceMark, "CreatedTime" \| "MarkKey"/g, 'Omit<DoctorPerformanceMark, "CreatedTime" | "id"');
serverContent = serverContent.replace(/Pick<DoctorPerformanceMark, "CreatedTime" \| "MarkKey"/g, 'Pick<DoctorPerformanceMark, "CreatedTime" | "id"');

// Fix duplicates in server.ts
// We know it's id: patient.id or id: patientKey, let's just strip the second one safely.
const serverLines = serverContent.split('\n');
for (let i = 0; i < serverLines.length; i++) {
  if (serverLines[i].includes('id: patient.id,')) {
    if (serverLines[i+1] && serverLines[i+1].includes('id: patient.id,')) {
      serverLines[i+1] = '';
    }
  }
  if (serverLines[i].includes('id: patientKey,')) {
    if (serverLines[i+1] && serverLines[i+1].includes('id: patientKey,')) {
      serverLines[i+1] = '';
    }
  }
}
fs.writeFileSync('server.ts', serverLines.filter(line => line !== '').join('\n'), 'utf8');

// 2. permissions.ts
let permContent = fs.readFileSync('src/auth/permissions.ts', 'utf8');
permContent = permContent.replace(/RolePresetID/g, 'id'); // this replaces all instances of RolePresetID with id
fs.writeFileSync('src/auth/permissions.ts', permContent, 'utf8');

// 3. CathLabRoomView.tsx
let cathContent = fs.readFileSync('src/components/CathLabRoomView.tsx', 'utf8');
cathContent = cathContent.replace(/id:\s*c\.id,\s*PatientKey/g, 'ConsultKey: c.id,\n      PatientKey');
cathContent = cathContent.replace(/ConsultKey:\s*currentConsult\.id,/g, 'id: currentConsult.id,');
cathContent = cathContent.replace(/ConsultKey:\s*Date\.now\(\)\.toString\(\),/g, 'id: Date.now().toString(),');
cathContent = cathContent.replace(/PatientKey:\s*p\.id,/g, 'id: p.id,');
fs.writeFileSync('src/components/CathLabRoomView.tsx', cathContent, 'utf8');

// 4. StaffResultsView.tsx
let staffContent = fs.readFileSync('src/components/StaffResultsView.tsx', 'utf8');
staffContent = staffContent.replace(/id:\s*p\.id,\s*ConsultType/g, 'PatientKey: p.id,\n      ConsultType');
fs.writeFileSync('src/components/StaffResultsView.tsx', staffContent, 'utf8');

console.log('Fixed remaining errors.');
