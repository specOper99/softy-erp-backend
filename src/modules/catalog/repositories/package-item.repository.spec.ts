import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PackageItem } from '../entities/package-item.entity';
import { PackageItemRepository } from './package-item.repository';

describe('PackageItemRepository', () => {
  let repository: PackageItemRepository;
  let mockTypeOrmRepository: Repository<PackageItem>;

  beforeEach(async () => {
    mockTypeOrmRepository = {
      find: jest.fn(),
      findOne: jest.fn(),
      count: jest.fn(),
    } as unknown as Repository<PackageItem>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PackageItemRepository,
        {
          provide: getRepositoryToken(PackageItem),
          useValue: mockTypeOrmRepository,
        },
      ],
    }).compile();

    repository = module.get<PackageItemRepository>(PackageItemRepository);
  });

  it('should be defined', () => {
    expect(repository).toBeDefined();
  });
});
