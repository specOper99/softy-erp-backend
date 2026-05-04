/**
 * Fails if en/ar/fr/ku translation files do not share the same flattened key set.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

const TRANSLATIONS_DIR = path.join(__dirname, '../../src/common/i18n/translations');
const LOCALES = ['en', 'ar', 'fr', 'ku'] as const;

function flattenKeys(obj: Record<string, unknown>, prefix = ''): string[] {
  const keys: string[] = [];
  for (const [k, v] of Object.entries(obj)) {
    const next = prefix ? `${prefix}.${k}` : k;
    if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
      keys.push(...flattenKeys(v as Record<string, unknown>, next));
    } else {
      keys.push(next);
    }
  }
  return keys.sort();
}

function loadKeys(locale: string): Set<string> {
  const filePath = path.join(TRANSLATIONS_DIR, `${locale}.json`);
  const raw = fs.readFileSync(filePath, 'utf-8');
  const parsed = JSON.parse(raw) as Record<string, unknown>;
  return new Set(flattenKeys(parsed));
}

function main(): void {
  const sets = LOCALES.map((loc) => ({ loc, keys: loadKeys(loc) }));
  const ref = sets[0]!;
  let failed = false;

  for (let i = 1; i < sets.length; i++) {
    const a = ref.keys;
    const b = sets[i]!.keys;
    const onlyA = [...a].filter((k) => !b.has(k));
    const onlyB = [...b].filter((k) => !a.has(k));
    if (onlyA.length > 0 || onlyB.length > 0) {
      failed = true;
      console.error(`Locale key mismatch: ${ref.loc} vs ${sets[i]!.loc}`);
      if (onlyA.length)
        console.error(
          `  Only in ${ref.loc}:`,
          onlyA.slice(0, 50),
          onlyA.length > 50 ? `... +${onlyA.length - 50} more` : '',
        );
      if (onlyB.length)
        console.error(
          `  Only in ${sets[i]!.loc}:`,
          onlyB.slice(0, 50),
          onlyB.length > 50 ? `... +${onlyB.length - 50} more` : '',
        );
    }
  }

  if (failed) {
    process.exit(1);
  }
  console.log(`i18n locale parity OK (${ref.keys.size} keys × ${LOCALES.length} locales).`);
}

main();
