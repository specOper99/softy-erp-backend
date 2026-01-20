import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Task } from '../entities/task.entity';
import { TaskRepository } from './task.repository';

describe('TaskRepository', () => {
  let repository: TaskRepository;
  let mockTypeOrmRepository: Repository<Task>;

  beforeEach(async () => {
    mockTypeOrmRepository = {
      find: jest.fn(),
      findOne: jest.fn(),
      count: jest.fn(),
    } as unknown as Repository<Task>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TaskRepository,
        {
          provide: getRepositoryToken(Task),
          useValue: mockTypeOrmRepository,
        },
      ],
    }).compile();

    repository = module.get<TaskRepository>(TaskRepository);
  });

  it('should be defined', () => {
    expect(repository).toBeDefined();
  });
});
