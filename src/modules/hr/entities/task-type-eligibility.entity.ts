import { Column, Entity, Index } from 'typeorm';
import { BaseTenantEntity } from '../../../common/entities/abstract.entity';

@Entity('task_type_eligibilities')
@Index('IDX_task_type_eligibility_tenant_user_task_type_unique', ['tenantId', 'userId', 'taskTypeId'], {
  unique: true,
})
@Index('IDX_task_type_eligibility_tenant_user', ['tenantId', 'userId'])
@Index('IDX_task_type_eligibility_tenant_task_type', ['tenantId', 'taskTypeId'])
export class TaskTypeEligibility extends BaseTenantEntity {
  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @Column({ name: 'task_type_id', type: 'uuid' })
  taskTypeId: string;
}
