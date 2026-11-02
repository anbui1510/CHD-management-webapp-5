import fs from 'fs';

const content = fs.readFileSync('src/data/appsScriptCode.ts', 'utf8');
const startMarker = 'GOOGLE_APPS_SCRIPT_CODE = `';
const start = content.indexOf(startMarker);
if (start < 0) throw new Error('start marker not found');
const codeStart = start + startMarker.length;
const codeEnd = content.lastIndexOf('`');
if (codeEnd <= codeStart) throw new Error('end backtick not found');
const code = content.slice(codeStart, codeEnd)
  .replace(/\n\/\*\* @consult-slide-prompt:(start|end) \*\//g, '');
fs.mkdirSync('docs', { recursive: true });
fs.writeFileSync('docs/Code.gs', code, 'utf8');
const lines = code.split('\n');
console.log(`Wrote docs/Code.gs (${lines.length} lines)`);
console.log('First line:', lines[0]);
console.log('Last line:', lines[lines.length - 1]);
