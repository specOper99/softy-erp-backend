import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { Role, TaskStatus } from '../../common/enums';
import { TenantContextService } from '../../common/services/tenant-context.service';
import { AuditService } from '../audit/audit.service';
import { FinanceService } from '../finance/services/finance.service';
import { MailService } from '../mail/mail.service';
import { User } from '../users/entities/user.entity';
import { Task } from './entities/task.entity';
import { TasksService } from './tasks.service';

describe('TasksService - Comprehensive Tests', () => {
  let service: TasksService;

  const adminUser = { id: 'admin-uuid', role: Role.ADMIN } as User;
  const staffUser = { id: 'staff-uuid', role: Role.FIELD_STAFF } as User;

  const mockTask = {
    id: 'task-uuid-123',
    bookingId: 'booking-uuid-123',
    taskTypeId: 'task-type-uuid-123',
    assignedUserId: 'user-uuid-123',
    status: TaskStatus.PENDING,
    commissionSnapshot: 100,
    dueDate: new Date('2024-12-31'),
    completedAt: null,
    notes: 'Test task',
    booking: {
      id: 'booking-uuid-123',
      clientId: 'client-123',
      client: { name: 'John Doe' },
    },
    taskType: { id: 'task-type-uuid-123', name: 'Photography' },
    assignedUser: { id: 'user-uuid-123', email: 'user@example.com' },
  };

  const mockTaskRepository = {
    find: jest.fn().mockResolvedValue([mockTask]),
    findOne: jest.fn(),
    save: jest.fn().mockImplementation((task) => Promise.resolve(task)),
    createQueryBuilder: jest.fn(() => ({
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([mockTask]),
    })),
  };

  const mockFinanceService = {
    moveToPayable: jest.fn().mockResolvedValue({}),
    addPendingCommission: jest.fn().mockResolvedValue({}),
    subtractPendingCommission: jest.fn().mockResolvedValue({}),
  };

  const mockMailService = {
    sendTaskAssignment: jest.fn().mockResolvedValue(undefined),
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
      save: jest.fn().mockImplementation((entity) => Promise.resolve(entity)),
      findOne: jest.fn(),
    },
  };

  const mockDataSource = {
    createQueryRunner: jest.fn().mockReturnValue(mockQueryRunner),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TasksService,
        { provide: getRepositoryToken(Task), useValue: mockTaskRepository },
        { provide: FinanceService, useValue: mockFinanceService },
        { provide: MailService, useValue: mockMailService },
        { provide: AuditService, useValue: mockAuditService },
        { provide: DataSource, useValue: mockDataSource },
      ],
    }).compile();

    service = module.get<TasksService>(TasksService);

    // Reset mocks
    jest.clearAllMocks();

    // Default behavior for repository findOne
    mockTaskRepository.findOne.mockImplementation(({ where }) => {
      if (where.id === 'task-uuid-123') {
        return Promise.resolve({ ...mockTask });
      }
      return Promise.resolve(null);
    });

    // Default behavior for queryRunner.manager.findOne (pessimistic locking)
    mockQueryRunner.manager.findOne.mockImplementation(
      (EntityClass, options) => {
        if (options?.where?.id === 'task-uuid-123') {
          return Promise.resolve({ ...mockTask, tenantId: 'tenant-123' });
        }
        return Promise.resolve(null);
      },
    );

    jest
      .spyOn(TenantContextService, 'getTenantId')
      .mockReturnValue('tenant-123');
  });

  // ============ FIND OPERATIONS TESTS ============
  describe('findAll', () => {
    it('should return all tasks with relations', async () => {
      const result = await service.findAll();
      expect(result).toEqual([mockTask]);
      expect(mockTaskRepository.createQueryBuilder).toHaveBeenCalledWith(
        'task',
      );
    });

    it('should return empty array when no tasks exist', async () => {
      // We need to override the default mock for createQueryBuilder to return valid chain but empty result
      const mockQb = {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([]),
      };
      (mockTaskRepository.createQueryBuilder as jest.Mock).mockReturnValue(
        mockQb,
      );

      const result = await service.findAll();
      expect(result).toEqual([]);
    });

    it('should return multiple tasks', async () => {
      const tasks = [
        mockTask,
        { ...mockTask, id: 'task-2', status: TaskStatus.IN_PROGRESS },
      ];

      const mockQb = {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue(tasks),
      };
      (mockTaskRepository.createQueryBuilder as jest.Mock).mockReturnValue(
        mockQb,
      );

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
      await expect(service.findOne('invalid-id')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('findByBooking', () => {
    it('should return tasks for a booking', async () => {
      mockTaskRepository.find.mockResolvedValueOnce([mockTask]);
      const result = await service.findByBooking('booking-uuid-123');
      expect(result).toHaveLength(1);
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

    it('should throw NotFoundException for non-existent task', async () => {
      await expect(
        service.update('invalid-id', { notes: 'Test' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ============ ASSIGN TASK TESTS ============
  describe('assignTask', () => {
    it('should assign task to user', async () => {
      // Mock the locking call
      mockQueryRunner.manager.findOne.mockResolvedValueOnce({
        ...mockTask,
        tenantId: 'tenant-123',
      });
      // Mock the second call for relations
      mockQueryRunner.manager.findOne.mockResolvedValueOnce({
        ...mockTask,
        tenantId: 'tenant-123',
        booking: {
          id: 'booking-uuid-123',
          clientId: 'client-123',
          client: { name: 'Client' },
        },
        taskType: { name: 'Type' },
      });
      // Mock user validation (User lookup)
      mockQueryRunner.manager.findOne.mockResolvedValueOnce({
        id: 'new-user-id',
        tenantId: 'tenant-123',
      });
      // Mock user fetch for email
      mockQueryRunner.manager.findOne.mockResolvedValueOnce({
        id: 'new-user-id',
        email: 'new@example.com',
      });

      const result = await service.assignTask('task-uuid-123', {
        userId: 'new-user-id',
      });
      expect(result.assignedUserId).toBe('new-user-id');
    });

    it('should reassign task to different user', async () => {
      // Mock the locking call
      mockQueryRunner.manager.findOne.mockResolvedValueOnce({
        ...mockTask,
        assignedUserId: 'original-user',
        tenantId: 'tenant-123',
      });
      // Mock the second call for relations
      mockQueryRunner.manager.findOne.mockResolvedValueOnce({
        ...mockTask,
        assignedUserId: 'original-user',
        tenantId: 'tenant-123',
        booking: {
          id: 'booking-uuid-123',
          clientId: 'client-123',
          client: { name: 'Client' },
        },
        taskType: { name: 'Type' },
      });
      // Mock user validation (User lookup)
      mockQueryRunner.manager.findOne.mockResolvedValueOnce({
        id: 'new-user-id',
        tenantId: 'tenant-123',
      });
      // Mock the user fetch for email
      mockQueryRunner.manager.findOne.mockResolvedValueOnce({
        id: 'new-user-id',
        email: 'new@example.com',
      });

      const result = await service.assignTask('task-uuid-123', {
        userId: 'new-user-id',
      });
      expect(result.assignedUserId).toBe('new-user-id');
      expect(mockFinanceService.subtractPendingCommission).toHaveBeenCalled();
    });

    it('should throw NotFoundException for non-existent task', async () => {
      await expect(
        service.assignTask('invalid-id', { userId: 'user-id' }),
      ).rejects.toThrow(NotFoundException);
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
      await expect(
        service.startTask('task-uuid-123', adminUser),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject starting completed task', async () => {
      mockTaskRepository.findOne.mockResolvedValueOnce({
        ...mockTask,
        status: TaskStatus.COMPLETED,
      });
      await expect(
        service.startTask('task-uuid-123', adminUser),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw NotFoundException for non-existent task', async () => {
      await expect(service.startTask('invalid-id', adminUser)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should forbid field staff from starting unassigned task', async () => {
      mockTaskRepository.findOne.mockResolvedValueOnce({
        ...mockTask,
        assignedUserId: null,
      });
      await expect(
        service.startTask('task-uuid-123', staffUser),
      ).rejects.toThrow(ForbiddenException);
    });

    it("should forbid field staff from starting someone else's task", async () => {
      mockTaskRepository.findOne.mockResolvedValueOnce({
        ...mockTask,
        assignedUserId: 'another-user',
      });
      await expect(
        service.startTask('task-uuid-123', staffUser),
      ).rejects.toThrow(ForbiddenException);
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

      await expect(
        service.completeTask('task-uuid-123', adminUser),
      ).rejects.toThrow(BadRequestException);
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

      await expect(
        service.completeTask('task-uuid-123', adminUser),
      ).rejects.toThrow(BadRequestException);
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

      mockFinanceService.moveToPayable.mockRejectedValueOnce(
        new Error('Wallet error'),
      );
      await expect(
        service.completeTask('task-uuid-123', adminUser),
      ).rejects.toThrow('Wallet error');
      expect(mockQueryRunner.rollbackTransaction).toHaveBeenCalled();
    });

    it('should throw NotFoundException for non-existent task', async () => {
      mockQueryRunner.manager.findOne.mockResolvedValueOnce(null);
      await expect(
        service.completeTask('invalid-id', adminUser),
      ).rejects.toThrow(NotFoundException);
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

      await expect(
        service.completeTask('task-uuid-123', staffUser),
      ).rejects.toThrow(ForbiddenException);
    });
  });
});
