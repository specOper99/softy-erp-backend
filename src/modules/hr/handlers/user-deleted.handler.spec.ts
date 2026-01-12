import { Logger } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { UserDeletedEvent } from '../../users/events/user-deleted.event';
import { HrService } from '../services/hr.service';
import { UserDeletedHandler } from './user-deleted.handler';

describe('UserDeletedHandler', () => {
  let handler: UserDeletedHandler;
  let hrService: HrService;

  const mockHrService = {
    softDeleteProfileByUserId: jest.fn().mockResolvedValue(undefined),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserDeletedHandler,
        { provide: HrService, useValue: mockHrService },
      ],
    }).compile();

    handler = module.get<UserDeletedHandler>(UserDeletedHandler);
    hrService = module.get<HrService>(HrService);
  });

  it('should be defined', () => {
    expect(handler).toBeDefined();
  });

  it('should call softDeleteProfileByUserId on UserDeletedEvent', async () => {
    const event = new UserDeletedEvent(
      'user-uuid-123',
      'tenant-id',
      'test@example.com',
    );
    await handler.handle(event);
    expect(hrService.softDeleteProfileByUserId).toHaveBeenCalledWith(
      'user-uuid-123',
    );
  });

  it('should log error if deletion fails', async () => {
    const loggerSpy = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation();
    mockHrService.softDeleteProfileByUserId.mockRejectedValueOnce(
      new Error('Test error'),
    );
    const event = new UserDeletedEvent(
      'user-uuid-123',
      'tenant-id',
      'test@example.com',
    );

    await handler.handle(event);

    expect(hrService.softDeleteProfileByUserId).toHaveBeenCalledWith(
      'user-uuid-123',
    );
    expect(loggerSpy).toHaveBeenCalledWith(
      expect.stringContaining('Failed to delete profile'),
    );
  });
});
