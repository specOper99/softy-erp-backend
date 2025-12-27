import { Test, TestingModule } from '@nestjs/testing';
import { TaskStatus } from '../../common/enums';
import { User } from '../users/entities/user.entity';
import { TasksController } from './tasks.controller';
import { TasksService } from './tasks.service';

describe('TasksController', () => {
    let controller: TasksController;
    let service: TasksService;

    const mockTask = { id: 'uuid', status: TaskStatus.PENDING };
    const mockUser = { id: 'u-uuid' } as User;

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            controllers: [TasksController],
            providers: [
                {
                    provide: TasksService,
                    useValue: {
                        findAll: jest.fn().mockResolvedValue([mockTask]),
                        findOne: jest.fn().mockResolvedValue(mockTask),
                        findByUser: jest.fn().mockResolvedValue([mockTask]),
                        findByBooking: jest.fn().mockResolvedValue([mockTask]),
                        update: jest.fn().mockResolvedValue(mockTask),
                        assignTask: jest.fn().mockResolvedValue(mockTask),
                        startTask: jest.fn().mockResolvedValue(mockTask),
                        completeTask: jest.fn().mockResolvedValue(mockTask),
                    },
                },
            ],
        }).compile();

        controller = module.get<TasksController>(TasksController);
        service = module.get<TasksService>(TasksService);
    });

    it('should be defined', () => {
        expect(controller).toBeDefined();
    });

    describe('findAll', () => {
        it('should call service.findAll', async () => {
            await controller.findAll();
            expect(service.findAll).toHaveBeenCalled();
        });
    });

    describe('findMyTasks', () => {
        it('should call service.findByUser', async () => {
            await controller.findMyTasks(mockUser);
            expect(service.findByUser).toHaveBeenCalledWith(mockUser.id);
        });
    });

    describe('findByBooking', () => {
        it('should call service.findByBooking', async () => {
            await controller.findByBooking('b-uuid');
            expect(service.findByBooking).toHaveBeenCalledWith('b-uuid');
        });
    });

    describe('findOne', () => {
        it('should call service.findOne', async () => {
            await controller.findOne('uuid');
            expect(service.findOne).toHaveBeenCalledWith('uuid');
        });
    });

    describe('update', () => {
        it('should call service.update', async () => {
            const dto = { title: 'updated' } as any;
            await controller.update('uuid', dto);
            expect(service.update).toHaveBeenCalledWith('uuid', dto);
        });
    });

    describe('assign', () => {
        it('should call service.assignTask', async () => {
            const dto = { staffId: 's-id' } as any;
            await controller.assign('uuid', dto);
            expect(service.assignTask).toHaveBeenCalledWith('uuid', dto);
        });
    });

    describe('start', () => {
        it('should call service.startTask', async () => {
            await controller.start('uuid');
            expect(service.startTask).toHaveBeenCalledWith('uuid');
        });
    });

    describe('complete', () => {
        it('should call service.completeTask', async () => {
            await controller.complete('uuid');
            expect(service.completeTask).toHaveBeenCalledWith('uuid');
        });
    });
});
