import { Test, TestingModule } from '@nestjs/testing';
import { BookingUpdatedEvent } from '../../../bookings/events/booking-updated.event';
import { FinancialReportService } from '../../services/financial-report.service';
import { BookingUpdatedHandler } from './booking-updated.handler';

describe('BookingUpdatedHandler', () => {
  let handler: BookingUpdatedHandler;
  let financialReportService: FinancialReportService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BookingUpdatedHandler,
        {
          provide: FinancialReportService,
          useValue: {
            invalidateReportCaches: jest.fn().mockResolvedValue(undefined),
          },
        },
      ],
    }).compile();

    handler = module.get<BookingUpdatedHandler>(BookingUpdatedHandler);
    financialReportService = module.get<FinancialReportService>(FinancialReportService);
  });

  it('should invalidate report caches on booking update', async () => {
    const event = new BookingUpdatedEvent('booking-123', 'tenant-456', { status: 'CONFIRMED' }, new Date());

    await handler.handle(event);

    expect(financialReportService.invalidateReportCaches).toHaveBeenCalledWith('tenant-456');
  });

  it('should log error if invalidation fails', async () => {
    const event = new BookingUpdatedEvent('booking-123', 'tenant-456', { status: 'CONFIRMED' }, new Date());

    jest.spyOn(financialReportService, 'invalidateReportCaches').mockRejectedValue(new Error('Cache error'));

    // Should not throw
    await expect(handler.handle(event)).resolves.not.toThrow();
  });
});
