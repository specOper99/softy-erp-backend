import * as fs from 'node:fs';
import * as path from 'node:path';

const EXCLUDED_DIRS = new Set(['node_modules', 'dist', 'coverage', '.git']);
const REPORT_FILE_NAME = 'tenant-async-boundary-report.txt';

const GLOBAL_FILE_ALLOWLIST = [
  {
    file: 'src/common/services/outbox-relay.service.ts',
    reason: 'Outbox relay is intentionally global infrastructure processing.',
  },
] as const;

interface Violation {
  file: string;
  line: number;
  rule: 'MISSING_TENANT_CONTEXT_BOUNDARY';
  message: string;
  content: string;
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

function collectTenantOwnedEntities(files: string[]): Set<string> {
  const tenantOwned = new Set<string>();

  for (const file of files) {
    if (!file.endsWith('.entity.ts')) {
      continue;
    }

    const content = fs.readFileSync(file, 'utf-8');
    if (!/\btenantId\b/.test(content)) {
      continue;
    }

    const classMatches = content.matchAll(/export\s+class\s+([A-Za-z0-9_]+)/g);
    for (const match of classMatches) {
      if (match[1]) {
        tenantOwned.add(match[1]);
      }
    }
  }

  return tenantOwned;
}

function collectTenantAwareRepositories(files: string[]): Set<string> {
  const repositoryNames = new Set<string>();

  for (const file of files) {
    if (!file.endsWith('.repository.ts')) {
      continue;
    }

    const content = fs.readFileSync(file, 'utf-8');
    if (!/extends\s+TenantAwareRepository\s*</.test(content)) {
      continue;
    }

    const classMatches = content.matchAll(/export\s+class\s+([A-Za-z0-9_]+)/g);
    for (const match of classMatches) {
      if (match[1]) {
        repositoryNames.add(match[1]);
      }
    }
  }

  return repositoryNames;
}

function isAsyncBoundaryFile(filePath: string, content: string): boolean {
  const relPath = toPosixPath(path.relative(process.cwd(), filePath));
  if (relPath.endsWith('.handler.ts') || relPath.endsWith('.processor.ts')) {
    return true;
  }

  return /@(Cron|Interval|Timeout)\s*\(/.test(content);
}

function isAllowlisted(relPath: string): boolean {
  return GLOBAL_FILE_ALLOWLIST.some((item) => item.file === relPath);
}

function getLineForPattern(lines: string[], pattern: RegExp): number {
  for (let i = 0; i < lines.length; i++) {
    if (pattern.test(lines[i] ?? '')) {
      return i + 1;
    }
  }
  return 1;
}

function findTenantPersistenceSignals(
  source: string,
  lines: string[],
  tenantOwnedEntities: Set<string>,
  tenantAwareRepositories: Set<string>,
): { line: number; content: string } | null {
  const ctorTypePattern = /private\s+readonly\s+[A-Za-z0-9_]+\s*:\s*([A-Za-z0-9_]+)/g;
  let ctorMatch: RegExpExecArray | null;
  while ((ctorMatch = ctorTypePattern.exec(source)) !== null) {
    const typeName = ctorMatch[1];
    if (!typeName) {
      continue;
    }

    if (tenantAwareRepositories.has(typeName)) {
      const line = getLineForPattern(lines, new RegExp(`\\b${typeName}\\b`));
      return {
        line,
        content: (lines[line - 1] ?? '').trim(),
      };
    }
  }

  const entityPattern = /(?:@InjectRepository\(|Repository\s*<|getRepository\s*\()\s*([A-Za-z0-9_]+)/g;
  let entityMatch: RegExpExecArray | null;
  while ((entityMatch = entityPattern.exec(source)) !== null) {
    const entityName = entityMatch[1];
    if (!entityName || !tenantOwnedEntities.has(entityName)) {
      continue;
    }

    const line = getLineForPattern(lines, new RegExp(`\\b${entityName}\\b`));
    return {
      line,
      content: (lines[line - 1] ?? '').trim(),
    };
  }

  return null;
}

function checkFile(
  filePath: string,
  tenantOwnedEntities: Set<string>,
  tenantAwareRepositories: Set<string>,
): Violation[] {
  const source = fs.readFileSync(filePath, 'utf-8');
  if (!isAsyncBoundaryFile(filePath, source)) {
    return [];
  }

  const relPath = toPosixPath(path.relative(process.cwd(), filePath));
  if (isAllowlisted(relPath)) {
    return [];
  }

  const lines = source.split('\n');
  const signal = findTenantPersistenceSignals(source, lines, tenantOwnedEntities, tenantAwareRepositories);
  if (!signal) {
    return [];
  }

  const hasExplicitBoundary = /TenantContextService\.run\s*\(/.test(source);
  if (hasExplicitBoundary) {
    return [];
  }

  return [
    {
      file: relPath,
      line: signal.line,
      rule: 'MISSING_TENANT_CONTEXT_BOUNDARY',
      message:
        'Async handler/processor/cron touches tenant-scoped persistence without explicit TenantContextService.run(tenantId, ...).',
      content: signal.content,
    },
  ];
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

function buildReport(violations: Violation[], scannedBoundaryFileCount: number): string {
  const lines: string[] = [];
  lines.push('Tenant Async Boundary Report');
  lines.push(`Scanned async boundary files: ${scannedBoundaryFileCount}`);
  lines.push(`Violations: ${violations.length}`);
  lines.push('');
  lines.push('Rule:');
  lines.push(
    '- Handlers/processors/cron that touch tenant-scoped persistence must establish TenantContextService.run(tenantId, ...).',
  );
  lines.push('');
  lines.push('Violations:');

  for (const violation of violations) {
    lines.push(`- ${violation.file}:${violation.line} [${violation.rule}]`);
    lines.push(`  ${violation.message}`);
    lines.push(`  ${violation.content}`);
  }

  lines.push('');
  lines.push('Global allowlist:');
  for (const entry of GLOBAL_FILE_ALLOWLIST) {
    lines.push(`- ${entry.file} -> ${entry.reason}`);
  }

  return `${lines.join('\n')}\n`;
}

function main(): void {
  const srcDir = path.join(process.cwd(), 'src');
  if (!fs.existsSync(srcDir)) {
    console.error('ERROR: src directory not found. Run from project root.');
    process.exit(1);
  }

  const files = getAllFiles(srcDir);
  const tenantOwnedEntities = collectTenantOwnedEntities(files);
  const tenantAwareRepositories = collectTenantAwareRepositories(files);
  const boundaryFiles = files.filter((file) => isAsyncBoundaryFile(file, fs.readFileSync(file, 'utf-8')));

  const violations = sortViolations(
    boundaryFiles.flatMap((file) => checkFile(file, tenantOwnedEntities, tenantAwareRepositories)),
  );
  const reportPath = path.join(process.cwd(), REPORT_FILE_NAME);

  if (violations.length === 0) {
    if (fs.existsSync(reportPath)) {
      fs.rmSync(reportPath);
    }
    console.log('✅ Tenant async boundary checks passed');
    console.log(`   Scanned ${boundaryFiles.length} async boundary files.`);
    return;
  }

  fs.writeFileSync(reportPath, buildReport(violations, boundaryFiles.length), 'utf-8');

  console.error(`❌ Found ${violations.length} tenant async boundary violation(s):\n`);
  for (const violation of violations) {
    console.error(`${violation.file}:${violation.line} [${violation.rule}]`);
    console.error(`  ${violation.content}`);
  }
  console.error(`\n📄 Report written to ${reportPath}`);
  process.exit(1);
}

main();
