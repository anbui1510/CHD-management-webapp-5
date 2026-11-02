/**
 * Generates buildConsultSlidePrompt() for Code.gs from shared prompt lines.
 * Run: node scripts/generate-apps-script-prompt-block.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const linesTs = fs.readFileSync(
  path.join(__dirname, '../src/consultSlide/appsScriptPromptLines.ts'),
  'utf8'
);
const match = linesTs.match(
  /CONSULT_SLIDE_APPS_SCRIPT_PROMPT_LINES[^[]*\[([\s\S]*?)\];/
);
if (!match) throw new Error('Could not parse CONSULT_SLIDE_APPS_SCRIPT_PROMPT_LINES');

const rawEntries = [...match[1].matchAll(/'((?:\\'|[^'])*)'/g)].map(m => m[1]);

function escapeForAppsScriptString(s) {
  return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

const quoted = rawEntries.map(line => {
  const escaped = escapeForAppsScriptString(line);
  const physical = `    "${escaped}",`;
  if (physical.length > 72) {
    throw new Error(
      `Prompt line too long for Apps Script paste (${physical.length} > 72): ${line}`
    );
  }
  return physical;
});

const fn = `/** Generated from src/consultSlide/appsScriptPromptLines.ts — do not edit by hand. */
function buildConsultSlidePrompt(patient, consult) {
  patient = patient || {};
  consult = consult || {};
  var ctx = JSON.stringify({ patient: patient, consult: consult }, null, 2);
  var lines = [
${quoted.join('\n')}
  ];
  var out = [];
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i];
    if (line === "__CTX__") {
      out.push(ctx);
    } else {
      out.push(line);
    }
  }
  return out.join("\\n");
}
`;

const markerStart = '/** @consult-slide-prompt:start */';
const markerEnd = '/** @consult-slide-prompt:end */';
const appsPath = path.join(__dirname, '../src/data/appsScriptCode.ts');
let apps = fs.readFileSync(appsPath, 'utf8');
const startIdx = apps.indexOf(markerStart);
const endIdx = apps.indexOf(markerEnd);
if (startIdx < 0 || endIdx < 0 || endIdx <= startIdx) {
  throw new Error(`Missing ${markerStart} / ${markerEnd} in appsScriptCode.ts`);
}
apps =
  apps.slice(0, startIdx + markerStart.length) +
  '\n' +
  fn +
  '\n' +
  apps.slice(endIdx);
fs.writeFileSync(appsPath, apps, 'utf8');
console.log('Updated buildConsultSlidePrompt in appsScriptCode.ts');
