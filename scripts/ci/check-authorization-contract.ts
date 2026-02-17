import * as fs from 'node:fs';
import * as path from 'node:path';

const EXCLUDED_DIRS = new Set(['node_modules', 'dist', 'coverage', '.git']);
const REPORT_FILE_NAME = 'authorization-contract-report.txt';

const AUTH_GUARDS = new Set(['JwtAuthGuard', 'PlatformJwtAuthGuard', 'ClientTokenGuard', 'MetricsGuard', 'WsJwtGuard']);

const PLATFORM_GUARDS = new Set(['PlatformJwtAuthGuard']);
const CLIENT_GUARDS = new Set(['ClientTokenGuard']);
const TENANT_GUARDS = new Set(['JwtAuthGuard']);

type RuleId =
  | 'MUTATING_ENDPOINT_MISSING_AUTH_OR_PUBLIC'
  | 'SKIP_TENANT_AUTH_MODEL_UNDECLARED'
  | 'UNGUARDED_SERVICE_ORCHESTRATION_RISK';

interface Violation {
  file: string;
  line: number;
  rule: RuleId;
  message: string;
  content: string;
}

interface DecoratorContext {
  guards: Set<string>;
  hasSkipTenant: boolean;
  hasMutatingDecorator: boolean;
}

interface MethodEntry {
  name: string;
  line: number;
  decorators: DecoratorContext;
}

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
  const inControllersDir = /^src\/modules\/.*\/controllers\/.*\.ts$/.test(relativePath);
  const flatController = /^src\/modules\/.*\.controller\.ts$/.test(relativePath);
  return inControllersDir || flatController;
}

function shouldScanFile(relativePath: string): boolean {
  if (!isControllerFile(relativePath)) {
    return false;
  }

  if (relativePath.endsWith('.spec.ts') || relativePath.endsWith('.d.ts')) {
    return false;
  }

  return true;
}

function parseDecoratorContext(decoratorLines: string[]): DecoratorContext {
  const merged = decoratorLines.join(' ');
  const guards = new Set<string>();
  const useGuardsRegex = /@UseGuards\s*\(([^)]*)\)/g;

  for (const match of merged.matchAll(useGuardsRegex)) {
    const args = match[1] ?? '';
    for (const token of args.matchAll(/\b([A-Za-z_][A-Za-z0-9_]*)\b/g)) {
      const guardName = token[1];
      if (guardName && guardName.endsWith('Guard')) {
        guards.add(guardName);
      }
    }
  }

  return {
    guards,
    hasSkipTenant: /@SkipTenant\s*\(/.test(merged),
    hasMutatingDecorator: /@(Post|Patch|Put|Delete)\s*\(/.test(merged),
  };
}

function extractMethodName(signatureLine: string): string {
  const withoutModifiers = signatureLine
    .replace(/^(public|private|protected|readonly|static|async)\s+/g, '')
    .replace(/^(public|private|protected|readonly|static|async)\s+/g, '');
  const match = withoutModifiers.match(/^([A-Za-z_$][A-Za-z0-9_$]*)\s*\(/);
  return match?.[1] ?? 'unknownMethod';
}

function isMethodSignatureLine(trimmed: string): boolean {
  if (!trimmed.includes('(')) {
    return false;
  }

  if (/^(if|for|while|switch|catch|return|new|throw)\b/.test(trimmed)) {
    return false;
  }

  return /^(public|private|protected|readonly|static|async|\s)*[A-Za-z_$][A-Za-z0-9_$]*\s*\(/.test(trimmed);
}

function hasAnyAuthGuard(guards: Set<string>): boolean {
  for (const guard of guards) {
    if (AUTH_GUARDS.has(guard)) {
      return true;
    }
  }
  return false;
}

function hasGuardFromSet(guards: Set<string>, set: Set<string>): boolean {
  for (const guard of guards) {
    if (set.has(guard)) {
      return true;
    }
  }
  return false;
}

function extractControllerMetadata(fileContent: string): {
  classLine: number;
  classDecorators: DecoratorContext;
  methods: MethodEntry[];
} {
  const lines = fileContent.split('\n');
  const methods: MethodEntry[] = [];
  let classLine = 1;
  let classDecorators: DecoratorContext = {
    guards: new Set<string>(),
    hasSkipTenant: false,
    hasMutatingDecorator: false,
  };

  let pendingDecoratorLines: string[] = [];

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] ?? '';
    const trimmed = line.trim();

    if (trimmed.startsWith('@')) {
      pendingDecoratorLines.push(trimmed);
      continue;
    }

    if (pendingDecoratorLines.length > 0 && /^export\s+class\s+\w+/.test(trimmed)) {
      classDecorators = parseDecoratorContext(pendingDecoratorLines);
      classLine = i + 1;
      pendingDecoratorLines = [];
      continue;
    }

    if (pendingDecoratorLines.length > 0 && isMethodSignatureLine(trimmed)) {
      methods.push({
        name: extractMethodName(trimmed),
        line: i + 1,
        decorators: parseDecoratorContext(pendingDecoratorLines),
      });
      pendingDecoratorLines = [];
      continue;
    }

    if (trimmed.length === 0 || trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) {
      continue;
    }

    pendingDecoratorLines = [];
  }

  return { classLine, classDecorators, methods };
}

function collectFileAuthGuards(classDecorators: DecoratorContext, methods: MethodEntry[]): Set<string> {
  const guards = new Set<string>();
  for (const guard of classDecorators.guards) {
    if (AUTH_GUARDS.has(guard)) {
      guards.add(guard);
    }
  }
  for (const method of methods) {
    for (const guard of method.decorators.guards) {
      if (AUTH_GUARDS.has(guard)) {
        guards.add(guard);
      }
    }
  }
  return guards;
}

function checkMutatingEndpoints(
  relativePath: string,
  classDecorators: DecoratorContext,
  methods: MethodEntry[],
): Violation[] {
  const violations: Violation[] = [];
  const classHasAuth = hasAnyAuthGuard(classDecorators.guards);

  for (const method of methods) {
    if (!method.decorators.hasMutatingDecorator) {
      continue;
    }

    const endpointHasAuth = classHasAuth || hasAnyAuthGuard(method.decorators.guards);
    const endpointHasSkipTenant = classDecorators.hasSkipTenant || method.decorators.hasSkipTenant;

    if (endpointHasAuth || endpointHasSkipTenant) {
      continue;
    }

    violations.push({
      file: relativePath,
      line: method.line,
      rule: 'MUTATING_ENDPOINT_MISSING_AUTH_OR_PUBLIC',
      message:
        'Mutating endpoint requires auth guard at class/method level, or explicit public declaration via @SkipTenant().',
      content: method.name,
    });
  }

  return violations;
}

function checkSkipTenantAuthModel(
  relativePath: string,
  classLine: number,
  classDecorators: DecoratorContext,
  methods: MethodEntry[],
): Violation[] {
  const controllerHasSkipTenant =
    classDecorators.hasSkipTenant || methods.some((method) => method.decorators.hasSkipTenant);

  if (!controllerHasSkipTenant) {
    return [];
  }

  const fileGuards = collectFileAuthGuards(classDecorators, methods);

  if (hasGuardFromSet(fileGuards, PLATFORM_GUARDS)) {
    return [];
  }
  if (hasGuardFromSet(fileGuards, CLIENT_GUARDS)) {
    return [];
  }
  if (hasGuardFromSet(fileGuards, TENANT_GUARDS)) {
    return [];
  }

  const hasExplicitPublicSkipTenantEndpoint = methods.some((method) => {
    const endpointHasSkipTenant = classDecorators.hasSkipTenant || method.decorators.hasSkipTenant;
    const endpointHasAuth = hasAnyAuthGuard(classDecorators.guards) || hasAnyAuthGuard(method.decorators.guards);
    return endpointHasSkipTenant && !endpointHasAuth;
  });

  if (hasExplicitPublicSkipTenantEndpoint) {
    return [];
  }

  if (fileGuards.size > 0) {
    return [];
  }

  return [
    {
      file: relativePath,
      line: classLine,
      rule: 'SKIP_TENANT_AUTH_MODEL_UNDECLARED',
      message:
        '@SkipTenant() controller must explicitly declare an auth model (platform/client/tenant/public) to reduce drift.',
      content: '@SkipTenant()',
    },
  ];
}

function checkUnguardedServiceOrchestrationRisk(
  relativePath: string,
  fileContent: string,
  classDecorators: DecoratorContext,
  methods: MethodEntry[],
): Violation[] {
  const hasSkipTenant = classDecorators.hasSkipTenant || methods.some((method) => method.decorators.hasSkipTenant);
  const hasAuthGuard = collectFileAuthGuards(classDecorators, methods).size > 0;

  if (hasSkipTenant || hasAuthGuard) {
    return [];
  }

  const lines = fileContent.split('\n');
  const violations: Violation[] = [];

  lines.forEach((line, index) => {
    const match = line.match(/^\s*import\s+.+\s+from\s+['"](\.{1,2}\/[^'"]*services\/[^'"]+)['"]/);
    if (!match) {
      return;
    }

    violations.push({
      file: relativePath,
      line: index + 1,
      rule: 'UNGUARDED_SERVICE_ORCHESTRATION_RISK',
      message:
        'Controller imports local services but has no auth guard usage and no @SkipTenant() declaration (high-risk drift).',
      content: line.trim(),
    });
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

function buildReport(violations: Violation[], scannedControllerCount: number, mutatingEndpointCount: number): string {
  const lines: string[] = [];
  lines.push('Authorization Contract Report');
  lines.push('=============================');
  lines.push(`Scanned controller files: ${scannedControllerCount}`);
  lines.push(`Mutating endpoints detected: ${mutatingEndpointCount}`);
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
    .map((filePath) => toPosixPath(path.relative(process.cwd(), filePath)))
    .filter((relativePath) => shouldScanFile(relativePath));

  let mutatingEndpointCount = 0;
  let violations: Violation[] = [];

  for (const relativePath of controllerFiles) {
    const absolutePath = path.join(process.cwd(), relativePath);
    const fileContent = fs.readFileSync(absolutePath, 'utf-8');
    const metadata = extractControllerMetadata(fileContent);

    mutatingEndpointCount += metadata.methods.filter((method) => method.decorators.hasMutatingDecorator).length;

    violations = violations.concat(checkMutatingEndpoints(relativePath, metadata.classDecorators, metadata.methods));
    violations = violations.concat(
      checkSkipTenantAuthModel(relativePath, metadata.classLine, metadata.classDecorators, metadata.methods),
    );
    violations = violations.concat(
      checkUnguardedServiceOrchestrationRisk(relativePath, fileContent, metadata.classDecorators, metadata.methods),
    );
  }

  const sortedViolations = sortViolations(violations);
  const reportPath = path.join(process.cwd(), REPORT_FILE_NAME);

  if (sortedViolations.length === 0) {
    if (fs.existsSync(reportPath)) {
      fs.rmSync(reportPath);
    }
    console.log('✅ Authorization contract checks passed');
    console.log(
      `   Scanned ${controllerFiles.length} controller files; found ${mutatingEndpointCount} mutating endpoints.`,
    );
    return;
  }

  fs.writeFileSync(reportPath, buildReport(sortedViolations, controllerFiles.length, mutatingEndpointCount), 'utf-8');
  console.error(`❌ Found ${sortedViolations.length} authorization contract violation(s):\n`);
  for (const violation of sortedViolations) {
    console.error(`${violation.file}:${violation.line} [${violation.rule}]`);
    console.error(`  ${violation.content}`);
  }
  console.error(`\n📄 Report written to ${reportPath}`);
  process.exit(1);
}

main();
