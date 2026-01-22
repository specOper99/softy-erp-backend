import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Webhook } from '../entities/webhook.entity';
import { WebhookRepository } from './webhook.repository';

describe('WebhookRepository', () => {
  let repository: WebhookRepository;
  let mockTypeOrmRepository: Repository<Webhook>;

  beforeEach(async () => {
    mockTypeOrmRepository = {
      find: jest.fn(),
      findOne: jest.fn(),
      count: jest.fn(),
    } as unknown as Repository<Webhook>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WebhookRepository,
        {
          provide: getRepositoryToken(Webhook),
          useValue: mockTypeOrmRepository,
        },
      ],
    }).compile();

    repository = module.get<WebhookRepository>(WebhookRepository);
  });

  it('should be defined', () => {
    expect(repository).toBeDefined();
  });
});
