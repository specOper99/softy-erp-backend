import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import type { Repository, SelectQueryBuilder } from 'typeorm';
import { User } from '../domain/entities/user.entity';
import { UserRepository } from './user.repository';

describe('UserRepository', () => {
  let repository: UserRepository;
  let mockTypeOrmRepository: jest.Mocked<Repository<User>>;

  beforeEach(async () => {
    mockTypeOrmRepository = {
      find: jest.fn(),
      findOne: jest.fn(),
      count: jest.fn(),
      update: jest.fn().mockResolvedValue({ affected: 1, raw: [], generatedMaps: [] }),
      createQueryBuilder: jest.fn(),
    } as unknown as jest.Mocked<Repository<User>>;

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

  describe('auth bootstrap global helpers', () => {
    it('findByEmailGlobal queries without tenant scope', async () => {
      const user = { id: 'u1', email: 'a@b.com', tenantId: 't1' } as User;
      mockTypeOrmRepository.findOne.mockResolvedValue(user);

      const result = await repository.findByEmailGlobal('a@b.com');

      expect(result).toBe(user);
      expect(mockTypeOrmRepository.findOne).toHaveBeenCalledWith({ where: { email: 'a@b.com' } });
    });

    it('findByEmailWithMfaSecretGlobal selects mfaSecret without tenant filter', async () => {
      const qb = {
        addSelect: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue({ id: 'u1', mfaSecret: 'secret' }),
      };
      mockTypeOrmRepository.createQueryBuilder.mockReturnValue(qb as unknown as SelectQueryBuilder<User>);

      const result = await repository.findByEmailWithMfaSecretGlobal('a@b.com');

      expect(result?.mfaSecret).toBe('secret');
      expect(qb.addSelect).toHaveBeenCalledWith('user.mfaSecret');
      expect(qb.andWhere).toHaveBeenCalledWith('user.email = :email', { email: 'a@b.com' });
    });

    it('findByIdWithRecoveryCodesGlobal selects recovery codes without tenant filter', async () => {
      const qb = {
        addSelect: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue({ id: 'u1', mfaRecoveryCodes: ['c1'] }),
      };
      mockTypeOrmRepository.createQueryBuilder.mockReturnValue(qb as unknown as SelectQueryBuilder<User>);

      const result = await repository.findByIdWithRecoveryCodesGlobal('u1');

      expect(result?.mfaRecoveryCodes).toEqual(['c1']);
      expect(qb.addSelect).toHaveBeenCalledWith('user.mfaRecoveryCodes');
      expect(qb.andWhere).toHaveBeenCalledWith('user.id = :userId', { userId: 'u1' });
    });

    it('updatePasswordHashGlobal updates by id only', async () => {
      await repository.updatePasswordHashGlobal('u1', 'new-hash');
      expect(mockTypeOrmRepository.update).toHaveBeenCalledWith({ id: 'u1' }, { passwordHash: 'new-hash' });
    });
  });
});
