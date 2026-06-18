import { ForbiddenException } from '@nestjs/common';

export enum TenantMismatchOperation {
  READ = 'READ',
  CREATE = 'CREATE',
  UPDATE = 'UPDATE',
  DELETE = 'DELETE',
  EXPORT = 'EXPORT',
  STREAM = 'STREAM',
}

export class TenantMismatchException extends ForbiddenException {
  readonly contextTenantId: string;
  readonly entityTenantId?: string;
  readonly operation: TenantMismatchOperation;

  constructor(options: {
    contextTenantId: string;
    entityTenantId?: string;
    operation: TenantMismatchOperation;
    entityType?: string;
    entityId?: string;
  }) {
    const target =
      options.entityType !== undefined
        ? `${options.entityType}${options.entityId ? ` (${options.entityId})` : ''}`
        : 'resource';

    super({
      code: 'common.tenant_mismatch',
      args: { operation: options.operation, target },
      contextTenantId: options.contextTenantId,
      entityTenantId: options.entityTenantId,
      operation: options.operation,
    });

    this.contextTenantId = options.contextTenantId;
    this.entityTenantId = options.entityTenantId;
    this.operation = options.operation;
  }
}
