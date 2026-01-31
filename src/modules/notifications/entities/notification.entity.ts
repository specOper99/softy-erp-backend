import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseTenantEntity } from '../../../common/entities/abstract.entity';
import type { User } from '../../users/entities/user.entity';
import { NotificationType } from '../enums/notification.enum';

@Entity('notifications')
@Index(['userId', 'read'])
@Index(['userId', 'createdAt'])
export class Notification extends BaseTenantEntity {
  @Column({ name: 'user_id' })
  userId: string;

  @ManyToOne('User', { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({
    type: 'enum',
    enum: NotificationType,
    name: 'notification_type',
  })
  type: NotificationType;

  @Column()
  title: string;

  @Column('text')
  message: string;

  @Column({ type: 'jsonb', nullable: true })
  metadata?: Record<string, unknown>;

  @Column({ default: false })
  read: boolean;

  @Column({ name: 'read_at', type: 'timestamptz', nullable: true })
  readAt?: Date;

  @Column({ name: 'action_url', nullable: true })
  actionUrl?: string;
}
