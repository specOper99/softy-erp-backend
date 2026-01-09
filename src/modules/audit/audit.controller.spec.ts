import { Reflector } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';
import { AuditController } from './audit.controller';
import { AuditService } from './audit.service';

describe('AuditController', () => {
  let controller: AuditController;
  let auditService: jest.Mocked<AuditService>;

  const mockAuditLog = {
    id: 'log-123',
    action: 'CREATE',
    entityName: 'User',
    entityId: 'user-123',
    timestamp: new Date(),
    oldValues: null,
    newValues: { email: 'test@example.com' },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuditController],
      providers: [
        {
          provide: AuditService,
          useValue: {
            findAllCursor: jest.fn(),
            findOne: jest.fn(),
          },
        },
        Reflector,
      ],
    }).compile();

    controller = module.get<AuditController>(AuditController);
    auditService = module.get(AuditService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('findAllCursor', () => {
    it('should return paginated audit logs', async () => {
      const mockResult = {
        data: [mockAuditLog],
        nextCursor: 'next-cursor-123',
        hasMore: true,
      };
      auditService.findAllCursor.mockResolvedValue(mockResult as any);

      const query = { cursor: 'cursor-123', limit: 20 };
      const result = await controller.findAllCursor(query as any);

      expect(auditService.findAllCursor).toHaveBeenCalledWith(query);
      expect(result.data).toHaveLength(1);
      expect(result.hasMore).toBe(true);
    });

    it('should support filtering', async () => {
      const mockResult = { data: [mockAuditLog], hasMore: false };
      auditService.findAllCursor.mockResolvedValue(mockResult as any);

      const query = {
        entityName: 'User',
        action: 'CREATE',
        userId: 'user-123',
        startDate: '2024-01-01',
        endDate: '2024-12-31',
      };
      const result = await controller.findAllCursor(query as any);

      expect(auditService.findAllCursor).toHaveBeenCalledWith(query);
      expect(result.data).toHaveLength(1);
    });
  });

  describe('findOne', () => {
    it('should return audit log by id', async () => {
      auditService.findOne.mockResolvedValue(mockAuditLog as any);

      const result = await controller.findOne('log-123');

      expect(auditService.findOne).toHaveBeenCalledWith('log-123');
      expect(result).toEqual(mockAuditLog);
    });
  });
});
