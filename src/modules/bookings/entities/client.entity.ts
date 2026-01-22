import { Column, Entity, Index, OneToMany } from 'typeorm';
import { PII, SanitizeHtml } from '../../../common/decorators';
import { BaseTenantEntity } from '../../../common/entities/abstract.entity';
import { Booking } from './booking.entity';

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

  @OneToMany(() => Booking, (booking) => booking.client)
  bookings: Promise<Booking[]>;

  isAccessTokenValid(): boolean {
    if (!this.accessTokenHash || !this.accessTokenExpiry) {
      return false;
    }
    return new Date() < this.accessTokenExpiry;
  }
}
