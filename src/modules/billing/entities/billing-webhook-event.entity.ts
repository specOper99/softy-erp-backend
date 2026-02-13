import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity('billing_webhook_events')
@Index(['provider', 'eventId'], { unique: true })
export class BillingWebhookEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'varchar', length: 32 })
  provider: string;

  @Index()
  @Column({ name: 'event_id', type: 'varchar', length: 255 })
  eventId: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
