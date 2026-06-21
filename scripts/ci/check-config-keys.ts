import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const srcDir = join(root, 'src');
const configDir = join(srcDir, 'config');

const KNOWN_BAD_CONFIG_PATTERNS: ReadonlyArray<{ pattern: RegExp; message: string }> = [
  {
    pattern: /configService\.get(?:OrThrow)?<[^>]*>\(\s*['"]auth\.jwtAccessExpires['"]/u,
    message: 'Use auth.jwtAccessExpiresSeconds (registered in auth.config.ts), not auth.jwtAccessExpires.',
  },
  {
    pattern: /configService\.get(?:OrThrow)?<[^>]*>\(\s*['"]auth\.jwtRefreshExpires['"]/u,
    message: 'Use auth.jwtRefreshExpiresDays (registered in auth.config.ts), not auth.jwtRefreshExpires.',
  },
];

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

function walkTsFiles(directory: string): string[] {
  const entries = readdirSync(directory, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const fullPath = join(directory, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === 'dist') {
        continue;
      }
      files.push(...walkTsFiles(fullPath));
      continue;
    }

    if (entry.isFile() && entry.name.endsWith('.ts') && !entry.name.endsWith('.spec.ts')) {
      files.push(fullPath);
    }
  }

  return files;
}

function flattenRegisteredKeys(value: unknown, prefix: string, keys: Set<string>): void {
  if (value === null || value === undefined) {
    return;
  }

  if (Array.isArray(value)) {
    return;
  }

  if (typeof value === 'object') {
    for (const [key, nestedValue] of Object.entries(value)) {
      const nextPrefix = prefix ? `${prefix}.${key}` : key;
      if (nestedValue !== null && typeof nestedValue === 'object' && !Array.isArray(nestedValue)) {
        flattenRegisteredKeys(nestedValue, nextPrefix, keys);
      } else {
        keys.add(nextPrefix);
      }
    }
  }
}

function loadRegisteredConfigKeys(): Set<string> {
  const keys = new Set<string>();
  const configFiles = readdirSync(configDir).filter((fileName) => fileName.endsWith('.config.ts'));

  for (const fileName of configFiles) {
    const contents = readFileSync(join(configDir, fileName), 'utf8');
    const namespaceMatch = contents.match(/registerAs\(\s*['"]([^'"]+)['"]/u);
    if (!namespaceMatch?.[1]) {
      continue;
    }

    const namespace = namespaceMatch[1];
    const returnMatch = contents.match(/registerAs\(\s*['"][^'"]+['"]\s*,\s*\(\)\s*=>\s*\(\{([\s\S]*?)\}\)\s*\)/u);
    if (!returnMatch?.[1]) {
      continue;
    }

    const objectBody = `{${returnMatch[1]}}`;
    try {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call -- CI script evaluates static config object literals.
      const parsed = Function(`"use strict"; return (${objectBody});`)() as Record<string, unknown>;
      flattenRegisteredKeys(parsed, namespace, keys);
    } catch {
      // Fall back to top-level key scan when the config factory uses helpers.
      const topLevelKeys = [...objectBody.matchAll(/^\s*([A-Za-z0-9_]+)\s*:/gmu)].map((match) => match[1]);
      for (const key of topLevelKeys) {
        keys.add(`${namespace}.${key}`);
      }
    }
  }

  return keys;
}

const registeredKeys = loadRegisteredConfigKeys();
const violations: string[] = [];

for (const filePath of walkTsFiles(srcDir)) {
  const relativePath = filePath.slice(root.length + 1);
  const contents = readFileSync(filePath, 'utf8');

  for (const { pattern, message } of KNOWN_BAD_CONFIG_PATTERNS) {
    if (pattern.test(contents)) {
      violations.push(`${relativePath}: ${message}`);
    }
  }

  const configGetMatches = contents.matchAll(/configService\.get(?:OrThrow)?(?:<[^>]*>)?\(\s*['"]([^'"]+)['"]/gu);
  for (const match of configGetMatches) {
    const key = match[1];
    if (!key || !key.includes('.')) {
      continue;
    }

    const namespace = key.split('.')[0];
    const hasRegisteredNamespace = [...registeredKeys].some((registeredKey) =>
      registeredKey.startsWith(`${namespace}.`),
    );
    if (!hasRegisteredNamespace || registeredKeys.has(key)) {
      continue;
    }

    const leaf = key.split('.').slice(1).join('.');
    const sibling = [...registeredKeys].find(
      (registeredKey) => registeredKey.startsWith(`${namespace}.`) && registeredKey.endsWith(leaf),
    );
    if (sibling) {
      violations.push(`${relativePath}: configService.get('${key}') — did you mean '${sibling}'?`);
    }
  }
}

if (violations.length > 0) {
  fail(`Config key safety violations:\n${violations.map((violation) => `- ${violation}`).join('\n')}`);
}

console.info('Config key safety check passed.');
