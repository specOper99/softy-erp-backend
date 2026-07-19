import { Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { FinanceService } from '../../finance/application/finance.service';
import { Invoice } from '../../finance/domain/entities/invoice.entity';
import { Transaction } from '../../finance/domain/entities/transaction.entity';
import { TransactionType } from '../../finance/domain/enums/transaction-type.enum';
import { TaskAssignee } from '../../tasks/domain/entities/task-assignee.entity';
import { Task } from '../../tasks/domain/entities/task.entity';
import { Booking } from '../domain/entities/booking.entity';

export type ConfirmDepositResult = {
  depositTx: Transaction | null;
  transactionId: string | null;
};

/**
 * Booking-side finance effects: deposit on confirm, cancel reversal,
 * commission transfer, invoice cancel sync.
 */
@Injectable()
export class BookingFinanceEffectsService {
  constructor(private readonly financeService: FinanceService) {}

  /**
   * Posts remaining deposit as INCOME when confirm settles unpaid deposit.
   * Updates booking.amountPaid / paymentStatus on the in-memory entity (caller saves).
   */
  async applyConfirmDeposit(manager: EntityManager, booking: Booking): Promise<ConfirmDepositResult> {
    const depositAmount = Number(booking.depositAmount) || 0;
    const alreadyPaid = Number(booking.amountPaid) || 0;

    if (depositAmount <= 0 || alreadyPaid >= depositAmount) {
      return { depositTx: null, transactionId: null };
    }

    const remainingDeposit = depositAmount - alreadyPaid;

    const depositTx = await this.financeService.createTransactionWithManager(manager, {
      type: TransactionType.INCOME,
      amount: remainingDeposit,
      category: 'Booking Deposit',
      bookingId: booking.id,
      description: `Deposit payment on confirm: ${booking.client?.name || 'Unknown Client'} - ${booking.servicePackage?.name}`,
      transactionDate: new Date(),
      revenueAccountCode: booking.servicePackage?.revenueAccountCode,
    });

    booking.amountPaid = alreadyPaid + remainingDeposit;
    booking.paymentStatus = booking.derivePaymentStatus();

    return { depositTx, transactionId: depositTx.id };
  }

  /**
   * Transfers pending commission for cancelled booking tasks (assignee or legacy assignee).
   */
  async reverseTaskCommissions(manager: EntityManager, tenantId: string, bookingTasks: Task[]): Promise<void> {
    const taskIds = bookingTasks.map((task) => task.id);
    const taskAssigneesByTaskId = new Map<string, TaskAssignee[]>();

    if (taskIds.length > 0) {
      const taskAssignees = await manager.find(TaskAssignee, {
        where: taskIds.map((taskId) => ({ tenantId, taskId })),
      });

      for (const assignee of taskAssignees) {
        const existing = taskAssigneesByTaskId.get(assignee.taskId) ?? [];
        existing.push(assignee);
        taskAssigneesByTaskId.set(assignee.taskId, existing);
      }
    }

    for (const task of bookingTasks) {
      const taskAssignees = taskAssigneesByTaskId.get(task.id) ?? [];
      if (taskAssignees.length > 0) {
        for (const assignee of taskAssignees) {
          const assigneeCommission = Number(assignee.commissionSnapshot) || 0;
          if (assigneeCommission > 0) {
            await this.financeService.transferPendingCommission(
              manager,
              assignee.userId,
              undefined,
              assigneeCommission,
            );
          }
        }
        continue;
      }

      const legacyCommission = Number(task.commissionSnapshot) || 0;
      if (task.assignedUserId && legacyCommission > 0) {
        await this.financeService.transferPendingCommission(manager, task.assignedUserId, undefined, legacyCommission);
      }
    }
  }

  /**
   * Net INCOME−REFUND reversal TX for cancel. Caller clears booking.amountPaid.
   */
  async applyCancelReversal(manager: EntityManager, tenantId: string, booking: Booking): Promise<Transaction | null> {
    const ledgerRows = await manager.find(Transaction, {
      where: {
        tenantId,
        bookingId: booking.id,
      },
    });

    const netIncome = ledgerRows.reduce((sum, tx) => {
      if (tx.voidedAt) return sum;
      const amount = Number(tx.amount) || 0;
      if (tx.type === TransactionType.INCOME) return sum + amount;
      if (tx.type === TransactionType.REFUND) return sum - Math.abs(amount);
      return sum;
    }, 0);

    const hasExistingReversal = ledgerRows.some(
      (tx) => !tx.voidedAt && (tx.category === 'Booking Reversal' || tx.reversalOfId != null),
    );

    if (netIncome <= 0 || hasExistingReversal) {
      return null;
    }

    return this.financeService.createTransactionWithManager(manager, {
      type: TransactionType.INCOME,
      amount: -netIncome,
      category: 'Booking Reversal',
      bookingId: booking.id,
      description: `Booking cancellation reversal: ${booking.client?.name || 'Unknown Client'}`,
      transactionDate: new Date(),
    });
  }

  /** Sync invoice document snapshot when booking is cancelled. */
  async cancelLinkedInvoice(manager: EntityManager, tenantId: string, bookingId: string): Promise<void> {
    const invoice = await manager.findOne(Invoice, {
      where: { bookingId, tenantId },
      lock: { mode: 'pessimistic_write' },
    });
    if (invoice) {
      invoice.cancel();
      await manager.save(invoice);
    }
  }
}
