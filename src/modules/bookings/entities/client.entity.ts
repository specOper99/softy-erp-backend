import { Column, Entity, Index } from 'typeorm';
import { PII } from '../../../common/decorators/pii.decorator';
import { SanitizeHtml } from '../../../common/decorators/sanitize-html.decorator';
import { BaseTenantEntity } from '../../../common/entities/abstract.entity';

@Entity('clients')
@Index(['tenantId', 'id'], { unique: true })
@Index(['tenantId', 'email'])
@Index(['tenantId', 'phone'])
@Index(['tenantId', 'accessTokenHash']) // Index for efficient hash lookups
export class Client extends BaseTenantEntity {
  @Column()
  @SanitizeHtml()
  name: string;

  @Column({ nullable: true })
  @PII()
  email: string;

  @Column({ nullable: true })
  @PII()
  phone: string;

  @Column({ type: 'text', nullable: true })
  @SanitizeHtml()
  notes: string;

  @Column({ type: 'jsonb', nullable: true, default: [] })
  @Index('idx_clients_tags', { synchronize: false }) // GIN index created via migration
  tags: string[];

  @Column({
    name: 'notification_preferences',
    type: 'jsonb',
    default: { email: true, inApp: true },
  })
  notificationPreferences: {
    email: boolean;
    inApp: boolean;
  };

  // Magic Link Authentication - SECURITY: Store hash, not plaintext
  @Column({
    name: 'access_token_hash',
    type: 'varchar',
    length: 64,
    nullable: true,
  })
  accessTokenHash: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  accessTokenExpiry: Date | null;

  isAccessTokenValid(): boolean {
    if (!this.accessTokenHash || !this.accessTokenExpiry) {
      return false;
    }
    return new Date() < this.accessTokenExpiry;
  }
}
