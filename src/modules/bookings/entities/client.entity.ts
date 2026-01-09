import { Column, Entity, Index, OneToMany } from 'typeorm';
import { PII, SanitizeHtml } from '../../../common/decorators';
import { BaseTenantEntity } from '../../../common/entities/abstract.entity';
import { Booking } from './booking.entity';

@Entity('clients')
@Index(['tenantId', 'id'], { unique: true })
@Index(['tenantId', 'email'])
@Index(['tenantId', 'phone'])
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

  // Magic Link Authentication
  @Column({ nullable: true })
  accessToken: string;

  @Column({ type: 'timestamptz', nullable: true })
  accessTokenExpiry: Date;

  @OneToMany(() => Booking, (booking) => booking.client)
  bookings: Promise<Booking[]>;

  isAccessTokenValid(): boolean {
    if (!this.accessToken || !this.accessTokenExpiry) {
      return false;
    }
    return new Date() < this.accessTokenExpiry;
  }
}
