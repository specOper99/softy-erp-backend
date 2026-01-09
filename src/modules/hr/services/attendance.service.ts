import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TenantContextService } from '../../../common/services/tenant-context.service';
import {
  CreateAttendanceDto,
  UpdateAttendanceDto,
} from '../dto/attendance.dto';
import { Attendance } from '../entities/attendance.entity';

@Injectable()
export class AttendanceService {
  constructor(
    @InjectRepository(Attendance)
    private readonly attendanceRepository: Repository<Attendance>,
  ) {}

  async create(dto: CreateAttendanceDto): Promise<Attendance> {
    const tenantId = TenantContextService.getTenantId();
    if (!tenantId) {
      throw new BadRequestException('Tenant context missing');
    }
    const attendance = this.attendanceRepository.create({
      ...dto,
      tenantId,
      checkIn: dto.checkIn ? new Date(dto.checkIn) : null,
      checkOut: dto.checkOut ? new Date(dto.checkOut) : null,
      date: new Date(dto.date),
    });
    return this.attendanceRepository.save(attendance);
  }

  async findAll(userId?: string): Promise<Attendance[]> {
    const tenantId = TenantContextService.getTenantId();
    if (!tenantId) {
      throw new BadRequestException('Tenant context missing');
    }
    const where: { tenantId: string; userId?: string } = { tenantId };
    if (userId) where.userId = userId;

    return this.attendanceRepository.find({
      where,
      order: { date: 'DESC' },
    });
  }

  async findOne(id: string): Promise<Attendance> {
    const tenantId = TenantContextService.getTenantId();
    if (!tenantId) {
      throw new BadRequestException('Tenant context missing');
    }
    const attendance = await this.attendanceRepository.findOne({
      where: { id, tenantId },
    });
    if (!attendance) {
      throw new NotFoundException(`Attendance record ${id} not found`);
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
    const attendance = await this.findOne(id);
    await this.attendanceRepository.remove(attendance);
  }
}
