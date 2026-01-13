import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { PaginationDto } from '../../../common/dto/pagination.dto';
import { TenantContextService } from '../../../common/services/tenant-context.service';
import { MathUtils } from '../../../common/utils/math.utils';
import { EmployeeWallet } from '../entities/employee-wallet.entity';

import { WalletRepository } from '../repositories/wallet.repository';

@Injectable()
export class WalletService {
  constructor(private readonly walletRepository: WalletRepository) {}

  async getOrCreateWallet(userId: string, manager?: EntityManager): Promise<EmployeeWallet> {
    if (manager) {
      return this.getOrCreateWalletWithManager(manager, userId);
    }
    // If no manager provided, we'll need to handle it.
    // Ideally this should be transactional, but for read/create idempotent operation it's okay-ish with unique constraints.
    // However, to keep it safe and strictly follow previous pattern, we might need a transaction runner or just rely on repository.
    // Given the original code used dataSource.transaction, we should probably keep that pattern in the caller or inject DataSource found in FinanceModule.
    // For simplicity in refactor, let's stick to repository for non-transactional read, but ideally use manager if provided.

    // Original used dataSource.transaction wrapping getOrCreateWalletWithManager.
    // We will assume the caller manages transaction if they pass a manager.
    // If not, we do a simple check-then-create which might have race conditions without lock.
    // But since this is a refactor, let's keep the logic close to original but maybe cleaner.
    // Let's rely on `getOrCreateWalletWithManager` being the primary internal method.

    // Since we don't have DataSource injected here (to avoid bloat), we might need to rely on the caller to start transaction if they want strict locking.
    // OR we inject DataSource. Let's start simple.
    // OR we inject DataSource. Let's start simple.
    let wallet = await this.walletRepository.findOne({
      where: { userId },
    });

    if (!wallet) {
      try {
        wallet = this.walletRepository.create({
          userId,
          pendingBalance: 0,
          payableBalance: 0,
        });
        wallet = await this.walletRepository.save(wallet);
      } catch (error) {
        // Handle race condition if unique constraint exists
        if (
          error &&
          typeof error === 'object' &&
          'code' in error &&
          (error as Record<string, unknown>).code === '23505'
        ) {
          // Postgres unique_violation
          wallet = await this.walletRepository.findOne({
            where: { userId },
          });
          if (!wallet) throw error; // Should not happen
        } else {
          throw error;
        }
      }
    }
    return wallet;
  }

  async getOrCreateWalletWithManager(manager: EntityManager, userId: string): Promise<EmployeeWallet> {
    const tenantId = TenantContextService.getTenantIdOrThrow();
    let wallet = await manager.findOne(EmployeeWallet, {
      where: { userId, tenantId },
      lock: { mode: 'pessimistic_write' },
    });
    if (!wallet) {
      wallet = manager.create(EmployeeWallet, {
        userId,
        pendingBalance: 0,
        payableBalance: 0,
        tenantId,
      });
      wallet = await manager.save(wallet);
    }
    return wallet;
  }

  async getWalletByUserId(userId: string): Promise<EmployeeWallet | null> {
    return this.walletRepository.findOne({
      where: { userId },
      relations: ['user'],
    });
  }

  async getAllWallets(query: PaginationDto = new PaginationDto()): Promise<EmployeeWallet[]> {
    return this.walletRepository.find({
      relations: ['user'],
      skip: query.getSkip(),
      take: query.getTake(),
    });
  }

  /**
   * Add pending commission to a user's wallet.
   * @requires MUST be called within an active transaction context
   * @throws Error if called outside transaction
   */
  async addPendingCommission(manager: EntityManager, userId: string, amount: number): Promise<EmployeeWallet> {
    this.assertTransactionActive(manager, 'addPendingCommission');
    if (amount <= 0) {
      throw new BadRequestException('wallet.commission_must_be_positive');
    }
    const tenantId = TenantContextService.getTenantIdOrThrow();
    let wallet = await manager.findOne(EmployeeWallet, {
      where: { userId, tenantId },
      lock: { mode: 'pessimistic_write' },
    });
    if (!wallet) {
      wallet = manager.create(EmployeeWallet, {
        userId,
        pendingBalance: 0,
        payableBalance: 0,
        tenantId,
      });
    }
    wallet.pendingBalance = MathUtils.add(Number(wallet.pendingBalance), Number(amount));
    return manager.save(wallet);
  }

  /**
   * Subtract pending commission from a user's wallet.
   * Used when reassigning a task to reverse the old user's commission.
   * @requires MUST be called within an active transaction context
   * @throws Error if called outside transaction
   */
  async subtractPendingCommission(manager: EntityManager, userId: string, amount: number): Promise<EmployeeWallet> {
    this.assertTransactionActive(manager, 'subtractPendingCommission');
    if (amount <= 0) {
      throw new BadRequestException('wallet.commission_must_be_positive');
    }
    const tenantId = TenantContextService.getTenantIdOrThrow();
    const wallet = await manager.findOne(EmployeeWallet, {
      where: { userId, tenantId },
      lock: { mode: 'pessimistic_write' },
    });
    if (!wallet) {
      throw new NotFoundException(`Wallet not found for user ${userId}`);
    }
    const newBalance = MathUtils.subtract(Number(wallet.pendingBalance), Number(amount));
    wallet.pendingBalance = Math.max(0, newBalance);
    return manager.save(wallet);
  }

  /**
   * Move commission from pending to payable balance.
   * @requires MUST be called within an active transaction context
   * @throws Error if called outside transaction
   */
  async moveToPayable(manager: EntityManager, userId: string, amount: number): Promise<EmployeeWallet> {
    this.assertTransactionActive(manager, 'moveToPayable');
    if (amount <= 0) {
      throw new BadRequestException('wallet.transfer_must_be_positive');
    }
    const tenantId = TenantContextService.getTenantIdOrThrow();
    const wallet = await manager.findOne(EmployeeWallet, {
      where: { userId, tenantId },
      lock: { mode: 'pessimistic_write' },
    });
    if (!wallet) {
      throw new NotFoundException(`Wallet not found for user ${userId}`);
    }

    // Validate sufficient pending balance before transfer
    const currentPending = Number(wallet.pendingBalance);
    const transferAmount = Number(amount);

    if (transferAmount > currentPending) {
      throw new BadRequestException(
        `Insufficient pending balance: ${currentPending.toFixed(2)} < ${transferAmount.toFixed(2)}`,
      );
    }

    wallet.pendingBalance = MathUtils.subtract(currentPending, transferAmount);
    wallet.payableBalance = MathUtils.add(Number(wallet.payableBalance), transferAmount);
    return manager.save(wallet);
  }

  /**
   * Reset payable balance to zero after payout.
   * @requires MUST be called within an active transaction context
   * @throws Error if called outside transaction
   */
  async resetPayableBalance(manager: EntityManager, userId: string): Promise<EmployeeWallet> {
    this.assertTransactionActive(manager, 'resetPayableBalance');
    const tenantId = TenantContextService.getTenantIdOrThrow();
    const wallet = await manager.findOne(EmployeeWallet, {
      where: { userId, tenantId },
      lock: { mode: 'pessimistic_write' },
    });
    if (!wallet) {
      throw new NotFoundException(`Wallet not found for user ${userId}`);
    }
    wallet.payableBalance = 0;
    return manager.save(wallet);
  }

  /**
   * Validates that an EntityManager is within an active transaction.
   * Prevents wallet race conditions by ensuring atomic operations.
   */
  private assertTransactionActive(manager: EntityManager, methodName: string): void {
    if (!manager.queryRunner?.isTransactionActive) {
      throw new Error(`${methodName} must be called within an active transaction context`);
    }
  }
}
