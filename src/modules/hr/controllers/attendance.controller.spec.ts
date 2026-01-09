import { Reflector } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';
import { Role } from '../../users/enums/role.enum';
import { AttendanceService } from '../services/attendance.service';
import { AttendanceController } from './attendance.controller';

describe('AttendanceController', () => {
  let controller: AttendanceController;
  let service: jest.Mocked<AttendanceService>;

  const mockAttendance = {
    id: 'att-1',
    userId: 'user-1',
    date: new Date('2024-01-15'),
    checkIn: new Date('2024-01-15T09:00:00'),
    checkOut: new Date('2024-01-15T17:00:00'),
    status: 'PRESENT',
    workedHours: 8,
  };

  const mockAdminUser = {
    id: 'admin-1',
    role: Role.ADMIN,
    tenantId: 'tenant-1',
  };

  const mockFieldStaffUser = {
    id: 'user-1',
    role: Role.FIELD_STAFF,
    tenantId: 'tenant-1',
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AttendanceController],
      providers: [
        {
          provide: AttendanceService,
          useValue: {
            create: jest.fn(),
            findAll: jest.fn(),
            findOne: jest.fn(),
            update: jest.fn(),
            remove: jest.fn(),
          },
        },
        Reflector,
      ],
    }).compile();

    controller = module.get<AttendanceController>(AttendanceController);
    service = module.get(AttendanceService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('create', () => {
    it('should create attendance record for admin', async () => {
      const dto = {
        userId: 'user-1',
        date: '2024-01-15',
        checkIn: '2024-01-15T09:00:00',
      };
      service.create.mockResolvedValue(mockAttendance as any);

      const result = await controller.create(dto as any, mockAdminUser as any);

      expect(service.create).toHaveBeenCalledWith(dto);
      expect(result).toEqual(mockAttendance);
    });

    it('should allow field staff to create their own attendance', async () => {
      const dto = {
        userId: 'user-1',
        date: '2024-01-15',
        checkIn: '2024-01-15T09:00:00',
      };
      service.create.mockResolvedValue(mockAttendance as any);

      const result = await controller.create(
        dto as any,
        mockFieldStaffUser as any,
      );

      expect(service.create).toHaveBeenCalledWith(dto);
      expect(result).toEqual(mockAttendance);
    });

    it('should reject field staff creating attendance for others', () => {
      const dto = {
        userId: 'other-user',
        date: '2024-01-15',
        checkIn: '2024-01-15T09:00:00',
      };

      expect(() =>
        controller.create(dto as any, mockFieldStaffUser as any),
      ).toThrow(
        'Field staff can only create attendance records for themselves',
      );
    });
  });

  describe('findAll', () => {
    it('should return all attendance records for admin', async () => {
      service.findAll.mockResolvedValue([mockAttendance] as any);

      const result = await controller.findAll(undefined, mockAdminUser as any);

      expect(service.findAll).toHaveBeenCalledWith(undefined);
      expect(result).toHaveLength(1);
    });

    it('should filter by userId for admin', async () => {
      service.findAll.mockResolvedValue([mockAttendance] as any);

      const result = await controller.findAll('user-1', mockAdminUser as any);

      expect(service.findAll).toHaveBeenCalledWith('user-1');
      expect(result).toHaveLength(1);
    });

    it('should only return own records for field staff', async () => {
      service.findAll.mockResolvedValue([mockAttendance] as any);

      const result = await controller.findAll(
        undefined,
        mockFieldStaffUser as any,
      );

      expect(service.findAll).toHaveBeenCalledWith('user-1');
      expect(result).toHaveLength(1);
    });
  });

  describe('findOne', () => {
    it('should return attendance by id for admin', async () => {
      service.findOne.mockResolvedValue(mockAttendance as any);

      const result = await controller.findOne('att-1', mockAdminUser as any);

      expect(service.findOne).toHaveBeenCalledWith('att-1');
      expect(result).toEqual(mockAttendance);
    });

    it('should allow field staff to view own attendance', async () => {
      service.findOne.mockResolvedValue(mockAttendance as any);

      const result = await controller.findOne(
        'att-1',
        mockFieldStaffUser as any,
      );

      expect(service.findOne).toHaveBeenCalledWith('att-1');
      expect(result).toEqual(mockAttendance);
    });

    it('should reject field staff viewing others attendance', async () => {
      const otherAttendance = { ...mockAttendance, userId: 'other-user' };
      service.findOne.mockResolvedValue(otherAttendance as any);

      await expect(
        controller.findOne('att-1', mockFieldStaffUser as any),
      ).rejects.toThrow(
        'Field staff can only view their own attendance records',
      );
    });
  });

  describe('update', () => {
    it('should update attendance record', async () => {
      const dto = { checkOut: '2024-01-15T18:00:00' };
      const updated = { ...mockAttendance, checkOut: new Date(dto.checkOut) };
      service.update.mockResolvedValue(updated as any);

      const result = await controller.update('att-1', dto as any);

      expect(service.update).toHaveBeenCalledWith('att-1', dto);
      expect(result).toEqual(updated);
    });
  });

  describe('remove', () => {
    it('should delete attendance record', async () => {
      service.remove.mockResolvedValue(undefined);

      await controller.remove('att-1');

      expect(service.remove).toHaveBeenCalledWith('att-1');
    });
  });
});
