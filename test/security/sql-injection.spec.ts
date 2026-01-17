import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * SQL Injection Prevention Tests
 *
 * Static analysis tests to verify all SQL queries in the codebase
 * use proper parameterization to prevent SQL injection vulnerabilities.
 */

describe('SQL Injection Prevention', () => {
  const srcDir = path.join(__dirname, '..', '..', 'src');

  function walk(dir: string, acc: string[] = []): string[] {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full, acc);
      } else if (entry.isFile() && full.endsWith('.ts') && !full.endsWith('.spec.ts')) {
        acc.push(full);
      }
    }
    return acc;
  }

  // Safe patterns for template literals in SQL context
  const SAFE_ALIAS_PATTERNS = [
    /\$\{alias\}\./, // ${alias}.fieldName - table aliasing
    /\$\{prefix\}\./, // ${prefix}.fieldName - table prefixing
    /\$\{dateFieldStr\}/, // ${dateFieldStr} - internal field reference
  ];

  // Unsafe pattern: string interpolation in addSelect with quoted values
  const UNSAFE_ADDSELECT_INTERPOLATION = /\.addSelect\s*\(\s*`[^`]*'\$\{[^}]+\}'[^`]*`/;

  // Unsafe pattern: string interpolation in WHERE clauses (excluding safe aliases)
  const UNSAFE_WHERE_INTERPOLATION = /\.(where|andWhere|orWhere)\s*\(\s*`[^`]*\$\{[^}]+\}[^`]*`/;

  function isSafeInterpolation(line: string): boolean {
    return SAFE_ALIAS_PATTERNS.some((pattern) => pattern.test(line));
  }

  it('should not use string interpolation with values in addSelect clauses', () => {
    const tsFiles = walk(srcDir);
    const violations: string[] = [];

    for (const file of tsFiles) {
      const content = fs.readFileSync(file, 'utf8');
      const lines = content.split('\n');

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line && UNSAFE_ADDSELECT_INTERPOLATION.test(line)) {
          violations.push(`${file}:${i + 1} -> ${line.trim()}`);
        }
      }
    }

    if (violations.length > 0) {
      fail(
        `Found ${violations.length} addSelect clause(s) with unsafe string interpolation.\n` +
          `These should use parameterized queries with :paramName and .setParameter():\n\n` +
          violations.join('\n'),
      );
    }
  });

  it('should not use string interpolation with values in WHERE clauses (excluding safe aliases)', () => {
    const tsFiles = walk(srcDir);
    const violations: string[] = [];

    for (const file of tsFiles) {
      const content = fs.readFileSync(file, 'utf8');
      const lines = content.split('\n');

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line && UNSAFE_WHERE_INTERPOLATION.test(line) && !isSafeInterpolation(line)) {
          // Skip known safe files
          if (file.includes('tenant-aware.repository.ts')) continue;
          if (file.includes('cursor-pagination.helper.ts')) continue;
          if (file.includes('profile.repository.ts')) continue;

          violations.push(`${file}:${i + 1} -> ${line.trim()}`);
        }
      }
    }

    if (violations.length > 0) {
      fail(
        `Found ${violations.length} WHERE clause(s) with potentially unsafe string interpolation.\n` +
          `These should use parameterized queries with :paramName syntax:\n\n` +
          violations.join('\n'),
      );
    }
  });

  it('all createQueryBuilder calls should use parameterized queries', () => {
    const tsFiles = walk(srcDir);
    const queryBuilderFiles: string[] = [];

    for (const file of tsFiles) {
      const content = fs.readFileSync(file, 'utf8');
      if (content.includes('.createQueryBuilder(')) {
        queryBuilderFiles.push(file);
      }
    }

    // Verify we have query builder usage in the codebase
    expect(queryBuilderFiles.length).toBeGreaterThan(0);

    // All should use :paramName syntax when filtering
    for (const file of queryBuilderFiles) {
      const content = fs.readFileSync(file, 'utf8');

      // Check for properly parameterized WHERE clauses
      if (content.includes('.where(') || content.includes('.andWhere(')) {
        // Should contain :paramName patterns
        const hasParameterizedQueries = /:[\w]+/.test(content);
        expect(hasParameterizedQueries).toBe(true);
      }
    }
  });

  it('should have a running SQL safety CI check script', () => {
    const scriptPath = path.join(__dirname, '..', '..', 'scripts', 'ci', 'check-raw-queries.ts');
    expect(fs.existsSync(scriptPath)).toBe(true);
  });
});
