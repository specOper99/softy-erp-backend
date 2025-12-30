import { Column, Entity, Index, JoinColumn, OneToOne } from 'typeorm';
import { User } from '../../users/entities/user.entity';

import { BaseTenantEntity } from '../../../common/entities/abstract.entity';

@Entity('employee_wallets')
@Index(['tenantId', 'userId'], { unique: true })
export class EmployeeWallet extends BaseTenantEntity {
  @Column({ name: 'user_id' })
  userId: string;

  @Column({
    name: 'pending_balance',
    type: 'decimal',
    precision: 12,
    scale: 2,
    default: 0,
  })
  pendingBalance: number;

  @Column({
    name: 'payable_balance',
    type: 'decimal',
    precision: 12,
    scale: 2,
    default: 0,
  })
  payableBalance: number;

  @OneToOne(() => User)
  @JoinColumn({ name: 'user_id' })
  user: User;
}
