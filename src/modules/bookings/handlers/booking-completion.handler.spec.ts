import { DataSource } from 'typeorm';
import { TaskStatus } from '../../tasks/enums/task-status.enum';
import { TaskCompletedEvent } from '../../tasks/events/task-completed.event';
import { BookingCompletionHandler } from './booking-completion.handler';

describe('BookingCompletionHandler', () => {
  let handler: BookingCompletionHandler;
  let mockManager: {
    findOne: jest.Mock;
    find: jest.Mock;
    update: jest.Mock;
  };
  let mockDataSource: Partial<DataSource>;

  beforeEach(() => {
    mockManager = {
      findOne: jest.fn(),
      find: jest.fn(),
      update: jest.fn(),
    };
    mockDataSource = {
      manager: mockManager as unknown as DataSource['manager'],
    };
    handler = new BookingCompletionHandler(mockDataSource as DataSource);
  });

  it('should update completion percentage when tasks complete', async () => {
    // Task linked to a booking
    mockManager.findOne.mockResolvedValue({
      id: 'task-1',
      bookingId: 'booking-1',
      tenantId: 'tenant-1',
    });

    // 3 tasks total, 2 completed
    mockManager.find.mockResolvedValue([
      { id: 'task-1', status: TaskStatus.COMPLETED },
      { id: 'task-2', status: TaskStatus.COMPLETED },
      { id: 'task-3', status: TaskStatus.PENDING },
    ]);

    const event = new TaskCompletedEvent('task-1', 'tenant-1', new Date(), 50, 'user-1');
    await handler.handle(event);

    expect(mockManager.update).toHaveBeenCalledWith(
      expect.anything(), // Booking class
      { id: 'booking-1', tenantId: 'tenant-1' },
      { completionPercentage: 66.67 },
    );
  });

  it('should set 100% when all tasks are completed', async () => {
    mockManager.findOne.mockResolvedValue({
      id: 'task-1',
      bookingId: 'booking-1',
      tenantId: 'tenant-1',
    });

    mockManager.find.mockResolvedValue([
      { id: 'task-1', status: TaskStatus.COMPLETED },
      { id: 'task-2', status: TaskStatus.COMPLETED },
    ]);

    const event = new TaskCompletedEvent('task-1', 'tenant-1', new Date(), 50, 'user-1');
    await handler.handle(event);

    expect(mockManager.update).toHaveBeenCalledWith(
      expect.anything(),
      { id: 'booking-1', tenantId: 'tenant-1' },
      { completionPercentage: 100 },
    );
  });

  it('should skip if task has no booking', async () => {
    mockManager.findOne.mockResolvedValue({
      id: 'task-1',
      bookingId: null,
      tenantId: 'tenant-1',
    });

    const event = new TaskCompletedEvent('task-1', 'tenant-1', new Date(), 50, 'user-1');
    await handler.handle(event);

    expect(mockManager.find).not.toHaveBeenCalled();
    expect(mockManager.update).not.toHaveBeenCalled();
  });

  it('should skip if task is not found', async () => {
    mockManager.findOne.mockResolvedValue(null);

    const event = new TaskCompletedEvent('task-missing', 'tenant-1', new Date(), 50, 'user-1');
    await handler.handle(event);

    expect(mockManager.find).not.toHaveBeenCalled();
    expect(mockManager.update).not.toHaveBeenCalled();
  });

  it('should not throw on errors (logs instead)', async () => {
    mockManager.findOne.mockRejectedValue(new Error('DB down'));

    const event = new TaskCompletedEvent('task-1', 'tenant-1', new Date(), 50, 'user-1');
    // Should not throw
    await expect(handler.handle(event)).resolves.not.toThrow();
  });
});
