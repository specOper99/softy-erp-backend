import { Reflector } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';
import { PaginationDto } from '../../../common/dto/pagination.dto';
import { User } from '../../users/entities/user.entity';
import { Role } from '../../users/enums/role.enum';
import { CreateAttendanceDto, UpdateAttendanceDto } from '../dto/attendance.dto';
import { Attendance } from '../entities/attendance.entity';
import { AttendanceService } from '../services/attendance.service';
import { AttendanceController } from './attendance.controller';

describe('AttendanceController', () => {
  let controller: AttendanceController;
  let service: jest.Mocked<AttendanceService>;

  const mockAttendance = {
    id: '11111111-1111-4111-8111-111111111111',
    userId: '22222222-2222-4222-8222-222222222222',
    date: new Date('2024-01-15'),
    checkIn: new Date('2024-01-15T09:00:00'),
    checkOut: new Date('2024-01-15T17:00:00'),
    status: 'PRESENT',
    workedHours: 8,
  };

  const mockAdminUser = {
    id: '33333333-3333-4333-8333-333333333333',
    role: Role.ADMIN,
    tenantId: '44444444-4444-4444-8444-444444444444',
  };

  const mockFieldStaffUser = {
    id: '22222222-2222-4222-8222-222222222222',
    role: Role.FIELD_STAFF,
    tenantId: '44444444-4444-4444-8444-444444444444',
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
      const dto: CreateAttendanceDto = {
        userId: '22222222-2222-4222-8222-222222222222',
        date: '2024-01-15',
        checkIn: '2024-01-15T09:00:00',
      };
      service.create.mockResolvedValue(mockAttendance as unknown as Attendance);

      const result = await controller.create(dto, mockAdminUser as User);

      expect(service.create).toHaveBeenCalledWith(dto);
      expect(result).toEqual(mockAttendance);
    });

    it('should allow field staff to create their own attendance', async () => {
      const dto: CreateAttendanceDto = {
        userId: '22222222-2222-4222-8222-222222222222',
        date: '2024-01-15',
        checkIn: '2024-01-15T09:00:00',
      };
      service.create.mockResolvedValue(mockAttendance as unknown as Attendance);

      const result = await controller.create(dto, mockFieldStaffUser as User);

      expect(service.create).toHaveBeenCalledWith(dto);
      expect(result).toEqual(mockAttendance);
    });

    it('should reject field staff creating attendance for others', () => {
      const dto: CreateAttendanceDto = {
        userId: 'other-user',
        date: '2024-01-15',
        checkIn: '2024-01-15T09:00:00',
      };

      expect(() => controller.create(dto, mockFieldStaffUser as User)).toThrow(
        'Field staff can only create attendance records for themselves',
      );
    });
  });

  describe('findAll', () => {
    class ListAttendanceQueryDto extends PaginationDto {
      userId?: string;
    }

    it('should return all attendance records for admin', async () => {
      service.findAll.mockResolvedValue([mockAttendance] as unknown as Attendance[]);

      const query = new PaginationDto();

      const result = await controller.findAll(query, mockAdminUser as User);

      expect(service.findAll).toHaveBeenCalledWith(query, undefined);
      expect(result).toHaveLength(1);
    });

    it('should filter by userId for admin', async () => {
      service.findAll.mockResolvedValue([mockAttendance] as unknown as Attendance[]);

      const query = new ListAttendanceQueryDto();
      query.limit = 10;
      query.userId = '22222222-2222-4222-8222-222222222222';

      const result = await controller.findAll(query, mockAdminUser as User);

      expect(service.findAll).toHaveBeenCalledWith(
        expect.objectContaining({ limit: 10 }),
        '22222222-2222-4222-8222-222222222222',
      );
      expect(result).toHaveLength(1);
    });

    it('should only return own records for field staff', async () => {
      service.findAll.mockResolvedValue([mockAttendance] as unknown as Attendance[]);

      const query = new PaginationDto();

      const result = await controller.findAll(query, mockFieldStaffUser as User);

      expect(service.findAll).toHaveBeenCalledWith(query, '22222222-2222-4222-8222-222222222222');
      expect(result).toHaveLength(1);
    });
  });

  describe('findOne', () => {
    it('should return attendance by id for admin', async () => {
      service.findOne.mockResolvedValue(mockAttendance as unknown as Attendance);

      const result = await controller.findOne('11111111-1111-4111-8111-111111111111', mockAdminUser as User);

      expect(service.findOne).toHaveBeenCalledWith('11111111-1111-4111-8111-111111111111');
      expect(result).toEqual(mockAttendance);
    });

    it('should allow field staff to view own attendance', async () => {
      service.findOne.mockResolvedValue(mockAttendance as unknown as Attendance);

      const result = await controller.findOne('11111111-1111-4111-8111-111111111111', mockFieldStaffUser as User);

      expect(service.findOne).toHaveBeenCalledWith('11111111-1111-4111-8111-111111111111');
      expect(result).toEqual(mockAttendance);
    });

    it('should reject field staff viewing others attendance', async () => {
      const otherAttendance = { ...mockAttendance, userId: 'other-user' };
      service.findOne.mockResolvedValue(otherAttendance as unknown as Attendance);

      await expect(
        controller.findOne('11111111-1111-4111-8111-111111111111', mockFieldStaffUser as User),
      ).rejects.toThrow('Field staff can only view their own attendance records');
    });
  });

  describe('update', () => {
    it('should update attendance record', async () => {
      const dto: UpdateAttendanceDto = { checkOut: new Date('2024-01-15T18:00:00').toISOString() };
      const updated = { ...mockAttendance, checkOut: new Date(dto.checkOut!) };
      service.update.mockResolvedValue(updated as unknown as Attendance);

      const result = await controller.update('11111111-1111-4111-8111-111111111111', dto);

      expect(service.update).toHaveBeenCalledWith('11111111-1111-4111-8111-111111111111', dto);
      expect(result).toEqual(updated);
    });
  });

  describe('remove', () => {
    it('should delete attendance record', async () => {
      service.remove.mockResolvedValue(undefined);

      await controller.remove('11111111-1111-4111-8111-111111111111');

      expect(service.remove).toHaveBeenCalledWith('11111111-1111-4111-8111-111111111111');
    });
  });
});
