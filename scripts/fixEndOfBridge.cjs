const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, '../src/api/supabaseFetchBridge.ts');
let content = fs.readFileSync(file, 'utf8');

const endPart = `  const nativeFetch = window.fetch.bind(window);
  (window as any).__CHD_NATIVE_FETCH__ = nativeFetch;
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const handled = await handleApiRequest(input, init);
    if (handled) return handled;
    return nativeFetch(input, init);
  };
};`;

// replace from `(window as any).__CHD_SUPABASE_FETCH_BRIDGE__ = true;` to the end
const idx = content.lastIndexOf('(window as any).__CHD_SUPABASE_FETCH_BRIDGE__ = true;');
if (idx > -1) {
  content = content.substring(0, idx + 53) + '\n' + endPart + '\n';
  fs.writeFileSync(file, content, 'utf8');
  console.log('Fixed end of file');
} else {
  console.log('Marker not found');
}
