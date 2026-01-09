import { Column, Entity, Index } from 'typeorm';
import { BaseTenantEntity } from '../../../common/entities/abstract.entity';

@Entity('payroll_runs')
@Index(['tenantId', 'id'], { unique: true })
export class PayrollRun extends BaseTenantEntity {
  @Column({ name: 'total_employees', type: 'int' })
  totalEmployees: number;

  @Column({ name: 'total_payout', type: 'decimal', precision: 12, scale: 2 })
  totalPayout: number;

  @Column({ name: 'processed_at', type: 'timestamptz' })
  processedAt: Date;

  @Column({ default: 'COMPLETED' })
  status: string;

  @Column({ name: 'transaction_ids', type: 'jsonb', nullable: true })
  transactionIds: string[];

  @Column({ type: 'text', nullable: true })
  notes: string;
}
