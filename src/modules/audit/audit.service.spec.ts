import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { AuditService } from './audit.service';
import { AuditLog } from './entities/audit-log.entity';

describe('AuditService', () => {
  let service: AuditService;
  let repository: Repository<AuditLog>;

  const mockAuditLog = {
    id: 'log-123',
    action: 'CREATE',
    entityName: 'User',
    entityId: 'user-123',
    createdAt: new Date(),
  } as AuditLog;

  const mockRepository = {
    create: jest.fn().mockImplementation((dto) => dto),
    save: jest.fn().mockResolvedValue(mockAuditLog),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuditService,
        {
          provide: getRepositoryToken(AuditLog),
          useValue: mockRepository,
        },
      ],
    }).compile();

    service = module.get<AuditService>(AuditService);
    repository = module.get<Repository<AuditLog>>(getRepositoryToken(AuditLog));
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('log', () => {
    const logData = {
      action: 'CREATE',
      entityName: 'User',
      entityId: 'user-123',
      notes: 'Test log',
    };

    it('should log using the injected repository when no manager provided', async () => {
      const result = await service.log(logData);
      expect(repository.create).toHaveBeenCalledWith(logData);
      expect(repository.save).toHaveBeenCalled();
      expect(result).toEqual(mockAuditLog);
    });

    it('should log using the manager repository when manager provided', async () => {
      const mockManagerRepo = {
        create: jest.fn().mockImplementation((dto) => dto),
        save: jest.fn().mockResolvedValue(mockAuditLog),
      };
      const mockManager = {
        getRepository: jest.fn().mockReturnValue(mockManagerRepo),
      } as unknown as EntityManager;

      const result = await service.log(logData, mockManager);

      expect(mockManager.getRepository).toHaveBeenCalledWith(AuditLog);
      expect(mockManagerRepo.create).toHaveBeenCalledWith(logData);
      expect(mockManagerRepo.save).toHaveBeenCalled();
      expect(result).toEqual(mockAuditLog);
    });
  });
});
