const fs = require('fs');

let c = fs.readFileSync('server.ts', 'utf8');

c = c.replace(/'MarkKey'/g, "'id'");
c = c.replace(/"MarkKey"/g, '"id"');

// Fix `id:` in appendDoctorMarkIfMissing
// We know that `id: secretary.id` should be `StaffKey: secretary.id`
c = c.replace(/id:\s*secretary\.id,/g, 'StaffKey: secretary.id,');
// We know that `id: scheduler.id` should be `StaffKey: scheduler.id`
c = c.replace(/id:\s*scheduler\.id,/g, 'StaffKey: scheduler.id,');
// We know that `id: requestByStaff.id` should be `StaffKey: requestByStaff.id`
c = c.replace(/id:\s*requestByStaff\.id,/g, 'StaffKey: requestByStaff.id,');
// We know that `id: ptvAssistant.id` should be `StaffKey: ptvAssistant.id`
c = c.replace(/id:\s*ptvAssistant\.id,/g, 'StaffKey: ptvAssistant.id,');

// We know that `id: patientCtx.id` should be `PatientKey: patientCtx.id`
c = c.replace(/id:\s*patientCtx\.id,/g, 'PatientKey: patientCtx.id,');

fs.writeFileSync('server.ts', c, 'utf8');

let t = fs.readFileSync('src/types.ts', 'utf8');
t = t.replace(/MarkKey:\s*string;/g, 'id: string;');
fs.writeFileSync('src/types.ts', t, 'utf8');

console.log('Fixed server.ts and types.ts');
