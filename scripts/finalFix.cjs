const fs = require('fs');
let c;

// server.ts
c = fs.readFileSync('server.ts', 'utf8');
// Fix missing id in RolePresetRecord: It means I should change it back to RolePreset in `function resolveRolePresetRecords`? 
// No, the error is `Type 'RolePresetRecord[]' is not assignable to type 'RolePreset[]'`.
// Because `RolePresetRecord` in server.ts lacks `id`, maybe it has `RolePresetID`!
c = c.replace(/export type RolePresetRecord = \{[\s\S]*?\};/, match => match.replace('RolePresetID:', 'id:'));
c = c.replace(/Omit<Notification, 'NotificationKey' \|/g, "Omit<Notification, 'id' |");
c = c.replace(/Pick<Notification, 'NotificationKey' \|/g, "Pick<Notification, 'id' |");
c = c.replace(/input\.NotificationKey/g, 'input.id');
c = c.replace(/resolveRolePresets/g, 'resolveRolePresetRecords');
fs.writeFileSync('server.ts', c, 'utf8');

// App.tsx
c = fs.readFileSync('src/App.tsx', 'utf8');
c = c.replace(/RolePreset\[\]/g, 'RolePresetRecord[]'); // revert my bad change
// Wait, in App.tsx `RolePresetRecord` doesn't have `id`. Where is `RolePresetRecord` defined?
// `import { RolePresetRecord } from './auth/permissions';`
// Let's modify permissions.ts instead!
let perm = fs.readFileSync('src/auth/permissions.ts', 'utf8');
perm = perm.replace(/RolePresetID:/g, 'id:');
fs.writeFileSync('src/auth/permissions.ts', perm, 'utf8');

// CathLabRoomView.tsx
c = fs.readFileSync('src/components/CathLabRoomView.tsx', 'utf8');
// Line 784: Property 'ConsultKey' is missing in type '{ id: string; PatientKey: string;... }'
// It means I need to restore ConsultKey!
c = c.replace(/id:\s*c\.id,\s*PatientKey:\s*c\.PatientKey,/g, 'ConsultKey: c.id,\n      PatientKey: c.PatientKey,');
// Line 1095: Conversion of type '{ ConsultKey: string;... }' to type 'Consult'
c = c.replace(/ConsultKey: currentConsult\.id,/g, 'id: currentConsult.id,');
c = c.replace(/ConsultKey: Date\.now\(\)\.toString\(\),/g, 'id: Date.now().toString(),');
// Line 1116: Conversion of type '{ PatientKey: any; ... }' to type 'Patient'
c = c.replace(/PatientKey: p\.id,/g, 'id: p.id,');
fs.writeFileSync('src/components/CathLabRoomView.tsx', c, 'utf8');

// StaffResultsView.tsx
c = fs.readFileSync('src/components/StaffResultsView.tsx', 'utf8');
c = c.replace(/id:\s*p\.id,\s*ConsultType/g, 'PatientKey: p.id,\n      ConsultType');
fs.writeFileSync('src/components/StaffResultsView.tsx', c, 'utf8');

console.log('Final fixes applied');
