import {
  Column,
  DeleteDateColumn,
  Entity,
  Index,
  JoinColumn,
  OneToOne,
} from 'typeorm';
import { PII } from '../../../common/decorators';
import { BaseTenantEntity } from '../../../common/entities/abstract.entity';
import { User } from '../../users/entities/user.entity';
import { ContractType } from '../enums/contract-type.enum';

@Entity('profiles')
@Index(['tenantId', 'department'])
@Index(['tenantId', 'team'])
export class Profile extends BaseTenantEntity {
  @Column({ name: 'user_id', unique: true })
  userId: string;

  @Column({ name: 'first_name', nullable: true })
  firstName: string;

  @Column({ name: 'last_name', nullable: true })
  lastName: string;

  @Column({ name: 'job_title', nullable: true })
  jobTitle: string;

  @Column({
    name: 'base_salary',
    type: 'decimal',
    precision: 12,
    scale: 2,
    default: 0,
  })
  baseSalary: number;

  @Column({ name: 'hire_date', type: 'date', nullable: true })
  hireDate: Date | null;

  @Column({ name: 'bank_account', nullable: true })
  bankAccount: string;

  @Column({ nullable: true })
  phone: string;

  @Column({ name: 'emergency_contact_name', nullable: true })
  @PII()
  emergencyContactName: string;

  @Column({ name: 'emergency_contact_phone', nullable: true })
  @PII()
  emergencyContactPhone: string;

  @Column({ nullable: true })
  @PII()
  address: string;

  @Column({ nullable: true })
  city: string;

  @Column({ nullable: true })
  country: string;

  @Column({ nullable: true })
  department: string;

  @Column({ nullable: true })
  team: string;

  @Column({
    name: 'contract_type',
    type: 'enum',
    enum: ContractType,
    default: ContractType.FULL_TIME,
  })
  contractType: ContractType;

  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt: Date;

  @OneToOne(() => User)
  @JoinColumn({ name: 'user_id' })
  user: User;
}
