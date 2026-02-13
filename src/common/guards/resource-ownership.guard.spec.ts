import { ExecutionContext, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { DataSource } from 'typeorm';
import { Client } from '../../modules/bookings/entities/client.entity';
import { Role } from '../../modules/users/enums/role.enum';
import { TenantContextService } from '../services/tenant-context.service';
import { ResourceOwnershipGuard } from './resource-ownership.guard';

describe('ResourceOwnershipGuard', () => {
  const invoiceRepo = {
    findOne: jest.fn(),
  };

  const clientRepo = {
    findOne: jest.fn(),
  };

  const dataSource = {
    getRepository: jest.fn((entity: unknown) => {
      if (entity === 'Invoice') return invoiceRepo;
      if (entity === Client) return clientRepo;
      return invoiceRepo;
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

    clientRepo.findOne.mockResolvedValue({ id: 'client-1' });
    invoiceRepo.findOne.mockResolvedValue({ id: 'invoice-1', clientId: 'client-1' });

    const allowed = await TenantContextService.run('tenant-1', () =>
      guard.canActivate(createContext({ id: 'user-1', email: 'client@example.com', role: Role.CLIENT })),
    );

    expect(allowed).toBe(true);
    expect(clientRepo.findOne).toHaveBeenCalledWith({
      where: { tenantId: 'tenant-1', email: 'client@example.com' },
      select: ['id'],
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

    clientRepo.findOne.mockResolvedValue({ id: 'client-2' });
    invoiceRepo.findOne.mockResolvedValue({ id: 'invoice-1', clientId: 'client-1' });

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

    clientRepo.findOne.mockResolvedValue({ id: 'client-1' });
    invoiceRepo.findOne.mockResolvedValue(null);

    await expect(
      TenantContextService.run('tenant-1', () =>
        guard.canActivate(createContext({ id: 'user-1', email: 'client@example.com', role: Role.CLIENT })),
      ),
    ).rejects.toThrow(NotFoundException);
  });
});
