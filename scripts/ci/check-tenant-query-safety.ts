import * as fs from 'node:fs';
import * as path from 'node:path';

const EXCLUDED_DIRS = new Set(['node_modules', 'dist', 'coverage', '.git']);
const REPORT_FILE_NAME = 'tenant-query-safety-report.txt';

interface Violation {
  file: string;
  line: number;
  rule: 'UNSAFE_UNBRACKETED_OR_WHERE';
  message: string;
  content: string;
}

interface OffsetRange {
  start: number;
  end: number;
}

function toPosixPath(filePath: string): string {
  return filePath.split(path.sep).join('/');
}

function getAllFiles(dirPath: string, files: string[] = []): string[] {
  const entries = fs.readdirSync(dirPath).sort((a, b) => a.localeCompare(b));
  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry);
    const stat = fs.statSync(fullPath);

    if (stat.isDirectory()) {
      if (!EXCLUDED_DIRS.has(entry)) {
        getAllFiles(fullPath, files);
      }
      continue;
    }

    if (entry.endsWith('.ts') && !entry.endsWith('.spec.ts') && !entry.endsWith('.d.ts')) {
      files.push(fullPath);
    }
  }

  return files;
}

function sanitizeForScanning(source: string): string {
  const out: string[] = [];
  let inSingle = false;
  let inDouble = false;
  let inTemplate = false;
  let inLineComment = false;
  let inBlockComment = false;
  let escaped = false;

  for (let i = 0; i < source.length; i++) {
    const char = source.charAt(i);
    const next = source.charAt(i + 1);

    if (inLineComment) {
      if (char === '\n') {
        inLineComment = false;
        out.push('\n');
      } else {
        out.push(' ');
      }
      continue;
    }

    if (inBlockComment) {
      if (char === '*' && next === '/') {
        out.push(' ');
        out.push(' ');
        i++;
        inBlockComment = false;
      } else {
        out.push(char === '\n' ? '\n' : ' ');
      }
      continue;
    }

    if (inSingle) {
      out.push(char === '\n' ? '\n' : ' ');
      if (!escaped && char === "'") {
        inSingle = false;
      }
      escaped = !escaped && char === '\\';
      continue;
    }

    if (inDouble) {
      out.push(char === '\n' ? '\n' : ' ');
      if (!escaped && char === '"') {
        inDouble = false;
      }
      escaped = !escaped && char === '\\';
      continue;
    }

    if (inTemplate) {
      out.push(char === '\n' ? '\n' : ' ');
      if (!escaped && char === '`') {
        inTemplate = false;
      }
      escaped = !escaped && char === '\\';
      continue;
    }

    escaped = false;

    if (char === '/' && next === '/') {
      out.push(' ');
      out.push(' ');
      i++;
      inLineComment = true;
      continue;
    }

    if (char === '/' && next === '*') {
      out.push(' ');
      out.push(' ');
      i++;
      inBlockComment = true;
      continue;
    }

    if (char === "'") {
      out.push(' ');
      inSingle = true;
      continue;
    }

    if (char === '"') {
      out.push(' ');
      inDouble = true;
      continue;
    }

    if (char === '`') {
      out.push(' ');
      inTemplate = true;
      continue;
    }

    out.push(char);
  }

  return out.join('');
}

function findMatchingParen(source: string, openParenIndex: number): number {
  let depth = 0;

  for (let i = openParenIndex; i < source.length; i++) {
    const char = source.charAt(i);
    if (char === '(') {
      depth++;
      continue;
    }

    if (char === ')') {
      depth--;
      if (depth === 0) {
        return i;
      }
    }
  }

  return -1;
}

function findBracketRanges(sanitizedSource: string): OffsetRange[] {
  const ranges: OffsetRange[] = [];
  const bracketsPattern = /new\s+Brackets\s*\(/g;
  let match: RegExpExecArray | null;

  while ((match = bracketsPattern.exec(sanitizedSource)) !== null) {
    const openParenIndex = sanitizedSource.indexOf('(', match.index);
    if (openParenIndex === -1) {
      continue;
    }

    const closeParenIndex = findMatchingParen(sanitizedSource, openParenIndex);
    if (closeParenIndex === -1) {
      continue;
    }

    ranges.push({ start: openParenIndex, end: closeParenIndex });
  }

  return ranges;
}

function isInsideRange(offset: number, ranges: OffsetRange[]): boolean {
  return ranges.some((range) => offset > range.start && offset < range.end);
}

function buildLineStarts(source: string): number[] {
  const starts = [0];
  for (let i = 0; i < source.length; i++) {
    if (source.charAt(i) === '\n') {
      starts.push(i + 1);
    }
  }
  return starts;
}

function getLineNumber(lineStarts: number[], offset: number): number {
  let low = 0;
  let high = lineStarts.length - 1;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const lineStart = lineStarts[mid] ?? 0;
    const nextLineStart = lineStarts[mid + 1] ?? Number.MAX_SAFE_INTEGER;

    if (offset >= lineStart && offset < nextLineStart) {
      return mid + 1;
    }

    if (offset < lineStart) {
      high = mid - 1;
    } else {
      low = mid + 1;
    }
  }

  return lineStarts.length;
}

function checkFile(filePath: string): Violation[] {
  const source = fs.readFileSync(filePath, 'utf-8');
  const sanitized = sanitizeForScanning(source);
  const lines = source.split('\n');
  const lineStarts = buildLineStarts(source);
  const bracketRanges = findBracketRanges(sanitized);
  const violations: Violation[] = [];

  const orWherePattern = /\.orWhere\s*\(/g;
  let match: RegExpExecArray | null;
  while ((match = orWherePattern.exec(sanitized)) !== null) {
    const offset = match.index;
    if (isInsideRange(offset, bracketRanges)) {
      continue;
    }

    const line = getLineNumber(lineStarts, offset);
    const relPath = toPosixPath(path.relative(process.cwd(), filePath));
    const content = (lines[line - 1] ?? '').trim();

    violations.push({
      file: relPath,
      line,
      rule: 'UNSAFE_UNBRACKETED_OR_WHERE',
      message:
        'Unbracketed .orWhere() on tenant-scoped QueryBuilder can produce `tenant AND A OR B`; use .andWhere(new Brackets((qb) => qb.where(...).orWhere(...))).',
      content,
    });
  }

  return violations;
}

function buildReport(violations: Violation[], scannedFileCount: number): string {
  const lines: string[] = [];
  lines.push('Tenant Query Safety Report');
  lines.push(`Scanned files: ${scannedFileCount}`);
  lines.push(`Violations: ${violations.length}`);
  lines.push('');
  lines.push('Rule:');
  lines.push('- Disallow unbracketed .orWhere() in tenant-scoped QueryBuilders.');
  lines.push('- Safe pattern: .andWhere(new Brackets((qb) => qb.where(...).orWhere(...))).');
  lines.push('');
  lines.push('Violations:');

  for (const violation of violations) {
    lines.push(`- ${violation.file}:${violation.line} [${violation.rule}]`);
    lines.push(`  ${violation.message}`);
    lines.push(`  ${violation.content}`);
  }

  return `${lines.join('\n')}\n`;
}

function sortViolations(violations: Violation[]): Violation[] {
  return [...violations].sort((a, b) => {
    const fileCmp = a.file.localeCompare(b.file);
    if (fileCmp !== 0) {
      return fileCmp;
    }
    if (a.line !== b.line) {
      return a.line - b.line;
    }
    return a.content.localeCompare(b.content);
  });
}

function main(): void {
  const srcDir = path.join(process.cwd(), 'src');
  if (!fs.existsSync(srcDir)) {
    console.error('ERROR: src directory not found. Run from project root.');
    process.exit(1);
  }

  const files = getAllFiles(srcDir);
  const violations = sortViolations(files.flatMap((file) => checkFile(file)));
  const reportPath = path.join(process.cwd(), REPORT_FILE_NAME);

  if (violations.length === 0) {
    if (fs.existsSync(reportPath)) {
      fs.rmSync(reportPath);
    }
    console.log('✅ Tenant query safety checks passed');
    console.log(`   Scanned ${files.length} files.`);
    return;
  }

  console.error(`❌ Found ${violations.length} tenant query safety violation(s):\n`);
  for (const violation of violations) {
    console.error(`${violation.file}:${violation.line} [${violation.rule}]`);
    console.error(`  ${violation.content}`);
  }

  fs.writeFileSync(reportPath, buildReport(violations, files.length), 'utf-8');
  console.error(`\n📄 Report written to ${reportPath}`);
  process.exit(1);
}

main();
