/**
 * Reports exception string literals that look like i18n keys but are missing from en.json,
 * and non-.spec.ts lines that throw plain English (heuristic) for follow-up.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

const SRC_ROOT = path.join(__dirname, '../../src');
const EN_JSON = path.join(__dirname, '../../src/common/i18n/translations/en.json');

const KEY_LIKE = /^[a-z][a-z0-9_.]*$/;

function flattenKeys(obj: Record<string, unknown>, prefix = ''): Set<string> {
  const keys = new Set<string>();
  for (const [k, v] of Object.entries(obj)) {
    const next = prefix ? `${prefix}.${k}` : k;
    if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
      for (const x of flattenKeys(v as Record<string, unknown>, next)) keys.add(x);
    } else {
      keys.add(next);
    }
  }
  return keys;
}

function walkTsFiles(dir: string, out: string[]): void {
  for (const entry of fs.readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (fs.statSync(full).isDirectory()) {
      if (entry === 'node_modules' || entry === 'dist') continue;
      walkTsFiles(full, out);
      continue;
    }
    if (entry.endsWith('.ts') && !entry.endsWith('.d.ts')) {
      out.push(full);
    }
  }
}

/** Extract first string arg of throw new XException('...') or new XException("...") */
function extractExceptionStrings(line: string): string[] {
  const out: string[] = [];
  const re = /(?:throw\s+)?new\s+\w*Exception\s*\(\s*([`'"])([\s\S]*?)\1/g;
  let m: RegExpExecArray | null;
  const simplified = line.replace(/\/\/.*$/, '');
  while ((m = re.exec(simplified)) !== null) {
    const body = m[2];
    if (body && !body.includes('${') && !body.includes('\n')) {
      out.push(body);
    }
  }
  return out;
}

function main(): void {
  const enKeys = flattenKeys(JSON.parse(fs.readFileSync(EN_JSON, 'utf-8')) as Record<string, unknown>);
  const files: string[] = [];
  walkTsFiles(SRC_ROOT, files);

  const missingInJson: { file: string; line: number; key: string }[] = [];
  const maybeEnglish: { file: string; line: number; text: string }[] = [];

  for (const file of files) {
    const isSpec = file.endsWith('.spec.ts');
    const lines = fs.readFileSync(file, 'utf-8').split('\n');
    lines.forEach((line, idx) => {
      if (!/\w*Exception\s*\(/.test(line)) return;
      const strings = extractExceptionStrings(line);
      for (const s of strings) {
        if (!s.includes('.') || !KEY_LIKE.test(s)) {
          if (!isSpec && s.length > 3 && /[a-zA-Z]{3,}/.test(s) && !s.includes('_')) {
            maybeEnglish.push({ file, line: idx + 1, text: s.slice(0, 120) });
          }
          continue;
        }
        if (!enKeys.has(s)) {
          missingInJson.push({ file, line: idx + 1, key: s });
        }
      }
    });
  }

  if (missingInJson.length > 0) {
    console.error('Keys referenced in code but missing from en.json:');
    for (const m of missingInJson) {
      console.error(`  ${m.file}:${m.line}  ${m.key}`);
    }
  }

  console.log(`\nMissing keys count: ${missingInJson.length}`);
  console.log(`Heuristic non-key throws (non-spec, review manually): ${maybeEnglish.length}`);

  // Exit 1 only when missing keys — English heuristic is informational for now
  if (missingInJson.length > 0) {
    process.exit(1);
  }
}

main();
