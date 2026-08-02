const fs = require('fs');

let c = fs.readFileSync('src/auth/rolePresetDefaults.ts', 'utf8');
c = c.replace(/RolePresetID:/g, 'id:');
fs.writeFileSync('src/auth/rolePresetDefaults.ts', c, 'utf8');

console.log('Fixed RolePresetID in rolePresetDefaults.ts');
