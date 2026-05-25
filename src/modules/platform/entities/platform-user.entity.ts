import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';
import { PlatformRole } from '../enums/platform-role.enum';

@Entity('platform_users')
export class PlatformUser {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  email: string;

  @Column()
  fullName: string;

  @Column()
  passwordHash: string;

  @Column({ type: 'varchar' })
  role: PlatformRole;

  @Column({ default: 'active' })
  status: string;

  @Column({ default: false })
  mfaEnabled: boolean;
}
