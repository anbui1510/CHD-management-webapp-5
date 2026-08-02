const fs = require('fs');
const path = require('path');

const bridgePath = path.join(__dirname, '../src/api/supabaseFetchBridge.ts');
let content = fs.readFileSync(bridgePath, 'utf8');

// 1. Remove the entire UUID <-> TEXT KEY MAPPING REGISTRIES section up to resolveStaffUuid
content = content.replace(/\/\/ ─+[\s\S]*?function resolveStaffUuid\([^)]*\)\s*:\s*string\s*\|\s*null\s*{[\s\S]*?return null;\s*}/, '');

// 2. Replace toFrontendRecord and toSupabaseRecord with simplified versions
const newToFrontend = `
function toFrontendRecord(endpoint: string, record: any): any {
  if (!record) return record;
  const res = { ...record };

  if (endpoint === 'consults') {
    if (res.ConsultMember !== undefined) res.ConsultMember = parseTextArray(res.ConsultMember);
  } else if (endpoint === 'cathlabs') {
    if (res.CathMethod !== undefined) res.CathMethod = parseTextArray(res.CathMethod);
  }

  return res;
}
`;

const newToSupabase = `
function toSupabaseRecord(endpoint: string, record: any): any {
  if (!record) return record;
  const res = { ...record };

  if (endpoint === 'consults') {
    if (res.ConsultMember !== undefined) res.ConsultMember = stringifyTextArray(res.ConsultMember);
  } else if (endpoint === 'cathlabs') {
    if (res.CathMethod !== undefined) res.CathMethod = stringifyTextArray(res.CathMethod);
  }

  return res;
}
`;

content = content.replace(/function toFrontendRecord\([^)]*\)\s*:\s*any\s*{[\s\S]*?^}/m, newToFrontend.trim());
content = content.replace(/function toSupabaseRecord\([^)]*\)\s*:\s*any\s*{[\s\S]*?^}/m, newToSupabase.trim());

// 3. Remove registerEntityKeys loops
content = content.replace(/.*registerEntityKeys.*\n/g, '');

fs.writeFileSync(bridgePath, content, 'utf8');
console.log('Cleaned up supabaseFetchBridge.ts');
