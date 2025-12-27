import {
    Column,
    CreateDateColumn,
    DeleteDateColumn,
    Entity,
    JoinColumn,
    ManyToOne,
    OneToMany,
    PrimaryGeneratedColumn,
    UpdateDateColumn,
} from 'typeorm';
import { BookingStatus } from '../../../common/enums';
import { ServicePackage } from '../../catalog/entities/service-package.entity';
import { Task } from '../../tasks/entities/task.entity';

@Entity('bookings')
export class Booking {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ name: 'client_name' })
    clientName: string;

    @Column({ name: 'client_phone', nullable: true })
    clientPhone: string;

    @Column({ name: 'client_email', nullable: true })
    clientEmail: string;

    @Column({ name: 'event_date', type: 'timestamptz' })
    eventDate: Date;

    @Column({
        type: 'enum',
        enum: BookingStatus,
        default: BookingStatus.DRAFT,
    })
    status: BookingStatus;

    @Column({ name: 'total_price', type: 'decimal', precision: 12, scale: 2 })
    totalPrice: number;

    @Column({ name: 'package_id' })
    packageId: string;

    @Column({ type: 'text', nullable: true })
    notes: string;

    @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
    createdAt: Date;

    @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
    updatedAt: Date;

    @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz', nullable: true })
    deletedAt: Date;

    @ManyToOne(() => ServicePackage, (pkg) => pkg.bookings)
    @JoinColumn({ name: 'package_id' })
    servicePackage: ServicePackage;

    @OneToMany(() => Task, (task) => task.booking)
    tasks: Task[];
}
