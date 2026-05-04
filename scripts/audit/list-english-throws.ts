/** One-off: list non-key throw strings in src (excl. spec) */
import * as fs from 'node:fs';
import * as path from 'node:path';

const SRC = path.join(__dirname, '../../src');
const KEY_LIKE = /^[a-z][a-z0-9_.]*$/;

function walk(dir: string, out: string[]): void {
  for (const e of fs.readdirSync(dir)) {
    const f = path.join(dir, e);
    if (fs.statSync(f).isDirectory()) {
      if (!['node_modules', 'dist'].includes(e)) walk(f, out);
      continue;
    }
    if (e.endsWith('.ts') && !e.endsWith('.d.ts')) out.push(f);
  }
}

const re = /(?:throw\s+)?new\s+\w*Exception\s*\(\s*([`'"])([\s\S]*?)\1/g;

function main(): void {
  const files: string[] = [];
  walk(SRC, files);
  const byText = new Map<string, { count: number; files: Set<string> }>();

  for (const file of files) {
    if (file.endsWith('.spec.ts')) continue;
    const lines = fs.readFileSync(file, 'utf-8').split('\n');
    for (const line of lines) {
      if (!/\w*Exception\s*\(/.test(line)) continue;
      const simplified = line.replace(/\/\/.*$/, '');
      let m: RegExpExecArray | null;
      const r = new RegExp(re.source, 'g');
      while ((m = r.exec(simplified)) !== null) {
        const body = m[2];
        if (!body || body.includes('${')) continue;
        if (!body.includes('.') || !KEY_LIKE.test(body)) {
          if (body.length > 3 && /[a-zA-Z]{3,}/.test(body) && !body.includes('_')) {
            const rec = byText.get(body) ?? { count: 0, files: new Set<string>() };
            rec.count += 1;
            rec.files.add(file);
            byText.set(body, rec);
          }
        }
      }
    }
  }

  const sorted = [...byText.entries()].sort((a, b) => b[1].count - a[1].count);
  for (const [text, { count }] of sorted) {
    console.log(`${count}\t${text}`);
  }
}

main();
