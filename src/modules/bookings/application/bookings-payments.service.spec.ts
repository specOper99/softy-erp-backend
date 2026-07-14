import { BadRequestException, NotFoundException } from '@nestjs/common';
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
import { FinanceService } from '../../finance/application/finance.service';
import type { User } from '../../users/domain/entities/user.entity';
import { Role } from '../../users/domain/enums/role.enum';
import { BookingStatus } from '../domain/enums/booking-status.enum';
import { BookingsService } from './bookings.service';
import { BookingsPaymentsService } from './bookings-payments.service';

describe('BookingsPaymentsService', () => {
  let service: BookingsPaymentsService;
  let bookingsService: { findOne: jest.Mock };
  let financeService: ReturnType<typeof createMockFinanceService>;
  let dataSource: ReturnType<typeof createMockDataSource> & { __managerSave?: jest.Mock };

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

  beforeEach(async () => {
    mockTenantContext('tenant-123');

    financeService = createMockFinanceService();
    dataSource = createMockDataSource();
    bookingsService = { findOne: jest.fn().mockResolvedValue(mockBooking) };

    const managerSave = jest.fn().mockResolvedValue(mockBooking);
    dataSource.transaction.mockImplementation((cb: (manager: unknown) => unknown) =>
      cb({
        findOne: jest.fn().mockResolvedValue(mockBooking),
        update: jest.fn().mockResolvedValue({ affected: 1 }),
        save: managerSave,
      }),
    );
    (dataSource as { __managerSave?: jest.Mock }).__managerSave = managerSave;

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

      const managerSave = (dataSource as { __managerSave: jest.Mock }).__managerSave;
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

      const managerSave = jest.fn().mockResolvedValue(confirmedBooking);
      dataSource.transaction.mockImplementation((cb: (manager: unknown) => unknown) =>
        cb({
          findOne: jest.fn().mockResolvedValue({ ...confirmedBooking, amountPaid: 200, refundAmount: 0 }),
          save: managerSave,
        }),
      );

      await service.recordRefund(
        'booking-123',
        { amount: 50, paymentMethod: PaymentMethod.CASH, reason: 'partial refund' },
        mockAdminUser,
      );

      expect(managerSave).toHaveBeenCalledWith(
        OutboxEvent,
        expect.objectContaining({ type: 'RefundRecordedEvent', aggregateId: 'booking-123' }),
      );
      const outboxCall = managerSave.mock.calls.find(
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
          findOne: jest.fn().mockResolvedValue({ ...confirmedBooking, amountPaid: 100 }),
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
    it('throws BadRequestException when booking is already fully paid', async () => {
      const fullPaidBooking = createMockBooking({
        id: 'booking-123',
        tenantId: 'tenant-1',
        status: BookingStatus.CONFIRMED,
        totalPrice: 1000,
        amountPaid: 1000,
      });
      bookingsService.findOne.mockResolvedValue(fullPaidBooking);

      await expect(service.markAsPaid('booking-123', {}, mockAdminUser)).rejects.toThrow(BadRequestException);
    });

    it('throws NotFoundException for FIELD_STAFF with no assigned booking', async () => {
      bookingsService.findOne.mockRejectedValue(new NotFoundException('bookings.not_found'));
      await expect(service.markAsPaid('booking-123', {}, fieldStaffUser)).rejects.toThrow(NotFoundException);
    });

    it('records the remaining balance as a payment', async () => {
      const partiallyPaidBooking = createMockBooking({
        id: 'booking-123',
        tenantId: 'tenant-1',
        status: BookingStatus.CONFIRMED,
        totalPrice: 1000,
        amountPaid: 400,
        client: { email: 'a@b.com', name: 'C' },
        derivePaymentStatus: jest.fn().mockReturnValue('PARTIALLY_PAID'),
      });
      bookingsService.findOne.mockResolvedValue(partiallyPaidBooking);

      await service.markAsPaid('booking-123', { paymentMethod: PaymentMethod.CASH }, mockAdminUser);

      expect(financeService.createTransactionWithManager).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ amount: 600 }),
      );
    });
  });
});
