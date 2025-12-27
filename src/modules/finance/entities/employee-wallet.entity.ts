import {
    Column,
    CreateDateColumn,
    Entity,
    JoinColumn,
    OneToOne,
    PrimaryGeneratedColumn,
    UpdateDateColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';

@Entity('employee_wallets')
export class EmployeeWallet {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ name: 'user_id', unique: true })
    userId: string;

    @Column({
        name: 'pending_balance',
        type: 'decimal',
        precision: 12,
        scale: 2,
        default: 0,
    })
    pendingBalance: number;

    @Column({
        name: 'payable_balance',
        type: 'decimal',
        precision: 12,
        scale: 2,
        default: 0,
    })
    payableBalance: number;

    @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
    createdAt: Date;

    @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
    updatedAt: Date;

    @OneToOne(() => User)
    @JoinColumn({ name: 'user_id' })
    user: User;
}
