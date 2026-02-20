import * as fs from 'node:fs';
import * as path from 'node:path';

const EXCLUDED_DIRS = new Set(['node_modules', 'dist', 'coverage', '.git']);
const REPORT_FILE_NAME = 'tenant-contract-report.txt';

const GLOBAL_MODULE_ALLOWLIST_PREFIXES = [
  'src/modules/platform/',
  'src/modules/tenants/',
  'src/modules/health/',
  'src/modules/metrics/',
];

const RAW_REPOSITORY_ALLOWLIST = [
  {
    kind: 'entity',
    value: 'Tenant',
    reason: 'Tenant table is global metadata and must be resolved outside tenant-scoped repositories.',
  },
  {
    kind: 'entity',
    value: 'OutboxEvent',
    reason: 'Outbox relay is infrastructure-level and not tenant-owned domain persistence.',
  },
  {
    kind: 'pathPrefix',
    value: 'src/modules/platform/',
    reason: 'Platform module operates cross-tenant with explicit target tenant controls.',
  },
  {
    kind: 'pathPrefix',
    value: 'src/modules/tenants/',
    reason: 'Tenant lifecycle management is global and cannot be tenant-scoped by repository base.',
  },
  {
    kind: 'pathExact',
    value: 'src/modules/client-portal/decorators/validate-tenant-slug.decorator.ts',
    reason: 'Slug middleware resolves Tenant identity for public routes before tenant context is established.',
  },
  {
    kind: 'pathExact',
    value: 'src/common/services/outbox-relay.service.ts',
    reason: 'Outbox relay is a global publisher loop and intentionally uses raw outbox repository access.',
  },
] as const;

// File-path specific allowlist for RAW_REPOSITORY_IN_TENANT_MODULE violations
// These are exceptional cases that require explicit rationale and CI approval
const FILE_PATH_ALLOWLIST: { path: string; reason: string }[] = [
  {
    path: 'src/modules/audit/audit.processor.ts',
    reason: 'TEMP baseline allowlist (tenant-consistency-stabilization Tasks 7-11)',
  },
  {
    path: 'src/modules/billing/services/subscription.service.ts',
    reason: 'TEMP baseline allowlist (tenant-consistency-stabilization Tasks 7-11)',
  },
  {
    path: 'src/modules/finance/services/payout-relay.service.ts',
    reason: 'TEMP baseline allowlist (tenant-consistency-stabilization Tasks 7-11)',
  },
  {
    path: 'src/modules/finance/services/purchase-invoices.service.ts',
    reason: 'TEMP baseline allowlist (tenant-consistency-stabilization Tasks 7-11)',
  },
  {
    path: 'src/modules/finance/services/transaction-categories.service.ts',
    reason: 'TEMP baseline allowlist (tenant-consistency-stabilization Tasks 7-11)',
  },
  {
    path: 'src/modules/finance/services/vendors.service.ts',
    reason: 'TEMP baseline allowlist (tenant-consistency-stabilization Tasks 7-11)',
  },
  {
    path: 'src/modules/hr/services/task-type-eligibility.service.ts',
    reason: 'TEMP baseline allowlist (tenant-consistency-stabilization Tasks 7-11)',
  },
  {
    path: 'src/modules/mail/services/mail-template.service.ts',
    reason: 'TEMP baseline allowlist (tenant-consistency-stabilization Tasks 7-11)',
  },
  {
    path: 'src/modules/privacy/consent.service.ts',
    reason: 'TEMP baseline allowlist (tenant-consistency-stabilization Tasks 7-11)',
  },
  {
    path: 'src/modules/tasks/services/tasks-export.service.ts',
    reason: 'TEMP baseline allowlist (tenant-consistency-stabilization Tasks 7-11)',
  },
  {
    path: 'src/modules/tasks/services/time-entries.service.ts',
    reason: 'TEMP baseline allowlist (tenant-consistency-stabilization Tasks 7-11)',
  },
  {
    path: 'src/modules/users/services/users.service.ts',
    reason: 'TEMP baseline allowlist (tenant-consistency-stabilization Tasks 7-11)',
  },
];

const SKIP_TENANT_EXPLICIT_CONTEXT_ALLOWLIST = new Set([
  'src/modules/health/health.controller.ts',
  'src/modules/metrics/metrics.controller.ts',
  'src/modules/auth/auth.controller.ts',
  'src/modules/platform/controllers/platform-auth.controller.ts',
  'src/modules/platform/controllers/mfa.controller.ts',
  'src/modules/platform/controllers/mfa-login.controller.ts',
]);

interface SkipTenantMethodContract {
  methodName: string;
  tenantScopedCallPatterns: RegExp[];
}

interface SkipTenantUsageAllowlistEntry {
  reason: string;
  allowClassDecorator?: boolean;
  methods?: string[];
}

const SKIP_TENANT_USAGE_ALLOWLIST: Record<string, SkipTenantUsageAllowlistEntry> = {
  'src/modules/auth/auth.controller.ts': {
    reason: 'Auth bootstrap and recovery endpoints must run before tenant context is established.',
    methods: [
      'register',
      'login',
      'refreshTokens',
      'verifyMfaTotp',
      'verifyMfaRecovery',
      'forgotPassword',
      'resetPassword',
      'verifyEmail',
      'resendVerification',
    ],
  },
  'src/modules/billing/controllers/billing.controller.ts': {
    reason:
      'Stripe webhook controller validates signatures and derives tenant through billing linkage, not request tenant input.',
    allowClassDecorator: true,
  },
  'src/modules/client-portal/client-portal.controller.ts': {
    reason:
      'Client portal is public-entry auth and tenant derivation via slug/token, with explicit TenantContextService.run for tenant-scoped calls.',
    allowClassDecorator: true,
  },
  'src/modules/health/health.controller.ts': {
    reason: 'Health probes are infrastructure/global and do not operate on tenant-owned domain persistence.',
    allowClassDecorator: true,
  },
  'src/modules/metrics/metrics.controller.ts': {
    reason: 'Metrics endpoints are global platform telemetry and intentionally tenant-agnostic.',
    allowClassDecorator: true,
  },
  'src/modules/platform/controllers/mfa-login.controller.ts': {
    reason: 'Platform control-plane login MFA endpoint is global and not tenant-scoped.',
    allowClassDecorator: true,
  },
  'src/modules/platform/controllers/mfa.controller.ts': {
    reason: 'Platform control-plane MFA management is global and not tenant-scoped.',
    allowClassDecorator: true,
  },
  'src/modules/platform/controllers/platform-analytics.controller.ts': {
    reason: 'Platform control-plane analytics is global and uses explicit target-tenant context when needed.',
    allowClassDecorator: true,
  },
  'src/modules/platform/controllers/platform-audit.controller.ts': {
    reason: 'Platform control-plane audit log access is global compliance scope, not tenant request scope.',
    allowClassDecorator: true,
  },
  'src/modules/platform/controllers/platform-auth.controller.ts': {
    reason: 'Platform control-plane auth endpoints are global bootstrap/session flows.',
    allowClassDecorator: true,
  },
  'src/modules/platform/controllers/platform-security.controller.ts': {
    reason:
      'Platform security operations are global entry points and explicitly establish tenant context for targeted actions.',
    allowClassDecorator: true,
  },
  'src/modules/platform/controllers/platform-support.controller.ts': {
    reason: 'Platform support/impersonation endpoints are control-plane operations outside tenant guard scope.',
    allowClassDecorator: true,
  },
  'src/modules/platform/controllers/platform-tenants.controller.ts': {
    reason:
      'Platform tenant lifecycle management is global metadata/control-plane and not tenant-scoped by request context.',
    allowClassDecorator: true,
  },
  'src/modules/platform/controllers/platform-time-entries.controller.ts': {
    reason: 'Platform support time-entry endpoints use explicit target tenant context for tenant-specific operations.',
    allowClassDecorator: true,
  },
};

const SKIP_TENANT_METHOD_CONTRACTS: Record<string, SkipTenantMethodContract[]> = {
  'src/modules/client-portal/client-portal.controller.ts': [
    {
      methodName: 'getMyBookings',
      tenantScopedCallPatterns: [/this\.clientPortalService\.getMyBookingsPaginated\s*\(/],
    },
    { methodName: 'getBooking', tenantScopedCallPatterns: [/this\.clientPortalService\.getBooking\s*\(/] },
    { methodName: 'createBooking', tenantScopedCallPatterns: [/this\.clientPortalService\.createBooking\s*\(/] },
    { methodName: 'cancelBooking', tenantScopedCallPatterns: [/this\.clientPortalService\.cancelMyBooking\s*\(/] },
    { methodName: 'updateProfile', tenantScopedCallPatterns: [/this\.clientsService\.update\s*\(/] },
    {
      methodName: 'updateNotificationPreferences',
      tenantScopedCallPatterns: [/this\.clientsService\.update\s*\(/],
    },
    { methodName: 'getNotifications', tenantScopedCallPatterns: [/this\.notificationService\.findByClient\s*\(/] },
  ],
  'src/modules/platform/controllers/platform-time-entries.controller.ts': [
    { methodName: 'list', tenantScopedCallPatterns: [/this\.service\.list\s*\(/] },
    { methodName: 'findOne', tenantScopedCallPatterns: [/this\.service\.findOne\s*\(/] },
    { methodName: 'update', tenantScopedCallPatterns: [/this\.service\.update\s*\(/] },
  ],
  'src/modules/platform/controllers/platform-analytics.controller.ts': [
    { methodName: 'getTenantHealth', tenantScopedCallPatterns: [/this\.analyticsService\.getTenantHealth\s*\(/] },
  ],
  'src/modules/platform/controllers/platform-security.controller.ts': [
    { methodName: 'forcePasswordReset', tenantScopedCallPatterns: [/this\.securityService\.forcePasswordReset\s*\(/] },
    { methodName: 'revokeSessions', tenantScopedCallPatterns: [/this\.securityService\.revokeAllSessions\s*\(/] },
    { methodName: 'updateIpAllowlist', tenantScopedCallPatterns: [/this\.securityService\.updateIpAllowlist\s*\(/] },
    { methodName: 'initiateDataExport', tenantScopedCallPatterns: [/this\.securityService\.initiateDataExport\s*\(/] },
    {
      methodName: 'initiateDataDeletion',
      tenantScopedCallPatterns: [/this\.securityService\.initiateDataDeletion\s*\(/],
    },
    { methodName: 'getTenantRiskScore', tenantScopedCallPatterns: [/this\.securityService\.getTenantRiskScore\s*\(/] },
  ],
};

type RuleId =
  | 'TENANT_ID_FROM_REQUEST'
  | 'RAW_REPOSITORY_IN_TENANT_MODULE'
  | 'SKIP_TENANT_USAGE'
  | 'SKIP_TENANT_EXPLICIT_CONTEXT';
type Severity = 'violation' | 'warning';

const RULE_ORDER: RuleId[] = [
  'TENANT_ID_FROM_REQUEST',
  'RAW_REPOSITORY_IN_TENANT_MODULE',
  'SKIP_TENANT_EXPLICIT_CONTEXT',
  'SKIP_TENANT_USAGE',
];

interface Finding {
  file: string;
  line: number;
  rule: RuleId;
  severity: Severity;
  message: string;
  content: string;
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

    if (entry.endsWith('.ts') && !entry.endsWith('.spec.ts') && !entry.endsWith('.d.ts')) {
      files.push(fullPath);
    }
  }

  return files;
}

function isCommentLine(line: string): boolean {
  const trimmed = line.trim();
  return trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*') || trimmed.startsWith('*/');
}

function isControllerOrService(file: string): boolean {
  return (
    file.includes('/controllers/') ||
    file.includes('/services/') ||
    file.endsWith('.controller.ts') ||
    file.endsWith('.service.ts')
  );
}

function isInGlobalAllowlistModule(file: string): boolean {
  return GLOBAL_MODULE_ALLOWLIST_PREFIXES.some((prefix) => file.startsWith(prefix));
}

function shouldCheckTenantIdFromRequest(file: string): boolean {
  if (!file.startsWith('src/modules/')) {
    return false;
  }

  if (!isControllerOrService(file)) {
    return false;
  }

  return !isInGlobalAllowlistModule(file);
}

function isRawRepositoryAllowlisted(file: string, entityName?: string): boolean {
  for (const entry of RAW_REPOSITORY_ALLOWLIST) {
    if (entry.kind === 'entity' && entityName && entry.value === entityName) {
      return true;
    }
    if (entry.kind === 'pathPrefix' && file.startsWith(entry.value)) {
      return true;
    }
    if (entry.kind === 'pathExact' && file === entry.value) {
      return true;
    }
  }

  for (const entry of FILE_PATH_ALLOWLIST) {
    if (file === entry.path) {
      return true;
    }
  }

  return false;
}

function shouldCheckRawRepositoryContract(file: string): boolean {
  const inModuleOrCommon = file.startsWith('src/modules/') || file.startsWith('src/common/');
  if (!inModuleOrCommon) {
    return false;
  }

  if (isInGlobalAllowlistModule(file)) {
    return false;
  }

  if (isRawRepositoryAllowlisted(file)) {
    return false;
  }

  return true;
}

function collectTenantOwnedEntities(files: string[]): Set<string> {
  const tenantOwned = new Set<string>();

  for (const file of files) {
    const rel = toPosixPath(path.relative(process.cwd(), file));
    if (!rel.endsWith('.entity.ts')) {
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

function isControllerFile(file: string): boolean {
  return file.includes('/controllers/') || file.endsWith('.controller.ts');
}

function isServiceFile(file: string): boolean {
  return file.includes('/services/') || file.endsWith('.service.ts');
}

function getLineNumberForIndex(fileContent: string, index: number): number {
  let line = 1;
  for (let i = 0; i < index; i += 1) {
    if (fileContent[i] === '\n') {
      line += 1;
    }
  }
  return line;
}

function findMethodSpan(
  fileContent: string,
  methodName: string,
): { startIndex: number; openBraceIndex: number; endIndex: number } | null {
  const signatureRegex = new RegExp(`^\\s*(?:public|private|protected\\s+)?(?:async\\s+)?${methodName}\\s*\\(`, 'm');
  const signatureMatch = signatureRegex.exec(fileContent);
  if (!signatureMatch || signatureMatch.index === undefined) {
    return null;
  }

  const startIndex = signatureMatch.index;
  const openBraceIndex = fileContent.indexOf('{', startIndex);
  if (openBraceIndex === -1) {
    return null;
  }

  let depth = 0;
  for (let i = openBraceIndex; i < fileContent.length; i += 1) {
    const ch = fileContent[i];
    if (ch === '{') {
      depth += 1;
    } else if (ch === '}') {
      depth -= 1;
      if (depth === 0) {
        return { startIndex, openBraceIndex, endIndex: i };
      }
    }
  }

  return null;
}

function findSkipTenantExplicitContextFindings(relPath: string, fileContent: string, lines: string[]): Finding[] {
  const findings: Finding[] = [];
  if (!isControllerFile(relPath)) {
    return findings;
  }

  if (SKIP_TENANT_EXPLICIT_CONTEXT_ALLOWLIST.has(relPath)) {
    return findings;
  }

  if (!/@SkipTenant\s*\(/.test(fileContent)) {
    return findings;
  }

  const methodContracts = SKIP_TENANT_METHOD_CONTRACTS[relPath] ?? [];
  for (const contract of methodContracts) {
    const methodSpan = findMethodSpan(fileContent, contract.methodName);
    if (!methodSpan) {
      continue;
    }

    const methodBody = fileContent.slice(methodSpan.openBraceIndex + 1, methodSpan.endIndex);
    const touchesTenantScopedCall = contract.tenantScopedCallPatterns.some((pattern) => pattern.test(methodBody));
    if (!touchesTenantScopedCall) {
      continue;
    }

    if (/TenantContextService\.run\s*\(/.test(methodBody)) {
      continue;
    }

    const line = getLineNumberForIndex(fileContent, methodSpan.startIndex);
    findings.push({
      file: relPath,
      line,
      rule: 'SKIP_TENANT_EXPLICIT_CONTEXT',
      severity: 'violation',
      message:
        `@SkipTenant() method \`${contract.methodName}\` touches tenant-scoped dependencies without explicit ` +
        'TenantContextService.run(tenantId, ...).',
      content: lines[line - 1]?.trim() ?? contract.methodName,
    });
  }

  return findings;
}

function resolveSkipTenantDecoratorTarget(
  lines: string[],
  decoratorLineIndex: number,
): { type: 'class'; name: string } | { type: 'method'; name: string } | { type: 'unknown' } {
  for (let i = decoratorLineIndex + 1; i < lines.length; i += 1) {
    const trimmed = lines[i]?.trim() ?? '';
    if (!trimmed || isCommentLine(trimmed)) {
      continue;
    }

    if (trimmed.startsWith('@')) {
      continue;
    }

    const classMatch = trimmed.match(/^(?:export\s+)?class\s+([A-Za-z0-9_]+)/);
    if (classMatch?.[1]) {
      return { type: 'class', name: classMatch[1] };
    }

    const methodMatch = trimmed.match(/^(?:public\s+|private\s+|protected\s+)?(?:async\s+)?([A-Za-z0-9_]+)\s*\(/);
    if (methodMatch?.[1]) {
      return { type: 'method', name: methodMatch[1] };
    }
  }

  return { type: 'unknown' };
}

function isSkipTenantUsageAllowlisted(
  relPath: string,
  target: { type: 'class'; name: string } | { type: 'method'; name: string } | { type: 'unknown' },
): boolean {
  const allowlist = SKIP_TENANT_USAGE_ALLOWLIST[relPath];
  if (!allowlist) {
    return false;
  }

  if (target.type === 'class') {
    return Boolean(allowlist.allowClassDecorator);
  }

  if (target.type === 'method') {
    return (allowlist.methods ?? []).includes(target.name);
  }

  return false;
}

function findSkipTenantFindings(relPath: string, lines: string[]): Finding[] {
  const findings: Finding[] = [];
  if (!isControllerFile(relPath)) {
    return findings;
  }

  lines.forEach((line, index) => {
    if (isCommentLine(line)) {
      return;
    }
    if (/@SkipTenant\s*\(/.test(line)) {
      const target = resolveSkipTenantDecoratorTarget(lines, index);
      if (isSkipTenantUsageAllowlisted(relPath, target)) {
        return;
      }

      findings.push({
        file: relPath,
        line: index + 1,
        rule: 'SKIP_TENANT_USAGE',
        severity: 'warning',
        message: 'Controller uses @SkipTenant(); endpoint must be explicitly reviewed and classified.',
        content: line.trim(),
      });
    }
  });

  return findings;
}

function findTenantIdFromRequestFindings(relPath: string, lines: string[]): Finding[] {
  const findings: Finding[] = [];

  if (!shouldCheckTenantIdFromRequest(relPath)) {
    return findings;
  }

  lines.forEach((line, index) => {
    if (isCommentLine(line)) {
      return;
    }

    const trimmed = line.trim();
    const nextLine = lines[index + 1]?.trim() ?? '';
    const nextNextLine = lines[index + 2]?.trim() ?? '';
    const window = `${trimmed} ${nextLine} ${nextNextLine}`;

    const decoratorReadsTenantId =
      /@(Body|Query)\s*\(\s*['"`]tenantId['"`]\s*\)/.test(window) ||
      /@(Body|Query)\s*\([^)]*\)\s*(?:public|private|protected|readonly\s+)?tenantId\b/.test(window);
    const dtoBodyQueryDotTenantId = /\b(dto|body|query)\s*\.\s*tenantId\b/.test(trimmed);
    const dtoBodyQueryDestructureTenantId = /\{[^}]*\btenantId\b[^}]*\}\s*=\s*(dto|body|query)\b/.test(trimmed);

    if (decoratorReadsTenantId || dtoBodyQueryDotTenantId || dtoBodyQueryDestructureTenantId) {
      findings.push({
        file: relPath,
        line: index + 1,
        rule: 'TENANT_ID_FROM_REQUEST',
        severity: 'violation',
        message:
          'Tenant-scoped controller/service reads tenantId from DTO/body/query; derive tenant from context instead.',
        content: trimmed,
      });
    }
  });

  return findings;
}

function findRawRepositoryFindings(
  relPath: string,
  fileContent: string,
  lines: string[],
  tenantOwnedEntities: Set<string>,
): Finding[] {
  const findings: Finding[] = [];

  if (!shouldCheckRawRepositoryContract(relPath)) {
    return findings;
  }

  const extendsTenantAwareRepository = /extends\s+TenantAwareRepository\s*</.test(fileContent);
  const controllerFile = isControllerFile(relPath);
  const serviceFile = isServiceFile(relPath);

  lines.forEach((line, index) => {
    if (isCommentLine(line)) {
      return;
    }

    const trimmed = line.trim();
    const injectRepoMatch = trimmed.match(/@InjectRepository\(\s*([A-Za-z0-9_]+)\s*\)/);
    if (injectRepoMatch) {
      const entityName = injectRepoMatch[1];
      if (!entityName) {
        return;
      }
      const isTenantOwnedEntity = tenantOwnedEntities.has(entityName);
      const allowlisted = isRawRepositoryAllowlisted(relPath, entityName);

      if (isTenantOwnedEntity && !allowlisted && !extendsTenantAwareRepository) {
        if (controllerFile) {
          findings.push({
            file: relPath,
            line: index + 1,
            rule: 'RAW_REPOSITORY_IN_TENANT_MODULE',
            severity: 'violation',
            message: `Controller injects raw Repository<${entityName}> for tenant-owned entity.`,
            content: trimmed,
          });
        } else if (serviceFile || relPath.startsWith('src/modules/')) {
          findings.push({
            file: relPath,
            line: index + 1,
            rule: 'RAW_REPOSITORY_IN_TENANT_MODULE',
            severity: 'violation',
            message: `Service/module injects raw Repository<${entityName}>; prefer TenantAwareRepository derivative.`,
            content: trimmed,
          });
        }
      }
    }

    const hasBypassGetRepositoryCall =
      !/getRepositoryToken\s*\(/.test(trimmed) &&
      (/(?:\bdataSource\b|\bthis\.dataSource\b|\bmanager\b|\bthis\.manager\b)\s*\.\s*getRepository\s*\(/.test(
        trimmed,
      ) ||
        /\bgetRepository\s*\(\s*[^)\s]/.test(trimmed));
    if (hasBypassGetRepositoryCall && !isRawRepositoryAllowlisted(relPath)) {
      findings.push({
        file: relPath,
        line: index + 1,
        rule: 'RAW_REPOSITORY_IN_TENANT_MODULE',
        severity: 'violation',
        message: 'getRepository(...) usage in tenant-scoped module bypasses tenant-aware repository boundary.',
        content: trimmed,
      });
    }
  });

  return findings;
}

function dedupeFindings(findings: Finding[]): Finding[] {
  const seen = new Set<string>();
  const deduped: Finding[] = [];

  for (const finding of findings) {
    const key = `${finding.file}:${finding.line}:${finding.rule}:${finding.severity}:${finding.content}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    deduped.push(finding);
  }

  return deduped;
}

function groupByRule(findings: Finding[]): Map<RuleId, Finding[]> {
  const grouped = new Map<RuleId, Finding[]>();
  for (const finding of findings) {
    const existing = grouped.get(finding.rule) ?? [];
    existing.push(finding);
    grouped.set(finding.rule, existing);
  }
  return grouped;
}

function buildReport(
  violations: Finding[],
  warnings: Finding[],
  scannedFileCount: number,
  tenantOwnedEntityCount: number,
): string {
  const groupedViolations = groupByRule(violations);
  const groupedWarnings = groupByRule(warnings);

  const lines: string[] = [];
  lines.push('Tenant Contract Report');
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push(`Scanned files: ${scannedFileCount}`);
  lines.push(`Tenant-owned entities detected: ${tenantOwnedEntityCount}`);
  lines.push(`Violations (fail): ${violations.length}`);
  lines.push(`Warnings (no fail): ${warnings.length}`);
  lines.push('');

  lines.push('Violations (fail):');
  for (const rule of RULE_ORDER) {
    const entries = groupedViolations.get(rule) ?? [];
    lines.push(`${rule} (${entries.length})`);
    for (const entry of entries) {
      lines.push(`- ${entry.file}:${entry.line} ${entry.message}`);
      lines.push(`  ${entry.content}`);
    }
    lines.push('');
  }

  lines.push('Warnings (no fail):');
  for (const rule of RULE_ORDER) {
    const entries = groupedWarnings.get(rule) ?? [];
    lines.push(`${rule} (${entries.length})`);
    for (const entry of entries) {
      lines.push(`- ${entry.file}:${entry.line} ${entry.message}`);
      lines.push(`  ${entry.content}`);
    }
    lines.push('');
  }

  lines.push('Allowlist (explicit and conservative):');
  for (const item of RAW_REPOSITORY_ALLOWLIST) {
    lines.push(`- ${item.kind}:${item.value} -> ${item.reason}`);
  }
  for (const item of FILE_PATH_ALLOWLIST) {
    lines.push(`- path:${item.path} -> ${item.reason}`);
  }
  for (const [filePath, item] of Object.entries(SKIP_TENANT_USAGE_ALLOWLIST)) {
    if (item.allowClassDecorator) {
      lines.push(`- skipTenantClass:${filePath} -> ${item.reason}`);
    }
    for (const methodName of item.methods ?? []) {
      lines.push(`- skipTenantMethod:${filePath}#${methodName} -> ${item.reason}`);
    }
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
  let findings: Finding[] = [];

  for (const file of files) {
    const relPath = toPosixPath(path.relative(process.cwd(), file));
    const fileContent = fs.readFileSync(file, 'utf-8');
    const lines = fileContent.split('\n');

    findings = findings.concat(findTenantIdFromRequestFindings(relPath, lines));
    findings = findings.concat(findRawRepositoryFindings(relPath, fileContent, lines, tenantOwnedEntities));
    findings = findings.concat(findSkipTenantExplicitContextFindings(relPath, fileContent, lines));
    findings = findings.concat(findSkipTenantFindings(relPath, lines));
  }

  findings = dedupeFindings(findings);
  const violations = findings.filter((entry) => entry.severity === 'violation');
  const warnings = findings.filter((entry) => entry.severity === 'warning');

  const reportPath = path.join(process.cwd(), REPORT_FILE_NAME);
  fs.writeFileSync(reportPath, buildReport(violations, warnings, files.length, tenantOwnedEntities.size), 'utf-8');

  if (violations.length === 0) {
    console.log('✅ Tenant contract checks passed');
    console.log(`   Scanned ${files.length} files.`);
    console.log(`   Tenant-owned entities detected: ${tenantOwnedEntities.size}`);
    console.log(`   Warnings: ${warnings.length}`);
    if (warnings.length > 0) {
      console.log(`   Report written to ${reportPath}`);
    }
    return;
  }

  console.error(`❌ Found ${violations.length} tenant contract violation(s) and ${warnings.length} warning(s):\n`);
  for (const violation of violations) {
    console.error(`${violation.file}:${violation.line} [${violation.rule}]`);
    console.error(`  ${violation.content}`);
  }

  console.error(`\n📄 Report written to ${reportPath}`);
  process.exit(1);
}

main();
