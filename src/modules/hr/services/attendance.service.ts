import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TenantAwareRepository } from '../../../common/repositories/tenant-aware.repository';
import {
  CreateAttendanceDto,
  UpdateAttendanceDto,
} from '../dto/attendance.dto';
import { Attendance } from '../entities/attendance.entity';

@Injectable()
export class AttendanceService {
  private readonly attendanceRepository: TenantAwareRepository<Attendance>;

  constructor(
    @InjectRepository(Attendance)
    baseRepository: Repository<Attendance>,
  ) {
    this.attendanceRepository = new TenantAwareRepository(baseRepository);
  }

  async create(dto: CreateAttendanceDto): Promise<Attendance> {
    // Tenant context is handled by TenantAwareRepository

    // Validate date parsing
    const dateObj = new Date(dto.date);
    if (isNaN(dateObj.getTime())) {
      throw new BadRequestException('attendance.invalid_date_format');
    }

    const checkIn = dto.checkIn ? new Date(dto.checkIn) : null;
    const checkOut = dto.checkOut ? new Date(dto.checkOut) : null;

    // Validate checkIn/checkOut times
    if (checkIn && isNaN(checkIn.getTime())) {
      throw new BadRequestException('attendance.invalid_checkin_format');
    }
    if (checkOut && isNaN(checkOut.getTime())) {
      throw new BadRequestException('attendance.invalid_checkout_format');
    }

    // Validate checkOut >= checkIn
    if (checkIn && checkOut && checkOut < checkIn) {
      throw new BadRequestException(
        'attendance.checkout_must_be_after_checkin',
      );
    }

    const attendance = this.attendanceRepository.create({
      ...dto,
      checkIn,
      checkOut,
      date: dateObj,
    });

    try {
      return await this.attendanceRepository.save(attendance);
    } catch (err) {
      if ((err as { code?: string })?.code === '23505') {
        throw new ConflictException(
          'Attendance record for this user and date already exists',
        );
      }
      throw err;
    }
  }

  async findAll(userId?: string): Promise<Attendance[]> {
    const where: { userId?: string } = {};
    if (userId) where.userId = userId;

    return this.attendanceRepository.find({
      where,
      order: { date: 'DESC' },
    });
  }

  async findOne(id: string): Promise<Attendance> {
    const attendance = await this.attendanceRepository.findOne({
      where: { id },
    });
    if (!attendance) {
      throw new NotFoundException('attendance.record_not_found');
    }
    return attendance;
  }

  async update(id: string, dto: UpdateAttendanceDto): Promise<Attendance> {
    const attendance = await this.findOne(id);

    if (dto.checkIn) attendance.checkIn = new Date(dto.checkIn);
    if (dto.checkOut) attendance.checkOut = new Date(dto.checkOut);
    if (dto.status) attendance.status = dto.status;
    if (dto.leaveType) attendance.leaveType = dto.leaveType;
    if (dto.notes !== undefined) attendance.notes = dto.notes ?? null;
    if (dto.approvedBy) attendance.approvedBy = dto.approvedBy;
    if (dto.approvedAt) attendance.approvedAt = new Date(dto.approvedAt);

    if (dto.checkIn || dto.checkOut) {
      attendance.calculateWorkedHours();
    }

    return this.attendanceRepository.save(attendance);
  }

  async remove(id: string): Promise<void> {
    const result = await this.attendanceRepository.delete({ id });
    if (result.affected === 0) {
      throw new NotFoundException('attendance.record_not_found');
    }
  }
}
