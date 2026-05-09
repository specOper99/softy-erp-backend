import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { OutboxEvent } from '../../../common/entities/outbox-event.entity';
import { MathUtils } from '../../../common/utils/math.utils';
import { Transaction } from '../../finance/entities/transaction.entity';
import { TransactionType } from '../../finance/enums/transaction-type.enum';
import { FinanceService } from '../../finance/services/finance.service';
import { User } from '../../users/entities/user.entity';
import { MarkBookingPaidDto, RecordPaymentDto, RefundBookingDto } from '../dto';
import { Booking } from '../entities/booking.entity';
import { BookingStatus } from '../enums/booking-status.enum';
import { BookingsService } from './bookings.service';

@Injectable()
export class BookingsPaymentsService {
  constructor(
    private readonly bookingsService: BookingsService,
    private readonly financeService: FinanceService,
    private readonly dataSource: DataSource,
    @InjectRepository(OutboxEvent)
    private readonly outboxRepository: Repository<OutboxEvent>,
  ) {}

  async recordPayment(id: string, dto: RecordPaymentDto, user: User): Promise<void> {
    const booking = await this.bookingsService.findOne(id, user);

    const paymentTx = await this.dataSource.transaction(async (manager) => {
      const lockedBooking = await manager.findOne(Booking, {
        where: { id: booking.id, tenantId: booking.tenantId },
        lock: { mode: 'pessimistic_write' },
      });

      if (!lockedBooking) {
        throw new NotFoundException('bookings.not_found');
      }

      const paymentTx = await this.financeService.createTransactionWithManager(manager, {
        type: TransactionType.INCOME,
        amount: dto.amount,
        description: `Payment for booking ${lockedBooking.client?.name || 'Client'} - ${dto.paymentMethod || 'Manual'}`,
        bookingId: lockedBooking.id,
        category: 'Booking Payment',
        transactionDate: dto.transactionDate ? new Date(dto.transactionDate) : new Date(),
        paymentMethod: dto.paymentMethod,
        reference: dto.reference,
      });

      const currentPaid = Number(lockedBooking.amountPaid || 0);
      const newPaid = MathUtils.add(currentPaid, dto.amount);

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
      return paymentTx;
    });

    await this.financeService.notifyTransactionCreated(paymentTx);

    await this.outboxRepository.save({
      aggregateId: booking.id,
      type: 'PaymentRecordedEvent',
      payload: {
        bookingId: booking.id,
        tenantId: booking.tenantId,
        clientEmail: booking.client?.email || '',
        clientName: booking.client?.name || '',
        eventDate: booking.eventDate,
        amount: dto.amount,
        paymentMethod: dto.paymentMethod || 'Manual',
        reference: dto.reference || '',
        totalPrice: Number(booking.totalPrice),
        amountPaid: Number(booking.amountPaid),
      },
    });
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
      return refundTx;
    });

    await this.financeService.notifyTransactionCreated(refundTx);
  }

  async getBookingTransactions(id: string, user?: User): Promise<Transaction[]> {
    const booking = await this.bookingsService.findOne(id, user);
    return this.financeService.findTransactionsByBookingId(booking.id, booking.tenantId);
  }

  async markAsPaid(id: string, dto: MarkBookingPaidDto, user: User): Promise<void> {
    const booking = await this.bookingsService.findOne(id, user);
    const total = Number(booking.totalPrice || 0);
    const paid = Number(booking.amountPaid || 0);
    const remaining = MathUtils.subtract(total, paid);

    if (remaining <= 0) {
      throw new BadRequestException('booking.already_fully_paid');
    }

    return this.recordPayment(
      id,
      {
        amount: remaining,
        paymentMethod: dto.paymentMethod,
        reference: dto.reference,
        transactionDate: dto.transactionDate,
      },
      user,
    );
  }
}
