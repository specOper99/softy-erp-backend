import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('audit_logs')
export class AuditLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', nullable: true })
  userId: string; // The user who performed the action

  @Column()
  action: string; // e.g., 'CREATE', 'UPDATE', 'DELETE', 'STATUS_CHANGE'

  @Column({ name: 'entity_name' })
  entityName: string; // e.g., 'Booking', 'Task'

  @Column({ name: 'entity_id' })
  entityId: string;

  @Column({ type: 'jsonb', name: 'old_values', nullable: true })
  oldValues: any;

  @Column({ type: 'jsonb', name: 'new_values', nullable: true })
  newValues: any;

  @Column({ type: 'text', nullable: true })
  notes: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
