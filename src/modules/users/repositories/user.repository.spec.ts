import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../entities/user.entity';
import { UserRepository } from './user.repository';

describe('UserRepository', () => {
  let repository: UserRepository;
  let mockTypeOrmRepository: Repository<User>;

  beforeEach(async () => {
    mockTypeOrmRepository = {
      find: jest.fn(),
      findOne: jest.fn(),
      count: jest.fn(),
    } as unknown as Repository<User>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserRepository,
        {
          provide: getRepositoryToken(User),
          useValue: mockTypeOrmRepository,
        },
      ],
    }).compile();

    repository = module.get<UserRepository>(UserRepository);
  });

  it('should be defined', () => {
    expect(repository).toBeDefined();
  });
});
