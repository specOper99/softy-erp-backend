import { ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';
import { CacheUtilsService } from '../../../common/cache/cache-utils.service';
import { TenantContextService } from '../../../common/services/tenant-context.service';
import { SKIP_TENANT_KEY } from '../decorators/skip-tenant.decorator';
import { TenantStatus } from '../enums/tenant-status.enum';
import { TenantsService } from '../tenants.service';
import { TenantGuard } from './tenant.guard';

describe('TenantGuard', () => {
  let guard: TenantGuard;
  let reflector: Reflector;
  let tenantsService: { findOne: jest.Mock };
  let cache: { get: jest.Mock; set: jest.Mock };

  const mockExecutionContext = {
    switchToHttp: jest.fn().mockReturnValue({
      getRequest: () => ({}),
    }),
    getHandler: jest.fn(),
    getClass: jest.fn(),
  } as unknown as ExecutionContext;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TenantGuard,
        Reflector,
        {
          provide: TenantsService,
          useValue: { findOne: jest.fn() },
        },
        {
          provide: CacheUtilsService,
          useValue: { get: jest.fn(), set: jest.fn() },
        },
      ],
    }).compile();

    guard = module.get<TenantGuard>(TenantGuard);
    reflector = module.get<Reflector>(Reflector);
    tenantsService = module.get(TenantsService);
    cache = module.get(CacheUtilsService);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should be defined', () => {
    expect(guard).toBeDefined();
  });

  describe('canActivate', () => {
    it('should allow when @SkipTenant is present', () => {
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(true);

      const result = guard.canActivate(mockExecutionContext);

      expect(result).toBe(true);
    });

    it('should allow when tenantId is present and tenant is ACTIVE', async () => {
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(false);
      jest.spyOn(TenantContextService, 'getTenantId').mockReturnValue('tenant-123');
      cache.get.mockResolvedValue(undefined);
      tenantsService.findOne.mockResolvedValue({ status: TenantStatus.ACTIVE });

      const result = await guard.canActivate(mockExecutionContext);

      expect(result).toBe(true);
    });

    it('should throw ForbiddenException when tenant is SUSPENDED', async () => {
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(false);
      jest.spyOn(TenantContextService, 'getTenantId').mockReturnValue('tenant-123');
      cache.get.mockResolvedValue(undefined);
      tenantsService.findOne.mockResolvedValue({ status: TenantStatus.SUSPENDED });

      await expect(guard.canActivate(mockExecutionContext) as Promise<boolean>).rejects.toThrow(ForbiddenException);
    });

    it('should throw ForbiddenException when tenant not found (null)', async () => {
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(false);
      jest.spyOn(TenantContextService, 'getTenantId').mockReturnValue('tenant-123');
      cache.get.mockResolvedValue(undefined);
      tenantsService.findOne.mockResolvedValue(null);

      await expect(guard.canActivate(mockExecutionContext) as Promise<boolean>).rejects.toThrow(ForbiddenException);
      await expect(guard.canActivate(mockExecutionContext) as Promise<boolean>).rejects.toThrow(
        'tenants.tenant_suspended',
      );
    });

    it('should throw UnauthorizedException when no tenantId', () => {
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(false);
      jest.spyOn(TenantContextService, 'getTenantId').mockReturnValue(undefined);

      expect(() => guard.canActivate(mockExecutionContext)).toThrow(UnauthorizedException);
      expect(() => guard.canActivate(mockExecutionContext)).toThrow('Tenant context missing');
    });

    it('should check both handler and class for SkipTenant', async () => {
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(true);

      await guard.canActivate(mockExecutionContext);

      expect(reflector.getAllAndOverride).toHaveBeenCalledWith(SKIP_TENANT_KEY, [
        mockExecutionContext.getHandler(),
        mockExecutionContext.getClass(),
      ]);
    });
  });
});
