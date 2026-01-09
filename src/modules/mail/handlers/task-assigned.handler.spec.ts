import { Test, TestingModule } from '@nestjs/testing';
import { TaskAssignedEvent } from '../../tasks/events/task-assigned.event';
import { MailService } from '../mail.service';
import { TaskAssignedHandler } from './task-assigned.handler';

describe('TaskAssignedHandler', () => {
  let handler: TaskAssignedHandler;
  let mailService: jest.Mocked<MailService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TaskAssignedHandler,
        {
          provide: MailService,
          useValue: {
            sendTaskAssignment: jest.fn().mockResolvedValue(undefined),
          },
        },
      ],
    }).compile();

    handler = module.get<TaskAssignedHandler>(TaskAssignedHandler);
    mailService = module.get(MailService);
  });

  it('should be defined', () => {
    expect(handler).toBeDefined();
  });

  describe('handle', () => {
    it('should send task assignment email', async () => {
      const event: TaskAssignedEvent = {
        taskId: 'task-123',
        employeeName: 'John Employee',
        employeeEmail: 'john@company.com',
        taskTypeName: 'Photography',
        clientName: 'Client Corp',
        eventDate: new Date('2025-06-15'),
        commission: 250,
      };

      await handler.handle(event);

      expect(mailService.sendTaskAssignment).toHaveBeenCalledWith({
        employeeName: 'John Employee',
        employeeEmail: 'john@company.com',
        taskType: 'Photography',
        clientName: 'Client Corp',
        eventDate: event.eventDate,
        commission: 250,
      });
    });

    it('should propagate errors from mail service', async () => {
      mailService.sendTaskAssignment.mockRejectedValue(
        new Error('Mail failed'),
      );

      const event: TaskAssignedEvent = {
        taskId: 'task-456',
        employeeName: 'Jane Employee',
        employeeEmail: 'jane@company.com',
        taskTypeName: 'Videography',
        clientName: 'Another Client',
        eventDate: new Date('2025-07-20'),
        commission: 300,
      };

      await expect(handler.handle(event)).rejects.toThrow('Mail failed');
    });
  });
});
