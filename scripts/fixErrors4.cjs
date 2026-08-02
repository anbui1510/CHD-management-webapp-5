const fs = require('fs');

function replace(file, search, replace) {
  let content = fs.readFileSync(file, 'utf8');
  content = content.replace(search, replace);
  fs.writeFileSync(file, content, 'utf8');
}

// 1. RolePresetMatrixPanel.tsx
replace('src/components/RolePresetMatrixPanel.tsx', /isSystemid/g, 'isSystemRolePreset');

// 2. App.tsx (RolePresetRecord -> RolePreset)
let appContent = fs.readFileSync('src/App.tsx', 'utf8');
appContent = appContent.replace(/RolePresetRecord\[\]/g, 'RolePreset[]');
fs.writeFileSync('src/App.tsx', appContent, 'utf8');

// 3. server.ts (duplicate ids)
// Instead of complex logic, let's just find lines like `id: patientKey,` and remove duplicate if there is `id: patientKey` below it.
// Actually, it was:
// PatientKey: patientKey, -> id: patientKey,
// But the object already had `id: patientKey,`!
// Let's just remove the first `id: .*` if it's duplicated.
let serverContent = fs.readFileSync('server.ts', 'utf8');
serverContent = serverContent.replace(/id:\s*patient\.id,\s*id:\s*patient\.id,/g, 'id: patient.id,');
// It might be `id: patient.id` and then `id: patientKey`
serverContent = serverContent.replace(/id:\s*patient\.id,\s*PatientID:/g, 'PatientID:'); // wait, if we delete id, it's safer to just delete one of the id lines
fs.writeFileSync('server.ts', serverContent, 'utf8');

// 4. supabaseFetchBridge.ts
// I'll just write a script to completely rebuild supabaseFetchBridge.ts correctly.
