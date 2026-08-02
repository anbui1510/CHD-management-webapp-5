const fs = require('fs');

const logPath = 'C:/Users/hieub/.gemini/antigravity-ide/brain/55806836-ab8e-4609-9cbe-d4d2aa1099d1/.system_generated/logs/transcript_full.jsonl';
if (fs.existsSync(logPath)) {
  const content = fs.readFileSync(logPath, 'utf8');
  const lines = content.split('\n');
  let latestBridge = '';
  for (const line of lines) {
    if (line.includes('supabaseFetchBridge.ts')) {
      if (line.includes('```typescript')) {
        // Simple extraction heuristic
        const idx = line.indexOf('```typescript');
        const endIdx = line.indexOf('```', idx + 10);
        if (endIdx > -1) {
          latestBridge = line.substring(idx + 13, endIdx);
        }
      }
    }
  }
  
  if (latestBridge) {
    fs.writeFileSync('scripts/recoveredBridge.ts', latestBridge, 'utf8');
    console.log('Recovered to scripts/recoveredBridge.ts');
  } else {
    console.log('Not found in transcript.');
  }
}
