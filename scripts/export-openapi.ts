import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import * as dotenv from 'dotenv';
import 'reflect-metadata';
import { VersioningType } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { applyOpenApiExportEnv } from '../src/config/openapi-export-env';
import { createSwaggerDocument } from '../src/config/swagger.config';

async function main() {
  dotenv.config({ path: path.resolve(process.cwd(), '.env') });
  applyOpenApiExportEnv();

  const outputPath =
    process.env.OPENAPI_EXPORT_PATH || path.resolve(process.cwd(), '../frontend/src/api/openapi.remote.json');

  console.log('Creating Nest application for OpenAPI export...');
  const app = await NestFactory.create(AppModule, { logger: false, abortOnError: false });
  app.setGlobalPrefix('api');
  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: '1',
  });

  try {
    console.log('Generating Swagger document...');
    const document = createSwaggerDocument(app);
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
