import { Column, Entity, JoinColumn, ManyToOne, Unique } from 'typeorm';
import { BaseTenantEntity } from '../../../common/entities/abstract.entity';
import { User } from '../../users/entities/user.entity';
import { NotificationFrequency, NotificationType } from '../enums/notification.enum';

@Entity('notification_preferences')
@Unique(['userId', 'notificationType'])
export class NotificationPreference extends BaseTenantEntity {
  @Column({ name: 'user_id' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({
    type: 'enum',
    enum: NotificationType,
    name: 'notification_type',
  })
  notificationType: NotificationType;

  @Column({ name: 'email_enabled', default: true })
  emailEnabled: boolean;

  @Column({ name: 'in_app_enabled', default: true })
  inAppEnabled: boolean;

  @Column({
    type: 'enum',
    enum: NotificationFrequency,
    default: NotificationFrequency.IMMEDIATE,
  })
  frequency: NotificationFrequency;
}
