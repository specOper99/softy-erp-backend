import { ForbiddenException, NotFoundException } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import type { DataSource } from 'typeorm';
import { AbilityFactory } from '../authorization/ability.factory';
import type { CaslShadowMetric } from '../authorization/casl-shadow.metric';
import { Client } from '../../modules/bookings/entities/client.entity';
import { Role } from '../../modules/users/enums/role.enum';
import { TenantContextService } from '../services/tenant-context.service';
import { ResourceOwnershipGuard } from './resource-ownership.guard';

describe('ResourceOwnershipGuard', () => {
  const invoiceQueryBuilder = {
    select: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    getOne: jest.fn(),
  };

  const clientQueryBuilder = {
    select: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    getOne: jest.fn(),
  };

  const taskQueryBuilder = {
    select: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    getOne: jest.fn(),
  };

  const dataSource = {
    createQueryBuilder: jest.fn((entity: unknown) => {
      if (entity === 'Invoice') return invoiceQueryBuilder;
      if (entity === Client) return clientQueryBuilder;
      if (entity === 'Task') return taskQueryBuilder;
      return invoiceQueryBuilder;
    }),
  } as unknown as DataSource;

  const reflector = {
    get: jest.fn(),
  } as unknown as Reflector;

  const caslShadowMetric = {
    recordDisagreement: jest.fn(),
  } as unknown as CaslShadowMetric;

  const guard = new ResourceOwnershipGuard(reflector, dataSource, new AbilityFactory(), caslShadowMetric);

  const createContext = (user: Record<string, unknown>): Parameters<ResourceOwnershipGuard['canActivate']>[0] =>
    ({
      switchToHttp: () =>
        ({
          getRequest: () => ({ user, params: { id: 'invoice-1' } }),
        }) as unknown as ReturnType<ReturnType<typeof guard.canActivate> extends Promise<infer _> ? never : never>,
      getHandler: () => ({}),
      getClass: () => class TestClass {},
      getArgs: () => [],
      getArgByIndex: () => undefined,
      switchToRpc: () => ({}) as never,
      switchToWs: () => ({}) as never,
      getType: () => 'http',
    }) as never;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('allows admin bypass roles', async () => {
    (reflector.get as jest.Mock).mockReturnValue({
      resourceType: 'Invoice',
      paramName: 'id',
      ownerField: 'clientId',
      userField: 'clientId',
      allowRoles: [Role.ADMIN],
    });

    const allowed = await TenantContextService.run('tenant-1', () =>
      guard.canActivate(createContext({ id: 'user-1', role: Role.ADMIN, tenantId: 'tenant-1' })),
    );

    expect(allowed).toBe(true);
  });

  it('resolves clientId from tenant/email when user has none', async () => {
    (reflector.get as jest.Mock).mockReturnValue({
      resourceType: 'Invoice',
      paramName: 'id',
      ownerField: 'clientId',
      userField: 'clientId',
      allowRoles: [Role.ADMIN, Role.OPS_MANAGER],
    });

    clientQueryBuilder.getOne.mockResolvedValue({ id: 'client-1' });
    invoiceQueryBuilder.getOne.mockResolvedValue({ id: 'invoice-1', clientId: 'client-1' });

    const allowed = await TenantContextService.run('tenant-1', () =>
      guard.canActivate(
        createContext({ id: 'user-1', email: 'client@example.com', role: Role.CLIENT, tenantId: 'tenant-1' }),
      ),
    );

    expect(allowed).toBe(true);
  });

  it('denies access when client mapping does not match resource owner', async () => {
    (reflector.get as jest.Mock).mockReturnValue({
      resourceType: 'Invoice',
      paramName: 'id',
      ownerField: 'clientId',
      userField: 'clientId',
      allowRoles: [Role.ADMIN, Role.OPS_MANAGER],
    });

    clientQueryBuilder.getOne.mockResolvedValue({ id: 'client-2' });
    invoiceQueryBuilder.getOne.mockResolvedValue({ id: 'invoice-1', clientId: 'client-1' });

    await expect(
      TenantContextService.run('tenant-1', () =>
        guard.canActivate(
          createContext({ id: 'user-1', email: 'client@example.com', role: Role.CLIENT, tenantId: 'tenant-1' }),
        ),
      ),
    ).rejects.toThrow(ForbiddenException);
  });

  it('throws not found when resource does not exist', async () => {
    (reflector.get as jest.Mock).mockReturnValue({
      resourceType: 'Invoice',
      paramName: 'id',
      ownerField: 'clientId',
      userField: 'clientId',
      allowRoles: [Role.ADMIN, Role.OPS_MANAGER],
    });

    clientQueryBuilder.getOne.mockResolvedValue({ id: 'client-1' });
    invoiceQueryBuilder.getOne.mockResolvedValue(null);

    await expect(
      TenantContextService.run('tenant-1', () =>
        guard.canActivate(
          createContext({ id: 'user-1', email: 'client@example.com', role: Role.CLIENT, tenantId: 'tenant-1' }),
        ),
      ),
    ).rejects.toThrow(NotFoundException);
  });

  it('records CASL shadow disagreement when legacy and CASL decisions differ', async () => {
    (reflector.get as jest.Mock).mockReturnValue({
      resourceType: 'Invoice',
      paramName: 'id',
      ownerField: 'clientId',
      userField: 'clientId',
      allowRoles: [Role.ADMIN, Role.OPS_MANAGER],
    });

    await TenantContextService.run('tenant-1', () =>
      guard.canActivate(createContext({ id: 'ops-1', role: Role.OPS_MANAGER, tenantId: 'tenant-1' })),
    );

    expect(caslShadowMetric.recordDisagreement).toHaveBeenCalledWith(
      expect.objectContaining({
        role: Role.OPS_MANAGER,
        action: 'read',
        subject: 'Invoice',
        decision_legacy: 'allow',
        decision_casl: 'deny',
      }),
    );
  });
});
