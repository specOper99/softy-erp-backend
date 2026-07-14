import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, Unique } from 'typeorm';

@Entity('consumer_inbox')
@Unique('UQ_consumer_inbox_consumer_event', ['consumerName', 'eventId'])
export class ConsumerInbox {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar' })
  consumerName!: string;

  @Column({ type: 'uuid' })
  @Index('IDX_consumer_inbox_eventId')
  eventId!: string;

  @CreateDateColumn()
  processedAt!: Date;
}
