import * as fs from 'node:fs';
import * as path from 'node:path';

describe('Tenant scoping in QueryBuilder usages', () => {
  it('TenantAwareRepository query builder should prevent where() from dropping tenant scope', () => {
    const repoFile = path.join(__dirname, '..', '..', 'src', 'common', 'repositories', 'tenant-aware.repository.ts');
    const content = fs.readFileSync(repoFile, 'utf8');

    expect(content).toContain('queryBuilder.where =');
    expect(content).toContain('baseAndWhere');
  });

  it('ProfileRepository createQueryBuilder should delegate to TenantAwareRepository safety patch', () => {
    const repoFile = path.join(__dirname, '..', '..', 'src', 'modules', 'hr', 'repositories', 'profile.repository.ts');
    const content = fs.readFileSync(repoFile, 'utf8');

    expect(content).toContain('createQueryBuilder(alias: string)');
    expect(content).toContain('return super.createQueryBuilder(alias);');
  });

  it('all createQueryBuilder calls should apply tenant filters or use TenantAwareRepository', () => {
    const srcDir = path.join(__dirname, '..', '..', 'src');

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

    for (const file of tsFiles) {
      const content = fs.readFileSync(file, 'utf8');
      const lines = content.split('\n');
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line.includes('.createQueryBuilder(')) {
          // Skip tenant-aware repository implementation file itself
          if (file.endsWith('tenant-aware.repository.ts')) continue;

          // Inspect next N lines for tenantId scoping
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
      const msg = `Found createQueryBuilder usages without tenant scoping:\n${failures.join('\n')}`;
      fail(msg);
    }
  });
});
