import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  createMockBooking,
  createMockInvoice,
  createMockRepository,
  MockRepository,
  mockTenantContext,
} from '../../../../test/helpers/mock-factories';
import { Booking } from '../../bookings/entities/booking.entity';
import { BookingRepository } from '../../bookings/repositories/booking.repository';
import { Invoice, InvoiceStatus } from '../entities/invoice.entity';
import { InvoiceRepository } from '../repositories/invoice.repository';
import { InvoiceService } from './invoice.service';

describe('InvoiceService', () => {
  let service: InvoiceService;
  let invoiceRepo: MockRepository<Invoice>;
  let bookingRepo: MockRepository<Booking>;
  const mockTenantId = 'tenant-123';

  const mockBooking = createMockBooking({
    id: 'booking-123',
    tenantId: mockTenantId,
    subTotal: 1000,
    taxAmount: 100,
    totalPrice: 1100,
    eventDate: new Date('2024-06-15'),
    servicePackage: { name: 'Wedding Package' },
    client: { name: 'John Doe', email: 'john@example.com' },
  }) as unknown as Booking;

  const mockInvoice = createMockInvoice({
    id: 'invoice-123',
    tenantId: mockTenantId,
    bookingId: 'booking-123',
    invoiceNumber: 'INV-20240101-1234',
    status: InvoiceStatus.DRAFT,
    issueDate: new Date(),
    dueDate: new Date('2024-06-15'),
    items: [
      {
        description: 'Wedding Package',
        quantity: 1,
        unitPrice: 1000,
        amount: 1000,
      },
    ],
    subTotal: 1000,
    taxTotal: 100,
    totalAmount: 1100,
    currency: 'USD',
    booking: mockBooking,
  }) as unknown as Invoice;

  beforeEach(async () => {
    const mockInvoiceRepo = createMockRepository();
    const mockBookingRepo = createMockRepository();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InvoiceService,
        {
          provide: InvoiceRepository,
          useValue: mockInvoiceRepo,
        },
        {
          provide: BookingRepository,
          useValue: mockBookingRepo,
        },
      ],
    }).compile();

    service = module.get<InvoiceService>(InvoiceService);
    invoiceRepo = module.get(InvoiceRepository);
    bookingRepo = module.get(BookingRepository);

    mockTenantContext(mockTenantId);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createInvoice', () => {
    it('should create invoice for booking', async () => {
      bookingRepo.findOne.mockResolvedValue(mockBooking);
      invoiceRepo.findOne.mockResolvedValue(null); // No existing invoice
      invoiceRepo.create.mockReturnValue(mockInvoice);
      invoiceRepo.save.mockResolvedValue(mockInvoice);

      const result = await service.createInvoice('booking-123');

      expect(bookingRepo.findOne).toHaveBeenCalledWith({
        relations: ['client', 'servicePackage'],
        where: { id: 'booking-123' },
      });
      expect(invoiceRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          status: InvoiceStatus.DRAFT,
          subTotal: mockBooking.subTotal,
          taxTotal: mockBooking.taxAmount,
          totalAmount: mockBooking.totalPrice,
        }),
      );
      expect(result).toEqual(mockInvoice);
    });

    it('should return existing invoice if already exists', async () => {
      bookingRepo.findOne.mockResolvedValue(mockBooking);
      invoiceRepo.findOne.mockResolvedValue(mockInvoice);

      const result = await service.createInvoice('booking-123');

      expect(invoiceRepo.create).not.toHaveBeenCalled();
      expect(result).toEqual(mockInvoice);
    });

    it('should throw NotFoundException when booking not found', async () => {
      bookingRepo.findOne.mockResolvedValue(null);

      await expect(service.createInvoice('non-existent')).rejects.toThrow(NotFoundException);
    });
  });

  describe('getInvoicePdf', () => {
    it('should generate PDF for invoice', async () => {
      invoiceRepo.findOne.mockResolvedValue(mockInvoice);

      const result = await service.getInvoicePdf('invoice-123');

      expect(invoiceRepo.findOne).toHaveBeenCalledWith({
        where: { id: 'invoice-123' },
        relations: ['booking', 'booking.client'],
      });
      expect(result).toBeInstanceOf(Uint8Array);
      // PDF should start with %PDF
      expect(result[0]).toBe(0x25); // %
      expect(result[1]).toBe(0x50); // P
      expect(result[2]).toBe(0x44); // D
      expect(result[3]).toBe(0x46); // F
    });

    it('should throw NotFoundException when invoice not found', async () => {
      invoiceRepo.findOne.mockResolvedValue(null);

      await expect(service.getInvoicePdf('non-existent')).rejects.toThrow(NotFoundException);
    });
  });
});
