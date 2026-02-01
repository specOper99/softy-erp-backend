import { Column, Entity, JoinColumn, OneToOne } from 'typeorm';
import { BaseTenantEntity } from '../../../common/entities/abstract.entity';
import { User } from '../../users/entities/user.entity';

export interface DashboardWidgetConfig {
  id: string;
  isVisible: boolean;
  order: number;
}

export interface UserDashboardConfig {
  widgets: DashboardWidgetConfig[];
}

@Entity('user_preferences')
export class UserPreference extends BaseTenantEntity {
  @OneToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ name: 'user_id' })
  userId: string;

  @Column({ type: 'jsonb', default: {} })
  dashboardConfig: UserDashboardConfig;
}
