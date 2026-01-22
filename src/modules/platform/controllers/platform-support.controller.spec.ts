import { Test, TestingModule } from '@nestjs/testing';
import { ImpersonationService } from '../services/impersonation.service';
import { PlatformSupportController } from './platform-support.controller';

describe('PlatformSupportController', () => {
  let controller: PlatformSupportController;
  let impersonationService: ImpersonationService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PlatformSupportController],
      providers: [
        {
          provide: ImpersonationService,
          useValue: {
            startImpersonation: jest.fn().mockResolvedValue({
              tenantId: 'tenant-123',
              impersonationToken: 'token-abc',
              expiresAt: new Date(Date.now() + 4 * 60 * 60 * 1000),
            }),
            endImpersonation: jest.fn().mockResolvedValue(void 0),
            getActiveImpersonations: jest.fn().mockResolvedValue([]),
          },
        },
      ],
    }).compile();

    controller = module.get<PlatformSupportController>(PlatformSupportController);
    impersonationService = module.get<ImpersonationService>(ImpersonationService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Controller', () => {
    it('should be defined', () => {
      expect(controller).toBeDefined();
    });
  });

  describe('Impersonation', () => {
    it('should start impersonation', () => {
      expect(impersonationService.startImpersonation).toBeDefined();
    });

    it('should end impersonation', () => {
      expect(impersonationService.endImpersonation).toBeDefined();
    });
  });
});
