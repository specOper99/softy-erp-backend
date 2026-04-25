import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import type { NextFunction, Request, Response } from 'express';
import { Tenant } from '../../tenants/entities/tenant.entity';
import { TenantsService } from '../../tenants/tenants.service';
import { ValidateTenantSlugMiddleware } from './validate-tenant-slug.decorator';

describe('ValidateTenantSlugMiddleware', () => {
  let middleware: ValidateTenantSlugMiddleware;
  let tenantsService: { findBySlug: jest.Mock; ensurePortalTenantAccessible: jest.Mock };

  const mockTenant = { id: 'tenant-1', slug: 'acme', status: 'ACTIVE' } as Tenant;

  const buildRequest = (slug?: string): Request =>
    ({
      params: slug !== undefined ? { slug } : {},
    }) as unknown as Request;

  const mockRes = {} as Response;
  const mockNext: NextFunction = jest.fn();

  beforeEach(async () => {
    tenantsService = {
      findBySlug: jest.fn(),
      ensurePortalTenantAccessible: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [ValidateTenantSlugMiddleware, { provide: TenantsService, useValue: tenantsService }],
    }).compile();

    middleware = module.get<ValidateTenantSlugMiddleware>(ValidateTenantSlugMiddleware);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(middleware).toBeDefined();
  });

  describe('use()', () => {
    it('throws BadRequestException when slug param is absent', async () => {
      await expect(middleware.use(buildRequest(), mockRes, mockNext)).rejects.toThrow(BadRequestException);
      await expect(middleware.use(buildRequest(), mockRes, mockNext)).rejects.toThrow('Tenant slug is required');
      expect(tenantsService.findBySlug).not.toHaveBeenCalled();
    });

    it('delegates tenant lookup to TenantsService.findBySlug', async () => {
      tenantsService.findBySlug.mockResolvedValue(mockTenant);

      await middleware.use(buildRequest('acme'), mockRes, mockNext);

      expect(tenantsService.findBySlug).toHaveBeenCalledWith('acme');
    });

    it('delegates accessibility check to TenantsService.ensurePortalTenantAccessible', async () => {
      tenantsService.findBySlug.mockResolvedValue(mockTenant);

      await middleware.use(buildRequest('acme'), mockRes, mockNext);

      expect(tenantsService.ensurePortalTenantAccessible).toHaveBeenCalledWith(
        mockTenant,
        expect.objectContaining({ guard: 'ValidateTenantSlugMiddleware', tenantSlug: 'acme' }),
      );
    });

    it('injects tenant into request and calls next() when tenant is active', async () => {
      tenantsService.findBySlug.mockResolvedValue(mockTenant);
      const req = buildRequest('acme');

      await middleware.use(req, mockRes, mockNext);

      expect((req as Request & { tenant?: Tenant }).tenant).toEqual(mockTenant);
      expect(mockNext).toHaveBeenCalled();
    });

    it('propagates ForbiddenException when tenant is suspended or locked', async () => {
      const suspendedTenant = { ...mockTenant, status: 'SUSPENDED' } as Tenant;
      tenantsService.findBySlug.mockResolvedValue(suspendedTenant);
      tenantsService.ensurePortalTenantAccessible.mockImplementation(() => {
        throw new ForbiddenException('client-portal.tenant_blocked');
      });

      await expect(middleware.use(buildRequest('acme'), mockRes, mockNext)).rejects.toThrow(ForbiddenException);
      await expect(middleware.use(buildRequest('acme'), mockRes, mockNext)).rejects.toThrow(
        'client-portal.tenant_blocked',
      );
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('propagates NotFoundException when tenant slug is unknown', async () => {
      const { NotFoundException } = await import('@nestjs/common');
      tenantsService.findBySlug.mockRejectedValue(new NotFoundException());

      await expect(middleware.use(buildRequest('unknown-slug'), mockRes, mockNext)).rejects.toThrow(NotFoundException);
    });
  });
});
