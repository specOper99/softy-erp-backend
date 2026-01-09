import { Column, Entity, Index } from 'typeorm';
import { BaseTenantEntity } from '../../../common/entities/abstract.entity';
import { TaskStatus } from '../enums/task-status.enum';

@Entity('task_templates')
@Index(['tenantId', 'id'], { unique: true })
@Index(['tenantId', 'name'])
export class TaskTemplate extends BaseTenantEntity {
  @Column()
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ name: 'task_type_id', type: 'text', nullable: true })
  taskTypeId: string | null;

  @Column({
    type: 'enum',
    enum: TaskStatus,
    name: 'default_status',
    default: TaskStatus.PENDING,
  })
  defaultStatus: TaskStatus;

  @Column({
    name: 'default_commission',
    type: 'decimal',
    precision: 12,
    scale: 2,
    default: 0,
  })
  defaultCommission: number;

  @Column({
    name: 'estimated_hours',
    type: 'decimal',
    precision: 6,
    scale: 2,
    nullable: true,
  })
  estimatedHours: number | null;

  @Column({ name: 'default_due_days', type: 'int', nullable: true })
  defaultDueDays: number | null;

  @Column({ default: true })
  isActive: boolean;

  @Column({ type: 'jsonb', nullable: true, default: [] })
  checklist: string[];

  @Column({ name: 'sort_order', default: 0 })
  sortOrder: number;
}
