import { Column, Entity } from 'typeorm';
import { BaseTenantEntity } from '../../../common/entities/abstract.entity';

@Entity('webhooks')
export class Webhook extends BaseTenantEntity {
  @Column()
  url: string;

  @Column()
  secret: string;

  @Column('simple-array')
  events: string[];

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @Column({ name: 'resolved_ips', type: 'simple-array', nullable: true })
  resolvedIps?: string[];

  @Column({ name: 'ips_resolved_at', type: 'timestamp', nullable: true })
  ipsResolvedAt?: Date;
}
