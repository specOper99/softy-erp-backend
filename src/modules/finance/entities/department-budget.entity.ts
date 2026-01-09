import { Column, Entity, Index } from 'typeorm';
import { BaseTenantEntity } from '../../../common/entities/abstract.entity';

@Entity('department_budgets')
@Index(['tenantId', 'department', 'period'], { unique: true })
export class DepartmentBudget extends BaseTenantEntity {
  @Column()
  department: string;

  @Column({
    name: 'budget_amount',
    type: 'decimal',
    precision: 12,
    scale: 2,
    default: 0,
  })
  budgetAmount: number;

  @Column()
  @Index()
  period: string; // Format: "YYYY-MM"

  @Column({ name: 'start_date', type: 'date' })
  startDate: Date;

  @Column({ name: 'end_date', type: 'date' })
  endDate: Date;

  @Column({ type: 'text', nullable: true })
  notes: string;
}
