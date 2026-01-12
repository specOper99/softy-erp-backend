import { Logger } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { createMockMailService } from '../../../../test/helpers/mock-factories';
import { BookingConfirmedEvent } from '../../bookings/events/booking-confirmed.event';
import { TaskAssignedEvent } from '../../tasks/events/task-assigned.event';
import { MailService } from '../mail.service';
import { BookingConfirmedMailHandler } from './booking-confirmed.handler';
import { TaskAssignedHandler } from './task-assigned.handler';

describe('Mail Handlers', () => {
  let mailService: MailService;
  let bookingConfirmedHandler: BookingConfirmedMailHandler;
  let taskAssignedHandler: TaskAssignedHandler;

  // Use centralized mock factory
  const mockMailService = createMockMailService();

  beforeAll(() => {
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => {});
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => {});
  });

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BookingConfirmedMailHandler,
        TaskAssignedHandler,
        { provide: MailService, useValue: mockMailService },
      ],
    }).compile();

    mailService = module.get<MailService>(MailService);
    bookingConfirmedHandler = module.get<BookingConfirmedMailHandler>(
      BookingConfirmedMailHandler,
    );
    taskAssignedHandler = module.get<TaskAssignedHandler>(TaskAssignedHandler);

    jest.clearAllMocks();
  });

  describe('BookingConfirmedMailHandler', () => {
    const testDate = new Date('2024-06-15');

    it('should be defined', () => {
      expect(bookingConfirmedHandler).toBeDefined();
    });

    it('should call mailService.sendBookingConfirmation with correct data', async () => {
      const event = new BookingConfirmedEvent(
        'booking-123',
        'tenant-456',
        'client@example.com',
        'John Doe',
        'Premium Package',
        1500,
        testDate,
      );

      await bookingConfirmedHandler.handle(event);

      expect(mailService.sendBookingConfirmation).toHaveBeenCalledWith({
        clientName: 'John Doe',
        clientEmail: 'client@example.com',
        eventDate: testDate,
        packageName: 'Premium Package',
        totalPrice: 1500,
        bookingId: 'booking-123',
      });
    });

    it('should catch and log errors without throwing', async () => {
      const event = new BookingConfirmedEvent(
        'booking-err',
        'tenant-456',
        'client@example.com',
        'John Doe',
        'Premium Package',
        1500,
        testDate,
      );

      mockMailService.sendBookingConfirmation.mockRejectedValueOnce(
        new Error('SMTP connection failed'),
      );

      await expect(
        bookingConfirmedHandler.handle(event),
      ).resolves.not.toThrow();
    });

    it('should log error message when mail fails', async () => {
      const loggerSpy = jest.spyOn(Logger.prototype, 'error');
      const event = new BookingConfirmedEvent(
        'booking-fail',
        'tenant-456',
        'client@example.com',
        'John Doe',
        'Premium Package',
        1500,
        testDate,
      );

      mockMailService.sendBookingConfirmation.mockRejectedValueOnce(
        new Error('Network error'),
      );

      await bookingConfirmedHandler.handle(event);

      expect(loggerSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to send booking confirmation email'),
      );
    });

    it('should handle non-Error exceptions', async () => {
      const event = new BookingConfirmedEvent(
        'booking-nonError',
        'tenant-456',
        'client@example.com',
        'John Doe',
        'Premium Package',
        1500,
        testDate,
      );

      mockMailService.sendBookingConfirmation.mockRejectedValueOnce(
        'String error',
      );

      await expect(
        bookingConfirmedHandler.handle(event),
      ).resolves.not.toThrow();
    });
  });

  describe('TaskAssignedHandler', () => {
    const testDate = new Date('2024-07-20');

    it('should be defined', () => {
      expect(taskAssignedHandler).toBeDefined();
    });

    it('should call mailService.sendTaskAssignment with correct data', async () => {
      const event = new TaskAssignedEvent(
        'task-789',
        'tenant-456',
        'Jane Smith',
        'jane@example.com',
        'Photography',
        'Client Corp',
        testDate,
        250,
      );

      await taskAssignedHandler.handle(event);

      expect(mailService.sendTaskAssignment).toHaveBeenCalledWith({
        employeeName: 'Jane Smith',
        employeeEmail: 'jane@example.com',
        taskType: 'Photography',
        clientName: 'Client Corp',
        eventDate: testDate,
        commission: 250,
      });
    });

    it('should propagate errors from mail service', async () => {
      const event = new TaskAssignedEvent(
        'task-err',
        'tenant-456',
        'Jane Smith',
        'jane@example.com',
        'Photography',
        'Client Corp',
        testDate,
        250,
      );

      mockMailService.sendTaskAssignment.mockRejectedValueOnce(
        new Error('Mail service down'),
      );

      await expect(taskAssignedHandler.handle(event)).rejects.toThrow(
        'Mail service down',
      );
    });
  });
});
