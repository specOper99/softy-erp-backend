import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ServicePackage } from '../entities/service-package.entity';
import { ServicePackageRepository } from './service-package.repository';

describe('ServicePackageRepository', () => {
  let repository: ServicePackageRepository;
  let mockTypeOrmRepository: Repository<ServicePackage>;

  beforeEach(async () => {
    mockTypeOrmRepository = {
      find: jest.fn(),
      findOne: jest.fn(),
      count: jest.fn(),
    } as unknown as Repository<ServicePackage>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ServicePackageRepository,
        {
          provide: getRepositoryToken(ServicePackage),
          useValue: mockTypeOrmRepository,
        },
      ],
    }).compile();

    repository = module.get<ServicePackageRepository>(ServicePackageRepository);
  });

  it('should be defined', () => {
    expect(repository).toBeDefined();
  });
});
