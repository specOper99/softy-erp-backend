import * as fs from 'fs';
import * as path from 'path';

/**
 * SQL Safety Checker - CI Script
 *
 * Detects unsafe SQL patterns in TypeORM query builder usage:
 * - String interpolation in WHERE/SELECT clauses (except safe alias patterns)
 * - Raw SQL with template literals containing user-controlled potential values
 *
 * Usage: npx ts-node scripts/ci/check-raw-queries.ts
 */

// These patterns indicate string interpolation that could be unsafe
const UNSAFE_PATTERNS = [
  // Template literals with ${} in .where(), .andWhere(), .orWhere() context
  /\.(where|andWhere|orWhere)\s*\(\s*`[^`]*\$\{(?!alias)[^}]+\}[^`]*`/,
  // Template literals with ${} in .select(), .addSelect() that aren't safe alias patterns
  /\.(select|addSelect)\s*\(\s*`[^`]*\$\{(?!(alias|prefix))[^}]+\}[^`]*`/,
  // Direct string concatenation in query methods
  /\.(where|andWhere|orWhere|select|addSelect)\s*\(\s*['"][^'"]*['"]\s*\+/,
  // Template literals with enum/constant interpolation in SQL (bad practice even if safe)
  /\.(select|addSelect)\s*\(\s*`[^`]*'\$\{[^}]+\}'[^`]*`/,
];

// Safe patterns to whitelist (alias usage for table prefixing)
const SAFE_PATTERNS = [
  // ${alias}.fieldName pattern - safe for table aliasing
  /\$\{alias\}\./,
  // ${prefix}.fieldName pattern - safe for table aliasing
  /\$\{prefix\}\./,
  // ${dateFieldStr} pattern in cursor pagination - controlled internally
  /\$\{dateFieldStr\}/,
];

interface Violation {
  file: string;
  line: number;
  content: string;
  pattern: string;
}

function getAllFiles(dirPath: string, arrayOfFiles: string[] = []): string[] {
  const files = fs.readdirSync(dirPath);

  files.forEach((file) => {
    const fullPath = path.join(dirPath, file);
    if (fs.statSync(fullPath).isDirectory()) {
      // Skip node_modules, dist, coverage, .git
      if (!['node_modules', 'dist', 'coverage', '.git'].includes(file)) {
        getAllFiles(fullPath, arrayOfFiles);
      }
    } else if (file.endsWith('.ts') && !file.endsWith('.spec.ts') && !file.endsWith('.d.ts')) {
      arrayOfFiles.push(fullPath);
    }
  });

  return arrayOfFiles;
}

function isSafePattern(line: string): boolean {
  return SAFE_PATTERNS.some((pattern) => pattern.test(line));
}

function checkFile(filePath: string): Violation[] {
  const violations: Violation[] = [];
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');

  lines.forEach((line, index) => {
    // Skip comments
    if (line.trim().startsWith('//') || line.trim().startsWith('*')) {
      return;
    }

    // Check each unsafe pattern
    for (const pattern of UNSAFE_PATTERNS) {
      if (pattern.test(line)) {
        // Check if it's actually a safe pattern
        if (!isSafePattern(line)) {
          violations.push({
            file: filePath,
            line: index + 1,
            content: line.trim(),
            pattern: pattern.source,
          });
        }
      }
    }
  });

  return violations;
}

function main() {
  console.log('🔍 Checking for unsafe SQL patterns...\n');

  const srcDir = path.join(process.cwd(), 'src');

  if (!fs.existsSync(srcDir)) {
    console.error('ERROR: src directory not found. Run from project root.');
    process.exit(1);
  }

  const files = getAllFiles(srcDir);
  let allViolations: Violation[] = [];

  for (const file of files) {
    const violations = checkFile(file);
    allViolations = allViolations.concat(violations);
  }

  if (allViolations.length > 0) {
    console.error(`❌ Found ${allViolations.length} potentially unsafe SQL pattern(s):\n`);

    allViolations.forEach((v) => {
      console.error(`  ${v.file}:${v.line}`);
      console.error(`    → ${v.content}`);
      console.error('');
    });

    // Write report
    const reportPath = 'sql-safety-report.txt';
    const report = allViolations.map((v) => `${v.file}:${v.line}: ${v.content}`).join('\n');
    fs.writeFileSync(reportPath, report);
    console.error(`\n📄 Report written to ${reportPath}`);

    console.error('\n⚠️  Recommendations:');
    console.error('   - Use parameterized queries with :paramName syntax');
    console.error('   - Use .setParameter() or pass parameters object to .where()');
    console.error('   - Avoid string interpolation in SQL contexts\n');

    process.exit(1);
  } else {
    console.log('✅ No unsafe SQL patterns detected!');
    console.log(`   Scanned ${files.length} files.`);
  }
}

main();
