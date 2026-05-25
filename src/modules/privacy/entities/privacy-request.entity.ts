import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

export enum PrivacyRequestStatus {
  PENDING = 'PENDING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
}

export enum PrivacyRequestType {
  DATA_EXPORT = 'DATA_EXPORT',
  DELETION = 'DELETION',
}

@Entity('privacy_requests')
export class PrivacyRequest {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar' })
  type: PrivacyRequestType;

  @Column({ type: 'varchar' })
  status: PrivacyRequestStatus;

  @Column()
  tenantId: string;

  @Column({ nullable: true, type: 'varchar' })
  downloadUrl: string | null;
}
