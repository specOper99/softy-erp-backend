import { Test, TestingModule } from '@nestjs/testing';
import { PaymentRecordedEvent } from '../../bookings/events/payment-recorded.event';
import { MailService } from '../mail.service';
import { PaymentReceivedHandler } from './payment-received.handler';

describe('PaymentReceivedHandler', () => {
  let handler: PaymentReceivedHandler;
  let mailService: jest.Mocked<MailService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentReceivedHandler,
        {
          provide: MailService,
          useValue: {
            sendPaymentReceipt: jest.fn().mockResolvedValue(undefined),
          },
        },
      ],
    }).compile();

    handler = module.get<PaymentReceivedHandler>(PaymentReceivedHandler);
    mailService = module.get(MailService);
  });

  it('should be defined', () => {
    expect(handler).toBeDefined();
  });

  describe('handle', () => {
    it('should send payment receipt email', async () => {
      const event: PaymentRecordedEvent = {
        bookingId: 'booking-123',
        clientName: 'John Doe',
        clientEmail: 'john@example.com',
        eventDate: new Date('2025-06-15'),
        amount: 500,
        paymentMethod: 'credit_card',
        reference: 'REF-001',
        totalPrice: 1000,
        amountPaid: 500,
      };

      await handler.handle(event);

      expect(mailService.sendPaymentReceipt).toHaveBeenCalledWith({
        clientName: 'John Doe',
        to: 'john@example.com',
        bookingId: 'booking-123',
        eventDate: event.eventDate,
        amount: 500,
        paymentMethod: 'credit_card',
        reference: 'REF-001',
        totalPrice: 1000,
        amountPaid: 500,
      });
    });

    it('should handle mail service error gracefully', async () => {
      mailService.sendPaymentReceipt.mockRejectedValue(new Error('Mail error'));

      const event: PaymentRecordedEvent = {
        bookingId: 'booking-456',
        clientName: 'Jane Doe',
        clientEmail: 'jane@example.com',
        eventDate: new Date('2025-07-20'),
        amount: 300,
        paymentMethod: 'bank_transfer',
        reference: 'REF-002',
        totalPrice: 600,
        amountPaid: 300,
      };

      // Should not throw - error is caught and logged
      await expect(handler.handle(event)).resolves.not.toThrow();
    });
  });
});
