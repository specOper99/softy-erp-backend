#!/usr/bin/env node
/**
 * Builds manifest.json with backend SHA, schema version, and OpenAPI checksum.
 */
import { createHash } from 'node:crypto';
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync, copyFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = dirname(fileURLToPath(import.meta.url));
const pkgRoot = join(dir, '..');
const openApiSrc = join(pkgRoot, '../../../frontend/src/api/openapi.remote.json');
const openApiDest = join(pkgRoot, 'openapi.json');

const spec = readFileSync(openApiSrc);
copyFileSync(openApiSrc, openApiDest);

const checksum = createHash('sha256').update(spec).digest('hex');
let backendSha = 'unknown';
try {
  backendSha = execSync('git rev-parse HEAD', { cwd: join(pkgRoot, '../..'), encoding: 'utf8' }).trim();
} catch {
  // archive workspace may lack git metadata
}

const manifest = {
  package: '@softy/contracts',
  backendSha,
  schemaVersion: JSON.parse(spec.toString()).info?.version ?? '0.0.0',
  openapiChecksum: checksum,
  generatedAt: new Date().toISOString(),
};

writeFileSync(join(pkgRoot, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
console.log('Built @softy/contracts manifest', manifest.openapiChecksum.slice(0, 12));
