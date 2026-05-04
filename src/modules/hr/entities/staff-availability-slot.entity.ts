import { Column, Entity, Index } from 'typeorm';
import { BaseTenantEntity } from '../../../common/entities/abstract.entity';

@Entity('staff_availability_slots')
@Index(['tenantId', 'userId', 'dayOfWeek'])
@Index(['tenantId', 'userId'])
export class StaffAvailabilitySlot extends BaseTenantEntity {
  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  /** 0 = Sunday … 6 = Saturday */
  @Column({ name: 'day_of_week', type: 'smallint' })
  dayOfWeek: number;

  /** "HH:mm" 24-hour string, e.g. "09:00" */
  @Column({ name: 'start_time', type: 'varchar', length: 5 })
  startTime: string;

  /** "HH:mm" 24-hour string, e.g. "17:00" */
  @Column({ name: 'end_time', type: 'varchar', length: 5 })
  endTime: string;

  @Column({ name: 'is_recurring', type: 'boolean', default: true })
  isRecurring: boolean;

  @Column({ name: 'effective_from', type: 'date' })
  effectiveFrom: Date;

  @Column({ name: 'effective_to', type: 'date', nullable: true })
  effectiveTo: Date | null;
}
