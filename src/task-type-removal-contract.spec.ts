import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';

const repoSrc = join(__dirname);
const disallowedTaskTypePattern = /\btask[-_ ]?types?\b|TaskTypes?\b|taskType|task_type/i;
const allowedPathFragments = [
  'database/migrations/',
  'common/i18n/translations/',
  'task-type-removal-contract.spec.ts',
];

function collectFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const absolute = join(dir, entry);
    const stat = statSync(absolute);
    if (stat.isDirectory()) {
      if (entry === 'node_modules' || entry === 'dist') return [];
      return collectFiles(absolute);
    }
    return absolute.endsWith('.ts') || absolute.endsWith('.hbs') ? [absolute] : [];
  });
}

describe('task type removal contract', () => {
  it('does not keep task-type artifacts in current backend source', () => {
    const offenders = collectFiles(repoSrc)
      .filter((file) => !allowedPathFragments.some((fragment) => relative(repoSrc, file).includes(fragment)))
      .filter((file) => disallowedTaskTypePattern.test(readFileSync(file, 'utf8')))
      .map((file) => relative(repoSrc, file));

    expect(offenders).toEqual([]);
  });
});
