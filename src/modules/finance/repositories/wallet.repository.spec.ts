import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EmployeeWallet } from '../entities/employee-wallet.entity';
import { WalletRepository } from './wallet.repository';

describe('WalletRepository', () => {
  let repository: WalletRepository;
  let mockTypeOrmRepository: Repository<EmployeeWallet>;

  beforeEach(async () => {
    mockTypeOrmRepository = {
      find: jest.fn(),
      findOne: jest.fn(),
      count: jest.fn(),
    } as unknown as Repository<EmployeeWallet>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WalletRepository,
        {
          provide: getRepositoryToken(EmployeeWallet),
          useValue: mockTypeOrmRepository,
        },
      ],
    }).compile();

    repository = module.get<WalletRepository>(WalletRepository);
  });

  it('should be defined', () => {
    expect(repository).toBeDefined();
  });
});
