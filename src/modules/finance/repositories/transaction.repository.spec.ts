import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import type { Repository } from 'typeorm';
import { Transaction } from '../entities/transaction.entity';
import { TransactionRepository } from './transaction.repository';

describe('TransactionRepository', () => {
  let repository: TransactionRepository;
  let mockTypeOrmRepository: Repository<Transaction>;

  beforeEach(async () => {
    mockTypeOrmRepository = {
      find: jest.fn(),
      findOne: jest.fn(),
      count: jest.fn(),
    } as unknown as Repository<Transaction>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TransactionRepository,
        {
          provide: getRepositoryToken(Transaction),
          useValue: mockTypeOrmRepository,
        },
      ],
    }).compile();

    repository = module.get<TransactionRepository>(TransactionRepository);
  });

  it('should be defined', () => {
    expect(repository).toBeDefined();
  });
});
