import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';
import { TenantContextService } from '../../../common/services/tenant-context.service';
import { SKIP_TENANT_KEY } from '../decorators/skip-tenant.decorator';
import { TenantGuard } from './tenant.guard';

describe('TenantGuard', () => {
  let guard: TenantGuard;
  let reflector: Reflector;

  const mockExecutionContext = {
    switchToHttp: jest.fn().mockReturnValue({
      getRequest: () => ({}),
    }),
    getHandler: jest.fn(),
    getClass: jest.fn(),
  } as unknown as ExecutionContext;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [TenantGuard, Reflector],
    }).compile();

    guard = module.get<TenantGuard>(TenantGuard);
    reflector = module.get<Reflector>(Reflector);
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

    it('should allow when tenantId is present', () => {
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(false);
      jest.spyOn(TenantContextService, 'getTenantId').mockReturnValue('tenant-123');

      const result = guard.canActivate(mockExecutionContext);

      expect(result).toBe(true);
    });

    it('should throw UnauthorizedException when no tenantId', () => {
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(false);
      jest.spyOn(TenantContextService, 'getTenantId').mockReturnValue(undefined as any);

      expect(() => guard.canActivate(mockExecutionContext)).toThrow(UnauthorizedException);
      expect(() => guard.canActivate(mockExecutionContext)).toThrow('tenants.tenant_id_required');
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
