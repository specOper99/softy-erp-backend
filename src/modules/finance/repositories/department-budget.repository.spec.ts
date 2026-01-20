import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DepartmentBudget } from '../entities/department-budget.entity';
import { DepartmentBudgetRepository } from './department-budget.repository';

describe('DepartmentBudgetRepository', () => {
  let repository: DepartmentBudgetRepository;
  let mockTypeOrmRepository: Repository<DepartmentBudget>;

  beforeEach(async () => {
    mockTypeOrmRepository = {
      find: jest.fn(),
      findOne: jest.fn(),
      count: jest.fn(),
    } as unknown as Repository<DepartmentBudget>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DepartmentBudgetRepository,
        {
          provide: getRepositoryToken(DepartmentBudget),
          useValue: mockTypeOrmRepository,
        },
      ],
    }).compile();

    repository = module.get<DepartmentBudgetRepository>(DepartmentBudgetRepository);
  });

  it('should be defined', () => {
    expect(repository).toBeDefined();
  });
});
