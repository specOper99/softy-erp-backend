import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('webhooks')
export class Webhook {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  tenantId: string;

  @Column()
  url: string;

  @Column('simple-array')
  events: string[];

  @Column()
  secret: string;

  @Column({ default: true })
  isActive: boolean;

  @Column('simple-array', { name: 'resolved_ips', nullable: true })
  resolvedIps?: string[] | null;

  @Column({ name: 'ips_resolved_at', type: 'timestamp', nullable: true })
  ipsResolvedAt?: Date | null;

  @CreateDateColumn()
  createdAt: Date;
}
