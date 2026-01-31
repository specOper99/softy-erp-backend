/**
 * Typed Business Exception Classes
 *
 * These domain-specific exceptions provide:
 * - Stronger type safety than string error codes
 * - Better IDE autocomplete and refactoring support
 * - Consistent error response structure
 * - Easy i18n integration via error codes
 *
 * @example
 * ```typescript
 * throw new BookingNotFoundError('booking-123');
 * throw new CrossTenantAccessError('User attempted to access another tenant');
 * ```
 */

import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';

// ==================== Base Domain Exceptions ====================

/**
 * Base class for domain-specific errors.
 * Extends NestJS HttpException with a consistent structure.
 */
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

// ==================== Not Found Exceptions ====================

export class BookingNotFoundError extends NotFoundException {
  constructor(bookingId: string) {
    super({
      code: 'booking.not_found',
      message: `Booking with ID ${bookingId} not found`,
    });
  }
}

export class UserNotFoundError extends NotFoundException {
  constructor(userId: string) {
    super({
      code: 'user.not_found',
      message: `User with ID ${userId} not found`,
    });
  }
}

export class TaskNotFoundError extends NotFoundException {
  constructor(taskId: string) {
    super({
      code: 'task.not_found',
      message: `Task with ID ${taskId} not found`,
    });
  }
}

export class WalletNotFoundError extends NotFoundException {
  constructor(userId: string) {
    super({
      code: 'wallet.not_found',
      message: `Wallet not found for user ${userId}`,
    });
  }
}

export class ProfileNotFoundError extends NotFoundException {
  constructor(identifier: string) {
    super({
      code: 'profile.not_found',
      message: `Profile not found: ${identifier}`,
    });
  }
}

// ==================== Authorization Exceptions ====================

export class CrossTenantAccessError extends ForbiddenException {
  constructor(message = 'Cross-tenant operation denied') {
    super({
      code: 'common.cross_tenant_operation_denied',
      message,
    });
  }
}

/**
 * Thrown when an operation attempts to access or modify data belonging to a different tenant.
 * This is a security-critical exception that should trigger alerts in production.
 */
export class TenantMismatchException extends ForbiddenException {
  /** The tenant ID from the current context */
  readonly contextTenantId: string;
  /** The tenant ID of the entity being accessed (if known) */
  readonly entityTenantId?: string;
  /** The type of operation that was attempted */
  readonly operation: TenantMismatchOperation;

  constructor(options: {
    contextTenantId: string;
    entityTenantId?: string;
    operation: TenantMismatchOperation;
    entityType?: string;
    entityId?: string;
  }) {
    const entityInfo = options.entityType
      ? ` on ${options.entityType}${options.entityId ? ` (${options.entityId})` : ''}`
      : '';

    super({
      code: 'common.tenant_mismatch',
      message: `Tenant mismatch: ${options.operation} operation${entityInfo} denied`,
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
      message: `Insufficient permissions to ${action}`,
    });
  }
}

// ==================== Business Rule Exceptions ====================

export class InvalidBookingTransitionError extends BadRequestException {
  constructor(from: string, to: string) {
    super({
      code: 'booking.invalid_transition',
      message: `Cannot transition booking from ${from} to ${to}`,
    });
  }
}

export class TaskAlreadyAssignedError extends ConflictException {
  constructor(taskId: string) {
    super({
      code: 'task.already_assigned',
      message: `Task ${taskId} is already assigned`,
    });
  }
}

export class InsufficientBalanceError extends BadRequestException {
  constructor(required: number, available: number) {
    super({
      code: 'wallet.insufficient_balance',
      message: `Insufficient balance: required ${required}, available ${available}`,
    });
  }
}

export class DuplicateEmailError extends ConflictException {
  constructor(email: string) {
    super({
      code: 'user.duplicate_email',
      message: `Email ${email} is already registered`,
    });
  }
}

export class BookingInTerminalStateError extends BadRequestException {
  constructor(bookingId: string, status: string) {
    super({
      code: 'booking.terminal_state',
      message: `Booking ${bookingId} is in terminal state: ${status}`,
    });
  }
}
