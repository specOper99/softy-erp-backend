import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Column, Entity, Index } from 'typeorm';
import { BaseTenantEntity } from '../../../common/entities/abstract.entity';

@Entity('payroll_runs')
@Index(['tenantId', 'id'], { unique: true })
export class PayrollRun extends BaseTenantEntity {
  @ApiProperty()
  @Column({ name: 'total_employees', type: 'int' })
  totalEmployees: number;

  @ApiProperty()
  @Column({ name: 'total_payout', type: 'decimal', precision: 12, scale: 2 })
  totalPayout: number;

  @ApiProperty()
  @Column({ name: 'processed_at', type: 'timestamptz' })
  processedAt: Date;

  @ApiProperty()
  @Column({ default: 'COMPLETED' })
  status: string;

  @ApiPropertyOptional({ type: [String] })
  @Column({ name: 'transaction_ids', type: 'jsonb', nullable: true })
  transactionIds: string[];

  @ApiPropertyOptional()
  @Column({ type: 'text', nullable: true })
  notes: string;
}
