import { Test, TestingModule } from '@nestjs/testing';
import { PlatformTimeEntryQueryDto } from '../dto/platform-time-entries.dto';
import { PlatformTimeEntriesService } from '../services/platform-time-entries.service';
import { PlatformTimeEntriesController } from './platform-time-entries.controller';

describe('PlatformTimeEntriesController', () => {
  let controller: PlatformTimeEntriesController;
  let service: jest.Mocked<PlatformTimeEntriesService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PlatformTimeEntriesController],
      providers: [
        {
          provide: PlatformTimeEntriesService,
          useValue: {
            list: jest.fn(),
            findOne: jest.fn(),
            update: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<PlatformTimeEntriesController>(PlatformTimeEntriesController);
    service = module.get(PlatformTimeEntriesService);
  });

  it('delegates list to service', async () => {
    service.list.mockResolvedValue([]);

    await controller.list('tenant-1', {} as PlatformTimeEntryQueryDto);

    expect(service.list).toHaveBeenCalledWith('tenant-1', {});
  });
});
