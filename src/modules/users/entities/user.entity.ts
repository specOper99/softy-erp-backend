import { Exclude } from 'class-transformer';
import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  OneToMany,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Role } from '../../../common/enums';
import { EmployeeWallet } from '../../finance/entities/employee-wallet.entity';
import { Profile } from '../../hr/entities/profile.entity';
import { Task } from '../../tasks/entities/task.entity';

@Entity('users')
@Index(['email'], { unique: true })
@Index(['id', 'tenantId'], { unique: true }) // Composite index for foreign key referencing
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  email: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @Column({ name: 'password_hash' })
  @Exclude()
  passwordHash: string;

  @Column({
    type: 'enum',
    enum: Role,
    default: Role.FIELD_STAFF,
  })
  role: Role;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt: Date;

  @OneToOne(() => Profile, (profile) => profile.user)
  profile: Profile;

  @OneToOne(() => EmployeeWallet, (wallet) => wallet.user)
  wallet: EmployeeWallet;

  @OneToMany(() => Task, (task) => task.assignedUser)
  tasks: Promise<Task[]>;
}
