import * as fs from 'node:fs';
import * as path from 'node:path';

interface Violation {
  file: string;
  line: number;
  rule: string;
  content: string;
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

function checkFile(filePath: string): Violation[] {
  const violations: Violation[] = [];
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  const isSecuritySensitive = /\/(auth|platform)\//.test(filePath);
  const isEntityFile = /\/entities\//.test(filePath);

  lines.forEach((line, index) => {
    const trimmed = line.trim();

    if (trimmed.startsWith('//') || trimmed.startsWith('*')) {
      return;
    }

    if (isSecuritySensitive && trimmed.includes('Math.random(')) {
      violations.push({
        file: filePath,
        line: index + 1,
        rule: 'SECURITY_RANDOMNESS',
        content: trimmed,
      });
    }

    if (isEntityFile && /name:\s*'session_token'/.test(trimmed)) {
      violations.push({
        file: filePath,
        line: index + 1,
        rule: 'PLAINTEXT_SESSION_TOKEN_COLUMN',
        content: trimmed,
      });
    }

    if (isEntityFile && /name:\s*'refresh_token'/.test(trimmed)) {
      violations.push({
        file: filePath,
        line: index + 1,
        rule: 'PLAINTEXT_REFRESH_TOKEN_COLUMN',
        content: trimmed,
      });
    }
  });

  return violations;
}

function main(): void {
  const srcDir = path.join(process.cwd(), 'src');
  if (!fs.existsSync(srcDir)) {
    console.error('ERROR: src directory not found. Run from project root.');
    process.exit(1);
  }

  const files = getAllFiles(srcDir);
  const violations = files.flatMap((file) => checkFile(file));

  if (violations.length === 0) {
    console.log('✅ Security pattern checks passed');
    console.log(`   Scanned ${files.length} files.`);
    return;
  }

  console.error(`❌ Found ${violations.length} security pattern violation(s):\n`);
  for (const violation of violations) {
    console.error(`${violation.file}:${violation.line} [${violation.rule}]`);
    console.error(`  ${violation.content}`);
  }

  const reportPath = path.join(process.cwd(), 'security-patterns-report.txt');
  fs.writeFileSync(
    reportPath,
    violations.map((v) => `${v.file}:${v.line} [${v.rule}] ${v.content}`).join('\n'),
    'utf-8',
  );

  console.error(`\n📄 Report written to ${reportPath}`);
  process.exit(1);
}

main();
