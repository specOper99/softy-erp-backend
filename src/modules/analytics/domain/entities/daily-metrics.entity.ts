import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

@Entity('daily_metrics')
@Index(['tenantId', 'date'], { unique: true })
export class DailyMetrics {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @Column({ type: 'date' })
  date: string; // YYYY-MM-DD string for easy querying

  @Column('decimal', { name: 'total_revenue', precision: 12, scale: 2, default: 0 })
  totalRevenue: number;

  @Column('int', { name: 'bookings_count', default: 0 })
  bookingsCount: number;

  @Column('int', { name: 'tasks_completed_count', default: 0 })
  tasksCompletedCount: number;

  @Column('int', { name: 'active_clients_count', default: 0 })
  activeClientsCount: number;

  @Column('int', { name: 'cancellations_count', default: 0 })
  cancellationsCount: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
