import { Exclude } from 'class-transformer';
import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Role } from '../enums/role.enum';

@Entity('users')
@Index('IDX_users_email_unique_active', ['email'], { unique: true, where: '"deleted_at" IS NULL' })
@Index(['tenantId', 'email'])
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

  @Column({ name: 'mfa_secret', nullable: true, select: false })
  @Exclude()
  mfaSecret: string;

  @Column({ name: 'is_mfa_enabled', default: false })
  isMfaEnabled: boolean;

  @Column({
    name: 'mfa_recovery_codes',
    type: 'json',
    nullable: true,
    select: false,
  })
  @Exclude()
  mfaRecoveryCodes: string[];

  @Column({
    type: 'enum',
    enum: Role,
    default: Role.FIELD_STAFF,
  })
  role: Role;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @Column({ name: 'email_verified', default: false })
  emailVerified: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt: Date;
}
