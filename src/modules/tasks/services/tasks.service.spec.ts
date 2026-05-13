import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { EventBus } from '@nestjs/cqrs';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { createMockRepository, createMockTask, createMockUser } from '../../../../test/helpers/mock-factories';
import { TenantContextService } from '../../../common/services/tenant-context.service';
import { AuditService } from '../../audit/audit.service';
import { WalletService } from '../../finance/services/wallet.service';
import type { User } from '../../users/entities/user.entity';
import { Role } from '../../users/enums/role.enum';
import type { TaskAssignee } from '../entities/task-assignee.entity';
import { TaskAssigneeRole } from '../enums/task-assignee-role.enum';
import type { Task } from '../entities/task.entity';
import { TaskStatus } from '../enums/task-status.enum';
import { TaskCompletedEvent } from '../events/task-completed.event';
import { TaskAssigneeRepository } from '../repositories/task-assignee.repository';
import { TaskRepository } from '../repositories/task.repository';
import { TasksExportService } from './tasks-export.service';
import { TasksService } from './tasks.service';

describe('TasksService - Comprehensive Tests', () => {
  let service: TasksService;

  const adminUser = createMockUser({ id: 'admin-uuid', role: Role.ADMIN }) as unknown as User;
  const staffUser = createMockUser({ id: 'staff-uuid', role: Role.FIELD_STAFF }) as unknown as User;

  const mockTask = createMockTask({
    status: TaskStatus.PENDING,
    dueDate: new Date('2024-12-31'),
    // Explicitly defining nested objects to match original manual mock behavior for tests relying on them
    booking: {
      id: 'booking-uuid-123',
      clientId: 'client-123',
      client: { name: 'John Doe' },
    },
    processingType: { id: 'processing-type-uuid-123', name: 'Photography' },
    assignedUser: { id: 'user-uuid-123', email: 'user@example.com' },
  }) as unknown as Task;

  const mockTaskRepository = createMockRepository();
  mockTaskRepository.find = jest.fn().mockResolvedValue([mockTask]);
  mockTaskRepository.save = jest.fn().mockImplementation((task) => Promise.resolve(task));
  // Mock query builder methods that might be missing or specific
  const mockQueryBuilder = {
    leftJoinAndSelect: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    getMany: jest.fn().mockResolvedValue([mockTask]),
  };
  mockTaskRepository.createQueryBuilder = jest.fn(() => mockQueryBuilder);

  const mockWalletService = {
    moveToPayable: jest.fn().mockResolvedValue({}),
    addToPayableBalance: jest.fn().mockResolvedValue({}),
    addPendingCommission: jest.fn().mockResolvedValue({}),
    subtractPendingCommission: jest.fn().mockResolvedValue({}),
  };

  const mockEventBus = {
    publish: jest.fn(),
  };

  const mockAuditService = {
    log: jest.fn().mockResolvedValue(undefined),
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
      createQueryBuilder: jest.fn(),
    },
  };

  const mockAssigneeQueryBuilder = {
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    getExists: jest.fn().mockResolvedValue(true),
  };

  const mockTaskAssigneeRepository = {
    createQueryBuilder: jest.fn(() => mockAssigneeQueryBuilder),
    find: jest.fn().mockResolvedValue([]),
  };

  const mockTasksExportService = {
    exportToCSV: jest.fn(),
  };

  const mockDataSource = {
    createQueryRunner: jest.fn().mockReturnValue(mockQueryRunner),
    getRepository: jest.fn().mockReturnValue(mockTaskAssigneeRepository),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TasksService,
        { provide: TaskRepository, useValue: mockTaskRepository },
        { provide: WalletService, useValue: mockWalletService },
        { provide: EventBus, useValue: mockEventBus },
        { provide: AuditService, useValue: mockAuditService },
        { provide: DataSource, useValue: mockDataSource },
        { provide: TaskAssigneeRepository, useValue: mockTaskAssigneeRepository },
        { provide: EventBus, useValue: mockEventBus },
        { provide: TasksExportService, useValue: mockTasksExportService },
      ],
    }).compile();

    service = module.get<TasksService>(TasksService);

    // Reset mocks
    jest.clearAllMocks();

    const mockUpdateQueryBuilder = {
      update: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      execute: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    mockQueryRunner.manager.createQueryBuilder.mockReturnValue(mockUpdateQueryBuilder);

    // Default behavior for repository findOne
    mockTaskRepository.findOne.mockImplementation(({ where }) => {
      const whereId = where.id;
      if (whereId === 'task-uuid-123') {
        return Promise.resolve({ ...mockTask });
      }
      return Promise.resolve(null);
    });

    // Default behavior for queryRunner.manager.findOne (pessimistic locking)
    mockQueryRunner.manager.findOne.mockImplementation((EntityClass, options) => {
      if (options?.where?.id === 'task-uuid-123') {
        return Promise.resolve({ ...mockTask, tenantId: 'tenant-123' });
      }
      return Promise.resolve(null);
    });
    mockQueryRunner.manager.find.mockResolvedValue([]);

    jest.spyOn(TenantContextService, 'getTenantIdOrThrow').mockReturnValue('tenant-123');
  });

  // ============ FIND OPERATIONS TESTS ============
  describe('findAll', () => {
    it('scopes findAll() by tenantId', async () => {
      const tenantId = 'tenant-123';
      jest.spyOn(TenantContextService, 'getTenantIdOrThrow').mockReturnValue(tenantId);

      await service.findAll();

      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith('task.tenantId = :tenantId', { tenantId });
    });

    it('should return all tasks with relations', async () => {
      const result = await service.findAll();
      expect(result).toEqual([mockTask]);
      expect(mockTaskRepository.createQueryBuilder).toHaveBeenCalledWith('task');
    });

    it('should return empty array when no tasks exist', async () => {
      // We need to override the default mock for createQueryBuilder to return valid chain but empty result
      const mockQb = {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([]),
      };
      mockTaskRepository.createQueryBuilder.mockReturnValue(mockQb);

      const result = await service.findAll();
      expect(result).toEqual([]);
    });

    it('should return multiple tasks', async () => {
      const tasks = [mockTask, { ...mockTask, id: 'task-2', status: TaskStatus.IN_PROGRESS }];

      const mockQb = {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue(tasks),
      };
      mockTaskRepository.createQueryBuilder.mockReturnValue(mockQb);

      const result = await service.findAll();
      expect(result).toHaveLength(2);
    });
  });

  describe('findOne', () => {
    it('should return task by valid id', async () => {
      const result = await service.findOne('task-uuid-123');
      expect(result.commissionSnapshot).toBe(100);
    });

    it('should throw NotFoundException for invalid id', async () => {
      await expect(service.findOne('invalid-id')).rejects.toThrow(NotFoundException);
    });
  });

  describe('findByBooking', () => {
    it('should return tasks for a booking', async () => {
      mockTaskRepository.find.mockResolvedValueOnce([mockTask]);
      const result = await service.findByBooking('booking-uuid-123');
      expect(result).toHaveLength(1);
      expect(mockTaskRepository.find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ bookingId: 'booking-uuid-123' }),
          take: 100,
        }),
      );
    });

    it('should clamp limit to max 100', async () => {
      mockTaskRepository.find.mockResolvedValueOnce([mockTask]);
      await service.findByBooking('booking-uuid-123', 1000);
      expect(mockTaskRepository.find).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 100,
        }),
      );
    });

    it('should clamp limit to min 1', async () => {
      mockTaskRepository.find.mockResolvedValueOnce([mockTask]);
      await service.findByBooking('booking-uuid-123', 0);
      expect(mockTaskRepository.find).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 1,
        }),
      );
    });

    it('should return empty array for booking with no tasks', async () => {
      mockTaskRepository.find.mockResolvedValueOnce([]);
      const result = await service.findByBooking('booking-no-tasks');
      expect(result).toHaveLength(0);
    });
  });

  describe('findByUser', () => {
    it('should return tasks assigned to user', async () => {
      mockTaskRepository.find.mockResolvedValueOnce([mockTask]);
      const result = await service.findByUser('user-uuid-123');
      expect(result.length).toBe(1);
      expect(mockTaskRepository.find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ assignedUserId: 'user-uuid-123' }),
          take: 100,
        }),
      );
    });

    it('should clamp limit to max 100', async () => {
      mockTaskRepository.find.mockResolvedValueOnce([mockTask]);
      await service.findByUser('user-uuid-123', 1000);
      expect(mockTaskRepository.find).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 100,
        }),
      );
    });

    it('should clamp limit to min 1', async () => {
      mockTaskRepository.find.mockResolvedValueOnce([mockTask]);
      await service.findByUser('user-uuid-123', 0);
      expect(mockTaskRepository.find).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 1,
        }),
      );
    });

    it('should return empty array for user with no tasks', async () => {
      mockTaskRepository.find.mockResolvedValueOnce([]);
      const result = await service.findByUser('user-no-tasks');
      expect(result).toEqual([]);
    });
  });

  // ============ UPDATE TASK TESTS ============
  describe('update', () => {
    it('should update task notes', async () => {
      await service.update('task-uuid-123', {
        notes: 'Updated notes',
      });
      expect(mockTaskRepository.save).toHaveBeenCalled();
    });

    it('should update task due date', async () => {
      await service.update('task-uuid-123', {
        dueDate: '2025-01-15T10:00:00Z',
      });
      expect(mockTaskRepository.save).toHaveBeenCalled();
    });

    it('should reject reassignment via update', async () => {
      mockTaskRepository.findOne.mockResolvedValueOnce({
        ...mockTask,
        assignedUserId: 'user-uuid-123',
      } as Task);

      await expect(
        service.update('task-uuid-123', {
          assignedUserId: 'user-uuid-999',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw NotFoundException for non-existent task', async () => {
      await expect(service.update('invalid-id', { notes: 'Test' })).rejects.toThrow(NotFoundException);
    });
  });

  // ============ START TASK TESTS ============
  describe('startTask', () => {
    it('should start pending task', async () => {
      const result = await service.startTask('task-uuid-123', adminUser);
      expect(result.status).toBe(TaskStatus.IN_PROGRESS);
    });

    it('should reject starting in-progress task', async () => {
      mockTaskRepository.findOne.mockResolvedValueOnce({
        ...mockTask,
        status: TaskStatus.IN_PROGRESS,
      });
      await expect(service.startTask('task-uuid-123', adminUser)).rejects.toThrow(BadRequestException);
    });

    it('should reject starting completed task', async () => {
      mockTaskRepository.findOne.mockResolvedValueOnce({
        ...mockTask,
        status: TaskStatus.COMPLETED,
      });
      await expect(service.startTask('task-uuid-123', adminUser)).rejects.toThrow(BadRequestException);
    });

    it('should throw NotFoundException for non-existent task', async () => {
      await expect(service.startTask('invalid-id', adminUser)).rejects.toThrow(NotFoundException);
    });

    it('should forbid field staff from starting unassigned task', async () => {
      mockTaskRepository.findOne.mockResolvedValueOnce({
        ...mockTask,
        assignedUserId: null,
      });
      await expect(service.startTask('task-uuid-123', staffUser)).rejects.toThrow(ForbiddenException);
    });

    it("should forbid field staff from starting someone else's task", async () => {
      mockTaskRepository.findOne.mockResolvedValueOnce({
        ...mockTask,
        assignedUserId: 'another-user',
      });
      await expect(service.startTask('task-uuid-123', staffUser)).rejects.toThrow(ForbiddenException);
    });

    it('should allow field staff to start own assigned task', async () => {
      mockTaskRepository.findOne.mockResolvedValueOnce({
        ...mockTask,
        assignedUserId: 'staff-uuid',
        status: TaskStatus.PENDING,
      });
      const result = await service.startTask('task-uuid-123', staffUser);
      expect(result.status).toBe(TaskStatus.IN_PROGRESS);
    });
  });

  // ============ COMPLETE TASK TESTS ============
  describe('completeTask', () => {
    it('should complete multi-assignee task and credit each assignee wallet', async () => {
      mockQueryRunner.manager.findOne.mockResolvedValueOnce({
        ...mockTask,
        tenantId: 'tenant-123',
        status: TaskStatus.IN_PROGRESS,
        assignedUserId: null,
        commissionSnapshot: 999,
      });
      mockQueryRunner.manager.findOne.mockResolvedValueOnce({
        ...mockTask,
        tenantId: 'tenant-123',
        status: TaskStatus.IN_PROGRESS,
        assignedUserId: null,
        commissionSnapshot: 999,
      });
      mockQueryRunner.manager.find.mockResolvedValueOnce([
        {
          id: 'assignee-1',
          tenantId: 'tenant-123',
          taskId: 'task-uuid-123',
          userId: 'staff-1',
          role: TaskAssigneeRole.LEAD,
          commissionSnapshot: 60,
        },
        {
          id: 'assignee-2',
          tenantId: 'tenant-123',
          taskId: 'task-uuid-123',
          userId: 'staff-2',
          role: TaskAssigneeRole.ASSISTANT,
          commissionSnapshot: 40,
        },
      ] as TaskAssignee[]);

      const result = await service.completeTask('task-uuid-123', adminUser);

      expect(mockWalletService.moveToPayable).toHaveBeenCalledTimes(2);
      expect(mockWalletService.moveToPayable).toHaveBeenNthCalledWith(1, mockQueryRunner.manager, 'staff-1', 60);
      expect(mockWalletService.moveToPayable).toHaveBeenNthCalledWith(2, mockQueryRunner.manager, 'staff-2', 40);
      expect(result.commissionAccrued).toBe(100);
      expect(result.walletUpdated).toBe(true);
    });

    it('should use assignee commission snapshots and not legacy task commission when assignees exist', async () => {
      mockQueryRunner.manager.findOne.mockResolvedValueOnce({
        ...mockTask,
        tenantId: 'tenant-123',
        status: TaskStatus.IN_PROGRESS,
        assignedUserId: 'legacy-user',
        commissionSnapshot: 500,
      });
      mockQueryRunner.manager.findOne.mockResolvedValueOnce({
        ...mockTask,
        tenantId: 'tenant-123',
        status: TaskStatus.IN_PROGRESS,
        assignedUserId: 'legacy-user',
        commissionSnapshot: 500,
      });
      mockQueryRunner.manager.find.mockResolvedValueOnce([
        {
          id: 'assignee-1',
          tenantId: 'tenant-123',
          taskId: 'task-uuid-123',
          userId: 'staff-1',
          role: TaskAssigneeRole.LEAD,
          commissionSnapshot: 80,
        },
        {
          id: 'assignee-2',
          tenantId: 'tenant-123',
          taskId: 'task-uuid-123',
          userId: 'staff-2',
          role: TaskAssigneeRole.ASSISTANT,
          commissionSnapshot: 20,
        },
      ] as TaskAssignee[]);

      const result = await service.completeTask('task-uuid-123', adminUser);

      expect(mockWalletService.moveToPayable).toHaveBeenCalledTimes(2);
      expect(mockWalletService.moveToPayable).toHaveBeenCalledWith(mockQueryRunner.manager, 'staff-1', 80);
      expect(mockWalletService.moveToPayable).toHaveBeenCalledWith(mockQueryRunner.manager, 'staff-2', 20);
      expect(mockWalletService.moveToPayable).not.toHaveBeenCalledWith(mockQueryRunner.manager, 'legacy-user', 500);
      expect(result.commissionAccrued).toBe(100);
    });

    it('should return commissionAccrued as sum of assignee commission snapshots', async () => {
      mockQueryRunner.manager.findOne.mockResolvedValueOnce({
        ...mockTask,
        tenantId: 'tenant-123',
        status: TaskStatus.IN_PROGRESS,
      });
      mockQueryRunner.manager.findOne.mockResolvedValueOnce({
        ...mockTask,
        tenantId: 'tenant-123',
        status: TaskStatus.IN_PROGRESS,
      });
      mockQueryRunner.manager.find.mockResolvedValueOnce([
        {
          id: 'assignee-1',
          tenantId: 'tenant-123',
          taskId: 'task-uuid-123',
          userId: 'staff-1',
          role: TaskAssigneeRole.LEAD,
          commissionSnapshot: 33.33,
        },
        {
          id: 'assignee-2',
          tenantId: 'tenant-123',
          taskId: 'task-uuid-123',
          userId: 'staff-2',
          role: TaskAssigneeRole.ASSISTANT,
          commissionSnapshot: 66.67,
        },
      ] as TaskAssignee[]);

      const result = await service.completeTask('task-uuid-123', adminUser);

      expect(result.commissionAccrued).toBe(100);
      expect(result.walletUpdated).toBe(true);
    });

    it('should forbid field staff if task has assignees but user is not among them', async () => {
      mockQueryRunner.manager.findOne.mockResolvedValueOnce({
        ...mockTask,
        tenantId: 'tenant-123',
        status: TaskStatus.IN_PROGRESS,
        assignedUserId: 'another-user',
      });
      mockQueryRunner.manager.findOne.mockResolvedValueOnce({
        ...mockTask,
        tenantId: 'tenant-123',
        status: TaskStatus.IN_PROGRESS,
        assignedUserId: 'another-user',
      });
      mockQueryRunner.manager.find.mockResolvedValueOnce([
        {
          id: 'assignee-1',
          tenantId: 'tenant-123',
          taskId: 'task-uuid-123',
          userId: 'different-staff',
          role: TaskAssigneeRole.LEAD,
          commissionSnapshot: 100,
        },
      ] as TaskAssignee[]);

      await expect(service.completeTask('task-uuid-123', staffUser)).rejects.toThrow(ForbiddenException);
    });

    it('should fallback to legacy single-assignee commission accrual when no task assignees exist', async () => {
      mockQueryRunner.manager.findOne.mockResolvedValueOnce({
        ...mockTask,
        tenantId: 'tenant-123',
        status: TaskStatus.IN_PROGRESS,
        assignedUserId: 'legacy-user',
        commissionSnapshot: 120,
      });
      mockQueryRunner.manager.findOne.mockResolvedValueOnce({
        ...mockTask,
        tenantId: 'tenant-123',
        status: TaskStatus.IN_PROGRESS,
        assignedUserId: 'legacy-user',
        commissionSnapshot: 120,
      });
      mockQueryRunner.manager.find.mockResolvedValueOnce([]);

      const result = await service.completeTask('task-uuid-123', adminUser);

      expect(mockWalletService.addToPayableBalance).toHaveBeenCalledTimes(1);
      expect(mockWalletService.addToPayableBalance).toHaveBeenCalledWith(mockQueryRunner.manager, 'legacy-user', 120);
      expect(result.commissionAccrued).toBe(120);
      expect(result.walletUpdated).toBe(true);
    });

    it('should complete in-progress task and accrue commission', async () => {
      // Lock call
      mockQueryRunner.manager.findOne.mockResolvedValueOnce({
        ...mockTask,
        tenantId: 'tenant-123',
        status: TaskStatus.IN_PROGRESS,
      });
      // Relations call
      mockQueryRunner.manager.findOne.mockResolvedValueOnce({
        ...mockTask,
        tenantId: 'tenant-123',
        status: TaskStatus.IN_PROGRESS,
        commissionSnapshot: 100, // Ensure logic sees 100
      });

      const result = await service.completeTask('task-uuid-123', adminUser);
      expect(result.commissionAccrued).toBe(100);
      expect(result.walletUpdated).toBe(true);
      expect(mockQueryRunner.commitTransaction).toHaveBeenCalled();
      expect(mockEventBus.publish).toHaveBeenCalledWith(expect.any(TaskCompletedEvent));
    });

    it('should complete pending task and accrue commission', async () => {
      // Lock call
      mockQueryRunner.manager.findOne.mockResolvedValueOnce({
        ...mockTask,
        status: TaskStatus.PENDING,
      });
      // Relations call
      mockQueryRunner.manager.findOne.mockResolvedValueOnce({
        ...mockTask,
        status: TaskStatus.PENDING,
        commissionSnapshot: 100,
      });

      const result = await service.completeTask('task-uuid-123', adminUser);
      expect(result.commissionAccrued).toBe(100);
    });

    it('should reject completing already completed task', async () => {
      const completedTask = {
        ...mockTask,
        tenantId: 'tenant-123',
        status: TaskStatus.COMPLETED,
      };
      // Lock call
      mockQueryRunner.manager.findOne.mockResolvedValueOnce(completedTask);
      // Relations call
      mockQueryRunner.manager.findOne.mockResolvedValueOnce(completedTask);

      await expect(service.completeTask('task-uuid-123', adminUser)).rejects.toThrow(BadRequestException);
    });

    it('should reject completing unassigned task', async () => {
      // Lock call
      mockQueryRunner.manager.findOne.mockResolvedValueOnce({
        ...mockTask,
        tenantId: 'tenant-123',
        assignedUserId: null,
      });

      // No second call needed as it likely throws early or we mock specifically
      // Actually per logic: check status first, then assigned User.
      // If status is OK, it proceeds.
      // Wait, validation logic for assignment is after fetch.
      // But because my mock implementation of `findOne` default is just "return generic task",
      // I need to override the first call.
      // However, if the code splits fetch, validation might happen after second fetch if relation dependent?
      // Re-reading code: 'assignedUser' is a relation, loaded in Step 2.
      // So checks for assignment happen after step 2.

      mockQueryRunner.manager.findOne.mockReset(); // Reset default behavior

      // Step 1: Lock returns basic info
      mockQueryRunner.manager.findOne.mockResolvedValueOnce({
        ...mockTask,
        tenantId: 'tenant-123',
        status: TaskStatus.PENDING,
        assignedUserId: null,
      });

      // Step 2: Relations returns null assignedUser relation
      mockQueryRunner.manager.findOne.mockResolvedValueOnce({
        ...mockTask,
        tenantId: 'tenant-123',
        status: TaskStatus.PENDING,
        assignedUserId: null,
        assignedUser: null,
      });

      await expect(service.completeTask('task-uuid-123', adminUser)).rejects.toThrow(BadRequestException);
    });

    it('should handle zero commission task', async () => {
      // Lock call
      mockQueryRunner.manager.findOne.mockResolvedValueOnce({
        ...mockTask,
        tenantId: 'tenant-123',
      });
      // Relations call
      mockQueryRunner.manager.findOne.mockResolvedValueOnce({
        ...mockTask,
        tenantId: 'tenant-123',
        commissionSnapshot: 0,
      });

      const result = await service.completeTask('task-uuid-123', adminUser);
      expect(result.commissionAccrued).toBe(0);
      expect(result.walletUpdated).toBe(false);
    });

    it('should set completedAt timestamp', async () => {
      mockQueryRunner.manager.findOne.mockResolvedValueOnce({
        ...mockTask,
        tenantId: 'tenant-123',
        status: TaskStatus.IN_PROGRESS,
      });
      mockQueryRunner.manager.findOne.mockResolvedValueOnce({
        ...mockTask,
        tenantId: 'tenant-123',
        status: TaskStatus.IN_PROGRESS,
      });

      await service.completeTask('task-uuid-123', adminUser);
      const savedTask = mockQueryRunner.manager.save.mock.calls[0][0];
      expect(savedTask.completedAt).toBeInstanceOf(Date);
    });

    it('should rollback on wallet update failure', async () => {
      mockQueryRunner.manager.findOne.mockResolvedValueOnce({
        ...mockTask,
        tenantId: 'tenant-123',
        status: TaskStatus.IN_PROGRESS,
      });
      mockQueryRunner.manager.findOne.mockResolvedValueOnce({
        ...mockTask,
        tenantId: 'tenant-123',
        status: TaskStatus.IN_PROGRESS,
      });

      mockWalletService.addToPayableBalance.mockRejectedValueOnce(new Error('Wallet error'));
      await expect(service.completeTask('task-uuid-123', adminUser)).rejects.toThrow('Wallet error');
      expect(mockQueryRunner.rollbackTransaction).toHaveBeenCalled();
    });

    it('should throw NotFoundException for non-existent task', async () => {
      mockQueryRunner.manager.findOne.mockResolvedValueOnce(null);
      await expect(service.completeTask('invalid-id', adminUser)).rejects.toThrow(NotFoundException);
    });

    it('should handle high commission amount', async () => {
      mockQueryRunner.manager.findOne.mockResolvedValueOnce({
        ...mockTask,
        tenantId: 'tenant-123',
        commissionSnapshot: 9999.99,
      });
      mockQueryRunner.manager.findOne.mockResolvedValueOnce({
        ...mockTask,
        tenantId: 'tenant-123',
        commissionSnapshot: 9999.99,
      });

      const result = await service.completeTask('task-uuid-123', adminUser);
      expect(result.commissionAccrued).toBe(9999.99);
    });

    it("should forbid field staff from completing someone else's task", async () => {
      // Lock call
      mockQueryRunner.manager.findOne.mockResolvedValueOnce({
        ...mockTask,
        tenantId: 'tenant-123',
        status: TaskStatus.IN_PROGRESS,
      });
      // Relations call with a different assigned user
      mockQueryRunner.manager.findOne.mockResolvedValueOnce({
        ...mockTask,
        tenantId: 'tenant-123',
        status: TaskStatus.IN_PROGRESS,
        assignedUserId: 'another-user',
      });

      await expect(service.completeTask('task-uuid-123', staffUser)).rejects.toThrow(ForbiddenException);
    });
  });
});
