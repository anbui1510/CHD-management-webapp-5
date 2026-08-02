const fs = require('fs');
const path = require('path');
const p = path.join(__dirname, '../src/api/supabaseFetchBridge.ts');
let c = fs.readFileSync(p);
if (c[0] === 0xEF && c[1] === 0xBB && c[2] === 0xBF) {
  fs.writeFileSync(p, c.slice(3));
  console.log('Removed BOM');
} else if (c[0] === 0xFE && c[1] === 0xFF) {
  fs.writeFileSync(p, c.slice(2));
  console.log('Removed UTF-16 BE BOM');
} else if (c[0] === 0xFF && c[1] === 0xFE) {
  fs.writeFileSync(p, c.slice(2));
  console.log('Removed UTF-16 LE BOM');
} else {
  // If it's something else at start, check what it is
  const str = c.toString('utf8');
  if (str.charCodeAt(0) === 0xFEFF || str.charCodeAt(0) === 0x200B) {
    fs.writeFileSync(p, str.substring(1), 'utf8');
    console.log('Removed Zero Width Space / BOM');
  } else {
    console.log('First char code:', str.charCodeAt(0));
  }
}
