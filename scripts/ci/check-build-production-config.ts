import { readFileSync } from 'fs';
import { join } from 'path';

const root = process.cwd();

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

function read(relativePath: string): string {
  return readFileSync(join(root, relativePath), 'utf8');
}

const packageJson = JSON.parse(read('package.json')) as {
  scripts?: Record<string, string>;
};
const nestCli = JSON.parse(read('nest-cli.json')) as {
  compilerOptions?: {
    assets?: Array<string | { watchAssets?: boolean }>;
    watchAssets?: boolean;
  };
};
const dockerfile = read('Dockerfile');
const deployWorkflow = read('.github/workflows/deploy.yml');

if (nestCli.compilerOptions?.watchAssets === true) {
  fail('nest-cli.json must not enable compilerOptions.watchAssets for one-shot builds.');
}

const assetWatchers = nestCli.compilerOptions?.assets?.filter(
  (asset) => typeof asset !== 'string' && asset.watchAssets === true,
);
if (assetWatchers?.length) {
  fail('nest-cli.json assets must not enable watchAssets for one-shot builds.');
}

if (packageJson.scripts?.build?.includes('--watchAssets')) {
  fail('npm run build must remain a one-shot build without --watchAssets.');
}

if (!packageJson.scripts?.['start:dev']?.includes('--watchAssets')) {
  fail('start:dev should opt into asset watching explicitly.');
}

if (dockerfile.includes('--only=production=false')) {
  fail('Dockerfile must not use invalid npm --only=production=false.');
}

if (dockerfile.includes('npm prune --production')) {
  fail('Dockerfile must use npm prune --omit=dev instead of deprecated --production.');
}

if (!dockerfile.includes('npm ci --include=dev')) {
  fail('Dockerfile builder must install dev dependencies explicitly.');
}

if (!dockerfile.includes('npm prune --omit=dev')) {
  fail('Dockerfile must prune dev dependencies with --omit=dev.');
}

if (!deployWorkflow.includes('npm ci --include=dev')) {
  fail('Production deploy workflow must install dev dependencies before build steps.');
}

if (!deployWorkflow.includes('npm prune --omit=dev')) {
  fail('Production deploy workflow must prune dev dependencies after build/migration steps.');
}
