import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import {
  createMockBooking,
  createMockDataSource,
  createMockFinanceService,
  mockTenantContext,
} from '../../../../test/helpers/mock-factories';
import { OutboxEvent } from '../../../common/entities/outbox-event.entity';
import { PaymentMethod } from '../../../common/enums/payment-method.enum';
import { Invoice } from '../../finance/domain/entities/invoice.entity';
import { Transaction } from '../../finance/domain/entities/transaction.entity';
import { FinanceService } from '../../finance/application/finance.service';
import type { User } from '../../users/domain/entities/user.entity';
import { Role } from '../../users/domain/enums/role.enum';
import { Booking } from '../domain/entities/booking.entity';
import { BookingStatus } from '../domain/enums/booking-status.enum';
import { BookingsService } from './bookings.service';
import { BookingsPaymentsService } from './bookings-payments.service';

describe('BookingsPaymentsService', () => {
  let service: BookingsPaymentsService;
  let bookingsService: { findOne: jest.Mock };
  let financeService: ReturnType<typeof createMockFinanceService>;
  let dataSource: ReturnType<typeof createMockDataSource> & { __managerSave?: jest.Mock };
  let managerFindOne: jest.Mock;
  let managerUpdate: jest.Mock;
  let managerSave: jest.Mock;

  const mockAdminUser = { id: 'admin-1', role: Role.ADMIN } as User;
  const fieldStaffUser = { id: 'staff-1', role: Role.FIELD_STAFF } as User;

  const mockBooking = createMockBooking({
    id: 'booking-123',
    tenantId: 'tenant-1',
    status: BookingStatus.CONFIRMED,
    amountPaid: 0,
    totalPrice: 1000,
    depositAmount: 200,
    client: { email: 'client@example.com', name: 'Client' },
    derivePaymentStatus: jest.fn().mockReturnValue('PARTIALLY_PAID'),
  });

  function wireManager(lockedBooking: typeof mockBooking = mockBooking) {
    managerFindOne = jest.fn().mockImplementation((entity: unknown) => {
      if (entity === Booking) {
        return Promise.resolve(lockedBooking);
      }
      if (entity === Invoice || entity === Transaction) {
        return Promise.resolve(null);
      }
      return Promise.resolve(lockedBooking);
    });
    managerUpdate = jest.fn().mockResolvedValue({ affected: 1 });
    managerSave = jest.fn().mockResolvedValue(lockedBooking);
    dataSource.transaction.mockImplementation((cb: (manager: unknown) => unknown) =>
      cb({
        findOne: managerFindOne,
        update: managerUpdate,
        save: managerSave,
      }),
    );
    (dataSource as { __managerSave?: jest.Mock }).__managerSave = managerSave;
  }

  beforeEach(async () => {
    mockTenantContext('tenant-123');

    financeService = createMockFinanceService();
    dataSource = createMockDataSource();
    bookingsService = { findOne: jest.fn().mockResolvedValue(mockBooking) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BookingsPaymentsService,
        {
          provide: BookingsService,
          useValue: bookingsService,
        },
        {
          provide: FinanceService,
          useValue: financeService,
        },
        {
          provide: DataSource,
          useValue: dataSource,
        },
      ],
    }).compile();

    service = module.get<BookingsPaymentsService>(BookingsPaymentsService);
    wireManager();
  });

  describe('recordPayment', () => {
    it('publishes PaymentRecordedEvent once after successful payment write', async () => {
      await service.recordPayment(
        'booking-123',
        {
          amount: 250,
          paymentMethod: PaymentMethod.E_PAYMENT,
          reference: 'ref-1',
        },
        mockAdminUser,
      );

      expect(managerSave).toHaveBeenCalledWith(
        OutboxEvent,
        expect.objectContaining({ type: 'PaymentRecordedEvent', aggregateId: 'booking-123' }),
      );
      const outboxCall = managerSave.mock.calls.find(
        (call: unknown[]) => call[0] === OutboxEvent && (call[1] as { type?: string }).type === 'PaymentRecordedEvent',
      );
      expect(outboxCall).toBeDefined();
      expect((outboxCall[1] as Record<string, unknown>).payload).toMatchObject({
        bookingId: 'booking-123',
        amount: 250,
        tenantId: 'tenant-1',
      });
    });

    it('passes payment method, reference, and transaction date to finance service', async () => {
      const transactionDate = '2026-04-20T09:30:00.000Z';

      await service.recordPayment(
        'booking-123',
        {
          amount: 250,
          paymentMethod: PaymentMethod.E_PAYMENT,
          reference: 'ref-1',
          transactionDate,
        },
        mockAdminUser,
      );

      expect(financeService.createTransactionWithManager).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          paymentMethod: 'E_PAYMENT',
          reference: 'ref-1',
          transactionDate: new Date(transactionDate),
        }),
      );
    });

    it('throws NotFoundException for FIELD_STAFF with no assigned booking', async () => {
      bookingsService.findOne.mockRejectedValue(new NotFoundException('bookings.not_found'));
      await expect(service.recordPayment('booking-123', { amount: 100 }, fieldStaffUser)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('rejects payment when booking is not CONFIRMED or COMPLETED', async () => {
      const cancelled = createMockBooking({
        id: 'booking-123',
        tenantId: 'tenant-1',
        status: BookingStatus.CANCELLED,
      });
      bookingsService.findOne.mockResolvedValue(cancelled);

      await expect(service.recordPayment('booking-123', { amount: 100 }, mockAdminUser)).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.recordPayment('booking-123', { amount: 100 }, mockAdminUser)).rejects.toThrow(
        'booking.payment_only_confirmed_or_completed',
      );
      expect(financeService.createTransactionWithManager).not.toHaveBeenCalled();
    });

    it('rejects overpay above remaining balance under lock', async () => {
      const partiallyPaid = createMockBooking({
        id: 'booking-123',
        tenantId: 'tenant-1',
        status: BookingStatus.CONFIRMED,
        amountPaid: 900,
        totalPrice: 1000,
        derivePaymentStatus: jest.fn().mockReturnValue('PARTIALLY_PAID'),
      });
      bookingsService.findOne.mockResolvedValue(partiallyPaid);
      wireManager(partiallyPaid);

      await expect(service.recordPayment('booking-123', { amount: 200 }, mockAdminUser)).rejects.toThrow(
        'booking.payment_exceeds_balance_due',
      );
      expect(financeService.createTransactionWithManager).not.toHaveBeenCalled();
    });

    it('replays idempotent payment without creating a second transaction', async () => {
      const existingTx = { id: 'txn-existing', bookingId: 'booking-123', idempotencyKey: 'pay-key-1234567890' };
      managerFindOne = jest.fn().mockImplementation((entity: unknown) => {
        if (entity === Booking) return Promise.resolve(mockBooking);
        if (entity === Transaction) return Promise.resolve(existingTx);
        return Promise.resolve(null);
      });
      dataSource.transaction.mockImplementation((cb: (manager: unknown) => unknown) =>
        cb({ findOne: managerFindOne, update: managerUpdate, save: managerSave }),
      );

      await service.recordPayment('booking-123', { amount: 250, idempotencyKey: 'pay-key-1234567890' }, mockAdminUser);

      expect(financeService.createTransactionWithManager).not.toHaveBeenCalled();
      expect(financeService.notifyTransactionCreated).not.toHaveBeenCalled();
    });

    it('throws ConflictException when idempotency key belongs to another booking', async () => {
      const existingTx = { id: 'txn-other', bookingId: 'other-booking', idempotencyKey: 'pay-key-1234567890' };
      managerFindOne = jest.fn().mockImplementation((entity: unknown) => {
        if (entity === Booking) return Promise.resolve(mockBooking);
        if (entity === Transaction) return Promise.resolve(existingTx);
        return Promise.resolve(null);
      });
      dataSource.transaction.mockImplementation((cb: (manager: unknown) => unknown) =>
        cb({ findOne: managerFindOne, update: managerUpdate, save: managerSave }),
      );

      await expect(
        service.recordPayment('booking-123', { amount: 250, idempotencyKey: 'pay-key-1234567890' }, mockAdminUser),
      ).rejects.toThrow(ConflictException);
    });

    it('syncs Invoice.recordPayment when an invoice exists for the booking', async () => {
      const invoice = {
        bookingId: 'booking-123',
        tenantId: 'tenant-1',
        recordPayment: jest.fn(),
      };
      managerFindOne = jest.fn().mockImplementation((entity: unknown) => {
        if (entity === Booking) return Promise.resolve(mockBooking);
        if (entity === Invoice) return Promise.resolve(invoice);
        if (entity === Transaction) return Promise.resolve(null);
        return Promise.resolve(null);
      });
      dataSource.transaction.mockImplementation((cb: (manager: unknown) => unknown) =>
        cb({ findOne: managerFindOne, update: managerUpdate, save: managerSave }),
      );

      await service.recordPayment('booking-123', { amount: 250 }, mockAdminUser);

      expect(invoice.recordPayment).toHaveBeenCalledWith(250);
      expect(managerSave).toHaveBeenCalledWith(invoice);
    });
  });

  describe('recordRefund', () => {
    it('writes RefundRecordedEvent outbox row after successful refund', async () => {
      const confirmedBooking = createMockBooking({
        id: 'booking-123',
        tenantId: 'tenant-1',
        status: BookingStatus.CONFIRMED,
        amountPaid: 200,
        refundAmount: 0,
        totalPrice: 1000,
        client: { email: 'client@example.com', name: 'Client' },
        derivePaymentStatus: jest.fn().mockReturnValue('PARTIALLY_PAID'),
      });
      bookingsService.findOne.mockResolvedValue(confirmedBooking);

      const refundSave = jest.fn().mockResolvedValue(confirmedBooking);
      const invoice = {
        recordRefund: jest.fn(),
      };
      dataSource.transaction.mockImplementation((cb: (manager: unknown) => unknown) =>
        cb({
          findOne: jest
            .fn()
            .mockResolvedValueOnce({ ...confirmedBooking, amountPaid: 200, refundAmount: 0 })
            .mockResolvedValueOnce(invoice),
          save: refundSave,
        }),
      );

      await service.recordRefund(
        'booking-123',
        { amount: 50, paymentMethod: PaymentMethod.CASH, reason: 'partial refund' },
        mockAdminUser,
      );

      expect(invoice.recordRefund).toHaveBeenCalledWith(50);
      expect(refundSave).toHaveBeenCalledWith(invoice);
      expect(refundSave).toHaveBeenCalledWith(
        OutboxEvent,
        expect.objectContaining({ type: 'RefundRecordedEvent', aggregateId: 'booking-123' }),
      );
      const outboxCall = refundSave.mock.calls.find(
        (call: unknown[]) => call[0] === OutboxEvent && (call[1] as { type?: string }).type === 'RefundRecordedEvent',
      );
      expect(outboxCall).toBeDefined();
      expect((outboxCall[1] as Record<string, unknown>).payload).toMatchObject({
        bookingId: 'booking-123',
        amount: 50,
        tenantId: 'tenant-1',
        reason: 'partial refund',
      });
    });

    it('throws BadRequestException when booking is not CONFIRMED or COMPLETED', async () => {
      const draftBooking = createMockBooking({ id: 'booking-123', tenantId: 'tenant-1', status: BookingStatus.DRAFT });
      bookingsService.findOne.mockResolvedValue(draftBooking);

      await expect(service.recordRefund('booking-123', { amount: 50 }, mockAdminUser)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('throws BadRequestException when refund exceeds amount paid', async () => {
      const confirmedBooking = createMockBooking({
        id: 'booking-123',
        tenantId: 'tenant-1',
        status: BookingStatus.CONFIRMED,
        amountPaid: 100,
        derivePaymentStatus: jest.fn().mockReturnValue('PARTIALLY_PAID'),
      });
      bookingsService.findOne.mockResolvedValue(confirmedBooking);

      dataSource.transaction.mockImplementation((cb: (manager: unknown) => unknown) =>
        cb({
          findOne: jest
            .fn()
            .mockResolvedValueOnce({ ...confirmedBooking, amountPaid: 100 })
            .mockResolvedValueOnce(null),
          save: jest.fn(),
        }),
      );

      await expect(service.recordRefund('booking-123', { amount: 200 }, mockAdminUser)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('throws NotFoundException for FIELD_STAFF with no assigned booking', async () => {
      bookingsService.findOne.mockRejectedValue(new NotFoundException('bookings.not_found'));
      await expect(service.recordRefund('booking-123', { amount: 50 }, fieldStaffUser)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('markAsPaid', () => {
    it('throws BadRequestException when booking is already fully paid (under lock)', async () => {
      const fullPaidBooking = createMockBooking({
        id: 'booking-123',
        tenantId: 'tenant-1',
        status: BookingStatus.CONFIRMED,
        totalPrice: 1000,
        amountPaid: 1000,
        derivePaymentStatus: jest.fn().mockReturnValue('FULLY_PAID'),
      });
      bookingsService.findOne.mockResolvedValue(fullPaidBooking);
      wireManager(fullPaidBooking);

      await expect(service.markAsPaid('booking-123', {}, mockAdminUser)).rejects.toThrow(BadRequestException);
      await expect(service.markAsPaid('booking-123', {}, mockAdminUser)).rejects.toThrow('booking.already_fully_paid');
    });

    it('throws NotFoundException for FIELD_STAFF with no assigned booking', async () => {
      bookingsService.findOne.mockRejectedValue(new NotFoundException('bookings.not_found'));
      await expect(service.markAsPaid('booking-123', {}, fieldStaffUser)).rejects.toThrow(NotFoundException);
    });

    it('records the remaining balance from the locked booking, not the pre-lock snapshot', async () => {
      const snapshot = createMockBooking({
        id: 'booking-123',
        tenantId: 'tenant-1',
        status: BookingStatus.CONFIRMED,
        totalPrice: 1000,
        amountPaid: 400,
        client: { email: 'a@b.com', name: 'C' },
        derivePaymentStatus: jest.fn().mockReturnValue('PARTIALLY_PAID'),
      });
      const locked = createMockBooking({
        id: 'booking-123',
        tenantId: 'tenant-1',
        status: BookingStatus.CONFIRMED,
        totalPrice: 1000,
        amountPaid: 700,
        client: { email: 'a@b.com', name: 'C' },
        derivePaymentStatus: jest.fn().mockReturnValue('PARTIALLY_PAID'),
      });
      bookingsService.findOne.mockResolvedValue(snapshot);
      wireManager(locked);

      await service.markAsPaid('booking-123', { paymentMethod: PaymentMethod.CASH }, mockAdminUser);

      expect(financeService.createTransactionWithManager).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ amount: 300 }),
      );
    });
  });
});
