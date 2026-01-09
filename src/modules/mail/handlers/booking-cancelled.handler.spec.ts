import { Test, TestingModule } from '@nestjs/testing';
import { BookingCancelledEvent } from '../../bookings/events/booking-cancelled.event';
import { MailService } from '../mail.service';
import { BookingCancelledHandler } from './booking-cancelled.handler';

describe('BookingCancelledHandler', () => {
  let handler: BookingCancelledHandler;
  let mailService: jest.Mocked<MailService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BookingCancelledHandler,
        {
          provide: MailService,
          useValue: {
            sendCancellationEmail: jest.fn().mockResolvedValue(undefined),
          },
        },
      ],
    }).compile();

    handler = module.get<BookingCancelledHandler>(BookingCancelledHandler);
    mailService = module.get(MailService);
  });

  it('should be defined', () => {
    expect(handler).toBeDefined();
  });

  describe('handle', () => {
    it('should send booking cancellation email', async () => {
      const event: BookingCancelledEvent = {
        bookingId: 'booking-123',
        clientName: 'John Doe',
        clientEmail: 'john@example.com',
        eventDate: new Date('2025-06-15'),
        cancelledAt: new Date('2025-01-10'),
        daysBeforeEvent: 150,
        cancellationReason: 'Schedule conflict',
        amountPaid: 500,
        refundAmount: 400,
        refundPercentage: 80,
      };

      await handler.handle(event);

      expect(mailService.sendCancellationEmail).toHaveBeenCalledWith({
        clientName: 'John Doe',
        to: 'john@example.com',
        bookingId: 'booking-123',
        eventDate: event.eventDate,
        cancelledAt: event.cancelledAt,
        daysBeforeEvent: 150,
        cancellationReason: 'Schedule conflict',
        amountPaid: 500,
        refundAmount: 400,
        refundPercentage: 80,
      });
    });

    it('should handle mail service error gracefully', async () => {
      mailService.sendCancellationEmail.mockRejectedValue(
        new Error('SMTP error'),
      );

      const event: BookingCancelledEvent = {
        bookingId: 'booking-456',
        clientName: 'Jane Doe',
        clientEmail: 'jane@example.com',
        eventDate: new Date('2025-07-20'),
        cancelledAt: new Date('2025-01-15'),
        daysBeforeEvent: 180,
        cancellationReason: 'Changed venue',
        amountPaid: 300,
        refundAmount: 240,
        refundPercentage: 80,
      };

      await expect(handler.handle(event)).resolves.not.toThrow();
    });
  });
});
