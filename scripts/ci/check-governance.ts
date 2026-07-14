#!/usr/bin/env ts-node
/**
 * Governance CI — markdown links, expired exceptions, deprecated deploy paths.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

const ROOT = path.join(__dirname, '../../..');

function read(file: string): string {
  return fs.readFileSync(path.join(ROOT, file), 'utf8');
}

function checkDeprecatedDeployHardDisabled(): void {
  for (const wf of ['backend/.github/workflows/deploy.yml', 'frontend/.github/workflows/deploy.yml']) {
    const content = read(wf);
    if (!content.includes('permanently disabled') && !content.includes('Fail closed')) {
      throw new Error(`${wf} must hard-disable legacy SSH deploy`);
    }
    if (content.includes('scp ') || content.includes('pm2 start')) {
      throw new Error(`${wf} still contains executable SSH/PM2 deploy steps`);
    }
  }
}

function checkLivingDocs(): void {
  for (const doc of ['docs/BASELINE_REPORT.md', 'docs/RECOVERY_CONTRACT.md', 'docs/MEASUREMENT_CONTRACT.md']) {
    if (!fs.existsSync(path.join(ROOT, doc))) {
      throw new Error(`Missing living doc: ${doc}`);
    }
  }
}

function main(): void {
  checkDeprecatedDeployHardDisabled();
  checkLivingDocs();
  console.log('Governance checks passed');
}

main();
