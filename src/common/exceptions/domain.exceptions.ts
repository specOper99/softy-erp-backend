/**
 * Typed business exceptions: `code` + `args` for i18n; human text is produced in AllExceptionsFilter.
 */

import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';

export abstract class DomainException extends Error {
  abstract readonly code: string;
  abstract readonly statusCode: number;

  constructor(message: string) {
    super(message);
    this.name = this.constructor.name;
  }

  toJSON() {
    return {
      statusCode: this.statusCode,
      error: this.name,
      code: this.code,
      message: this.message,
    };
  }
}

export class BookingNotFoundError extends NotFoundException {
  constructor(bookingId: string) {
    super({
      code: 'booking.not_found',
      args: { id: bookingId },
    });
  }
}

export class UserNotFoundError extends NotFoundException {
  constructor(userId: string) {
    super({
      code: 'user.not_found',
      args: { id: userId },
    });
  }
}

export class TaskNotFoundError extends NotFoundException {
  constructor(taskId: string) {
    super({
      code: 'task.not_found',
      args: { id: taskId },
    });
  }
}

export class WalletNotFoundError extends NotFoundException {
  constructor(userId: string) {
    super({
      code: 'wallet.not_found',
      args: { id: userId },
    });
  }
}

export class ProfileNotFoundError extends NotFoundException {
  constructor(identifier: string) {
    super({
      code: 'profile.not_found',
      args: { identifier },
    });
  }
}

export class CrossTenantAccessError extends ForbiddenException {
  constructor() {
    super({
      code: 'common.cross_tenant_operation_denied',
    });
  }
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

export enum TenantMismatchOperation {
  READ = 'READ',
  CREATE = 'CREATE',
  UPDATE = 'UPDATE',
  DELETE = 'DELETE',
  EXPORT = 'EXPORT',
  STREAM = 'STREAM',
}

export class InsufficientPermissionsError extends ForbiddenException {
  constructor(action: string) {
    super({
      code: 'auth.insufficient_permissions',
      args: { action },
    });
  }
}

export class InvalidBookingTransitionError extends BadRequestException {
  constructor(from: string, to: string) {
    super({
      code: 'booking.invalid_transition',
      args: { from, to },
    });
  }
}

export class TaskAlreadyAssignedError extends ConflictException {
  constructor(taskId: string) {
    super({
      code: 'task.already_assigned',
      args: { id: taskId },
    });
  }
}

export class InsufficientBalanceError extends BadRequestException {
  constructor(required: number, available: number) {
    super({
      code: 'wallet.insufficient_balance',
      args: { required, available },
    });
  }
}

export class DuplicateEmailError extends ConflictException {
  constructor(email: string) {
    super({
      code: 'user.duplicate_email',
      args: { email },
    });
  }
}

export class BookingInTerminalStateError extends BadRequestException {
  constructor(bookingId: string, status: string) {
    super({
      code: 'booking.terminal_state',
      args: { id: bookingId, status },
    });
  }
}
