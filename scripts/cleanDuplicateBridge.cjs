const fs = require('fs');
let c = fs.readFileSync('src/api/supabaseFetchBridge.ts', 'utf8');

// 1. Remove the first instance of BRIDGE AUTH LAYER to `const loadStaffOnly = async` if it's at the top.
// Actually, let's just find ALL instances of `// BRIDGE AUTH LAYER` and only keep the LAST one.
const parts = c.split('// BRIDGE AUTH LAYER');
if (parts.length > 2) {
  // It means it appears more than once.
  // parts[0] is everything before the first instance.
  // parts[1] is everything between first and second instance.
  // We want to keep parts[0], then the text from the SECOND instance onwards.
  
  // Wait, the first instance goes up to `const loadStaffOnly = async`.
  // Let's find `const loadStaffOnly = async` inside parts[1].
  const loadStaffIdx = parts[1].indexOf('const loadStaffOnly = async');
  if (loadStaffIdx > -1) {
    const remainder = parts[1].substring(loadStaffIdx);
    
    // So the new content is:
    // parts[0] + remainder + '// BRIDGE AUTH LAYER' + parts[2]
    c = parts[0] + remainder + '// BRIDGE AUTH LAYER' + parts.slice(2).join('// BRIDGE AUTH LAYER');
    fs.writeFileSync('src/api/supabaseFetchBridge.ts', c, 'utf8');
    console.log('Removed top duplicate');
  } else {
    console.log('Could not find loadStaffOnly in first duplicate block');
  }
} else {
  console.log('No duplicates found?');
}
