import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { EnumExpectation } from './enum-sync';

export type MigrationEnumCorpus = Map<string, Set<string>>;

const CREATE_TYPE_ENUM_RE =
  /CREATE\s+TYPE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:"public"\.)?"([^"]+_enum)"\s+AS\s+ENUM\s*\(([^)]*)\)/gi;

const ADD_VALUE_RE =
  /ALTER\s+TYPE\s+(?:"public"\.)?"([^"]+_enum)"\s+ADD\s+VALUE(?:\s+IF\s+NOT\s+EXISTS)?\s+'([^']+)'/gi;

/** TypeORM TableColumn / createTable: enumName + enum array (either order). */
const ENUM_NAME_THEN_VALUES_RE = /enumName:\s*['"]([^'"]+_enum)['"][\s\S]{0,400}?enum:\s*\[([^\]]*)\]/gi;

const ENUM_VALUES_THEN_NAME_RE = /enum:\s*\[([^\]]*)\][\s\S]{0,400}?enumName:\s*['"]([^'"]+_enum)['"]/gi;

function extractQuotedLabels(blob: string): string[] {
  const labels: string[] = [];
  const re = /'([^']+)'/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(blob)) !== null) {
    if (match[1]) {
      labels.push(match[1]);
    }
  }
  return labels;
}

/** Return substring of `source` for the `[...]` array that starts at `openBracketIndex`. */
export function extractBalancedArrayBody(source: string, openBracketIndex: number): string | undefined {
  if (source[openBracketIndex] !== '[') {
    return undefined;
  }

  let depth = 0;
  for (let index = openBracketIndex; index < source.length; index += 1) {
    const char = source[index];
    if (char === '[') {
      depth += 1;
    } else if (char === ']') {
      depth -= 1;
      if (depth === 0) {
        return source.slice(openBracketIndex + 1, index);
      }
    }
  }

  return undefined;
}

function addLabels(corpus: MigrationEnumCorpus, enumName: string, labels: readonly string[]): void {
  const existing = corpus.get(enumName) ?? new Set<string>();
  for (const label of labels) {
    existing.add(label);
  }
  corpus.set(enumName, existing);
}

function parseCreateTableEnumColumns(source: string, corpus: MigrationEnumCorpus): void {
  const tableStartRe = /createTable\(\s*new\s+Table\(\s*\{/gi;
  let tableStart: RegExpExecArray | null;

  while ((tableStart = tableStartRe.exec(source)) !== null) {
    const fromTable = source.slice(tableStart.index);
    const tableNameMatch = /name:\s*['"]([^'"]+)['"]/.exec(fromTable);
    if (!tableNameMatch?.[1]) {
      continue;
    }
    const tableName = tableNameMatch[1];

    const columnsKey = fromTable.search(/columns:\s*\[/);
    if (columnsKey < 0) {
      continue;
    }
    const openBracket = fromTable.indexOf('[', columnsKey);
    const columnsBlob = extractBalancedArrayBody(fromTable, openBracket);
    if (!columnsBlob) {
      continue;
    }

    // Walk top-level `{ ... }` column objects (balanced braces).
    let index = 0;
    while (index < columnsBlob.length) {
      const openBrace = columnsBlob.indexOf('{', index);
      if (openBrace < 0) {
        break;
      }
      let depth = 0;
      let closeBrace = -1;
      for (let cursor = openBrace; cursor < columnsBlob.length; cursor += 1) {
        const char = columnsBlob[cursor];
        if (char === '{') {
          depth += 1;
        } else if (char === '}') {
          depth -= 1;
          if (depth === 0) {
            closeBrace = cursor;
            break;
          }
        }
      }
      if (closeBrace < 0) {
        break;
      }

      const columnBlock = columnsBlob.slice(openBrace, closeBrace + 1);
      index = closeBrace + 1;

      if (!/type:\s*['"]enum['"]/.test(columnBlock)) {
        continue;
      }
      if (/enumName:\s*['"]/.test(columnBlock)) {
        // Named enums handled by ENUM_NAME_THEN_VALUES_RE / ENUM_VALUES_THEN_NAME_RE.
        continue;
      }

      const columnNameMatch = /name:\s*['"]([^'"]+)['"]/.exec(columnBlock);
      const enumArrayMatch = /enum:\s*\[/.exec(columnBlock);
      if (!columnNameMatch?.[1] || !enumArrayMatch || enumArrayMatch.index === undefined) {
        continue;
      }
      const enumOpen = columnBlock.indexOf('[', enumArrayMatch.index);
      const enumBody = extractBalancedArrayBody(columnBlock, enumOpen);
      if (!enumBody) {
        continue;
      }
      addLabels(corpus, `${tableName}_${columnNameMatch[1]}_enum`, extractQuotedLabels(enumBody));
    }
  }
}

/**
 * Parse migration TypeScript/SQL sources into PG enum name → label sets.
 * Covers CREATE TYPE, ADD VALUE, and TypeORM enum / enumName column defs.
 */
export function parseMigrationEnumCorpus(migrationSources: readonly string[]): MigrationEnumCorpus {
  const corpus: MigrationEnumCorpus = new Map();

  for (const source of migrationSources) {
    CREATE_TYPE_ENUM_RE.lastIndex = 0;
    let createMatch: RegExpExecArray | null;
    while ((createMatch = CREATE_TYPE_ENUM_RE.exec(source)) !== null) {
      const enumName = createMatch[1];
      const body = createMatch[2] ?? '';
      if (enumName) {
        addLabels(corpus, enumName, extractQuotedLabels(body));
      }
    }

    ADD_VALUE_RE.lastIndex = 0;
    let addMatch: RegExpExecArray | null;
    while ((addMatch = ADD_VALUE_RE.exec(source)) !== null) {
      const enumName = addMatch[1];
      const label = addMatch[2];
      if (enumName && label) {
        addLabels(corpus, enumName, [label]);
      }
    }

    ENUM_NAME_THEN_VALUES_RE.lastIndex = 0;
    let namedMatch: RegExpExecArray | null;
    while ((namedMatch = ENUM_NAME_THEN_VALUES_RE.exec(source)) !== null) {
      const enumName = namedMatch[1];
      const body = namedMatch[2] ?? '';
      if (enumName) {
        addLabels(corpus, enumName, extractQuotedLabels(body));
      }
    }

    ENUM_VALUES_THEN_NAME_RE.lastIndex = 0;
    let valuesFirstMatch: RegExpExecArray | null;
    while ((valuesFirstMatch = ENUM_VALUES_THEN_NAME_RE.exec(source)) !== null) {
      const body = valuesFirstMatch[1] ?? '';
      const enumName = valuesFirstMatch[2];
      if (enumName) {
        addLabels(corpus, enumName, extractQuotedLabels(body));
      }
    }

    parseCreateTableEnumColumns(source, corpus);
  }

  return corpus;
}

export function loadMigrationSourcesFromDir(migrationsDir: string): string[] {
  return readdirSync(migrationsDir)
    .filter((name) => /^\d+-.+\.ts$/u.test(name))
    .sort((left, right) => left.localeCompare(right))
    .map((name) => readFileSync(join(migrationsDir, name), 'utf8'));
}

export function findMissingMigrationEnumLabels(
  expectations: readonly EnumExpectation[],
  corpus: MigrationEnumCorpus,
): string[] {
  const missing: string[] = [];

  for (const expectation of expectations) {
    const labels = corpus.get(expectation.pgEnumName) ?? corpus.get(expectation.pgEnumName.toLowerCase());

    if (!labels) {
      missing.push(
        `${expectation.table}.${expectation.column}: no CREATE TYPE / ADD VALUE / TypeORM enum coverage for "${expectation.pgEnumName}"`,
      );
      continue;
    }

    for (const tsValue of expectation.tsValues) {
      if (!labels.has(tsValue)) {
        missing.push(
          `${expectation.table}.${expectation.column}: TS value "${tsValue}" missing from migration corpus for "${expectation.pgEnumName}"`,
        );
      }
    }
  }

  return missing;
}
