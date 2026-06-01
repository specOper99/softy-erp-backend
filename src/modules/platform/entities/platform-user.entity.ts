import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';
import { PlatformRole } from '../enums/platform-role.enum';

@Entity('platform_users')
export class PlatformUser {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  email: string;

  @Column({ name: 'full_name' })
  fullName: string;

  @Column({ name: 'password_hash' })
  passwordHash: string;

  @Column({ type: 'varchar' })
  role: PlatformRole;

  @Column({ default: 'active' })
  status: string;

  @Column({ name: 'mfa_enabled', default: false })
  mfaEnabled: boolean;
}
