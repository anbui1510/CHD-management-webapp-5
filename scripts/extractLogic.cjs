const fs = require('fs');

let content = fs.readFileSync('src/api/supabaseFetchBridge.ts', 'utf8');
let start = content.indexOf('const loadStaffOnly = async');
let end = content.indexOf('export const clearLocalCache = async');

if (start > -1 && end > -1) {
  let extract = content.substring(start, end);
  fs.writeFileSync('extracted.txt', extract, 'utf8');
  console.log('Extracted successfully to extracted.txt');
} else {
  console.log('Could not find start or end', start, end);
}
