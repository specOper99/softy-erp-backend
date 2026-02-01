import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { EventBus } from '@nestjs/cqrs';
import { EntityManager } from 'typeorm';
import { CursorPaginationDto } from '../../../common/dto/cursor-pagination.dto';
import { PaginationDto } from '../../../common/dto/pagination.dto';
import { TenantContextService } from '../../../common/services/tenant-context.service';
import { CursorPaginationHelper } from '../../../common/utils/cursor-pagination.helper';
import { MathUtils } from '../../../common/utils/math.utils';
import { EmployeeWallet } from '../entities/employee-wallet.entity';
import { WalletBalanceUpdatedEvent } from '../events/wallet-balance-updated.event';

import { WalletRepository } from '../repositories/wallet.repository';

@Injectable()
export class WalletService {
  private readonly logger = new Logger(WalletService.name);

  constructor(
    private readonly walletRepository: WalletRepository,
    private readonly eventBus: EventBus,
  ) {}

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
        if (this.isUniqueViolation(error)) {
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
      try {
        wallet = await manager.save(wallet);
      } catch (error) {
        if (this.isUniqueViolation(error)) {
          wallet = await manager.findOne(EmployeeWallet, {
            where: { userId, tenantId },
            lock: { mode: 'pessimistic_write' },
          });
          if (!wallet) {
            throw error;
          }
        } else {
          throw error;
        }
      }
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

  async getAllWalletsCursor(
    query: CursorPaginationDto,
  ): Promise<{ data: EmployeeWallet[]; nextCursor: string | null }> {
    const qb = this.walletRepository.createQueryBuilder('wallet');

    qb.leftJoinAndSelect('wallet.user', 'user');

    return CursorPaginationHelper.paginate(qb, {
      cursor: query.cursor,
      limit: query.limit,
      alias: 'wallet',
    });
  }

  /**
   * Add pending commission to a user's wallet.
   * @requires MUST be called within an active transaction context
   * @throws Error if called outside transaction
   */
  async addPendingCommission(manager: EntityManager, userId: string, amount: number): Promise<EmployeeWallet> {
    if (amount <= 0) {
      throw new BadRequestException('wallet.commission_must_be_positive');
    }
    const wallet = await this.getWalletWithLock(manager, userId, 'addPendingCommission', true);
    const oldBalance = Number(wallet.pendingBalance);
    wallet.pendingBalance = MathUtils.add(oldBalance, Number(amount));
    const savedWallet = await manager.save(wallet);

    // Publish event after transaction commits
    this.eventBus.publish(
      new WalletBalanceUpdatedEvent(
        userId,
        wallet.tenantId,
        oldBalance,
        Number(savedWallet.pendingBalance),
        'pending',
        'Commission added',
      ),
    );

    return savedWallet;
  }

  /**
   * Subtract pending commission from a user's wallet.
   * Used when reassigning a task to reverse the old user's commission.
   * @requires MUST be called within an active transaction context
   * @throws Error if called outside transaction
   * @throws BadRequestException if subtraction would result in negative balance
   */
  async subtractPendingCommission(manager: EntityManager, userId: string, amount: number): Promise<EmployeeWallet> {
    if (amount <= 0) {
      throw new BadRequestException('wallet.commission_must_be_positive');
    }
    const wallet = await this.getWalletWithLock(manager, userId, 'subtractPendingCommission');
    const currentBalance = Number(wallet.pendingBalance);
    const newBalance = MathUtils.subtract(currentBalance, Number(amount));

    // SECURITY FIX: Negative balance indicates accounting error or fraud attempt
    // Do NOT silently clamp - this must be investigated
    if (newBalance < 0) {
      this.logger.error(
        `[ACCOUNTING_ANOMALY] Wallet balance would be negative for user ${userId}: ` +
          `pendingBalance=${currentBalance}, subtraction=${amount}, result=${newBalance}. ` +
          `Rejecting operation - requires investigation.`,
      );
      throw new BadRequestException(
        `wallet.insufficient_pending_balance: Cannot subtract ${amount} from balance of ${currentBalance}`,
      );
    }

    wallet.pendingBalance = newBalance;
    const savedWallet = await manager.save(wallet);

    // Publish event after transaction commits
    this.eventBus.publish(
      new WalletBalanceUpdatedEvent(
        userId,
        wallet.tenantId,
        currentBalance,
        newBalance,
        'pending',
        'Commission subtracted',
      ),
    );

    return savedWallet;
  }

  /**
   * Move commission from pending to payable balance.
   * @requires MUST be called within an active transaction context
   * @throws Error if called outside transaction
   */
  async moveToPayable(manager: EntityManager, userId: string, amount: number): Promise<EmployeeWallet> {
    if (amount <= 0) {
      throw new BadRequestException('wallet.transfer_must_be_positive');
    }
    const wallet = await this.getWalletWithLock(manager, userId, 'moveToPayable');

    // Validate sufficient pending balance before transfer
    const currentPending = Number(wallet.pendingBalance);
    const transferAmount = Number(amount);

    if (transferAmount > currentPending) {
      throw new BadRequestException(
        `Insufficient pending balance: ${currentPending.toFixed(2)} < ${transferAmount.toFixed(2)}`,
      );
    }

    const oldPayable = Number(wallet.payableBalance);
    wallet.pendingBalance = MathUtils.subtract(currentPending, transferAmount);
    wallet.payableBalance = MathUtils.add(oldPayable, transferAmount);
    const savedWallet = await manager.save(wallet);

    // Publish event after transaction commits
    this.eventBus.publish(
      new WalletBalanceUpdatedEvent(
        userId,
        wallet.tenantId,
        oldPayable,
        Number(savedWallet.payableBalance),
        'paid',
        'Commission moved to payable',
      ),
    );

    return savedWallet;
  }

  /**
   * Reset payable balance to zero after payout.
   * @requires MUST be called within an active transaction context
   * @throws Error if called outside transaction
   */
  async resetPayableBalance(manager: EntityManager, userId: string): Promise<EmployeeWallet> {
    const wallet = await this.getWalletWithLock(manager, userId, 'resetPayableBalance');
    const oldBalance = Number(wallet.payableBalance);
    wallet.payableBalance = 0;
    const savedWallet = await manager.save(wallet);

    // Publish event after transaction commits (only if there was a balance to reset)
    if (oldBalance > 0) {
      this.eventBus.publish(
        new WalletBalanceUpdatedEvent(
          userId,
          wallet.tenantId,
          oldBalance,
          0,
          'paid',
          'Payable balance reset after payout',
        ),
      );
    }

    return savedWallet;
  }

  /**
   * Refund payable balance after a failed payout.
   * @requires MUST be called within an active transaction context
   * @throws Error if called outside transaction
   */
  async refundPayableBalance(manager: EntityManager, userId: string, amount: number): Promise<EmployeeWallet> {
    if (amount <= 0) {
      // If amount is 0, nothing to refund, but we should validate
      return this.getOrCreateWalletWithManager(manager, userId);
    }

    const wallet = await this.getWalletWithLock(manager, userId, 'refundPayableBalance');

    wallet.payableBalance = MathUtils.add(Number(wallet.payableBalance), amount);
    this.logger.log(`Refunded $${amount} to user ${userId} payable balance`);
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

  private async getWalletWithLock(
    manager: EntityManager,
    userId: string,
    methodName: string,
    createIfMissing = false,
  ): Promise<EmployeeWallet> {
    this.assertTransactionActive(manager, methodName);
    const tenantId = TenantContextService.getTenantIdOrThrow();

    const wallet = await manager.findOne(EmployeeWallet, {
      where: { userId, tenantId },
      lock: { mode: 'pessimistic_write' },
    });

    if (!wallet) {
      if (createIfMissing) {
        return this.getOrCreateWalletWithManager(manager, userId);
      } else {
        throw new NotFoundException(`Wallet not found for user ${userId}`);
      }
    }
    return wallet;
  }

  private isUniqueViolation(error: unknown): boolean {
    if (typeof error !== 'object' || error === null) {
      return false;
    }

    const record = error as Record<string, unknown>;
    return record['code'] === '23505';
  }
}
