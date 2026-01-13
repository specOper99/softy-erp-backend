import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

@Entity('daily_metrics')
@Index(['tenantId', 'date'], { unique: true })
export class DailyMetrics {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  tenantId: string;

  @Column({ type: 'date' })
  date: string; // YYYY-MM-DD string for easy querying

  @Column('decimal', { precision: 12, scale: 2, default: 0 })
  totalRevenue: number;

  @Column('int', { default: 0 })
  bookingsCount: number;

  @Column('int', { default: 0 })
  tasksCompletedCount: number;

  @Column('int', { default: 0 })
  activeClientsCount: number;

  @Column('int', { default: 0 })
  cancellationsCount: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
