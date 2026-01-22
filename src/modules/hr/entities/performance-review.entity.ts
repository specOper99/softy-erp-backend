import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseTenantEntity } from '../../../common/entities/abstract.entity';
import { User } from '../../users/entities/user.entity';

export enum ReviewStatus {
  DRAFT = 'DRAFT',
  SUBMITTED = 'SUBMITTED',
  ACKNOWLEDGED = 'ACKNOWLEDGED',
  COMPLETED = 'COMPLETED',
}

export enum ReviewPeriodType {
  QUARTERLY = 'QUARTERLY',
  SEMI_ANNUAL = 'SEMI_ANNUAL',
  ANNUAL = 'ANNUAL',
  PROBATION = 'PROBATION',
  AD_HOC = 'AD_HOC',
}

export enum Rating {
  EXCEEDS_EXPECTATIONS = 5,
  MEETS_EXPECTATIONS = 4,
  NEEDS_IMPROVEMENT = 3,
  BELOW_EXPECTATIONS = 2,
  UNSATISFACTORY = 1,
}

@Entity('performance_reviews')
@Index(['tenantId', 'id'], { unique: true })
@Index(['tenantId', 'userId', 'periodStart', 'periodEnd'], { unique: true })
@Index(['tenantId', 'reviewerId'])
@Index(['tenantId', 'status'])
export class PerformanceReview extends BaseTenantEntity {
  @Column({ name: 'user_id' })
  userId: string;

  @Column({ name: 'reviewer_id' })
  reviewerId: string;

  @Column({
    type: 'enum',
    enum: ReviewPeriodType,
    name: 'period_type',
    default: ReviewPeriodType.QUARTERLY,
  })
  periodType: ReviewPeriodType;

  @Column({ name: 'period_start', type: 'date' })
  periodStart: Date;

  @Column({ name: 'period_end', type: 'date' })
  periodEnd: Date;

  @Column({
    type: 'enum',
    enum: ReviewStatus,
    default: ReviewStatus.DRAFT,
  })
  status: ReviewStatus;

  @Column({
    name: 'overall_rating',
    type: 'int',
    nullable: true,
  })
  overallRating: Rating | null;

  @Column({ type: 'jsonb', nullable: true, default: [] })
  strengths: string[];

  @Column({
    type: 'jsonb',
    name: 'areas_for_improvement',
    nullable: true,
    default: [],
  })
  areasForImprovement: string[];

  @Column({ type: 'jsonb', nullable: true, default: [] })
  goals: string[];

  @Column({ type: 'text', name: 'reviewer_comments', nullable: true })
  reviewerComments: string | null;

  @Column({ type: 'text', name: 'employee_comments', nullable: true })
  employeeComments: string | null;

  @Column({ name: 'submitted_at', type: 'timestamptz', nullable: true })
  submittedAt: Date | null;

  @Column({ name: 'acknowledged_at', type: 'timestamptz', nullable: true })
  acknowledgedAt: Date | null;

  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true })
  completedAt: Date | null;

  @ManyToOne('User', { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @ManyToOne('User', { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'reviewer_id' })
  reviewer: User;

  submit(): void {
    if (this.status === ReviewStatus.DRAFT) {
      this.status = ReviewStatus.SUBMITTED;
      this.submittedAt = new Date();
    }
  }

  acknowledge(): void {
    if (this.status === ReviewStatus.SUBMITTED) {
      this.status = ReviewStatus.ACKNOWLEDGED;
      this.acknowledgedAt = new Date();
    }
  }

  complete(): void {
    if (this.status === ReviewStatus.ACKNOWLEDGED) {
      this.status = ReviewStatus.COMPLETED;
      this.completedAt = new Date();
    }
  }
}
