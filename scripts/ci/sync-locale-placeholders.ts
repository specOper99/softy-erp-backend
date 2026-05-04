/**
 * Deep-merge: for each leaf key in en.json, ensure ar/fr/ku have the same key.
 * If missing, copy the English string (placeholder for translators).
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

const DIR = path.join(__dirname, '../../src/common/i18n/translations');
const LOCALES = ['ar', 'fr', 'ku'] as const;

function deepMergeMissing(en: unknown, target: unknown): unknown {
  if (en !== null && typeof en === 'object' && !Array.isArray(en)) {
    const te = target !== null && typeof target === 'object' && !Array.isArray(target) ? { ...(target as object) } : {};
    for (const [k, v] of Object.entries(en as Record<string, unknown>)) {
      const cur = (te as Record<string, unknown>)[k];
      if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
        (te as Record<string, unknown>)[k] = deepMergeMissing(v, cur);
      } else if (cur === undefined) {
        (te as Record<string, unknown>)[k] = v;
      }
    }
    return te;
  }
  return target !== undefined ? target : en;
}

function main(): void {
  const enPath = path.join(DIR, 'en.json');
  const en = JSON.parse(fs.readFileSync(enPath, 'utf-8'));
  for (const loc of LOCALES) {
    const p = path.join(DIR, `${loc}.json`);
    const existing = JSON.parse(fs.readFileSync(p, 'utf-8'));
    const merged = deepMergeMissing(en, existing);
    fs.writeFileSync(p, JSON.stringify(merged, null, 4) + '\n', 'utf-8');
    console.log(`Updated ${loc}.json`);
  }
}

main();
