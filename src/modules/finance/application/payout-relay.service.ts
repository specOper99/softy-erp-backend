import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import pLimit from 'p-limit';
import { DataSource, LessThanOrEqual } from 'typeorm';
import { TENANT_REPO_PAYOUT } from '../../../common/constants/tenant-repo.tokens';
import { TenantAwareRepository } from '../../../common/repositories/tenant-aware.repository';
import { DistributedLockService } from '../../../common/services/distributed-lock.service';
import { TenantContextService } from '../../../common/services/tenant-context.service';
import { TenantScopedManager } from '../../../common/utils/tenant-scoped-manager';
import { isRecord, readRecordString } from '../../../common/utils/error.util';
import { PAYMENT_GATEWAY, type PaymentGateway } from '../../hr/application/payment-gateway.service';
import { TenantsService } from '../../tenants/application/tenants.service';
import { FINANCE } from '../domain/constants';
import { Payout } from '../domain/entities/payout.entity';
import { Transaction } from '../domain/entities/transaction.entity';
import { PayoutStatus } from '../domain/enums/payout-status.enum';
import { TransactionType } from '../domain/enums/transaction-type.enum';
import { FinanceService } from './finance.service';
import { WalletService } from './wallet.service';

@Injectable()
export class PayoutRelayService {
  private readonly logger = new Logger(PayoutRelayService.name);
  private readonly tenantTx: TenantScopedManager;
  private static readonly CRON_LOCK_KEY = `${FINANCE.LOCK.PAYOUT_PROCESSING}:relay`;

  constructor(
    @Inject(TENANT_REPO_PAYOUT)
    private readonly payoutRepository: TenantAwareRepository<Payout>,
    @Inject(PAYMENT_GATEWAY)
    private readonly paymentGatewayService: PaymentGateway,
    private readonly walletService: WalletService,
    private readonly financeService: FinanceService,
    dataSource: DataSource,
    private readonly distributedLockService: DistributedLockService,
    private readonly tenantsService: TenantsService,
  ) {
    this.tenantTx = new TenantScopedManager(dataSource);
  }

  @Cron(CronExpression.EVERY_MINUTE)
  async processPendingPayouts(): Promise<void> {
    const result = await this.distributedLockService.withLock(
      PayoutRelayService.CRON_LOCK_KEY,
      async () => {
        await this.processBatch();
        return true;
      },
      {
        ttl: FINANCE.TIME.ONE_MINUTE_MS,
        maxRetries: 0,
      },
    );

    if (result === null) {
      this.logger.debug('Skipping payout relay: another instance is running.');
    }
  }

  async processBatch(): Promise<void> {
    const tenants = await this.tenantsService.findAll();
    const tenantLimit = pLimit(FINANCE.BATCH.MAX_CONCURRENCY);

    await Promise.allSettled(
      tenants.map((tenant) =>
        tenantLimit(async () => {
          await TenantContextService.run(tenant.id, async () => {
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

            this.logger.log(`Tenant ${tenant.id}: found ${payouts.length} pending payouts to process`);

            const payoutLimit = pLimit(FINANCE.BATCH.MAX_CONCURRENCY);
            await Promise.allSettled(payouts.map((payout) => payoutLimit(() => this.processSinglePayout(payout))));
          });
        }),
      ),
    );
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
    if (!isRecord(metadataUnknown)) return null;

    const userId = readRecordString(metadataUnknown, 'userId');
    const bankAccount = readRecordString(metadataUnknown, 'bankAccount');
    const referenceId = readRecordString(metadataUnknown, 'referenceId');
    const employeeName = readRecordString(metadataUnknown, 'employeeName');

    if (!userId || userId.length === 0) return null;
    if (!bankAccount || bankAccount.length === 0) return null;

    const finalReferenceId = referenceId && referenceId.length > 0 ? referenceId : `PAYOUT-${payout.id}`;
    const finalEmployeeName = employeeName && employeeName.length > 0 ? employeeName : 'Employee';

    return {
      userId,
      employeeName: finalEmployeeName,
      bankAccount,
      referenceId: finalReferenceId,
    };
  }

  private async completePayout(payout: Payout, transactionReference?: string): Promise<void> {
    try {
      let payoutTx: Transaction | undefined;
      await this.tenantTx.run(async (manager) => {
        payout.status = PayoutStatus.COMPLETED;
        payout.notes = `${payout.notes || ''} | TxnRef: ${transactionReference}`;
        await manager.save(payout);

        payoutTx = await this.financeService.createTransactionWithManager(manager, {
          type: TransactionType.PAYROLL,
          amount: Number(payout.amount),
          category: 'Monthly Payroll',
          payoutId: payout.id,
          description: `Payroll payout completed. Ref: ${transactionReference}`,
          transactionDate: new Date(),
        });
      });

      if (payoutTx) {
        await this.financeService.notifyTransactionCreated(payoutTx);
      }

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
