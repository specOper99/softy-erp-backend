import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { ReferenceType, TransactionType } from '../../../common/enums';
import { CreateTransactionDto, TransactionFilterDto } from '../dto';
import { EmployeeWallet } from '../entities/employee-wallet.entity';
import { Transaction } from '../entities/transaction.entity';

@Injectable()
export class FinanceService {
    constructor(
        @InjectRepository(Transaction)
        private readonly transactionRepository: Repository<Transaction>,
        @InjectRepository(EmployeeWallet)
        private readonly walletRepository: Repository<EmployeeWallet>,
        private readonly dataSource: DataSource,
    ) { }

    // Transaction Methods
    async createTransaction(dto: CreateTransactionDto): Promise<Transaction> {
        const transaction = this.transactionRepository.create({
            ...dto,
            transactionDate: new Date(dto.transactionDate),
        });
        return this.transactionRepository.save(transaction);
    }

    async createTransactionWithManager(
        manager: EntityManager,
        data: {
            type: TransactionType;
            amount: number;
            category?: string;
            referenceId?: string;
            referenceType?: ReferenceType;
            description?: string;
            transactionDate: Date;
        },
    ): Promise<Transaction> {
        const transaction = manager.create(Transaction, data);
        return manager.save(transaction);
    }

    async findAllTransactions(filter?: TransactionFilterDto): Promise<Transaction[]> {
        const queryBuilder = this.transactionRepository.createQueryBuilder('t');

        if (filter?.type) {
            queryBuilder.andWhere('t.type = :type', { type: filter.type });
        }

        if (filter?.startDate && filter?.endDate) {
            queryBuilder.andWhere('t.transactionDate BETWEEN :start AND :end', {
                start: new Date(filter.startDate),
                end: new Date(filter.endDate),
            });
        }

        return queryBuilder.orderBy('t.transactionDate', 'DESC').getMany();
    }

    async findTransactionById(id: string): Promise<Transaction | null> {
        return this.transactionRepository.findOne({ where: { id } });
    }

    async getTransactionSummary(): Promise<{
        totalIncome: number;
        totalExpenses: number;
        totalPayroll: number;
        netBalance: number;
    }> {
        const result = await this.transactionRepository
            .createQueryBuilder('t')
            .select('t.type', 'type')
            .addSelect('SUM(t.amount)', 'total')
            .groupBy('t.type')
            .getRawMany();

        const summary = {
            totalIncome: 0,
            totalExpenses: 0,
            totalPayroll: 0,
            netBalance: 0,
        };

        for (const row of result) {
            const amount = parseFloat(row.total) || 0;
            switch (row.type) {
                case TransactionType.INCOME:
                    summary.totalIncome = amount;
                    break;
                case TransactionType.EXPENSE:
                    summary.totalExpenses = amount;
                    break;
                case TransactionType.PAYROLL:
                    summary.totalPayroll = amount;
                    break;
            }
        }

        summary.netBalance = summary.totalIncome - summary.totalExpenses - summary.totalPayroll;
        return summary;
    }

    // Wallet Methods
    async getOrCreateWallet(userId: string): Promise<EmployeeWallet> {
        let wallet = await this.walletRepository.findOne({ where: { userId } });
        if (!wallet) {
            wallet = this.walletRepository.create({
                userId,
                pendingBalance: 0,
                payableBalance: 0,
            });
            wallet = await this.walletRepository.save(wallet);
        }
        return wallet;
    }

    async getWalletByUserId(userId: string): Promise<EmployeeWallet | null> {
        return this.walletRepository.findOne({
            where: { userId },
            relations: ['user'],
        });
    }

    async getAllWallets(): Promise<EmployeeWallet[]> {
        return this.walletRepository.find({ relations: ['user'] });
    }

    async addPendingCommission(
        manager: EntityManager,
        userId: string,
        amount: number,
    ): Promise<EmployeeWallet> {
        let wallet = await manager.findOne(EmployeeWallet, { where: { userId } });
        if (!wallet) {
            wallet = manager.create(EmployeeWallet, {
                userId,
                pendingBalance: 0,
                payableBalance: 0,
            });
        }
        wallet.pendingBalance = Number(wallet.pendingBalance) + Number(amount);
        return manager.save(wallet);
    }

    async moveToPayable(
        manager: EntityManager,
        userId: string,
        amount: number,
    ): Promise<EmployeeWallet> {
        const wallet = await manager.findOne(EmployeeWallet, { where: { userId } });
        if (!wallet) {
            throw new Error(`Wallet not found for user ${userId}`);
        }
        wallet.pendingBalance = Number(wallet.pendingBalance) - Number(amount);
        wallet.payableBalance = Number(wallet.payableBalance) + Number(amount);
        return manager.save(wallet);
    }

    async resetPayableBalance(manager: EntityManager, userId: string): Promise<EmployeeWallet> {
        const wallet = await manager.findOne(EmployeeWallet, { where: { userId } });
        if (!wallet) {
            throw new Error(`Wallet not found for user ${userId}`);
        }
        wallet.payableBalance = 0;
        return manager.save(wallet);
    }
}
