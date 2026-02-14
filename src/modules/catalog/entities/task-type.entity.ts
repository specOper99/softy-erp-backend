import { Column, Entity } from 'typeorm';
import { BaseTenantEntity } from '../../../common/entities/abstract.entity';

@Entity('task_types')
export class TaskType extends BaseTenantEntity {
  @Column()
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({
    name: 'default_commission_amount',
    type: 'decimal',
    precision: 12,
    scale: 2,
    default: 0,
  })
  defaultCommissionAmount: number;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;
}
