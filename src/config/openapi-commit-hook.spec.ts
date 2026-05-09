import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

describe('OpenAPI commit hook', () => {
  const backendRoot = resolve(__dirname, '..', '..');

  it('defines a backend script for commit-time OpenAPI generation', () => {
    const packageJson = JSON.parse(readFileSync(join(backendRoot, 'package.json'), 'utf8')) as {
      scripts?: Record<string, string>;
    };

    expect(packageJson.scripts?.['openapi:commit']).toContain('export-openapi-on-commit');
  });

  it('runs OpenAPI generation before lint-staged in pre-commit', () => {
    const preCommit = readFileSync(join(backendRoot, '.husky', 'pre-commit'), 'utf8');

    expect(preCommit).toContain('npm run openapi:commit');
    expect(preCommit.indexOf('npm run openapi:commit')).toBeLessThan(preCommit.indexOf('npx lint-staged'));
  });

  it('loads AppModule only after OpenAPI export env fallbacks are applied', () => {
    const exportScript = readFileSync(join(backendRoot, 'scripts', 'export-openapi.ts'), 'utf8');

    expect(exportScript).not.toMatch(/import\s+\{\s*AppModule\s*\}/);
    expect(exportScript.indexOf('applyOpenApiExportEnv()')).toBeLessThan(
      exportScript.indexOf("require('../src/app.module')"),
    );
  });

  it('uses stable docs build metadata for generated OpenAPI files', () => {
    const exportScript = readFileSync(join(backendRoot, 'scripts', 'export-openapi.ts'), 'utf8');

    expect(exportScript).toContain('OPENAPI_EXPORT_BUILD_SHA');
    expect(exportScript).toContain('1970-01-01T00:00:00.000Z');
  });
});
