import * as fs from 'node:fs';
import * as path from 'node:path';

const EXCLUDED_DIRS = new Set(['node_modules', 'dist', 'coverage', '.git']);
const REPORT_FILE_NAME = 'platform-tenant-body-report.txt';

const CONTROLLER_ALLOWLIST = new Set<string>([]);

type RuleId =
  | 'BODY_DECORATOR_TENANT_ID'
  | 'BODY_PARAM_NAMED_TENANT_ID'
  | 'BODY_DTO_CONTAINS_TENANT_ID'
  | 'BODY_PARAM_READS_TENANT_ID';

interface Violation {
  file: string;
  line: number;
  rule: RuleId;
  message: string;
  content: string;
}

interface BodyParam {
  name: string;
  typeName: string;
  line: number;
}

interface ImportBinding {
  importedName: string;
  sourceFile: string;
}

interface TypeScanCache {
  [key: string]: boolean;
}

function toPosixPath(filePath: string): string {
  return filePath.split(path.sep).join('/');
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function getAllFiles(dirPath: string, files: string[] = []): string[] {
  for (const entry of fs.readdirSync(dirPath)) {
    const fullPath = path.join(dirPath, entry);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      if (!EXCLUDED_DIRS.has(entry)) {
        getAllFiles(fullPath, files);
      }
      continue;
    }
    files.push(fullPath);
  }

  return files;
}

function shouldScanFile(relativePath: string): boolean {
  if (!relativePath.startsWith('src/modules/platform/')) {
    return false;
  }

  if (!/controller.*\.ts$/.test(relativePath)) {
    return false;
  }

  if (relativePath.endsWith('.spec.ts') || relativePath.endsWith('.d.ts')) {
    return false;
  }

  if (CONTROLLER_ALLOWLIST.has(relativePath)) {
    return false;
  }

  return true;
}

function getLineNumberForIndex(content: string, index: number): number {
  let line = 1;
  for (let i = 0; i < index; i += 1) {
    if (content[i] === '\n') {
      line += 1;
    }
  }
  return line;
}

function parseNamedImports(content: string, absoluteFilePath: string): Map<string, ImportBinding> {
  const bindings = new Map<string, ImportBinding>();
  const importRegex = /import\s*\{([^}]+)\}\s*from\s*['"]([^'"]+)['"]/g;

  for (const match of content.matchAll(importRegex)) {
    const rawBindings = match[1];
    const source = match[2];

    if (!rawBindings || !source || !source.startsWith('.')) {
      continue;
    }

    const sourceFile = resolveImportPath(absoluteFilePath, source);
    if (!sourceFile) {
      continue;
    }

    for (const rawBinding of rawBindings.split(',')) {
      const trimmed = rawBinding.trim();
      if (!trimmed) {
        continue;
      }

      const aliasMatch = trimmed.match(/^([A-Za-z_$][A-Za-z0-9_$]*)\s+as\s+([A-Za-z_$][A-Za-z0-9_$]*)$/);
      if (aliasMatch) {
        const importedName = aliasMatch[1];
        const localName = aliasMatch[2];
        if (importedName && localName) {
          bindings.set(localName, { importedName, sourceFile });
        }
        continue;
      }

      if (/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(trimmed)) {
        bindings.set(trimmed, { importedName: trimmed, sourceFile });
      }
    }
  }

  return bindings;
}

function resolveImportPath(fromFile: string, importPath: string): string | null {
  const baseDir = path.dirname(fromFile);
  const candidatePaths = [path.resolve(baseDir, `${importPath}.ts`), path.resolve(baseDir, importPath, 'index.ts')];

  for (const candidate of candidatePaths) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
      return candidate;
    }
  }

  return null;
}

function findClassBody(content: string, className: string): string | null {
  const classStartRegex = new RegExp(`(?:export\\s+)?class\\s+${escapeRegex(className)}\\b`);
  const classStartMatch = classStartRegex.exec(content);
  if (!classStartMatch || classStartMatch.index === undefined) {
    return null;
  }

  const openBraceIndex = content.indexOf('{', classStartMatch.index);
  if (openBraceIndex === -1) {
    return null;
  }

  let depth = 0;
  for (let i = openBraceIndex; i < content.length; i += 1) {
    const char = content[i];
    if (char === '{') {
      depth += 1;
      continue;
    }
    if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        return content.slice(openBraceIndex + 1, i);
      }
    }
  }

  return null;
}

function classBodyContainsTenantId(classBody: string): boolean {
  return /\btenantId\b\s*[!?]?\s*:/.test(classBody);
}

function bodyTypeContainsTenantId(
  typeName: string,
  controllerFilePath: string,
  controllerContent: string,
  importBindings: Map<string, ImportBinding>,
  cache: TypeScanCache,
): boolean {
  const cacheKey = `${controllerFilePath}::${typeName}`;
  const cached = cache[cacheKey];
  if (cached !== undefined) {
    return cached;
  }

  const localClassBody = findClassBody(controllerContent, typeName);
  if (localClassBody) {
    const result = classBodyContainsTenantId(localClassBody);
    cache[cacheKey] = result;
    return result;
  }

  const importBinding = importBindings.get(typeName);
  if (!importBinding) {
    cache[cacheKey] = false;
    return false;
  }

  const importedContent = fs.readFileSync(importBinding.sourceFile, 'utf-8');
  const importedClassBody = findClassBody(importedContent, importBinding.importedName);
  if (!importedClassBody) {
    cache[cacheKey] = false;
    return false;
  }

  const result = classBodyContainsTenantId(importedClassBody);
  cache[cacheKey] = result;
  return result;
}

function isCommentLine(line: string): boolean {
  const trimmed = line.trim();
  return trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*') || trimmed.startsWith('*/');
}

function scanControllerFile(filePath: string, relativePath: string, cache: TypeScanCache): Violation[] {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  const importBindings = parseNamedImports(content, filePath);
  const violations: Violation[] = [];
  const bodyParams: BodyParam[] = [];

  const bodyParamRegex =
    /@Body\s*\(([^)]*)\)\s*(?:public|private|protected|readonly\s+)?([A-Za-z_$][A-Za-z0-9_$]*)\s*:\s*([A-Za-z_$][A-Za-z0-9_$]*)/g;

  for (const match of content.matchAll(bodyParamRegex)) {
    const decoratorArg = (match[1] ?? '').trim();
    const paramName = match[2];
    const typeName = match[3];
    const index = match.index;

    if (!paramName || !typeName || index === undefined) {
      continue;
    }

    const line = getLineNumberForIndex(content, index);
    const lineContent = lines[line - 1]?.trim() ?? `${paramName}: ${typeName}`;

    bodyParams.push({ name: paramName, typeName, line });

    if (/['"`]tenantId['"`]/.test(decoratorArg)) {
      violations.push({
        file: relativePath,
        line,
        rule: 'BODY_DECORATOR_TENANT_ID',
        message: 'Platform controller reads tenantId directly from @Body(...).',
        content: lineContent,
      });
    }

    if (paramName === 'tenantId') {
      violations.push({
        file: relativePath,
        line,
        rule: 'BODY_PARAM_NAMED_TENANT_ID',
        message: 'Platform controller accepts tenantId as a @Body() parameter.',
        content: lineContent,
      });
    }

    if (bodyTypeContainsTenantId(typeName, filePath, content, importBindings, cache)) {
      violations.push({
        file: relativePath,
        line,
        rule: 'BODY_DTO_CONTAINS_TENANT_ID',
        message: `@Body() DTO type ${typeName} contains tenantId.`,
        content: lineContent,
      });
    }
  }

  for (const bodyParam of bodyParams) {
    const escapedName = escapeRegex(bodyParam.name);
    const dotAccessRegex = new RegExp(`\\b${escapedName}\\s*\\??\\.\\s*tenantId\\b`, 'g');
    const destructureRegex = new RegExp(`\\{[^}]*\\btenantId\\b[^}]*\\}\\s*=\\s*${escapedName}\\b`, 'g');

    for (const match of content.matchAll(dotAccessRegex)) {
      const index = match.index;
      if (index === undefined) {
        continue;
      }
      const line = getLineNumberForIndex(content, index);
      const lineContent = lines[line - 1]?.trim() ?? '';
      if (isCommentLine(lineContent)) {
        continue;
      }
      violations.push({
        file: relativePath,
        line,
        rule: 'BODY_PARAM_READS_TENANT_ID',
        message: `Platform controller reads tenantId from @Body() parameter ${bodyParam.name}.`,
        content: lineContent,
      });
    }

    for (const match of content.matchAll(destructureRegex)) {
      const index = match.index;
      if (index === undefined) {
        continue;
      }
      const line = getLineNumberForIndex(content, index);
      const lineContent = lines[line - 1]?.trim() ?? '';
      if (isCommentLine(lineContent)) {
        continue;
      }
      violations.push({
        file: relativePath,
        line,
        rule: 'BODY_PARAM_READS_TENANT_ID',
        message: `Platform controller destructures tenantId from @Body() parameter ${bodyParam.name}.`,
        content: lineContent,
      });
    }
  }

  return violations;
}

function dedupeViolations(violations: Violation[]): Violation[] {
  const seen = new Set<string>();
  const deduped: Violation[] = [];

  for (const violation of violations) {
    const key = `${violation.file}:${violation.line}:${violation.rule}:${violation.content}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    deduped.push(violation);
  }

  return deduped;
}

function sortViolations(violations: Violation[]): Violation[] {
  return [...violations].sort((a, b) => {
    if (a.file !== b.file) {
      return a.file.localeCompare(b.file);
    }
    if (a.line !== b.line) {
      return a.line - b.line;
    }
    return a.rule.localeCompare(b.rule);
  });
}

function buildReport(violations: Violation[], scannedControllerCount: number): string {
  const lines: string[] = [];
  lines.push('Platform Tenant Body Contract Report');
  lines.push('====================================');
  lines.push(`Scanned platform controller files: ${scannedControllerCount}`);
  lines.push(`Violations: ${violations.length}`);
  lines.push('');

  for (const violation of violations) {
    lines.push(`- ${violation.file}:${violation.line} [${violation.rule}]`);
    lines.push(`  ${violation.message}`);
    lines.push(`  ${violation.content}`);
  }

  return `${lines.join('\n')}\n`;
}

function main(): void {
  const platformDir = path.join(process.cwd(), 'src', 'modules', 'platform');
  if (!fs.existsSync(platformDir)) {
    console.error('ERROR: src/modules/platform directory not found. Run from project root.');
    process.exit(1);
  }

  const allFiles = getAllFiles(platformDir);
  const controllerFiles = allFiles
    .map((filePath) => toPosixPath(path.relative(process.cwd(), filePath)))
    .filter((relativePath) => shouldScanFile(relativePath));

  const cache: TypeScanCache = {};
  let violations: Violation[] = [];

  for (const relativePath of controllerFiles) {
    const absolutePath = path.join(process.cwd(), relativePath);
    violations = violations.concat(scanControllerFile(absolutePath, relativePath, cache));
  }

  const dedupedViolations = sortViolations(dedupeViolations(violations));
  const reportPath = path.join(process.cwd(), REPORT_FILE_NAME);

  if (dedupedViolations.length === 0) {
    if (fs.existsSync(reportPath)) {
      fs.rmSync(reportPath);
    }
    console.log('✅ Platform tenant body contract checks passed');
    console.log(`   Scanned ${controllerFiles.length} platform controller files.`);
    return;
  }

  fs.writeFileSync(reportPath, buildReport(dedupedViolations, controllerFiles.length), 'utf-8');
  console.error(`❌ Found ${dedupedViolations.length} platform tenant body contract violation(s):\n`);
  for (const violation of dedupedViolations) {
    console.error(`${violation.file}:${violation.line} [${violation.rule}]`);
    console.error(`  ${violation.content}`);
  }
  console.error(`\n📄 Report written to ${reportPath}`);
  process.exit(1);
}

main();
