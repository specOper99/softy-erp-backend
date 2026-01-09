import { INestApplication, VersioningType } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { unpack } from 'msgpackr';
import request from 'supertest';
import { AppModule } from '../src/app.module';

describe('MessagePack Negotiation (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();

    // Match main.ts configuration
    app.setGlobalPrefix('api');
    app.enableVersioning({
      type: VersioningType.URI,
      defaultVersion: '1',
    });

    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('/api/v1/health/live (GET) - should return JSON by default', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/health/live')
      .expect(200);

    expect(response.headers['content-type']).toMatch(/application\/json/);
    expect(response.body).toHaveProperty('status');
  });

  it('/api/v1/health/live (GET) - should return MessagePack when requested', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/health/live')
      .set('Accept', 'application/x-msgpack')
      .buffer(true)
      .parse((res, callback) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => callback(null, Buffer.concat(chunks)));
      })
      .expect(200);

    expect(response.headers['content-type']).toMatch(/application\/x-msgpack/);

    const decodedBody = unpack(response.body);
    expect(decodedBody).toHaveProperty('status');
  });

  it('/api/v1/health/live (GET) - should return JSON when explicitly requested', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/health/live')
      .set('Accept', 'application/json')
      .expect(200);

    expect(response.headers['content-type']).toMatch(/application\/json/);
    expect(response.body).toHaveProperty('status');
  });
});
