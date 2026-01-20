import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WebhookDelivery } from '../entities/webhook-delivery.entity';
import { WebhookDeliveryRepository } from './webhook-delivery.repository';

describe('WebhookDeliveryRepository', () => {
  let repository: WebhookDeliveryRepository;
  let mockTypeOrmRepository: Repository<WebhookDelivery>;

  beforeEach(async () => {
    mockTypeOrmRepository = {
      find: jest.fn(),
      findOne: jest.fn(),
      count: jest.fn(),
      // Add other methods if needed
    } as unknown as Repository<WebhookDelivery>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WebhookDeliveryRepository,
        {
          provide: getRepositoryToken(WebhookDelivery),
          useValue: mockTypeOrmRepository,
        },
      ],
    }).compile();

    repository = module.get<WebhookDeliveryRepository>(WebhookDeliveryRepository);
  });

  it('should be defined', () => {
    expect(repository).toBeDefined();
  });

  // Since logic is in TenantAwareRepository, we just need to ensure constructor works.
  // But we can add a simple test to verify inheritance if needed,
  // although 'toBeDefined' covers the file execution (import/definition).
});
