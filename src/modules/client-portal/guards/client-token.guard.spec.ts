import { ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Client } from '../../bookings/entities/client.entity';
import { TenantsService } from '../../tenants/tenants.service';
import { ClientAuthService } from '../services/client-auth.service';
import { ClientTokenGuard } from './client-token.guard';

describe('ClientTokenGuard', () => {
  let guard: ClientTokenGuard;
  let clientAuthService: jest.Mocked<ClientAuthService>;
  let tenantsService: { findOne: jest.Mock; ensurePortalTenantAccessible: jest.Mock };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ClientTokenGuard,
        {
          provide: ClientAuthService,
          useValue: {
            validateClientToken: jest.fn(),
          },
        },
        {
          provide: TenantsService,
          useValue: {
            findOne: jest.fn().mockResolvedValue({ id: 'tenant-1', status: 'ACTIVE' }),
            ensurePortalTenantAccessible: jest.fn(),
          },
        },
      ],
    }).compile();

    guard = module.get<ClientTokenGuard>(ClientTokenGuard);
    clientAuthService = module.get(ClientAuthService);
    tenantsService = module.get(TenantsService);
  });

  it('should be defined', () => {
    expect(guard).toBeDefined();
  });

  describe('canActivate', () => {
    it('should allow when x-client-token header is present', async () => {
      const mockContext = {
        switchToHttp: jest.fn().mockReturnValue({
          getRequest: () => ({
            headers: { 'x-client-token': 'valid-token-123' },
          }),
        }),
      } as unknown as ExecutionContext;

      clientAuthService.validateClientToken.mockResolvedValue({ id: 'client-1' } as Client);
      const result = await guard.canActivate(mockContext);

      expect(result).toBe(true);
      expect(tenantsService.findOne).toHaveBeenCalled();
      expect(tenantsService.ensurePortalTenantAccessible).toHaveBeenCalled();
    });

    it('should throw UnauthorizedException when token is missing', async () => {
      const mockContext = {
        switchToHttp: jest.fn().mockReturnValue({
          getRequest: () => ({
            headers: {},
          }),
        }),
      } as unknown as ExecutionContext;

      await expect(guard.canActivate(mockContext)).rejects.toThrow(UnauthorizedException);
      await expect(guard.canActivate(mockContext)).rejects.toThrow('client-portal.token_required');
    });

    it('should throw when token is empty string', async () => {
      const mockContext = {
        switchToHttp: jest.fn().mockReturnValue({
          getRequest: () => ({
            headers: { 'x-client-token': '' },
          }),
        }),
      } as unknown as ExecutionContext;

      await expect(guard.canActivate(mockContext)).rejects.toThrow(UnauthorizedException);
    });

    it('should throw when token is invalid', async () => {
      const mockContext = {
        switchToHttp: jest.fn().mockReturnValue({
          getRequest: () => ({
            headers: { 'x-client-token': 'invalid-token' },
          }),
        }),
      } as unknown as ExecutionContext;

      clientAuthService.validateClientToken.mockResolvedValue(null);

      await expect(guard.canActivate(mockContext)).rejects.toThrow(UnauthorizedException);
      await expect(guard.canActivate(mockContext)).rejects.toThrow('client-portal.token_invalid');
    });

    it('should throw when tenant is blocked', async () => {
      const mockContext = {
        switchToHttp: jest.fn().mockReturnValue({
          getRequest: () => ({
            headers: { 'x-client-token': 'valid-token' },
          }),
        }),
      } as unknown as ExecutionContext;

      clientAuthService.validateClientToken.mockResolvedValue({ id: 'client-1', tenantId: 'tenant-1' } as Client);
      tenantsService.ensurePortalTenantAccessible.mockImplementation(() => {
        throw new ForbiddenException('client-portal.tenant_blocked');
      });

      await expect(guard.canActivate(mockContext)).rejects.toThrow(ForbiddenException);
      await expect(guard.canActivate(mockContext)).rejects.toThrow('client-portal.tenant_blocked');
      expect(tenantsService.ensurePortalTenantAccessible).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ guard: 'ClientTokenGuard' }),
      );
    });
  });
});
