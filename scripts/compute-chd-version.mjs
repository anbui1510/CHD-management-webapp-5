#!/usr/bin/env node
/**
 * Compute deploy label: CHD5.yyyy.mm.dd.NNN
 * NNN = số lần deploy trong ngày (giờ VN), ưu tiên GitHub Actions runs (UTC date), fallback git commits.
 */
import { execSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';

const WORKFLOW_FILE = 'cloudflare-deploy.yml';
const TZ = 'Asia/Ho_Chi_Minh';

function getDateLabel(timeZone) {
  const parts = new Intl.DateTimeFormat('en', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());

  const year = parts.find((p) => p.type === 'year')?.value ?? '2026';
  const month = parts.find((p) => p.type === 'month')?.value ?? '01';
  const day = parts.find((p) => p.type === 'day')?.value ?? '01';

  return {
    dotted: `${year}.${month}.${day}`,
    iso: `${year}-${month}-${day}`,
  };
}

function gitCommitCountSince(isoDate) {
  try {
    const out = execSync(`git rev-list --count HEAD --since="${isoDate} 00:00:00 +0700"`, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    const count = parseInt(out, 10);
    return Number.isFinite(count) && count > 0 ? count : 1;
  } catch {
    return 1;
  }
}

function githubDeployRunsToday(utcIsoDate) {
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  if (!token) return null;

  try {
    const out = execSync(
      `gh run list --workflow=${WORKFLOW_FILE} --branch=main --created=${utcIsoDate} --limit=200 --json databaseId`,
      {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
        env: { ...process.env, GH_TOKEN: token },
      }
    );
    const runs = JSON.parse(out);
    if (!Array.isArray(runs) || runs.length === 0) return 1;
    return runs.length;
  } catch {
    return null;
  }
}

function parseSeqArg() {
  const idx = process.argv.indexOf('--seq');
  if (idx < 0) return null;
  const raw = String(process.argv[idx + 1] || '').trim();
  const parsed = parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function computeVersionLabel() {
  const vn = getDateLabel(TZ);
  const utc = getDateLabel('UTC');
  const gitSeq = gitCommitCountSince(vn.iso);
  const runSeqFromArg = parseSeqArg();
  const runSeqFromGh = githubDeployRunsToday(utc.iso);
  const runSeq = runSeqFromArg ?? runSeqFromGh;
  const seq = Math.max(gitSeq, runSeq ?? 0, 1);
  return `CHD5.${vn.dotted}.${String(seq).padStart(3, '0')}`;
}

const version = computeVersionLabel();

if (process.argv.includes('--github-env') && process.env.GITHUB_ENV) {
  appendFileSync(process.env.GITHUB_ENV, `BUILD_ID=${version}\n`, 'utf8');
}

console.log(version);
