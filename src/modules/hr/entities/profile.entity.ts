import {
    Column,
    CreateDateColumn,
    DeleteDateColumn,
    Entity,
    JoinColumn,
    OneToOne,
    PrimaryGeneratedColumn,
    UpdateDateColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';

@Entity('profiles')
export class Profile {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ name: 'user_id', unique: true })
    userId: string;

    @Column({ name: 'first_name', nullable: true })
    firstName: string;

    @Column({ name: 'last_name', nullable: true })
    lastName: string;

    @Column({ name: 'job_title', nullable: true })
    jobTitle: string;

    @Column({
        name: 'base_salary',
        type: 'decimal',
        precision: 12,
        scale: 2,
        default: 0,
    })
    baseSalary: number;

    @Column({ name: 'hire_date', type: 'date', nullable: true })
    hireDate: Date | null;

    @Column({ name: 'bank_account', nullable: true })
    bankAccount: string;

    @Column({ nullable: true })
    phone: string;

    @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
    createdAt: Date;

    @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
    updatedAt: Date;

    @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz', nullable: true })
    deletedAt: Date;

    @OneToOne(() => User)
    @JoinColumn({ name: 'user_id' })
    user: User;
}
