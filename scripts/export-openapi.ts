import { VersioningType } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import * as dotenv from 'dotenv';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import 'reflect-metadata';
import { applyOpenApiExportEnv } from '../src/config/openapi-export-env';
import { createSwaggerDocument } from '../src/config/swagger.config';

async function main() {
  dotenv.config({ path: path.resolve(process.cwd(), '.env') });
  applyOpenApiExportEnv();

  const outputPath =
    process.env.OPENAPI_EXPORT_PATH || path.resolve(process.cwd(), '../frontend/src/api/openapi.remote.json');
  const exportMeta = {
    commitSha: process.env.OPENAPI_EXPORT_BUILD_SHA || 'openapi-export',
    generatedAt: process.env.OPENAPI_EXPORT_GENERATED_AT || '1970-01-01T00:00:00.000Z',
  };

  console.log('Creating Nest application for OpenAPI export...');
  // Deferred require is intentional: applyOpenApiExportEnv() must set
  // ENABLE_BACKGROUND_JOBS=false before queue.module.ts is evaluated at load time.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { AppModule } = (await Promise.resolve(require('../src/app.module'))) as typeof import('../src/app.module');
  const app = await NestFactory.create(AppModule, { logger: false, abortOnError: false });
  app.setGlobalPrefix('api');
  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: '1',
  });

  try {
    console.log('Generating Swagger document...');
    const document = createSwaggerDocument(app, exportMeta);
    await writeFile(outputPath, `${JSON.stringify(document, null, 2)}\n`, 'utf8');
    console.log(`Exported OpenAPI document to ${outputPath}`);
  } finally {
    await app.close();
  }
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
