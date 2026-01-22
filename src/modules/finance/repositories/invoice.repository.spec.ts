import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Invoice } from '../entities/invoice.entity';
import { InvoiceRepository } from './invoice.repository';

describe('InvoiceRepository', () => {
  let repository: InvoiceRepository;
  let mockTypeOrmRepository: Repository<Invoice>;

  beforeEach(async () => {
    mockTypeOrmRepository = {
      find: jest.fn(),
      findOne: jest.fn(),
      count: jest.fn(),
    } as unknown as Repository<Invoice>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InvoiceRepository,
        {
          provide: getRepositoryToken(Invoice),
          useValue: mockTypeOrmRepository,
        },
      ],
    }).compile();

    repository = module.get<InvoiceRepository>(InvoiceRepository);
  });

  it('should be defined', () => {
    expect(repository).toBeDefined();
  });
});
