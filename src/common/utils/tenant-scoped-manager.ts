import { Injectable, Logger } from '@nestjs/common';
import { DataSource, EntityManager, QueryRunner } from 'typeorm';
import { TenantContextService } from '../services/tenant-context.service';

/**
 * TenantScopedManager
 *
 * A utility wrapper for DataSource.transaction() that:
 * 1. Automatically validates tenant context
 * 2. Provides cleaner transaction syntax
 * 3. Ensures proper QueryRunner lifecycle management
 * 4. Reduces boilerplate in service methods
 *
 * ## Usage Example:
 *
 * ### Before (Verbose QueryRunner Pattern):
 * ```typescript
 * const queryRunner = this.dataSource.createQueryRunner();
 * await queryRunner.connect();
 * await queryRunner.startTransaction();
 * try {
 *   const result = await queryRunner.manager.save(...);
 *   await queryRunner.commitTransaction();
 *   return result;
 * } catch (error) {
 *   if (queryRunner.isTransactionActive) {
 *     await queryRunner.rollbackTransaction();
 *   }
 *   throw error;
 * } finally {
 *   await queryRunner.release();
 * }
 * ```
 *
 * ### After (TenantScopedManager):
 * ```typescript
 * return this.tenantTx.run(async (manager) => {
 *   const result = await manager.save(...);
 *   return result;
 * });
 * ```
 */
@Injectable()
export class TenantScopedManager {
  private readonly logger = new Logger(TenantScopedManager.name);

  constructor(private readonly dataSource: DataSource) {}

  /**
   * Execute a function within a tenant-scoped transaction.
   * Automatically validates tenant context and manages QueryRunner lifecycle.
   *
   * @param work - Async function that receives EntityManager
   * @returns Promise with the result of the work function
   * @throws Error if tenant context is missing or work function fails
   */
  async run<T>(work: (manager: EntityManager) => Promise<T>): Promise<T> {
    // Validate tenant context early
    const tenantId = TenantContextService.getTenantIdOrThrow();

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const result = await work(queryRunner.manager);
      await queryRunner.commitTransaction();
      return result;
    } catch (error) {
      if (queryRunner.isTransactionActive) {
        await queryRunner.rollbackTransaction();
        this.logger.warn(
          `Transaction rolled back for tenant ${tenantId}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * Get the current tenant ID (convenience method).
   * Useful when you need the tenantId within your transaction logic.
   */
  getTenantId(): string {
    return TenantContextService.getTenantIdOrThrow();
  }

  /**
   * Execute with manual QueryRunner access (for advanced cases).
   * Use this when you need direct access to QueryRunner (e.g., for raw SQL).
   *
   * @param work - Async function that receives QueryRunner
   * @returns Promise with the result of the work function
   */
  async runWithQueryRunner<T>(work: (queryRunner: QueryRunner) => Promise<T>): Promise<T> {
    const tenantId = TenantContextService.getTenantIdOrThrow();

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const result = await work(queryRunner);
      await queryRunner.commitTransaction();
      return result;
    } catch (error) {
      if (queryRunner.isTransactionActive) {
        await queryRunner.rollbackTransaction();
        this.logger.warn(
          `Transaction rolled back for tenant ${tenantId}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
      throw error;
    } finally {
      await queryRunner.release();
    }
  }
}
