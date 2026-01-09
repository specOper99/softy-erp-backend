import { Test, TestingModule } from '@nestjs/testing';
import { BookingConfirmedEvent } from '../../bookings/events/booking-confirmed.event';
import { MailService } from '../mail.service';
import { BookingConfirmedMailHandler } from './booking-confirmed.handler';

describe('BookingConfirmedMailHandler', () => {
  let handler: BookingConfirmedMailHandler;
  let mailService: jest.Mocked<MailService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BookingConfirmedMailHandler,
        {
          provide: MailService,
          useValue: {
            sendBookingConfirmation: jest.fn().mockResolvedValue(undefined),
          },
        },
      ],
    }).compile();

    handler = module.get<BookingConfirmedMailHandler>(
      BookingConfirmedMailHandler,
    );
    mailService = module.get(MailService);
  });

  it('should be defined', () => {
    expect(handler).toBeDefined();
  });

  describe('handle', () => {
    it('should send booking confirmation email', async () => {
      const event: BookingConfirmedEvent = {
        bookingId: 'booking-123',
        clientName: 'John Doe',
        clientEmail: 'john@example.com',
        eventDate: new Date('2025-06-15'),
        packageName: 'Premium Package',
        totalPrice: 1000,
      };

      await handler.handle(event);

      expect(mailService.sendBookingConfirmation).toHaveBeenCalledWith({
        clientName: 'John Doe',
        clientEmail: 'john@example.com',
        eventDate: event.eventDate,
        packageName: 'Premium Package',
        totalPrice: 1000,
        bookingId: 'booking-123',
      });
    });

    it('should handle mail service error gracefully', async () => {
      mailService.sendBookingConfirmation.mockRejectedValue(
        new Error('SMTP error'),
      );

      const event: BookingConfirmedEvent = {
        bookingId: 'booking-456',
        clientName: 'Jane Doe',
        clientEmail: 'jane@example.com',
        eventDate: new Date('2025-07-20'),
        packageName: 'Basic Package',
        totalPrice: 500,
      };

      await expect(handler.handle(event)).resolves.not.toThrow();
    });
  });
});
