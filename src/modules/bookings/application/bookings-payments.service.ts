import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { DataSource, QueryFailedError } from 'typeorm';
import { OutboxEvent } from '../../../common/entities/outbox-event.entity';
import { isPostgresUniqueViolation } from '../../../common/utils/error.util';
import { MathUtils } from '../../../common/utils/math.utils';
import { Invoice } from '../../finance/domain/entities/invoice.entity';
import { Transaction } from '../../finance/domain/entities/transaction.entity';
import { TransactionType } from '../../finance/domain/enums/transaction-type.enum';
import { FinanceService } from '../../finance/application/finance.service';
import { User } from '../../users/domain/entities/user.entity';
import { MarkBookingPaidDto, RecordPaymentDto, RefundBookingDto } from '../api/dto';
import { Booking } from '../domain/entities/booking.entity';
import { BookingStatus } from '../domain/enums/booking-status.enum';
import { BookingsService } from './bookings.service';

/** Internal options: settleRemaining resolves amount under the booking lock. */
type RecordPaymentInput = RecordPaymentDto & { settleRemaining?: boolean };

@Injectable()
export class BookingsPaymentsService {
  constructor(
    private readonly bookingsService: BookingsService,
    private readonly financeService: FinanceService,
    private readonly dataSource: DataSource,
  ) {}

  async recordPayment(id: string, dto: RecordPaymentInput, user: User): Promise<void> {
    const booking = await this.bookingsService.findOne(id, user);

    if (booking.status !== BookingStatus.CONFIRMED && booking.status !== BookingStatus.COMPLETED) {
      throw new BadRequestException('booking.payment_only_confirmed_or_completed');
    }

    let result: { paymentTx: Transaction; replay: boolean };
    try {
      result = await this.dataSource.transaction(async (manager) => {
        const lockedBooking = await manager.findOne(Booking, {
          where: { id: booking.id, tenantId: booking.tenantId },
          lock: { mode: 'pessimistic_write' },
        });

        if (!lockedBooking) {
          throw new NotFoundException('bookings.not_found');
        }

        if (dto.idempotencyKey) {
          const existing = await manager.findOne(Transaction, {
            where: { tenantId: lockedBooking.tenantId, idempotencyKey: dto.idempotencyKey },
          });
          if (existing) {
            if (existing.bookingId === lockedBooking.id) {
              return { paymentTx: existing, replay: true };
            }
            throw new ConflictException('booking.payment_idempotency_conflict');
          }
        }

        const currentPaid = Number(lockedBooking.amountPaid || 0);
        const totalPrice = Number(lockedBooking.totalPrice || 0);
        const remaining = MathUtils.subtract(totalPrice, currentPaid);

        const amount = dto.settleRemaining ? remaining : dto.amount;

        if (dto.settleRemaining && remaining <= 0) {
          throw new BadRequestException('booking.already_fully_paid');
        }

        if (amount > remaining) {
          throw new BadRequestException('booking.payment_exceeds_balance_due');
        }

        if (amount <= 0) {
          throw new BadRequestException('booking.payment_amount_must_be_positive');
        }

        const paymentTx = await this.financeService.createTransactionWithManager(manager, {
          type: TransactionType.INCOME,
          amount,
          description: `Payment for booking ${lockedBooking.client?.name || 'Client'} - ${dto.paymentMethod || 'Manual'}`,
          bookingId: lockedBooking.id,
          category: 'Booking Payment',
          transactionDate: dto.transactionDate ? new Date(dto.transactionDate) : new Date(),
          paymentMethod: dto.paymentMethod,
          reference: dto.reference,
          idempotencyKey: dto.idempotencyKey,
        });

        const newPaid = MathUtils.add(currentPaid, amount);
        lockedBooking.amountPaid = newPaid;
        const newPaymentStatus = lockedBooking.derivePaymentStatus();

        await manager.update(
          Booking,
          { id: lockedBooking.id, tenantId: lockedBooking.tenantId },
          {
            amountPaid: newPaid,
            paymentStatus: newPaymentStatus,
            updatedAt: new Date(),
          },
        );

        booking.amountPaid = newPaid;

        const invoice = await manager.findOne(Invoice, {
          where: { bookingId: lockedBooking.id, tenantId: lockedBooking.tenantId },
          lock: { mode: 'pessimistic_write' },
        });
        if (invoice) {
          invoice.recordPayment(amount);
          await manager.save(invoice);
        }

        await manager.save(OutboxEvent, {
          aggregateId: lockedBooking.id,
          aggregateType: 'Booking',
          type: 'PaymentRecordedEvent',
          tenantId: lockedBooking.tenantId,
          occurredAt: new Date(),
          payload: {
            bookingId: lockedBooking.id,
            tenantId: lockedBooking.tenantId,
            clientEmail: lockedBooking.client?.email || '',
            clientName: lockedBooking.client?.name || '',
            eventDate: lockedBooking.eventDate,
            amount,
            paymentMethod: dto.paymentMethod || 'Manual',
            reference: dto.reference || '',
            totalPrice: Number(lockedBooking.totalPrice),
            amountPaid: Number(newPaid),
          },
        });

        return { paymentTx, replay: false };
      });
    } catch (error) {
      if (error instanceof QueryFailedError && isPostgresUniqueViolation(error) && dto.idempotencyKey) {
        throw new ConflictException('booking.payment_idempotency_conflict');
      }
      throw error;
    }

    if (!result.replay) {
      await this.financeService.notifyTransactionCreated(result.paymentTx);
    }
  }

  async recordRefund(id: string, dto: RefundBookingDto, user: User): Promise<void> {
    const booking = await this.bookingsService.findOne(id, user);

    if (booking.status !== BookingStatus.CONFIRMED && booking.status !== BookingStatus.COMPLETED) {
      throw new BadRequestException('booking.refund_only_confirmed_or_completed');
    }

    const refundTx = await this.dataSource.transaction(async (manager) => {
      const lockedBooking = await manager.findOne(Booking, {
        where: { id: booking.id, tenantId: booking.tenantId },
        lock: { mode: 'pessimistic_write' },
      });

      if (!lockedBooking) {
        throw new NotFoundException('bookings.not_found');
      }

      const amountPaid = Number(lockedBooking.amountPaid || 0);
      if (dto.amount > amountPaid) {
        throw new BadRequestException('booking.refund_exceeds_amount_paid');
      }

      const refundTx = await this.financeService.createTransactionWithManager(manager, {
        type: TransactionType.REFUND,
        amount: dto.amount,
        category: 'Booking Refund',
        bookingId: lockedBooking.id,
        paymentMethod: dto.paymentMethod,
        description: dto.reason,
        transactionDate: dto.transactionDate ? new Date(dto.transactionDate) : new Date(),
      });

      const newAmountPaid = MathUtils.subtract(amountPaid, dto.amount);
      const currentRefund = Number(lockedBooking.refundAmount || 0);
      const newRefundAmount = MathUtils.add(currentRefund, dto.amount);

      lockedBooking.amountPaid = newAmountPaid;
      lockedBooking.refundAmount = newRefundAmount;
      lockedBooking.paymentStatus = lockedBooking.derivePaymentStatus();

      await manager.save(lockedBooking);

      const invoice = await manager.findOne(Invoice, {
        where: { bookingId: lockedBooking.id, tenantId: lockedBooking.tenantId },
        lock: { mode: 'pessimistic_write' },
      });
      if (invoice) {
        invoice.recordRefund(dto.amount);
        await manager.save(invoice);
      }

      await manager.save(OutboxEvent, {
        aggregateId: lockedBooking.id,
        aggregateType: 'Booking',
        type: 'RefundRecordedEvent',
        tenantId: lockedBooking.tenantId,
        occurredAt: new Date(),
        payload: {
          bookingId: lockedBooking.id,
          tenantId: lockedBooking.tenantId,
          clientEmail: lockedBooking.client?.email || '',
          clientName: lockedBooking.client?.name || '',
          eventDate: lockedBooking.eventDate,
          amount: dto.amount,
          paymentMethod: dto.paymentMethod || 'Manual',
          reason: dto.reason || '',
          totalPrice: Number(lockedBooking.totalPrice),
          amountPaid: Number(newAmountPaid),
          refundAmount: Number(newRefundAmount),
        },
      });

      return refundTx;
    });

    await this.financeService.notifyTransactionCreated(refundTx);
  }

  async getBookingTransactions(id: string, user?: User): Promise<Transaction[]> {
    const booking = await this.bookingsService.findOne(id, user);
    return this.financeService.findTransactionsByBookingId(booking.id, booking.tenantId);
  }

  async markAsPaid(id: string, dto: MarkBookingPaidDto, user: User): Promise<void> {
    // Remaining must be computed inside the booking lock (via settleRemaining).
    return this.recordPayment(
      id,
      {
        amount: 0, // ignored when settleRemaining is true
        paymentMethod: dto.paymentMethod,
        reference: dto.reference,
        transactionDate: dto.transactionDate,
        settleRemaining: true,
      },
      user,
    );
  }
}
