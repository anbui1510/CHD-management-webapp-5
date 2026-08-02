const fs = require('fs');
let content = fs.readFileSync('src/api/supabaseFetchBridge.ts', 'utf8');

// replace \` with `
content = content.replace(/\\`/g, '`');
// replace \${ with ${
content = content.replace(/\\\$\{/g, '${');

fs.writeFileSync('src/api/supabaseFetchBridge.ts', content, 'utf8');
