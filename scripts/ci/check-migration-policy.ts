import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  extractFullMigrationTimestamp,
  getEffectiveMigrationTimestamp,
} from '../../src/database/patch-typeorm-migration-order';

type MigrationPolicyConfig = {
  grandfatheredLegacy13DigitMigrations: string[];
  grandfatheredFileClassTimestampMismatches?: Record<string, string>;
};

const root = process.cwd();
const migrationsDir = join(root, 'src', 'database', 'migrations');
const configPath = join(root, 'scripts', 'ci', 'migration-policy.config.json');
const migrationFilePattern = /^(\d+)-(.+)\.ts$/u;
const migrationClassPattern = /export class\s+([A-Za-z0-9_]+)\s+implements\s+MigrationInterface/u;

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

function readConfig(): MigrationPolicyConfig {
  return JSON.parse(readFileSync(configPath, 'utf8')) as MigrationPolicyConfig;
}

const files = readdirSync(migrationsDir)
  .filter((fileName) => fileName.endsWith('.ts'))
  .sort((left, right) => left.localeCompare(right));

const config = readConfig();
const grandfatheredLegacyFiles = new Set(config.grandfatheredLegacy13DigitMigrations);
const grandfatheredFileClassTimestampMismatches = new Map(
  Object.entries(config.grandfatheredFileClassTimestampMismatches ?? {}),
);
const seenEffectiveTimestamps = new Map<number, string>();
const seenRawTimestamps = new Map<number, string>();
const seenGrandfatheredFiles = new Set<string>();
const seenGrandfatheredMismatches = new Set<string>();

for (const fileName of files) {
  const match = fileName.match(migrationFilePattern);
  if (!match) {
    fail(`Migration file ${fileName} must match <timestamp>-<name>.ts.`);
  }

  const [, fileTimestampText] = match;
  if (!fileTimestampText) {
    fail(`Migration file ${fileName} is missing a numeric timestamp prefix.`);
  }

  if (fileTimestampText.length !== 13 && fileTimestampText.length !== 14) {
    fail(
      `Migration file ${fileName} uses ${fileTimestampText.length} digits. Use a 14-digit date-based timestamp. ` +
        'Only explicitly grandfathered 13-digit legacy migrations are allowed.',
    );
  }

  if (fileTimestampText.length === 13) {
    if (!grandfatheredLegacyFiles.has(fileName)) {
      fail(
        `New 13-digit migration detected: ${fileName}. Use a 14-digit date-based timestamp prefix ` +
          '(for example 20260601000000-YourMigration.ts) for all new migrations.',
      );
    }
    seenGrandfatheredFiles.add(fileName);
  }

  const fileTimestamp = Number.parseInt(fileTimestampText, 10);
  const previousFileForRawTimestamp = seenRawTimestamps.get(fileTimestamp);
  if (previousFileForRawTimestamp) {
    fail(`Duplicate raw migration timestamp ${fileTimestamp} found in ${previousFileForRawTimestamp} and ${fileName}.`);
  }
  seenRawTimestamps.set(fileTimestamp, fileName);

  const contents = readFileSync(join(migrationsDir, fileName), 'utf8');
  const classMatch = contents.match(migrationClassPattern);
  if (!classMatch?.[1]) {
    fail(`Migration file ${fileName} must export a class that implements MigrationInterface.`);
  }

  const className = classMatch[1];
  const classTimestamp = extractFullMigrationTimestamp(className);
  if (classTimestamp !== fileTimestamp) {
    const expectedGrandfatheredClassName = grandfatheredFileClassTimestampMismatches.get(fileName);
    if (expectedGrandfatheredClassName !== className) {
      fail(
        `Migration file ${fileName} and class ${className} disagree on timestamp. ` +
          `Expected both to use ${fileTimestamp}, or add the historical mismatch explicitly to migration-policy.config.json.`,
      );
    }
    seenGrandfatheredMismatches.add(fileName);
  }

  const effectiveTimestamp = getEffectiveMigrationTimestamp(className);
  const previousFileForEffectiveTimestamp = seenEffectiveTimestamps.get(effectiveTimestamp);
  if (previousFileForEffectiveTimestamp) {
    fail(
      `Duplicate effective migration timestamp ${effectiveTimestamp} found in ${previousFileForEffectiveTimestamp} and ${fileName}.`,
    );
  }
  seenEffectiveTimestamps.set(effectiveTimestamp, fileName);
}

const missingGrandfatheredFiles = config.grandfatheredLegacy13DigitMigrations.filter(
  (fileName) => !seenGrandfatheredFiles.has(fileName),
);
if (missingGrandfatheredFiles.length > 0) {
  fail(
    'Migration policy config contains grandfathered legacy files that no longer exist: ' +
      missingGrandfatheredFiles.join(', '),
  );
}

const missingGrandfatheredMismatches = Array.from(grandfatheredFileClassTimestampMismatches.keys()).filter(
  (fileName) => !seenGrandfatheredMismatches.has(fileName),
);
if (missingGrandfatheredMismatches.length > 0) {
  fail(
    'Migration policy config contains grandfathered file/class timestamp mismatches that no longer exist: ' +
      missingGrandfatheredMismatches.join(', '),
  );
}

console.log(
  `Migration policy checks passed for ${files.length} migration files ` +
    `(${config.grandfatheredLegacy13DigitMigrations.length} grandfathered 13-digit legacy files, ` +
    `${grandfatheredFileClassTimestampMismatches.size} grandfathered file/class timestamp mismatches).`,
);
