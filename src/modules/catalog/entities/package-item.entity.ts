import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { ServicePackage } from './service-package.entity';
import { TaskType } from './task-type.entity';

@Entity('package_items')
export class PackageItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'package_id' })
  packageId: string;

  @Column({ name: 'task_type_id' })
  taskTypeId: string;

  @Column({ type: 'integer', default: 1 })
  quantity: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @ManyToOne(() => ServicePackage, (pkg) => pkg.packageItems, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'package_id' })
  servicePackage: ServicePackage;

  @ManyToOne(() => TaskType, (taskType) => taskType.packageItems, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'task_type_id' })
  taskType: TaskType;
}
