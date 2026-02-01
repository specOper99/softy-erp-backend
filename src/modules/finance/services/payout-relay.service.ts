import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, LessThanOrEqual, Repository } from 'typeorm';
import { DistributedLockService } from '../../../common/services/distributed-lock.service';
import { TenantContextService } from '../../../common/services/tenant-context.service';
import { TenantScopedManager } from '../../../common/utils/tenant-scoped-manager';
import { MockPaymentGatewayService } from '../../hr/services/payment-gateway.service';
import { FINANCE } from '../constants';
import { Payout } from '../entities/payout.entity';
import { PayoutStatus } from '../enums/payout-status.enum';
import { TransactionType } from '../enums/transaction-type.enum';
import { FinanceService } from './finance.service';
import { WalletService } from './wallet.service';

@Injectable()
export class PayoutRelayService {
  private readonly logger = new Logger(PayoutRelayService.name);
  private readonly tenantTx: TenantScopedManager;
  /** Lock key for payout relay cron job */
  private static readonly CRON_LOCK_KEY = `${FINANCE.LOCK.PAYOUT_PROCESSING}:relay`;

  constructor(
    @InjectRepository(Payout)
    private readonly payoutRepository: Repository<Payout>,
    private readonly paymentGatewayService: MockPaymentGatewayService,
    private readonly walletService: WalletService,
    private readonly financeService: FinanceService,
    private readonly dataSource: DataSource,
    private readonly distributedLockService: DistributedLockService,
  ) {
    this.tenantTx = new TenantScopedManager(dataSource);
  }

  /**
   * Periodic job to process pending payouts.
   * Runs every minute.
   */
  @Cron(CronExpression.EVERY_MINUTE)
  async processPendingPayouts(): Promise<void> {
    const result = await this.distributedLockService.withLock(
      PayoutRelayService.CRON_LOCK_KEY,
      async () => {
        await this.processBatch();
        return true;
      },
      {
        ttl: FINANCE.TIME.ONE_MINUTE_MS, // 1 minute lock TTL matches cron interval
        maxRetries: 0, // Don't retry - let next cron tick handle it
      },
    );

    if (result === null) {
      this.logger.debug('Skipping payout relay: another instance is running.');
    }
  }

  async processBatch(): Promise<void> {
    const payouts = await this.payoutRepository.find({
      where: {
        status: PayoutStatus.PENDING,
        payoutDate: LessThanOrEqual(new Date()),
      },
      take: FINANCE.BATCH.DEFAULT_BATCH_SIZE,
      order: { payoutDate: 'ASC' },
    });

    if (payouts.length === 0) {
      return;
    }

    this.logger.log(`Found ${payouts.length} pending payouts to process`);

    for (const payout of payouts) {
      await this.processSinglePayout(payout);
    }
  }

  private async processSinglePayout(payout: Payout): Promise<void> {
    const loggerMetadata = { payoutId: payout.id, tenantId: payout.tenantId };

    await TenantContextService.run(payout.tenantId, async () => {
      try {
        const metadata = this.getPayoutMetadata(payout);
        if (!metadata) {
          this.logger.error(`Payout ${payout.id} missing or invalid metadata`, loggerMetadata);
          await this.failPayout(payout, 'Missing or invalid metadata');
          return;
        }

        if (metadata.bankAccount === 'NO_BANK_ACCOUNT') {
          this.logger.error(`Payout ${payout.id} has no bank account on file`, loggerMetadata);
          await this.failPayout(payout, 'Missing bank account');
          return;
        }

        const gatewayResult = await this.paymentGatewayService.triggerPayout({
          employeeName: metadata.employeeName,
          bankAccount: metadata.bankAccount,
          amount: Number(payout.amount),
          referenceId: metadata.referenceId,
        });

        if (gatewayResult.success) {
          await this.completePayout(payout, gatewayResult.transactionReference);
        } else {
          await this.failPayout(payout, gatewayResult.error || 'Gateway failed');
        }
      } catch (error) {
        this.logger.error(`Error processing payout ${payout.id}`, error);
      }
    });
  }

  private getPayoutMetadata(
    payout: Payout,
  ): { userId: string; employeeName: string; bankAccount: string; referenceId: string } | null {
    const metadataUnknown: unknown = payout.metadata;
    if (!metadataUnknown || typeof metadataUnknown !== 'object') return null;

    const metadata = metadataUnknown as Record<string, unknown>;

    const userId = metadata.userId;
    const bankAccount = metadata.bankAccount;
    const referenceId = metadata.referenceId;
    const employeeName = metadata.employeeName;

    if (typeof userId !== 'string' || userId.length === 0) return null;
    if (typeof bankAccount !== 'string' || bankAccount.length === 0) return null;

    const finalReferenceId =
      typeof referenceId === 'string' && referenceId.length > 0 ? referenceId : `PAYOUT-${payout.id}`;
    const finalEmployeeName = typeof employeeName === 'string' && employeeName.length > 0 ? employeeName : 'Employee';

    return {
      userId,
      employeeName: finalEmployeeName,
      bankAccount,
      referenceId: finalReferenceId,
    };
  }

  private async completePayout(payout: Payout, transactionReference?: string): Promise<void> {
    try {
      await this.tenantTx.run(async (manager) => {
        payout.status = PayoutStatus.COMPLETED;
        payout.notes = `${payout.notes || ''} | TxnRef: ${transactionReference}`;
        await manager.save(payout);

        // Create ERP Transaction
        await this.financeService.createTransactionWithManager(manager, {
          type: TransactionType.PAYROLL,
          amount: Number(payout.amount),
          category: 'Monthly Payroll',
          payoutId: payout.id,
          description: `Payroll payout completed. Ref: ${transactionReference}`,
          transactionDate: new Date(),
        });

        // No need to touch Wallet here, as balance was zeroed in the initial Payroll run.
      });

      this.logger.log(`Payout ${payout.id} completed successfully`);
    } catch (error) {
      this.logger.error(`Failed to complete payout ${payout.id} in DB`, error);
      throw error;
    }
  }

  private async failPayout(payout: Payout, reason: string): Promise<void> {
    try {
      await this.tenantTx.run(async (manager) => {
        payout.status = PayoutStatus.FAILED;
        payout.notes = `${payout.notes || ''} | Failed: ${reason}`;
        await manager.save(payout);

        const metadata = this.getPayoutMetadata(payout);
        if (metadata) {
          const commissionAmount = Number(payout.commissionAmount) || 0;
          if (commissionAmount > 0) {
            await this.walletService.refundPayableBalance(manager, metadata.userId, commissionAmount);
          }
        }
      });

      this.logger.warn(`Payout ${payout.id} marked as FAILED. Refunded if applicable.`);
    } catch (error) {
      this.logger.error(`Failed to mark payout ${payout.id} as FAILED`, error);
    }
  }
}
