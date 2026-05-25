import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('package_items')
export class PackageItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column()
  servicePackageId: string;

  @Column()
  tenantId: string;
}
