import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TaskType } from '../entities/task-type.entity';
import { TaskTypeRepository } from './task-type.repository';

describe('TaskTypeRepository', () => {
  let repository: TaskTypeRepository;
  let mockTypeOrmRepository: Repository<TaskType>;

  beforeEach(async () => {
    mockTypeOrmRepository = {
      find: jest.fn(),
      findOne: jest.fn(),
      count: jest.fn(),
    } as unknown as Repository<TaskType>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TaskTypeRepository,
        {
          provide: getRepositoryToken(TaskType),
          useValue: mockTypeOrmRepository,
        },
      ],
    }).compile();

    repository = module.get<TaskTypeRepository>(TaskTypeRepository);
  });

  it('should be defined', () => {
    expect(repository).toBeDefined();
  });
});
