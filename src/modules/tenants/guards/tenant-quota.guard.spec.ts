import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Tenant } from '../entities/tenant.entity';
import { TenantQuotaGuard } from './tenant-quota.guard';

describe('TenantQuotaGuard', () => {
  let guard: TenantQuotaGuard;
  let reflector: Reflector;
  let tenantRepository: {
    findOne: jest.Mock;
    manager: { getRepository: jest.Mock };
  };

  const createMockContext = (tenantId?: string) =>
    ({
      switchToHttp: jest.fn().mockReturnValue({
        getRequest: () => ({
          user: tenantId ? { tenantId } : undefined,
        }),
      }),
      getHandler: jest.fn(),
    }) as unknown as ExecutionContext;

  beforeEach(async () => {
    tenantRepository = {
      findOne: jest.fn(),
      manager: {
        getRepository: jest.fn().mockReturnValue({
          count: jest.fn().mockResolvedValue(5),
        }),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TenantQuotaGuard,
        Reflector,
        {
          provide: getRepositoryToken(Tenant),
          useValue: tenantRepository,
        },
      ],
    }).compile();

    guard = module.get<TenantQuotaGuard>(TenantQuotaGuard);
    reflector = module.get<Reflector>(Reflector);
  });

  it('should be defined', () => {
    expect(guard).toBeDefined();
  });

  describe('canActivate', () => {
    it('should allow when no tenantId', async () => {
      const context = createMockContext(undefined);

      const result = await guard.canActivate(context);

      expect(result).toBe(true);
    });

    it('should allow when no resource type specified', async () => {
      jest.spyOn(reflector, 'get').mockReturnValue(undefined);
      const context = createMockContext('tenant-123');

      const result = await guard.canActivate(context);

      expect(result).toBe(true);
    });

    it('should allow when tenant has no quotas', async () => {
      jest.spyOn(reflector, 'get').mockReturnValue('max_users');
      tenantRepository.findOne.mockResolvedValue({ id: 'tenant-123' });
      const context = createMockContext('tenant-123');

      const result = await guard.canActivate(context);

      expect(result).toBe(true);
    });

    it('should allow when no limit for resource', async () => {
      jest.spyOn(reflector, 'get').mockReturnValue('max_storage');
      tenantRepository.findOne.mockResolvedValue({
        id: 'tenant-123',
        quotas: { max_users: 10 },
      });
      const context = createMockContext('tenant-123');

      const result = await guard.canActivate(context);

      expect(result).toBe(true);
    });

    it('should allow when under quota', async () => {
      jest.spyOn(reflector, 'get').mockReturnValue('max_users');
      tenantRepository.findOne.mockResolvedValue({
        id: 'tenant-123',
        quotas: { max_users: 10 },
      });
      const context = createMockContext('tenant-123');

      const result = await guard.canActivate(context);

      expect(result).toBe(true);
    });

    it('should throw when quota exceeded', async () => {
      jest.spyOn(reflector, 'get').mockReturnValue('max_users');
      tenantRepository.findOne.mockResolvedValue({
        id: 'tenant-123',
        quotas: { max_users: 5 },
      });
      const context = createMockContext('tenant-123');

      await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);
      await expect(guard.canActivate(context)).rejects.toThrow('Quota exceeded for max_users');
    });
  });
});
