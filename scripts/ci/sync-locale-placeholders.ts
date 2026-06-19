/**
 * Deep-merge: for each leaf key in en/*.json, ensure ar/fr/ku have the same key.
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

function readNamespaceFiles(locale: string): Record<string, unknown> {
  const localeDir = path.join(DIR, locale);
  const merged: Record<string, unknown> = {};
  for (const file of fs.readdirSync(localeDir).filter((name) => name.endsWith('.json'))) {
    const namespace = file.replace(/\.json$/, '');
    merged[namespace] = JSON.parse(fs.readFileSync(path.join(localeDir, file), 'utf-8'));
  }
  return merged;
}

function writeNamespaceFiles(locale: string, merged: Record<string, unknown>): void {
  const localeDir = path.join(DIR, locale);
  for (const [namespace, value] of Object.entries(merged)) {
    fs.writeFileSync(path.join(localeDir, `${namespace}.json`), `${JSON.stringify(value, null, 2)}\n`, 'utf-8');
  }
}

function main(): void {
  const en = readNamespaceFiles('en');
  for (const loc of LOCALES) {
    const existing = readNamespaceFiles(loc);
    const merged = deepMergeMissing(en, existing) as Record<string, unknown>;
    writeNamespaceFiles(loc, merged);
    console.log(`Updated ${loc} namespaces`);
  }
}

main();
