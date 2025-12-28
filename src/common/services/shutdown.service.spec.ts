import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { ShutdownService } from './shutdown.service';

describe('ShutdownService', () => {
  let service: ShutdownService;
  let dataSource: DataSource;

  const mockDataSource = {
    isInitialized: true,
    destroy: jest.fn().mockResolvedValue(undefined),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ShutdownService,
        { provide: DataSource, useValue: mockDataSource },
      ],
    }).compile();

    service = module.get<ShutdownService>(ShutdownService);
    dataSource = module.get<DataSource>(DataSource);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('onApplicationShutdown', () => {
    it('should close database connection if initialized', async () => {
      await service.onApplicationShutdown('SIGTERM');
      expect(dataSource.destroy).toHaveBeenCalled();
    });

    it('should not try to close database connection if not initialized', async () => {
      mockDataSource.isInitialized = false;
      jest.clearAllMocks();

      await service.onApplicationShutdown('SIGTERM');
      expect(dataSource.destroy).not.toHaveBeenCalled();
    });
  });
});
