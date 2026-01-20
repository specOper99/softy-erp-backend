import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RecurringTransaction } from '../entities/recurring-transaction.entity';
import { RecurringTransactionRepository } from './recurring-transaction.repository';

describe('RecurringTransactionRepository', () => {
  let repository: RecurringTransactionRepository;
  let mockTypeOrmRepository: Repository<RecurringTransaction>;

  beforeEach(async () => {
    mockTypeOrmRepository = {
      find: jest.fn(),
      findOne: jest.fn(),
      count: jest.fn(),
    } as unknown as Repository<RecurringTransaction>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RecurringTransactionRepository,
        {
          provide: getRepositoryToken(RecurringTransaction),
          useValue: mockTypeOrmRepository,
        },
      ],
    }).compile();

    repository = module.get<RecurringTransactionRepository>(RecurringTransactionRepository);
  });

  it('should be defined', () => {
    expect(repository).toBeDefined();
  });
});
