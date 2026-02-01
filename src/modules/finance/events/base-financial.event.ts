/**
 * Base Financial Event
 *
 * Abstract base class for all financial events. Provides common structure,
 * metadata, and observability hooks for financial operations.
 *
 * Features:
 * - Automatic timestamp
 * - Correlation ID for tracing
 * - Deduplication support
 * - Prometheus metrics integration
 * - Severity classification
 */
import { IEvent } from '@nestjs/cqrs';
import { randomUUID } from 'crypto';

/**
 * Event severity levels
 */
export enum EventSeverity {
  /** Informational event */
  INFO = 'info',
  /** Warning - potential issue */
  WARNING = 'warning',
  /** Error - operation failed but recoverable */
  ERROR = 'error',
  /** Critical - requires immediate attention */
  CRITICAL = 'critical',
}

/**
 * Common metadata for all financial events
 */
export interface FinancialEventMetadata {
  /** Unique event ID */
  eventId: string;
  /** Correlation ID for request tracing */
  correlationId: string;
  /** Tenant context */
  tenantId: string;
  /** Event severity */
  severity: EventSeverity;
  /** When the event occurred */
  occurredAt: Date;
  /** Event type for routing */
  eventType: string;
  /** Additional tags for filtering/routing */
  tags: Record<string, string>;
}

/**
 * Base class for all financial events
 */
export abstract class BaseFinancialEvent implements IEvent {
  public readonly metadata: FinancialEventMetadata;

  constructor(
    tenantId: string,
    severity: EventSeverity,
    eventType: string,
    correlationId?: string,
    tags: Record<string, string> = {},
  ) {
    this.metadata = {
      eventId: randomUUID(),
      correlationId: correlationId || randomUUID(),
      tenantId,
      severity,
      occurredAt: new Date(),
      eventType,
      tags,
    };
  }

  /**
   * Unique key for deduplication in retry/alert systems
   */
  abstract get deduplicationKey(): string;

  /**
   * Human-readable description for alerts/logs
   */
  abstract get description(): string;

  /**
   * Prometheus labels for metrics
   */
  get metricsLabels(): Record<string, string> {
    return {
      tenant_id: this.metadata.tenantId,
      event_type: this.metadata.eventType,
      severity: this.metadata.severity,
      ...this.metadata.tags,
    };
  }
}

/**
 * Financial Operation Failed Event
 *
 * Generic base for operation failure events
 */
export abstract class FinancialOperationFailedEvent extends BaseFinancialEvent {
  constructor(
    tenantId: string,
    public readonly operationType: string,
    public readonly entityId: string,
    public readonly entityType: string,
    public readonly errorCode: string,
    public readonly errorMessage: string,
    severity: EventSeverity = EventSeverity.ERROR,
    correlationId?: string,
    tags: Record<string, string> = {},
  ) {
    super(tenantId, severity, `${operationType}_failed`, correlationId, {
      operation: operationType,
      entity_type: entityType,
      error_code: errorCode,
      ...tags,
    });
  }

  get deduplicationKey(): string {
    return `${this.operationType}:${this.entityType}:${this.entityId}:${this.errorCode}`;
  }

  get description(): string {
    return `${this.operationType} failed for ${this.entityType}:${this.entityId} - ${this.errorMessage}`;
  }
}
