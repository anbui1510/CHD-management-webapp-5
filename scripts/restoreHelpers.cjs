const fs = require('fs');
const path = require('path');

const appsScriptPath = path.join(__dirname, '../src/api/appsScriptFetch.ts');
const supabaseBridgePath = path.join(__dirname, '../src/api/supabaseFetchBridge.ts');

const appsScriptContent = fs.readFileSync(appsScriptPath, 'utf8');
const supabaseBridgeContent = fs.readFileSync(supabaseBridgePath, 'utf8');

// Match from // BRIDGE AUTH LAYER up to const loadStaffOnly
const match = appsScriptContent.match(/BRIDGE AUTH LAYER[\s\S]*?const loadStaffOnly = async/);
if (match) {
  let helpers = match[0].replace('const loadStaffOnly = async', '');
  
  // Remove Apps Script specific things like getScriptUrl, setScriptUrl, getScriptSecret, setScriptSecret
  helpers = helpers.replace(/const getScriptUrl[\s\S]*?const setScriptUrl[\s\S]*?};\n/g, '');
  helpers = helpers.replace(/const isLocalHost[\s\S]*?;/g, '');
  
  // Add isLocalHost
  helpers += '\nconst isLocalHost = () => [\'localhost\', \'127.0.0.1\', \'0.0.0.0\'].includes(window.location.hostname);\n\n';
  
  const endStr = 'const loadStaffOnly = async';
  if (supabaseBridgeContent.includes(endStr)) {
    const insertIdx = supabaseBridgeContent.indexOf(endStr);
    const newContent = supabaseBridgeContent.substring(0, insertIdx) + '// ' + helpers + supabaseBridgeContent.substring(insertIdx);
    fs.writeFileSync(supabaseBridgePath, newContent, 'utf8');
    console.log('Restored helper functions to supabaseFetchBridge.ts');
  } else {
    console.log('Could not find loadStaffOnly in supabaseFetchBridge.ts');
  }
} else {
  console.log('Could not find helpers in appsScriptFetch.ts');
}
