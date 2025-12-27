import {
    Column,
    CreateDateColumn,
    Entity,
    OneToMany,
    PrimaryGeneratedColumn,
    UpdateDateColumn,
} from 'typeorm';
import { Task } from '../../tasks/entities/task.entity';
import { PackageItem } from './package-item.entity';

@Entity('task_types')
export class TaskType {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column()
    name: string;

    @Column({ type: 'text', nullable: true })
    description: string;

    @Column({
        name: 'default_commission_amount',
        type: 'decimal',
        precision: 12,
        scale: 2,
        default: 0,
    })
    defaultCommissionAmount: number;

    @Column({ name: 'is_active', default: true })
    isActive: boolean;

    @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
    createdAt: Date;

    @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
    updatedAt: Date;

    @OneToMany(() => PackageItem, (item) => item.taskType)
    packageItems: PackageItem[];

    @OneToMany(() => Task, (task) => task.taskType)
    tasks: Task[];
}
