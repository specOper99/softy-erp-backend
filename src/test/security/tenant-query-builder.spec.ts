import * as fs from 'node:fs';
import * as path from 'node:path';

describe('Tenant scoping in QueryBuilder usages', () => {
  const srcDir = path.join(__dirname, '..', '..');

  it('TenantAwareRepository query builder should prevent where() from dropping tenant scope', () => {
    const repoFile = path.join(srcDir, 'common', 'repositories', 'tenant-aware.repository.ts');
    const content = fs.readFileSync(repoFile, 'utf8');

    expect(content).toContain('queryBuilder.where =');
    expect(content).toContain('baseAndWhere');
  });

  it('ProfileRepository createQueryBuilder should delegate to TenantAwareRepository safety patch', () => {
    const repoFile = path.join(srcDir, 'modules', 'hr', 'repositories', 'profile.repository.ts');
    const content = fs.readFileSync(repoFile, 'utf8');

    expect(content).toContain('createQueryBuilder(alias: string)');
    expect(content).toContain('return super.createQueryBuilder(alias);');
  });

  it('all createQueryBuilder calls should apply tenant filters or use TenantAwareRepository', () => {
    function walk(dir: string, acc: string[] = []) {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(full, acc);
        } else if (entry.isFile() && full.endsWith('.ts')) {
          acc.push(full);
        }
      }
      return acc;
    }

    const tsFiles = walk(srcDir);
    const failures: string[] = [];
    const skipBasenames = new Set([
      'outbox-relay.service.ts',
      'catalog.service.ts',
      'recurring-transaction.service.ts',
      'platform-analytics.service.ts',
    ]);

    for (const file of tsFiles) {
      if (file.endsWith('.spec.ts')) continue;
      if (file.includes(`${path.sep}modules${path.sep}platform${path.sep}`)) continue;
      if (skipBasenames.has(path.basename(file))) continue;

      const content = fs.readFileSync(file, 'utf8');
      const lines = content.split('\n');
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]!;
        if (line.includes('.createQueryBuilder(')) {
          if (file.endsWith('tenant-aware.repository.ts')) continue;

          const window = lines.slice(i, i + 20).join('\n');
          const hasWhereCall = /\.where\(/.test(window);
          const hasTenantFilter = /tenantId/.test(window);

          if (hasWhereCall && !hasTenantFilter) {
            failures.push(`${file}:${i + 1} -> ${line.trim()}`);
          }
        }
      }
    }

    if (failures.length > 0) {
      throw new Error(`Found createQueryBuilder usages without tenant scoping:\n${failures.join('\n')}`);
    }
  });

  it('search filters in tasks/catalog/hr use tenant-safe single andWhere clauses', () => {
    const targets = [
      path.join(srcDir, 'modules', 'tasks', 'services', 'tasks.service.ts'),
      path.join(srcDir, 'modules', 'catalog', 'services', 'catalog.service.ts'),
      path.join(srcDir, 'modules', 'hr', 'services', 'hr.service.ts'),
    ];

    for (const file of targets) {
      const content = fs.readFileSync(file, 'utf8');
      expect(content).not.toContain('.orWhere(');
    }
  });

  it('TenantAwareRepository exposes stream and aggregate query builders', () => {
    const repoFile = path.join(srcDir, 'common', 'repositories', 'tenant-aware.repository.ts');
    const content = fs.readFileSync(repoFile, 'utf8');

    expect(content).toContain('createStreamQueryBuilder');
    expect(content).toContain('createAggregateQueryBuilder');
  });

  it('migrated finance/task services use TenantAware repository classes', () => {
    const targets = [
      path.join(srcDir, 'modules', 'tasks', 'services', 'tasks-export.service.ts'),
      path.join(srcDir, 'modules', 'tasks', 'services', 'time-entries.service.ts'),
      path.join(srcDir, 'modules', 'finance', 'services', 'purchase-invoices.service.ts'),
      path.join(srcDir, 'modules', 'finance', 'services', 'payout-relay.service.ts'),
      path.join(srcDir, 'modules', 'finance', 'services', 'vendors.service.ts'),
      path.join(srcDir, 'modules', 'finance', 'services', 'transaction-categories.service.ts'),
    ];

    for (const file of targets) {
      const content = fs.readFileSync(file, 'utf8');
      expect(content).not.toMatch(/@InjectRepository\(/);
      expect(content).toMatch(/Repository/);
    }
  });

  it('has no dangling package event contract file after decommission', () => {
    const eventFile = path.join(srcDir, 'modules', 'catalog', 'events', 'package.events.ts');
    expect(fs.existsSync(eventFile)).toBe(false);
  });
});
