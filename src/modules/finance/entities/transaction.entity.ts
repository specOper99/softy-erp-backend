import {
    Column,
    CreateDateColumn,
    Entity,
    PrimaryGeneratedColumn,
} from 'typeorm';
import { ReferenceType, TransactionType } from '../../../common/enums';

@Entity('transactions')
export class Transaction {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({
        type: 'enum',
        enum: TransactionType,
    })
    type: TransactionType;

    @Column({ type: 'decimal', precision: 12, scale: 2 })
    amount: number;

    @Column({ nullable: true })
    category: string;

    @Column({ name: 'reference_id', type: 'uuid', nullable: true })
    referenceId: string | null;

    @Column({
        name: 'reference_type',
        type: 'enum',
        enum: ReferenceType,
        nullable: true,
    })
    referenceType: ReferenceType | null;

    @Column({ type: 'text', nullable: true })
    description: string;

    @Column({ name: 'transaction_date', type: 'timestamptz' })
    transactionDate: Date;

    @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
    createdAt: Date;
}
