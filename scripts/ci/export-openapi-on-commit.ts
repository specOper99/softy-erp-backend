import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const backendRoot = resolve(__dirname, '..', '..');
const frontendRoot = resolve(backendRoot, '..', 'frontend');
const frontendOpenApiCache = join(frontendRoot, 'src', 'api', 'openapi.remote.json');

function run(label: string, command: string, args: string[], cwd: string, env: Record<string, string> = {}) {
  console.log(`\n[openapi:commit] ${label}`);
  const result = spawnSync(command, args, {
    cwd,
    env: { ...process.env, ...env },
    stdio: 'inherit',
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

if (!existsSync(join(frontendRoot, 'package.json'))) {
  throw new Error(`Sibling frontend repo was not found at ${relative(backendRoot, frontendRoot)}`);
}

run('export backend OpenAPI cache', 'npm', ['run', 'openapi:export'], backendRoot, {
  OPENAPI_EXPORT_PATH: frontendOpenApiCache,
});
run('sync frontend OpenAPI generated types', 'npm', ['run', 'api:sync:local'], frontendRoot);
run('write frontend endpoint coverage report', 'npm', ['run', 'api:coverage'], frontendRoot);
run('refresh frontend capability map', 'npm', ['run', 'generate:capabilities'], frontendRoot);

console.log('\n[openapi:commit] Generated OpenAPI and frontend contract artifacts.');
console.log('[openapi:commit] Review and commit frontend repo changes separately.');
