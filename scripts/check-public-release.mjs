#!/usr/bin/env node
/**
 * Guard against identifiers from the private pre-release project entering the
 * public tree. This catches known historical values; it is not a substitute
 * for secret scanning or human review.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const listed = (args) =>
  execFileSync('git', args, { cwd: root, encoding: 'utf8' }).split('\0').filter(Boolean);
const tracked = [...new Set([
  ...listed(['ls-files', '-z']),
  ...listed(['ls-files', '--others', '--exclude-standard', '-z']),
])];

// Build the historical identifiers from fragments so this checker does not
// flag its own deny-list. The resulting regular expressions are intentionally
// specific; broader secret scanning remains a separate CI responsibility.
const privateHandle = ['ahmd', 'mshazly'].join('');
const privateName = ['ahmed', 'mshazly'].join('');
const blockedNames = [
  new RegExp(privateHandle, 'i'),
  new RegExp(privateName, 'i'),
  new RegExp(['ahmed[- ](?:mohamed |mostafa )?el-?', 'shazly'].join(''), 'i'),
  new RegExp(['(?:api\\.)?vitae\\.', privateHandle, '\\.me'].join(''), 'i'),
  new RegExp(['/home/', privateHandle, '\\b'].join(''), 'i'),
];
const forbiddenFiles = new Set(['.env', 'deploy/.env']);
const findings = [];

for (const rel of tracked) {
  if (forbiddenFiles.has(rel)) {
    findings.push(`${rel}: tracked secret file`);
    continue;
  }
  const abs = resolve(root, rel);
  let source;
  try {
    source = readFileSync(abs, 'utf8');
  } catch {
    continue;
  }
  for (const pattern of blockedNames) {
    if (pattern.test(source)) findings.push(`${rel}: matches ${pattern}`);
  }
}

if (findings.length > 0) {
  console.error(`public-release findings (${findings.length}):`);
  for (const finding of findings) console.error(`  ${finding}`);
  process.exit(1);
}

console.log(`public-release: ok (${tracked.length} tracked files checked)`);
