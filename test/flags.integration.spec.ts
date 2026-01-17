import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { ConfigModule } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { FlagsService } from '../src/common/flags/flags.service';
import { databaseConfig } from '../src/config';

describe('FlagsService Integration', () => {
  let moduleRef: TestingModule;
  let flagsService: FlagsService;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          load: [databaseConfig], // Minimal config
        }),
        // We're mocking the actual ConfigService usage inside FlagsService manually or via DI override
        // But for integration, we want to see it instantiate.
        // Since Unleash requires a real server, we'll verify it handles missing config gracefully (default false)
        // or mocked behavior.
      ],
      providers: [FlagsService],
    }).compile();

    flagsService = moduleRef.get<FlagsService>(FlagsService);
    await moduleRef.init();
  });

  afterAll(async () => {
    await moduleRef.close();
  });

  it('should be defined', () => {
    expect(flagsService).toBeDefined();
  });

  it('should return default value when not configured', () => {
    const isEnabled = flagsService.isEnabled('some-feature');
    expect(isEnabled).toBe(false);
  });

  it('should return provided default value', () => {
    const isEnabled = flagsService.isEnabled('some-feature', {}, true);
    expect(isEnabled).toBe(true);
  });
});
