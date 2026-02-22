import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { BaseTenantEntity } from '../../../common/entities/abstract.entity';
import type { TaskType } from './task-type.entity';

@Entity('package_items')
export class PackageItem extends BaseTenantEntity {
  @Column({ name: 'package_id', type: 'uuid' })
  packageId: string;

  @Column({ name: 'task_type_id', type: 'uuid' })
  taskTypeId: string;

  @Column({ type: 'integer', default: 1 })
  quantity: number;

  @Column({ type: 'varchar', length: 50, nullable: true })
  role?: string;

  @ManyToOne('TaskType', {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'task_type_id' })
  taskType: TaskType;
}
