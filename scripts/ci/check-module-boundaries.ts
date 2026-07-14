#!/usr/bin/env ts-node
/**
 * Report-only module boundary checker.
 * Fails when NEW violations are introduced vs baseline file.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

const ROOT = path.join(__dirname, '../../src/modules');
const BASELINE = path.join(__dirname, '../../reports/module-boundaries-baseline.txt');

const LAYERS = ['api', 'application', 'domain', 'infrastructure'] as const;

function listViolations(): string[] {
  const violations: string[] = [];
  if (!fs.existsSync(ROOT)) return violations;

  for (const moduleName of fs.readdirSync(ROOT)) {
    const modulePath = path.join(ROOT, moduleName);
    if (!fs.statSync(modulePath).isDirectory()) continue;

    const hasLayer = LAYERS.some((layer) => fs.existsSync(path.join(modulePath, layer)));
    if (!hasLayer) {
      violations.push(`missing-layers:${moduleName}`);
    }
  }
  return violations.sort();
}

function main(): void {
  const current = listViolations();
  const baseline = fs.existsSync(BASELINE) ? fs.readFileSync(BASELINE, 'utf8').trim().split('\n').filter(Boolean) : [];

  const newViolations = current.filter((v) => !baseline.includes(v));

  if (newViolations.length > 0) {
    console.error('New module boundary violations:');
    for (const v of newViolations) console.error(`  - ${v}`);
    process.exit(1);
  }

  console.log(`Module boundaries OK (${current.length} known gaps, 0 new)`);
}

main();
