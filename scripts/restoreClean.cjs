const fs = require('fs');

let corrupted = fs.readFileSync('src/api/supabaseFetchBridge.ts', 'utf8');

// Find the LAST `const loadStaffOnly = async` in the corrupted file
const loadStaffIdx = corrupted.lastIndexOf('const loadStaffOnly = async');
const bottomPart = corrupted.substring(loadStaffIdx);

// Now get the pristine top part from appsScriptFetch.ts
let appsScript = fs.readFileSync('src/api/appsScriptFetch.ts', 'utf8');
const appsLoadStaffIdx = appsScript.indexOf('const loadStaffOnly = async');
let pristineTop = appsScript.substring(0, appsLoadStaffIdx);

// But wait, pristineTop has `appsScript` specific things!
// We need to replace:
// `import { appsScriptClient } from './appsScriptClient';` with `import { supabase } from './supabaseClient';`
pristineTop = pristineTop.replace(/import \{ .* \} from '.\/appsScriptClient';/, "import { supabase } from './supabaseClient';");

// Save the merged file
fs.writeFileSync('src/api/supabaseFetchBridge.ts', pristineTop + bottomPart, 'utf8');
console.log('Restored supabaseFetchBridge.ts successfully');

