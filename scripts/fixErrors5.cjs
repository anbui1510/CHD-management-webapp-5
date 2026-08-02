const fs = require('fs');

function replaceFile(path, search, replace) {
  let content = fs.readFileSync(path, 'utf8');
  content = content.replace(search, replace);
  fs.writeFileSync(path, content, 'utf8');
}

// 1. server.ts
let serverContent = fs.readFileSync('server.ts', 'utf8');
serverContent = serverContent.replace(/RolePresetRecord/g, 'RolePreset');
serverContent = serverContent.replace(/"NotificationKey"/g, '"id"');
serverContent = serverContent.replace(/"MarkKey"/g, '"id"');
serverContent = serverContent.replace(/(id:\s*[^,]+,\s*)\n\s*id:\s*[^,]+,/g, '$1');
serverContent = serverContent.replace(/id:\s*patientKey,\n\s*id:\s*patientKey,/g, 'id: patientKey,');
serverContent = serverContent.replace(/id:\s*patient\.id,\n\s*id:\s*patient\.id,/g, 'id: patient.id,');
// Fix "Type 'unknown' is not assignable to type 'string'" which might be from `id: uuid() as string`? Let's just cast.
// Actually, I'll just change any `Omit<Notification, "NotificationKey" | ...>` to `id`.
serverContent = serverContent.replace(/Omit<Notification, "NotificationKey"/g, 'Omit<Notification, "id"');
serverContent = serverContent.replace(/Pick<Notification, "NotificationKey"/g, 'Pick<Notification, "id"');
// Let's remove duplicate `id:` in server.ts line by line
const serverLines = serverContent.split('\n');
for (let i = 0; i < serverLines.length; i++) {
  if (serverLines[i].includes('id: patient.id,')) {
    if (serverLines[i+1] && serverLines[i+1].includes('id: patient.id,')) {
      serverLines.splice(i+1, 1);
    }
  }
  if (serverLines[i].includes('id: patientKey,')) {
    if (serverLines[i+1] && serverLines[i+1].includes('id: patientKey,')) {
      serverLines.splice(i+1, 1);
    }
  }
}
fs.writeFileSync('server.ts', serverLines.join('\n'), 'utf8');

// 2. App.tsx
replaceFile('src/App.tsx', /RolePresetRecord/g, 'RolePreset');

// 3. RolePresetMatrixPanel.tsx
replaceFile('src/components/RolePresetMatrixPanel.tsx', /isSystemRolePreset/g, 'isSystemRolePresetId');

// 4. CathLabRoomView.tsx
let cathContent = fs.readFileSync('src/components/CathLabRoomView.tsx', 'utf8');
// Fix duplicate id (which was ConsultKey)
// In CathLabRoomView, line 787: error TS1117: An object literal cannot have multiple properties with the same name.
const cathLines = cathContent.split('\n');
for (let i = 0; i < cathLines.length; i++) {
  if (cathLines[i].includes('id: c.id,')) {
    if (cathLines[i-1] && cathLines[i-1].includes('id: currentCathLab.id')) {
      // It was ConsultKey: c.id
      cathLines[i] = cathLines[i].replace('id: c.id', 'ConsultKey: c.id');
    }
    if (cathLines[i+1] && cathLines[i+1].includes('PatientKey: c.PatientKey')) {
      // It was ConsultKey: c.id
      cathLines[i] = cathLines[i].replace('id: c.id', 'ConsultKey: c.id');
    }
  }
  // Line 1095: Conversion of type '{ ConsultKey: string;... }' to type 'Consult'
  if (cathLines[i].includes('ConsultKey: currentConsult.id,')) {
    cathLines[i] = cathLines[i].replace('ConsultKey: currentConsult.id,', 'id: currentConsult.id,');
  }
  if (cathLines[i].includes('ConsultKey: Date.now().toString(),')) {
    cathLines[i] = cathLines[i].replace('ConsultKey:', 'id:');
  }
  // Line 1116: Conversion of type '{ PatientKey: any; ... }' to type 'Patient'
  if (cathLines[i].includes('PatientKey: p.id,')) {
    cathLines[i] = cathLines[i].replace('PatientKey: p.id,', 'id: p.id,');
  }
}
fs.writeFileSync('src/components/CathLabRoomView.tsx', cathLines.join('\n'), 'utf8');

// 5. StaffResultsView.tsx
let staffContent = fs.readFileSync('src/components/StaffResultsView.tsx', 'utf8');
const staffLines = staffContent.split('\n');
for (let i = 0; i < staffLines.length; i++) {
  // StaffResultsView.tsx(314,13): Property 'PatientKey' is missing
  // StaffResultsView.tsx(316,9): An object literal cannot have multiple properties with the same name.
  // We replaced PatientKey: p.id with id: p.id, but it already had id: consult.id!
  if (staffLines[i].includes('id: p.id,')) {
    if (staffLines[i-2] && staffLines[i-2].includes('id: consult.id')) {
      staffLines[i] = staffLines[i].replace('id: p.id,', 'PatientKey: p.id,');
    }
  }
}
fs.writeFileSync('src/components/StaffResultsView.tsx', staffLines.join('\n'), 'utf8');

console.log('Fixed specific remaining errors.');
