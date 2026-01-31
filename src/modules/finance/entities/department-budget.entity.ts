import { Column, Entity, Index } from 'typeorm';
import { MoneyColumn } from '../../../common/decorators/column.decorators';
import { BaseTenantEntity } from '../../../common/entities/abstract.entity';

@Entity('department_budgets')
@Index(['tenantId', 'department', 'period'], { unique: true })
export class DepartmentBudget extends BaseTenantEntity {
  @Column()
  department: string;

  /**
   * Budget allocation for this department/period.
   * Transformer ensures type safety (PostgreSQL returns strings).
   */
  @MoneyColumn('budget_amount')
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
