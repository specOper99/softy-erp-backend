import { Test, TestingModule } from '@nestjs/testing';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';

describe('DashboardController', () => {
    let controller: DashboardController;
    let service: DashboardService;

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            controllers: [DashboardController],
            providers: [
                {
                    provide: DashboardService,
                    useValue: {
                        getRevenueSummary: jest.fn().mockResolvedValue([]),
                        getStaffPerformance: jest.fn().mockResolvedValue([]),
                        getPackageStats: jest.fn().mockResolvedValue([]),
                    },
                },
            ],
        }).compile();

        controller = module.get<DashboardController>(DashboardController);
        service = module.get<DashboardService>(DashboardService);
    });

    it('should be defined', () => {
        expect(controller).toBeDefined();
    });

    describe('getSummary', () => {
        it('should call service.getRevenueSummary', async () => {
            await controller.getSummary();
            expect(service.getRevenueSummary).toHaveBeenCalled();
        });
    });

    describe('getStaffPerformance', () => {
        it('should call service.getStaffPerformance', async () => {
            await controller.getStaffPerformance();
            expect(service.getStaffPerformance).toHaveBeenCalled();
        });
    });

    describe('getPackageStats', () => {
        it('should call service.getPackageStats', async () => {
            await controller.getPackageStats();
            expect(service.getPackageStats).toHaveBeenCalled();
        });
    });
});
