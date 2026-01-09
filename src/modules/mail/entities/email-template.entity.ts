import { Column, Entity, Index } from 'typeorm';
import { BaseTenantEntity } from '../../../common/entities/abstract.entity';

@Entity('email_templates')
@Index(['tenantId', 'name'], { unique: true })
export class EmailTemplate extends BaseTenantEntity {
  @Column()
  name: string;

  @Column()
  subject: string;

  @Column('text')
  content: string;

  @Column('jsonb', { default: [] })
  variables: string[];

  @Column({ default: false })
  isSystem: boolean;

  @Column({ nullable: true })
  description: string;
}
