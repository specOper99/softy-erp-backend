import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TenantContextService } from '../../../common/services/tenant-context.service';
import { Attendance } from '../entities/attendance.entity';
import { AttendanceService } from './attendance.service';

describe('AttendanceService', () => {
  let service: AttendanceService;
  let attendanceRepo: jest.Mocked<Repository<Attendance>>;

  const mockTenantId = 'tenant-123';
  const mockAttendance = {
    id: 'att-1',
    userId: 'user-1',
    tenantId: mockTenantId,
    date: new Date('2024-01-15'),
    checkIn: new Date('2024-01-15T09:00:00'),
    checkOut: new Date('2024-01-15T17:00:00'),
    status: 'PRESENT',
    workedHours: 8,
    calculateWorkedHours: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AttendanceService,
        {
          provide: getRepositoryToken(Attendance),
          useValue: {
            create: jest.fn(),
            save: jest.fn(),
            find: jest.fn(),
            findOne: jest.fn(),
            remove: jest.fn(),
            delete: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<AttendanceService>(AttendanceService);
    attendanceRepo = module.get(getRepositoryToken(Attendance));

    // Mock tenant context
    jest
      .spyOn(TenantContextService, 'getTenantId')
      .mockReturnValue(mockTenantId);
    jest
      .spyOn(TenantContextService, 'getTenantIdOrThrow')
      .mockReturnValue(mockTenantId);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('should create attendance record', async () => {
      const dto = {
        userId: 'user-1',
        date: '2024-01-15',
        checkIn: '2024-01-15T09:00:00',
      };
      attendanceRepo.create.mockReturnValue(mockAttendance as any);
      attendanceRepo.save.mockResolvedValue(mockAttendance as any);

      const result = await service.create(dto as any);

      expect(attendanceRepo.create).toHaveBeenCalledWith({
        ...dto,
        tenantId: mockTenantId,
        checkIn: expect.any(Date),
        checkOut: null,
        date: expect.any(Date),
      });
      expect(result).toEqual(mockAttendance);
    });

    it('should throw BadRequestException when no tenant context', async () => {
      jest
        .spyOn(TenantContextService, 'getTenantIdOrThrow')
        .mockImplementation(() => {
          throw new BadRequestException('Tenant context missing');
        });

      await expect(
        service.create({ userId: 'user-1', date: '2024-01-15' } as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException for invalid date format', async () => {
      await expect(
        service.create({ userId: 'user-1', date: 'invalid-date' } as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when checkOut is before checkIn', async () => {
      const dto = {
        userId: 'user-1',
        date: '2024-01-15',
        checkIn: '2024-01-15T17:00:00',
        checkOut: '2024-01-15T09:00:00', // Before checkIn
      };

      await expect(service.create(dto as any)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw ConflictException on duplicate attendance', async () => {
      const dto = {
        userId: 'user-1',
        date: '2024-01-15',
      };
      attendanceRepo.create.mockReturnValue(mockAttendance as any);
      attendanceRepo.save.mockRejectedValue({ code: '23505' });

      await expect(service.create(dto as any)).rejects.toThrow(
        ConflictException,
      );
    });
  });

  describe('findAll', () => {
    it('should return all attendance records', async () => {
      attendanceRepo.find.mockResolvedValue([mockAttendance] as any);

      const result = await service.findAll();

      expect(attendanceRepo.find).toHaveBeenCalledWith({
        where: { tenantId: mockTenantId },
        order: { date: 'DESC' },
      });
      expect(result).toHaveLength(1);
    });

    it('should filter by userId', async () => {
      attendanceRepo.find.mockResolvedValue([mockAttendance] as any);

      const result = await service.findAll('user-1');

      expect(attendanceRepo.find).toHaveBeenCalledWith({
        where: { tenantId: mockTenantId, userId: 'user-1' },
        order: { date: 'DESC' },
      });
      expect(result).toHaveLength(1);
    });

    it('should throw BadRequestException when no tenant context', async () => {
      jest
        .spyOn(TenantContextService, 'getTenantIdOrThrow')
        .mockImplementation(() => {
          throw new BadRequestException('Tenant context missing');
        });

      await expect(service.findAll()).rejects.toThrow(BadRequestException);
    });
  });

  describe('findOne', () => {
    it('should return attendance by id', async () => {
      attendanceRepo.findOne.mockResolvedValue(mockAttendance as any);

      const result = await service.findOne('att-1');

      expect(attendanceRepo.findOne).toHaveBeenCalledWith({
        where: { id: 'att-1', tenantId: mockTenantId },
      });
      expect(result).toEqual(mockAttendance);
    });

    it('should throw NotFoundException when not found', async () => {
      attendanceRepo.findOne.mockResolvedValue(null);

      await expect(service.findOne('not-found')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('update', () => {
    it('should update attendance record', async () => {
      const dto = { checkOut: '2024-01-15T18:00:00' };
      attendanceRepo.findOne.mockResolvedValue({ ...mockAttendance } as any);
      attendanceRepo.save.mockResolvedValue({
        ...mockAttendance,
        checkOut: new Date(dto.checkOut),
      } as any);

      const result = await service.update('att-1', dto as any);

      expect(result.checkOut).toEqual(new Date(dto.checkOut));
    });
  });

  describe('remove', () => {
    it('should delete attendance record', async () => {
      attendanceRepo.delete.mockResolvedValue({ affected: 1, raw: [] } as any);

      await service.remove('att-1');

      expect(attendanceRepo.delete).toHaveBeenCalledWith({
        id: 'att-1',
        tenantId: mockTenantId,
      });
    });

    it('should throw NotFoundException when record not found', async () => {
      attendanceRepo.delete.mockResolvedValue({ affected: 0, raw: [] } as any);

      await expect(service.remove('not-found')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
