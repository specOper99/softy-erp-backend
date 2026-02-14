import { Column, Entity, Index, JoinColumn, OneToOne } from 'typeorm';
import { MoneyColumn } from '../../../common/decorators/column.decorators';
import { BaseTenantEntity } from '../../../common/entities/abstract.entity';
import type { User } from '../../users/entities/user.entity';

@Entity('employee_wallets')
@Index(['tenantId', 'userId'], { unique: true })
export class EmployeeWallet extends BaseTenantEntity {
  @Column({ name: 'user_id' })
  userId: string;

  /**
   * Pending commission balance (not yet payable).
   * Transformer ensures type safety (PostgreSQL returns strings).
   */
  @MoneyColumn('pending_balance')
  pendingBalance: number;

  /**
   * Balance available for payout.
   * Transformer ensures type safety (PostgreSQL returns strings).
   */
  @MoneyColumn('payable_balance')
  payableBalance: number;

  @OneToOne('User')
  @JoinColumn({ name: 'user_id' })
  user: User;
}
