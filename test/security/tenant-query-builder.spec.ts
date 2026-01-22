import * as fs from 'node:fs';
import * as path from 'node:path';

describe('Tenant scoping in QueryBuilder usages', () => {
  it('all createQueryBuilder calls should apply tenant filters or use TenantAwareRepository', () => {
    const srcDir = path.join(__dirname, '..', '..', 'src');
    const _files = fs.readdirSync(srcDir, { withFileTypes: true });

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

          // Inspect next N lines for tenantId filter
          const window = lines.slice(i, i + 12).join('\n');
          const hasTenantFilter = /tenantId/.test(window);

          if (!hasTenantFilter) {
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
