import * as fs from 'node:fs';
import * as path from 'node:path';

interface SkipTenantEntry {
  filePath: string;
  controllerClass: string | null;
  module: string;
  classification: 'tenant-agnostic' | 'tenant-specific-unauthenticated' | 'auth-bootstrap';
  decoratorMatches: number[];
  notes?: string;
}

interface Report {
  generatedAt: string;
  totalCount: number;
  classifications: {
    'tenant-agnostic': number;
    'tenant-specific-unauthenticated': number;
    'auth-bootstrap': number;
  };
  entries: SkipTenantEntry[];
}

function getAllFiles(dirPath: string, files: string[] = []): string[] {
  for (const entry of fs.readdirSync(dirPath)) {
    const fullPath = path.join(dirPath, entry);
    if (fs.statSync(fullPath).isDirectory()) {
      if (!['node_modules', 'dist', 'coverage', '.git'].includes(entry)) {
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

function extractControllerClass(filePath: string, content: string): string | null {
  const controllerMatch = content.match(/@Controller\([^)]*\)\nexport class (\w+Controller)/);
  if (controllerMatch && controllerMatch[1]) {
    return controllerMatch[1];
  }

  const classMatch = content.match(/export class (\w+Controller)\s*\{/);
  if (classMatch && classMatch[1]) {
    return classMatch[1];
  }

  return null;
}

function extractModule(filePath: string): string {
  const match = filePath.match(/src\/modules\/([^/]+)\//);
  return match && match[1] ? match[1] : 'unknown';
}

function classifyEndpoint(filePath: string, module: string): { classification: string; notes?: string } {
  const moduleClassification: Record<string, { classification: string; notes?: string }> = {
    health: { classification: 'tenant-agnostic', notes: 'Health check endpoints' },
    metrics: { classification: 'tenant-agnostic', notes: 'Prometheus metrics endpoint' },
    auth: { classification: 'auth-bootstrap', notes: 'Authentication bootstrap endpoints' },
    'client-portal': {
      classification: 'tenant-specific-unauthenticated',
      notes: 'Client portal with magic link auth - uses slug routes',
    },
    billing: { classification: 'tenant-agnostic', notes: 'Platform billing webhooks' },
    platform: { classification: 'tenant-agnostic', notes: 'Platform-only admin endpoints' },
  };

  const result = moduleClassification[module];
  if (result) {
    return result;
  }

  return { classification: 'tenant-agnostic', notes: `Unknown module: ${module}` };
}

function findSkipTenantOccurrences(filePath: string): number[] {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  const matches: number[] = [];

  lines.forEach((line, index) => {
    if (/@SkipTenant\(\)/.test(line)) {
      matches.push(index + 1);
    }
  });

  return matches;
}

function generateReport(): Report {
  const srcDir = path.join(process.cwd(), 'src', 'modules');

  if (!fs.existsSync(srcDir)) {
    console.error('ERROR: src/modules directory not found. Run from project root.');
    process.exit(1);
  }

  const files = getAllFiles(srcDir);
  const entries: SkipTenantEntry[] = [];

  for (const filePath of files) {
    const matches = findSkipTenantOccurrences(filePath);

    if (matches.length === 0) {
      continue;
    }

    const content = fs.readFileSync(filePath, 'utf-8');
    const controllerClass = extractControllerClass(filePath, content);
    const module = extractModule(filePath);
    const { classification, notes } = classifyEndpoint(filePath, module);

    entries.push({
      filePath: filePath.replace(process.cwd() + '/', ''),
      controllerClass,
      module,
      classification: classification as SkipTenantEntry['classification'],
      decoratorMatches: matches,
      notes,
    });
  }

  entries.sort((a, b) => a.filePath.localeCompare(b.filePath));

  const classifications = {
    'tenant-agnostic': entries.filter((e) => e.classification === 'tenant-agnostic').length,
    'tenant-specific-unauthenticated': entries.filter((e) => e.classification === 'tenant-specific-unauthenticated')
      .length,
    'auth-bootstrap': entries.filter((e) => e.classification === 'auth-bootstrap').length,
  };

  return {
    generatedAt: new Date().toISOString(),
    totalCount: entries.length,
    classifications,
    entries,
  };
}

function generateMarkdown(report: Report): string {
  const lines: string[] = [
    '# @SkipTenant() Endpoints Report',
    '',
    `Generated: ${report.generatedAt}`,
    '',
    '## Summary',
    '',
    `| Classification | Count |`,
    `|---------------|-------|`,
    `| Tenant-Agnostic | ${report.classifications['tenant-agnostic']} |`,
    `| Tenant-Specific (Unauthenticated) | ${report.classifications['tenant-specific-unauthenticated']} |`,
    `| Auth Bootstrap | ${report.classifications['auth-bootstrap']} |`,
    `| **Total** | **${report.totalCount}** |`,
    '',
    '---',
    '',
  ];

  const sections: { title: string; classification: SkipTenantEntry['classification'] }[] = [
    { title: 'Tenant-Agnostic (Health/Metrics/Platform/Billing)', classification: 'tenant-agnostic' },
    { title: 'Tenant-Specific but Unauthenticated (Client Portal)', classification: 'tenant-specific-unauthenticated' },
    { title: 'Auth Bootstrap (Register/Login/Refresh)', classification: 'auth-bootstrap' },
  ];

  for (const section of sections) {
    const sectionEntries = report.entries.filter((e) => e.classification === section.classification);

    if (sectionEntries.length === 0) {
      continue;
    }

    lines.push(`## ${section.title}`);
    lines.push('');

    for (const entry of sectionEntries) {
      lines.push(`### ${entry.controllerClass || entry.filePath.split('/').pop()}`);
      lines.push('');
      lines.push(`- **File**: \`${entry.filePath}\``);
      lines.push(`- **Module**: ${entry.module}`);
      lines.push(`- **Matches**: Lines ${entry.decoratorMatches.join(', ')}`);
      if (entry.notes) {
        lines.push(`- **Notes**: ${entry.notes}`);
      }
      lines.push('');
    }
  }

  lines.push('---');
  lines.push('*Report generated by scripts/ci/report-skip-tenant.ts*');

  return lines.join('\n');
}

function main(): void {
  const report = generateReport();

  const jsonPath = path.join(process.cwd(), 'skip-tenant-report.json');
  fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2), 'utf-8');
  console.log(`✅ JSON report written to ${jsonPath}`);

  const mdPath = path.join(process.cwd(), 'skip-tenant-report.md');
  const markdown = generateMarkdown(report);
  fs.writeFileSync(mdPath, markdown, 'utf-8');
  console.log(`✅ Markdown report written to ${mdPath}`);

  console.log(`\n📊 Summary:`);
  console.log(`   Total controllers with @SkipTenant(): ${report.totalCount}`);
  console.log(`   - Tenant-Agnostic: ${report.classifications['tenant-agnostic']}`);
  console.log(`   - Tenant-Specific (Unauthenticated): ${report.classifications['tenant-specific-unauthenticated']}`);
  console.log(`   - Auth Bootstrap: ${report.classifications['auth-bootstrap']}`);
}

main();
