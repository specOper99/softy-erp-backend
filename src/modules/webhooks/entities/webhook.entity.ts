import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('webhooks')
export class Webhook {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @Column()
  url: string;

  @Column('simple-array')
  events: string[];

  @Column()
  secret: string;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @Column('simple-array', { name: 'resolved_ips', nullable: true })
  resolvedIps?: string[] | null;

  @Column({ name: 'ips_resolved_at', type: 'timestamp', nullable: true })
  ipsResolvedAt?: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
