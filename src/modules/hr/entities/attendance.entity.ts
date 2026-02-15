import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseTenantEntity } from '../../../common/entities/abstract.entity';
import { User } from '../../users/entities/user.entity';

export enum AttendanceStatus {
  PRESENT = 'PRESENT',
  ABSENT = 'ABSENT',
  LEAVE = 'LEAVE',
  HALF_DAY = 'HALF_DAY',
  REMOTE = 'REMOTE',
  SICK = 'SICK',
}

export enum LeaveType {
  ANNUAL = 'ANNUAL',
  SICK = 'SICK',
  PERSONAL = 'PERSONAL',
  UNPAID = 'UNPAID',
  MATERNITY = 'MATERNITY',
  PATERNITY = 'PATERNITY',
}

@Entity('attendance')
@Index(['tenantId', 'id'], { unique: true })
@Index(['tenantId', 'userId', 'date'], { unique: true })
@Index(['tenantId', 'date'])
export class Attendance extends BaseTenantEntity {
  @Column({ name: 'user_id' })
  userId: string;

  @Column({ type: 'date' })
  date: Date;

  @Column({ name: 'check_in', type: 'timestamptz', nullable: true })
  checkIn: Date | null;

  @Column({ name: 'check_out', type: 'timestamptz', nullable: true })
  checkOut: Date | null;

  @Column({
    type: 'enum',
    enum: AttendanceStatus,
    default: AttendanceStatus.PRESENT,
  })
  status: AttendanceStatus;

  @Column({
    type: 'enum',
    enum: LeaveType,
    name: 'leave_type',
    nullable: true,
  })
  leaveType: LeaveType | null;

  @Column({
    name: 'worked_hours',
    type: 'decimal',
    precision: 5,
    scale: 2,
    nullable: true,
    transformer: {
      to: (value: number | null) => value,
      from: (value: string | null) => (value == null ? null : Number(value)),
    },
  })
  workedHours: number | null;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @Column({ name: 'approved_by', nullable: true })
  approvedBy: string | null;

  @Column({ name: 'approved_at', type: 'timestamptz', nullable: true })
  approvedAt: Date | null;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'approved_by' })
  approver: User | null;

  calculateWorkedHours(): void {
    if (this.checkIn && this.checkOut) {
      this.workedHours = (this.checkOut.getTime() - this.checkIn.getTime()) / 3600000;
    }
  }
}
