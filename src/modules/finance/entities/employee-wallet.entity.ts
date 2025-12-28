import { Column, Entity, JoinColumn, OneToOne } from 'typeorm';
import { User } from '../../users/entities/user.entity';

import { BaseTenantEntity } from '../../../common/entities/abstract.entity';

@Entity('employee_wallets')
export class EmployeeWallet extends BaseTenantEntity {
  @Column({ name: 'user_id', unique: true })
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
