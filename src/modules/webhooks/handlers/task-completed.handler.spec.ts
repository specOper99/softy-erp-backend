import { Test, TestingModule } from '@nestjs/testing';
import { TaskCompletedEvent } from '../../tasks/events/task-completed.event';
import { WebhookService } from '../webhooks.service';
import { TaskCompletedWebhookHandler } from './task-completed.handler';

describe('TaskCompletedWebhookHandler', () => {
  let handler: TaskCompletedWebhookHandler;
  let webhookService: jest.Mocked<WebhookService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TaskCompletedWebhookHandler,
        {
          provide: WebhookService,
          useValue: {
            emit: jest.fn().mockResolvedValue(undefined),
          },
        },
      ],
    }).compile();

    handler = module.get<TaskCompletedWebhookHandler>(
      TaskCompletedWebhookHandler,
    );
    webhookService = module.get(WebhookService);
  });

  it('should be defined', () => {
    expect(handler).toBeDefined();
  });

  describe('handle', () => {
    it('should emit task.completed webhook', async () => {
      const event: TaskCompletedEvent = {
        taskId: 'task-123',
        tenantId: 'tenant-123',
        assignedUserId: 'user-456',
        completedAt: new Date('2025-06-15'),
        commissionAccrued: 100,
      };

      await handler.handle(event);

      expect(webhookService.emit).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: 'tenant-123',
          type: 'task.completed',
          payload: expect.objectContaining({
            taskId: 'task-123',
            assignedUserId: 'user-456',
            completedAt: event.completedAt,
            commissionAccrued: 100,
          }),
          timestamp: expect.any(String),
        }),
      );
    });
  });
});
