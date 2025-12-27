import {
    Column,
    CreateDateColumn,
    Entity,
    JoinColumn,
    ManyToOne,
    PrimaryGeneratedColumn,
    UpdateDateColumn,
} from 'typeorm';
import { Booking } from '../../bookings/entities/booking.entity';
import { Task } from '../../tasks/entities/task.entity';

@Entity('attachments')
export class Attachment {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column()
    name: string;

    @Column()
    url: string;

    @Column({ name: 'mime_type' })
    mimeType: string;

    @Column({ type: 'int' })
    size: number;

    @Column({ name: 'booking_id', nullable: true })
    bookingId: string | null;

    @Column({ name: 'task_id', nullable: true })
    taskId: string | null;

    @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
    createdAt: Date;

    @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
    updatedAt: Date;

    @ManyToOne(() => Booking, { nullable: true, onDelete: 'CASCADE' })
    @JoinColumn({ name: 'booking_id' })
    booking: Booking | null;

    @ManyToOne(() => Task, { nullable: true, onDelete: 'CASCADE' })
    @JoinColumn({ name: 'task_id' })
    task: Task | null;
}
