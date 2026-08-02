const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, '../src/api/supabaseFetchBridge.ts');
let content = fs.readFileSync(file, 'utf8');

// Find the first occurrence of // BRIDGE AUTH LAYER
const firstIdx = content.indexOf('// BRIDGE AUTH LAYER');
if (firstIdx > -1) {
  // Find the next `const loadStaffOnly = async` AFTER firstIdx
  const nextLoadStaff = content.indexOf('const loadStaffOnly = async', firstIdx);
  if (nextLoadStaff > -1) {
    // Check if there is another `// BRIDGE AUTH LAYER` AFTER nextLoadStaff
    const secondIdx = content.indexOf('// BRIDGE AUTH LAYER', nextLoadStaff);
    if (secondIdx > -1) {
      // Yes, there are duplicates! Let's delete the FIRST one entirely.
      // Wait, is it safer to delete the FIRST one or SECOND one?
      // The first one is at the very top of the file. Let's see:
      if (firstIdx < 100) {
        // It's at the top. Let's delete from 0 to nextLoadStaff
        // But wait, the original file had imports at the top!
        // If imports are before firstIdx, we shouldn't delete them.
        
        // Let's just remove the block from firstIdx to nextLoadStaff
        content = content.substring(0, firstIdx - 3) + content.substring(nextLoadStaff); // -3 for // \n
        fs.writeFileSync(file, content, 'utf8');
        console.log('Removed duplicate helpers from top');
      } else {
        // Delete the second one
        const thirdLoadStaff = content.indexOf('const loadStaffOnly = async', secondIdx);
        content = content.substring(0, secondIdx - 3) + content.substring(thirdLoadStaff);
        fs.writeFileSync(file, content, 'utf8');
        console.log('Removed duplicate helpers from bottom');
      }
    } else {
       console.log('Only 1 instance found? But powershell said 2.');
    }
  }
}
