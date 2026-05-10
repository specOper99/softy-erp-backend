import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { EventBus } from '@nestjs/cqrs';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { createMockTask, createMockUser } from '../../../../test/helpers/mock-factories';
import { TenantContextService } from '../../../common/services/tenant-context.service';
import { AuditService } from '../../audit/audit.service';
import { FinanceService } from '../../finance/services/finance.service';
import type { User } from '../../users/entities/user.entity';
import { Role } from '../../users/enums/role.enum';
import { TaskAssignee } from '../entities/task-assignee.entity';
import type { Task } from '../entities/task.entity';
import { TaskAssigneeRole } from '../enums/task-assignee-role.enum';
import { TaskStatus } from '../enums/task-status.enum';
import { TaskAssigneeRepository } from '../repositories/task-assignee.repository';
import { TaskRepository } from '../repositories/task.repository';
import { TaskAssigneeService } from './task-assignee.service';

describe('TaskAssigneeService', () => {
  let service: TaskAssigneeService;

  const adminUser = createMockUser({ id: 'admin-uuid', role: Role.ADMIN }) as unknown as User;
  const staffUser = createMockUser({ id: 'staff-uuid', role: Role.FIELD_STAFF }) as unknown as User;

  const mockTask = createMockTask({
    id: 'task-uuid-123',
    tenantId: 'tenant-123',
    status: TaskStatus.PENDING,
    assignedUserId: 'old-user-id',
    commissionSnapshot: 100,
    booking: {
      id: 'booking-uuid-123',
      clientId: 'client-123',
      client: { name: 'John Doe' },
      eventDate: new Date('2024-12-31'),
    },
    taskType: { id: 'task-type-uuid-123', name: 'Photography' },
    assignedUser: { id: 'old-user-id', email: 'old@example.com' },
  }) as unknown as Task;

  const mockAssignee: TaskAssignee = {
    id: 'assignee-1',
    tenantId: 'tenant-123',
    taskId: 'task-uuid-123',
    userId: 'user-1',
    role: TaskAssigneeRole.LEAD,
    commissionSnapshot: 80,
  } as TaskAssignee;

  const mockTaskRepository = {
    findOne: jest.fn(),
  };

  const mockTaskAssigneeRepository = {
    find: jest.fn().mockResolvedValue([]),
  };

  const mockFinanceService = {
    transferPendingCommission: jest.fn().mockResolvedValue(undefined),
  };

  const mockAuditService = {
    log: jest.fn().mockResolvedValue(undefined),
  };

  const mockEventBus = {
    publish: jest.fn(),
  };

  const mockUpdateQb = {
    update: jest.fn().mockReturnThis(),
    set: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    execute: jest.fn().mockResolvedValue({ affected: 1 }),
  };

  const mockQueryRunner = {
    connect: jest.fn(),
    startTransaction: jest.fn(),
    commitTransaction: jest.fn(),
    rollbackTransaction: jest.fn(),
    release: jest.fn(),
    isTransactionActive: true,
    manager: {
      create: jest.fn().mockImplementation((_entity, payload) => payload),
      save: jest.fn().mockImplementation((entity) => Promise.resolve(entity)),
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn(),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
      delete: jest.fn().mockResolvedValue({ affected: 1 }),
      createQueryBuilder: jest.fn().mockReturnValue(mockUpdateQb),
    },
  };

  const mockDataSource = {
    createQueryRunner: jest.fn().mockReturnValue(mockQueryRunner),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TaskAssigneeService,
        { provide: TaskRepository, useValue: mockTaskRepository },
        { provide: TaskAssigneeRepository, useValue: mockTaskAssigneeRepository },
        { provide: FinanceService, useValue: mockFinanceService },
        { provide: AuditService, useValue: mockAuditService },
        { provide: EventBus, useValue: mockEventBus },
        { provide: DataSource, useValue: mockDataSource },
      ],
    }).compile();

    service = module.get<TaskAssigneeService>(TaskAssigneeService);

    jest.clearAllMocks();

    // Restore createQueryBuilder mock after clearAllMocks
    mockQueryRunner.manager.createQueryBuilder.mockReturnValue(mockUpdateQb);
    mockUpdateQb.update.mockReturnValue(mockUpdateQb);
    mockUpdateQb.set.mockReturnValue(mockUpdateQb);
    mockUpdateQb.where.mockReturnValue(mockUpdateQb);
    mockUpdateQb.andWhere.mockReturnValue(mockUpdateQb);
    mockUpdateQb.execute.mockResolvedValue({ affected: 1 });

    jest.spyOn(TenantContextService, 'getTenantIdOrThrow').mockReturnValue('tenant-123');

    // Default: task found
    mockQueryRunner.manager.findOne.mockImplementation((_EntityClass, options) => {
      if (options?.where?.id === 'task-uuid-123') {
        return Promise.resolve({ ...mockTask });
      }
      return Promise.resolve(null);
    });

    // Default: user found in tenant
    mockQueryRunner.manager.find.mockResolvedValue([]);
  });

  // ============ assignTask ============
  describe('assignTask', () => {
    it('should assign task and transfer commission', async () => {
      const newUser = createMockUser({ id: 'new-user-id', email: 'new@example.com' }) as unknown as User;

      // findOne(Task, lock) → task; findOne(Task, relations) → task with booking; findOne(User) → newUser
      mockQueryRunner.manager.findOne
        .mockResolvedValueOnce({ ...mockTask })
        .mockResolvedValueOnce({ ...mockTask, assignedUser: newUser })
        .mockResolvedValueOnce(newUser);

      await service.assignTask('task-uuid-123', { userId: 'new-user-id' });

      expect(mockFinanceService.transferPendingCommission).toHaveBeenCalledWith(
        mockQueryRunner.manager,
        'old-user-id',
        'new-user-id',
        100,
      );
      expect(mockAuditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'UPDATE',
          entityName: 'Task',
          entityId: 'task-uuid-123',
        }),
      );
      expect(mockEventBus.publish).toHaveBeenCalled();
    });

    it('should throw NotFoundException when task does not exist', async () => {
      mockQueryRunner.manager.findOne.mockResolvedValueOnce(null);

      await expect(service.assignTask('non-existent', { userId: 'any-user' })).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException when user is not in tenant', async () => {
      // Lock findOne returns task
      mockQueryRunner.manager.findOne
        .mockResolvedValueOnce({ ...mockTask })
        .mockResolvedValueOnce({ ...mockTask })
        .mockResolvedValueOnce(null); // user not found

      await expect(service.assignTask('task-uuid-123', { userId: 'foreign-user' })).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  // ============ addTaskAssignee ============
  describe('addTaskAssignee', () => {
    it('should add ASSISTANT assignee and transfer commission', async () => {
      const task = { ...mockTask };
      mockQueryRunner.manager.findOne
        .mockResolvedValueOnce(task) // lock
        .mockResolvedValueOnce(task) // relations
        .mockResolvedValueOnce({ id: 'user-1', tenantId: 'tenant-123' }) // validateUser
        .mockResolvedValueOnce(null); // syncLegacy: no lead

      const dto = { userId: 'user-1', role: TaskAssigneeRole.ASSISTANT, commissionSnapshot: 50 };
      const result = await service.addTaskAssignee('task-uuid-123', dto);

      expect(result).toMatchObject({
        tenantId: 'tenant-123',
        taskId: 'task-uuid-123',
        userId: 'user-1',
        role: TaskAssigneeRole.ASSISTANT,
        commissionSnapshot: 50,
      });
      expect(mockFinanceService.transferPendingCommission).toHaveBeenCalledWith(
        mockQueryRunner.manager,
        null,
        'user-1',
        50,
      );
    });

    it('should add LEAD assignee and demote existing LEAD', async () => {
      const task = { ...mockTask };
      mockQueryRunner.manager.findOne
        .mockResolvedValueOnce(task) // lock
        .mockResolvedValueOnce(task) // relations
        .mockResolvedValueOnce({ id: 'user-2', tenantId: 'tenant-123' }) // validateUser
        .mockResolvedValueOnce(null); // syncLegacy: no lead after sync

      const dto = { userId: 'user-2', role: TaskAssigneeRole.LEAD, commissionSnapshot: 75 };
      await service.addTaskAssignee('task-uuid-123', dto);

      // Should run the demote query builder
      expect(mockUpdateQb.execute).toHaveBeenCalled();
    });

    it('should throw BadRequestException when commissionSnapshot is zero', async () => {
      const task = { ...mockTask, commissionSnapshot: 0 };
      mockQueryRunner.manager.findOne
        .mockResolvedValueOnce(task)
        .mockResolvedValueOnce(task)
        .mockResolvedValueOnce({ id: 'user-1', tenantId: 'tenant-123' });

      await expect(
        service.addTaskAssignee('task-uuid-123', { userId: 'user-1', commissionSnapshot: 0 }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw ConflictException on duplicate assignee (PG 23505)', async () => {
      const task = { ...mockTask };
      mockQueryRunner.manager.findOne
        .mockResolvedValueOnce(task)
        .mockResolvedValueOnce(task)
        .mockResolvedValueOnce({ id: 'user-1', tenantId: 'tenant-123' });

      const pgError = Object.assign(new Error('duplicate key'), { code: '23505' });
      mockQueryRunner.manager.save.mockRejectedValueOnce(pgError);

      await expect(
        service.addTaskAssignee('task-uuid-123', { userId: 'user-1', commissionSnapshot: 50 }),
      ).rejects.toThrow(ConflictException);
    });
  });

  // ============ removeTaskAssignee ============
  describe('removeTaskAssignee', () => {
    it('should remove assignee and reverse commission', async () => {
      const task = { ...mockTask };
      mockQueryRunner.manager.findOne
        .mockResolvedValueOnce(task) // lock
        .mockResolvedValueOnce(task) // relations
        .mockResolvedValueOnce({ ...mockAssignee, commissionSnapshot: 80 }) // assignee
        .mockResolvedValueOnce(null); // syncLegacy: no lead

      await service.removeTaskAssignee('task-uuid-123', 'user-1');

      expect(mockQueryRunner.manager.delete).toHaveBeenCalledWith(TaskAssignee, {
        tenantId: 'tenant-123',
        taskId: 'task-uuid-123',
        userId: 'user-1',
      });
      expect(mockFinanceService.transferPendingCommission).toHaveBeenCalledWith(
        mockQueryRunner.manager,
        'user-1',
        undefined,
        80,
      );
    });

    it('should throw NotFoundException when assignee does not exist', async () => {
      const task = { ...mockTask };
      mockQueryRunner.manager.findOne
        .mockResolvedValueOnce(task)
        .mockResolvedValueOnce(task)
        .mockResolvedValueOnce(null); // assignee not found

      await expect(service.removeTaskAssignee('task-uuid-123', 'ghost-user')).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException when assignee commissionSnapshot is zero', async () => {
      const task = { ...mockTask };
      mockQueryRunner.manager.findOne
        .mockResolvedValueOnce(task)
        .mockResolvedValueOnce(task)
        .mockResolvedValueOnce({ ...mockAssignee, commissionSnapshot: 0 });

      await expect(service.removeTaskAssignee('task-uuid-123', 'user-1')).rejects.toThrow(BadRequestException);
    });
  });

  // ============ listTaskAssignees ============
  describe('listTaskAssignees', () => {
    it('should return all assignees for admin user', async () => {
      mockTaskRepository.findOne.mockResolvedValueOnce(mockTask);
      mockTaskAssigneeRepository.find.mockResolvedValueOnce([mockAssignee]);

      const result = await service.listTaskAssignees('task-uuid-123', adminUser);

      expect(result).toEqual([mockAssignee]);
    });

    it('should return assignees when FIELD_STAFF is among them', async () => {
      const staffAssignee = { ...mockAssignee, userId: 'staff-uuid' };
      mockTaskRepository.findOne.mockResolvedValueOnce({
        ...mockTask,
        assignedUserId: null,
      });
      mockTaskAssigneeRepository.find.mockResolvedValueOnce([staffAssignee]);

      const result = await service.listTaskAssignees('task-uuid-123', staffUser);

      expect(result).toEqual([staffAssignee]);
    });

    it('should throw ForbiddenException when FIELD_STAFF is not an assignee', async () => {
      mockTaskRepository.findOne.mockResolvedValueOnce({
        ...mockTask,
        assignedUserId: 'other-user',
      });
      mockTaskAssigneeRepository.find.mockResolvedValueOnce([{ ...mockAssignee, userId: 'other-user' }]);

      await expect(service.listTaskAssignees('task-uuid-123', staffUser)).rejects.toThrow(ForbiddenException);
    });

    it('should throw NotFoundException when task does not exist', async () => {
      mockTaskRepository.findOne.mockResolvedValueOnce(null);

      await expect(service.listTaskAssignees('non-existent', adminUser)).rejects.toThrow(NotFoundException);
    });
  });
});
