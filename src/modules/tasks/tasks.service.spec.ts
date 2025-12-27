import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { TaskStatus } from '../../common/enums';
import { AuditService } from '../audit/audit.service';
import { FinanceService } from '../finance/services/finance.service';
import { MailService } from '../mail/mail.service';
import { Task } from './entities/task.entity';
import { TasksService } from './tasks.service';

describe('TasksService - Comprehensive Tests', () => {
    let service: TasksService;

    const mockTask = {
        id: 'task-uuid-123',
        bookingId: 'booking-uuid-123',
        taskTypeId: 'task-type-uuid-123',
        assignedUserId: 'user-uuid-123',
        status: TaskStatus.PENDING,
        commissionSnapshot: 100.0,
        dueDate: new Date('2024-12-31'),
        completedAt: null,
        notes: 'Test task',
        booking: { id: 'booking-uuid-123', clientName: 'John Doe' },
        taskType: { id: 'task-type-uuid-123', name: 'Photography' },
        assignedUser: { id: 'user-uuid-123', email: 'user@example.com' },
    };

    const mockTaskRepository = {
        find: jest.fn().mockResolvedValue([mockTask]),
        findOne: jest.fn(),
        save: jest.fn().mockImplementation((task) => Promise.resolve(task)),
    };

    const mockFinanceService = {
        moveToPayable: jest.fn().mockResolvedValue({}),
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
        manager: {
            save: jest.fn().mockImplementation((entity) => Promise.resolve(entity)),
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

        // Default behavior
        mockTaskRepository.findOne.mockImplementation(({ where }) => {
            if (where.id === 'task-uuid-123') {
                return Promise.resolve({ ...mockTask });
            }
            return Promise.resolve(null);
        });
    });

    // ============ FIND OPERATIONS TESTS ============
    describe('findAll', () => {
        it('should return all tasks with relations', async () => {
            const result = await service.findAll();
            expect(result).toEqual([mockTask]);
            expect(mockTaskRepository.find).toHaveBeenCalledWith({
                relations: ['booking', 'taskType', 'assignedUser'],
                order: { createdAt: 'DESC' },
            });
        });

        it('should return empty array when no tasks exist', async () => {
            mockTaskRepository.find.mockResolvedValueOnce([]);
            const result = await service.findAll();
            expect(result).toEqual([]);
        });

        it('should return multiple tasks', async () => {
            const tasks = [
                mockTask,
                { ...mockTask, id: 'task-2', status: TaskStatus.IN_PROGRESS },
            ];
            mockTaskRepository.find.mockResolvedValueOnce(tasks);
            const result = await service.findAll();
            expect(result.length).toBe(2);
        });
    });

    describe('findOne', () => {
        it('should return task by valid id', async () => {
            const result = await service.findOne('task-uuid-123');
            expect(result.commissionSnapshot).toBe(100.0);
        });

        it('should throw NotFoundException for invalid id', async () => {
            await expect(service.findOne('invalid-id')).rejects.toThrow(NotFoundException);
        });
    });

    describe('findByBooking', () => {
        it('should return tasks for a booking', async () => {
            mockTaskRepository.find.mockResolvedValueOnce([mockTask]);
            const result = await service.findByBooking('booking-uuid-123');
            expect(result.length).toBe(1);
        });

        it('should return empty array for booking with no tasks', async () => {
            mockTaskRepository.find.mockResolvedValueOnce([]);
            const result = await service.findByBooking('booking-no-tasks');
            expect(result).toEqual([]);
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
            const result = await service.update('task-uuid-123', { notes: 'Updated notes' });
            expect(mockTaskRepository.save).toHaveBeenCalled();
        });

        it('should update task due date', async () => {
            const result = await service.update('task-uuid-123', {
                dueDate: '2025-01-15T10:00:00Z'
            });
            expect(mockTaskRepository.save).toHaveBeenCalled();
        });

        it('should throw NotFoundException for non-existent task', async () => {
            await expect(
                service.update('invalid-id', { notes: 'Test' })
            ).rejects.toThrow(NotFoundException);
        });
    });

    // ============ ASSIGN TASK TESTS ============
    describe('assignTask', () => {
        it('should assign task to user', async () => {
            const result = await service.assignTask('task-uuid-123', { userId: 'new-user-id' });
            expect(result.assignedUserId).toBe('new-user-id');
        });

        it('should reassign task to different user', async () => {
            mockTaskRepository.findOne.mockResolvedValueOnce({
                ...mockTask,
                assignedUserId: 'original-user',
            });
            const result = await service.assignTask('task-uuid-123', { userId: 'new-user-id' });
            expect(result.assignedUserId).toBe('new-user-id');
        });

        it('should throw NotFoundException for non-existent task', async () => {
            await expect(
                service.assignTask('invalid-id', { userId: 'user-id' })
            ).rejects.toThrow(NotFoundException);
        });
    });

    // ============ START TASK TESTS ============
    describe('startTask', () => {
        it('should start pending task', async () => {
            const result = await service.startTask('task-uuid-123');
            expect(result.status).toBe(TaskStatus.IN_PROGRESS);
        });

        it('should reject starting in-progress task', async () => {
            mockTaskRepository.findOne.mockResolvedValueOnce({
                ...mockTask,
                status: TaskStatus.IN_PROGRESS,
            });
            await expect(service.startTask('task-uuid-123')).rejects.toThrow(BadRequestException);
        });

        it('should reject starting completed task', async () => {
            mockTaskRepository.findOne.mockResolvedValueOnce({
                ...mockTask,
                status: TaskStatus.COMPLETED,
            });
            await expect(service.startTask('task-uuid-123')).rejects.toThrow(BadRequestException);
        });

        it('should throw NotFoundException for non-existent task', async () => {
            await expect(service.startTask('invalid-id')).rejects.toThrow(NotFoundException);
        });
    });

    // ============ COMPLETE TASK TESTS ============
    describe('completeTask', () => {
        it('should complete in-progress task and accrue commission', async () => {
            mockTaskRepository.findOne.mockResolvedValueOnce({
                ...mockTask,
                status: TaskStatus.IN_PROGRESS,
            });
            const result = await service.completeTask('task-uuid-123');
            expect(result.commissionAccrued).toBe(100.0);
            expect(result.walletUpdated).toBe(true);
            expect(mockQueryRunner.commitTransaction).toHaveBeenCalled();
        });

        it('should complete pending task and accrue commission', async () => {
            const result = await service.completeTask('task-uuid-123');
            expect(result.commissionAccrued).toBe(100.0);
        });

        it('should reject completing already completed task', async () => {
            mockTaskRepository.findOne.mockResolvedValueOnce({
                ...mockTask,
                status: TaskStatus.COMPLETED,
            });
            await expect(service.completeTask('task-uuid-123')).rejects.toThrow(BadRequestException);
        });

        it('should reject completing unassigned task', async () => {
            mockTaskRepository.findOne.mockResolvedValueOnce({
                ...mockTask,
                assignedUserId: null,
            });
            await expect(service.completeTask('task-uuid-123')).rejects.toThrow(BadRequestException);
        });

        it('should handle zero commission task', async () => {
            mockTaskRepository.findOne.mockResolvedValueOnce({
                ...mockTask,
                commissionSnapshot: 0,
            });
            const result = await service.completeTask('task-uuid-123');
            expect(result.commissionAccrued).toBe(0);
            expect(result.walletUpdated).toBe(false);
        });

        it('should set completedAt timestamp', async () => {
            mockTaskRepository.findOne.mockResolvedValueOnce({
                ...mockTask,
                status: TaskStatus.IN_PROGRESS,
            });
            await service.completeTask('task-uuid-123');
            const savedTask = mockQueryRunner.manager.save.mock.calls[0][0];
            expect(savedTask.completedAt).toBeInstanceOf(Date);
        });

        it('should rollback on wallet update failure', async () => {
            mockTaskRepository.findOne.mockResolvedValueOnce({
                ...mockTask,
                status: TaskStatus.IN_PROGRESS,
            });
            mockFinanceService.moveToPayable.mockRejectedValueOnce(new Error('Wallet error'));
            await expect(service.completeTask('task-uuid-123')).rejects.toThrow('Wallet error');
            expect(mockQueryRunner.rollbackTransaction).toHaveBeenCalled();
        });

        it('should throw NotFoundException for non-existent task', async () => {
            await expect(service.completeTask('invalid-id')).rejects.toThrow(NotFoundException);
        });

        it('should handle high commission amount', async () => {
            mockTaskRepository.findOne.mockResolvedValueOnce({
                ...mockTask,
                commissionSnapshot: 9999.99,
            });
            const result = await service.completeTask('task-uuid-123');
            expect(result.commissionAccrued).toBe(9999.99);
        });
    });
});
