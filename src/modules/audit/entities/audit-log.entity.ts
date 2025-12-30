import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('audit_logs')
export class AuditLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ name: 'user_id', nullable: true })
  userId: string; // The user who performed the action

  @Index()
  @Column({ name: 'tenant_id', type: 'uuid', nullable: true })
  tenantId: string; // The tenant context for scoped audit queries

  @Column()
  action: string; // e.g., 'CREATE', 'UPDATE', 'DELETE', 'STATUS_CHANGE'

  @Column({ name: 'entity_name' })
  entityName: string; // e.g., 'Booking', 'Task'

  @Index()
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
