import { Column, Entity, Index } from 'typeorm';
import { BaseTenantEntity } from '../../../common/entities/abstract.entity';

@Entity('processing_type_eligibilities')
@Index('IDX_pt_eligibility_tenant_user_pt_unique', ['tenantId', 'userId', 'processingTypeId'], {
  unique: true,
})
@Index('IDX_pt_eligibility_tenant_user', ['tenantId', 'userId'])
@Index('IDX_pt_eligibility_tenant_pt', ['tenantId', 'processingTypeId'])
export class ProcessingTypeEligibility extends BaseTenantEntity {
  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @Column({ name: 'processing_type_id', type: 'uuid' })
  processingTypeId: string;
}
