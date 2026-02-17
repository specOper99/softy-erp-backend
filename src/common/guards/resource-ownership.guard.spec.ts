import { ExecutionContext, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { DataSource } from 'typeorm';
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

  const dataSource = {
    createQueryBuilder: jest.fn((entity: unknown) => {
      if (entity === 'Invoice') return invoiceQueryBuilder;
      if (entity === Client) return clientQueryBuilder;
      return invoiceQueryBuilder;
    }),
  } as unknown as DataSource;

  const reflector = {
    get: jest.fn(),
  } as unknown as Reflector;

  const guard = new ResourceOwnershipGuard(reflector, dataSource);

  const createContext = (user: Record<string, unknown>): ExecutionContext =>
    ({
      switchToHttp: () =>
        ({
          getRequest: () => ({ user, params: { id: 'invoice-1' } }),
        }) as unknown as ReturnType<ExecutionContext['switchToHttp']>,
      getHandler: () => ({}),
      getClass: () => class TestClass {},
      getArgs: () => [],
      getArgByIndex: () => undefined,
      switchToRpc: () => ({}) as never,
      switchToWs: () => ({}) as never,
      getType: () => 'http',
    }) as unknown as ExecutionContext;

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
      guard.canActivate(createContext({ id: 'user-1', role: Role.ADMIN })),
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
      guard.canActivate(createContext({ id: 'user-1', email: 'client@example.com', role: Role.CLIENT })),
    );

    expect(allowed).toBe(true);
    expect(clientQueryBuilder.select).toHaveBeenCalledWith(['client.id']);
    expect(clientQueryBuilder.where).toHaveBeenCalledWith('client.tenantId = :tenantId', { tenantId: 'tenant-1' });
    expect(clientQueryBuilder.andWhere).toHaveBeenCalledWith('client.email = :email', {
      email: 'client@example.com',
    });
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
        guard.canActivate(createContext({ id: 'user-1', email: 'client@example.com', role: Role.CLIENT })),
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
        guard.canActivate(createContext({ id: 'user-1', email: 'client@example.com', role: Role.CLIENT })),
      ),
    ).rejects.toThrow(NotFoundException);
  });
});
