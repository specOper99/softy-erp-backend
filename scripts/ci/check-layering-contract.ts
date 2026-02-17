import * as fs from 'node:fs';
import * as path from 'node:path';

const EXCLUDED_DIRS = new Set(['node_modules', 'dist', 'coverage', '.git']);
const REPORT_FILE_NAME = 'layering-contract-report.txt';

const CONTROLLER_EXCEPTION_ALLOWLIST = new Set<string>([]);

type RuleId =
  | 'CONTROLLER_REPOSITORY_REFERENCE'
  | 'CONTROLLER_DATASOURCE_REFERENCE'
  | 'CONTROLLER_ENTITY_MANAGER_REFERENCE'
  | 'CONTROLLER_GET_REPOSITORY_TOKEN_REFERENCE'
  | 'CONTROLLER_INJECT_REPOSITORY_DECORATOR'
  | 'CONTROLLER_GET_REPOSITORY_CALL';

interface RuleDefinition {
  id: RuleId;
  pattern: RegExp;
  message: string;
}

interface Violation {
  file: string;
  line: number;
  rule: RuleId;
  message: string;
  content: string;
}

const FORBIDDEN_PATTERNS: RuleDefinition[] = [
  {
    id: 'CONTROLLER_REPOSITORY_REFERENCE',
    pattern: /\bRepository\b/,
    message: 'Controller references Repository primitive directly.',
  },
  {
    id: 'CONTROLLER_DATASOURCE_REFERENCE',
    pattern: /\bDataSource\b/,
    message: 'Controller references DataSource primitive directly.',
  },
  {
    id: 'CONTROLLER_ENTITY_MANAGER_REFERENCE',
    pattern: /\bEntityManager\b/,
    message: 'Controller references EntityManager primitive directly.',
  },
  {
    id: 'CONTROLLER_GET_REPOSITORY_TOKEN_REFERENCE',
    pattern: /\bgetRepositoryToken\b/,
    message: 'Controller references getRepositoryToken directly.',
  },
  {
    id: 'CONTROLLER_INJECT_REPOSITORY_DECORATOR',
    pattern: /@InjectRepository\b/,
    message: 'Controller uses @InjectRepository decorator directly.',
  },
  {
    id: 'CONTROLLER_GET_REPOSITORY_CALL',
    pattern: /\.getRepository\s*\(/,
    message: 'Controller calls .getRepository(...) directly.',
  },
];

function toPosixPath(filePath: string): string {
  return filePath.split(path.sep).join('/');
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

function isControllerFile(relativePath: string): boolean {
  return /^src\/modules\/.*\/controllers\/.*\.ts$/.test(relativePath);
}

function shouldScanFile(relativePath: string): boolean {
  if (!isControllerFile(relativePath)) {
    return false;
  }

  if (relativePath.endsWith('.spec.ts') || relativePath.endsWith('.d.ts')) {
    return false;
  }

  if (CONTROLLER_EXCEPTION_ALLOWLIST.has(relativePath)) {
    return false;
  }

  return true;
}

function isCommentLine(line: string): boolean {
  const trimmed = line.trim();
  return trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*') || trimmed.startsWith('*/');
}

function checkFile(filePath: string, relativePath: string): Violation[] {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  const violations: Violation[] = [];

  lines.forEach((line, index) => {
    const trimmed = line.trim();
    if (trimmed.length === 0 || isCommentLine(trimmed)) {
      return;
    }

    for (const rule of FORBIDDEN_PATTERNS) {
      if (!rule.pattern.test(trimmed)) {
        continue;
      }

      violations.push({
        file: relativePath,
        line: index + 1,
        rule: rule.id,
        message: rule.message,
        content: trimmed,
      });
    }
  });

  return violations;
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
  lines.push('Layering Contract Report');
  lines.push('========================');
  lines.push(`Scanned controller files: ${scannedControllerCount}`);
  lines.push(`Violations: ${violations.length}`);
  lines.push('');

  for (const violation of violations) {
    lines.push(`- ${violation.file}:${violation.line} [${violation.rule}]`);
    lines.push(`  ${violation.message}`);
    lines.push(`  ${violation.content}`);
  }

  return lines.join('\n');
}

function main(): void {
  const modulesDir = path.join(process.cwd(), 'src', 'modules');
  if (!fs.existsSync(modulesDir)) {
    console.error('ERROR: src/modules directory not found. Run from project root.');
    process.exit(1);
  }

  const allFiles = getAllFiles(modulesDir);
  const controllerFiles = allFiles
    .map((file) => toPosixPath(path.relative(process.cwd(), file)))
    .filter((relativePath) => shouldScanFile(relativePath));

  const violations = sortViolations(
    controllerFiles.flatMap((relativePath) => checkFile(path.join(process.cwd(), relativePath), relativePath)),
  );

  const reportPath = path.join(process.cwd(), REPORT_FILE_NAME);

  if (violations.length === 0) {
    if (fs.existsSync(reportPath)) {
      fs.rmSync(reportPath);
    }
    console.log('✅ Layering contract checks passed');
    console.log(`   Scanned ${controllerFiles.length} controller files.`);
    return;
  }

  fs.writeFileSync(reportPath, buildReport(violations, controllerFiles.length), 'utf-8');
  console.error(`❌ Found ${violations.length} layering contract violation(s):\n`);
  for (const violation of violations) {
    console.error(`${violation.file}:${violation.line} [${violation.rule}]`);
    console.error(`  ${violation.content}`);
  }
  console.error(`\n📄 Report written to ${reportPath}`);
  process.exit(1);
}

main();
