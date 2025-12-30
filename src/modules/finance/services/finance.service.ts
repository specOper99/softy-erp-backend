import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { ReferenceType, TransactionType } from '../../../common/enums';
import { TenantContextService } from '../../../common/services/tenant-context.service';
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
  ) {}

  // Transaction Methods
  async createTransaction(dto: CreateTransactionDto): Promise<Transaction> {
    const tenantId = TenantContextService.getTenantId();
    const transaction = this.transactionRepository.create({
      ...dto,
      transactionDate: new Date(dto.transactionDate),
      tenantId,
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
    const tenantId = TenantContextService.getTenantId();
    const transaction = manager.create(Transaction, { ...data, tenantId });
    return manager.save(transaction);
  }

  async findAllTransactions(
    filter?: TransactionFilterDto,
  ): Promise<Transaction[]> {
    const tenantId = TenantContextService.getTenantId();
    const queryBuilder = this.transactionRepository.createQueryBuilder('t');

    queryBuilder.where('t.tenantId = :tenantId', { tenantId });

    if (filter?.type) {
      queryBuilder.andWhere('t.type = :type', { type: filter.type });
    }

    if (filter?.startDate && filter?.endDate) {
      queryBuilder.andWhere('t.transactionDate BETWEEN :start AND :end', {
        start: new Date(filter.startDate),
        end: new Date(filter.endDate),
      });
    }

    return queryBuilder
      .orderBy('t.transactionDate', 'DESC')
      .skip(filter?.getSkip())
      .take(filter?.getTake())
      .getMany();
  }

  async findTransactionById(id: string): Promise<Transaction> {
    const tenantId = TenantContextService.getTenantId();
    const transaction = await this.transactionRepository.findOne({
      where: { id, tenantId },
    });
    if (!transaction) {
      throw new NotFoundException(`Transaction with ID ${id} not found`);
    }
    return transaction;
  }

  async getTransactionSummary(): Promise<{
    totalIncome: number;
    totalExpenses: number;
    totalPayroll: number;
    netBalance: number;
  }> {
    const tenantId = TenantContextService.getTenantId();
    const result = await this.transactionRepository
      .createQueryBuilder('t')
      .where('t.tenantId = :tenantId', { tenantId })
      .select('t.type', 'type')
      .addSelect('SUM(t.amount)', 'total')
      .groupBy('t.type')
      .getRawMany<{ type: TransactionType; total: string }>();

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

    summary.netBalance =
      summary.totalIncome - summary.totalExpenses - summary.totalPayroll;
    return summary;
  }

  // Wallet Methods
  async getOrCreateWallet(userId: string): Promise<EmployeeWallet> {
    return this.dataSource.transaction(async (manager) => {
      return this.getOrCreateWalletWithManager(manager, userId);
    });
  }

  async getOrCreateWalletWithManager(
    manager: EntityManager,
    userId: string,
  ): Promise<EmployeeWallet> {
    const tenantId = TenantContextService.getTenantId();
    let wallet = await manager.findOne(EmployeeWallet, {
      where: { userId, tenantId },
      lock: { mode: 'pessimistic_write' },
    });
    if (!wallet) {
      wallet = manager.create(EmployeeWallet, {
        userId,
        pendingBalance: 0,
        payableBalance: 0,
        tenantId,
      });
      wallet = await manager.save(wallet);
    }
    return wallet;
  }

  async getWalletByUserId(userId: string): Promise<EmployeeWallet | null> {
    const tenantId = TenantContextService.getTenantId();
    return this.walletRepository.findOne({
      where: { userId, tenantId },
      relations: ['user'],
    });
  }

  async getAllWallets(): Promise<EmployeeWallet[]> {
    const tenantId = TenantContextService.getTenantId();
    return this.walletRepository.find({
      where: { tenantId },
      relations: ['user'],
    });
  }

  async addPendingCommission(
    manager: EntityManager,
    userId: string,
    amount: number,
  ): Promise<EmployeeWallet> {
    const tenantId = TenantContextService.getTenantId();
    let wallet = await manager.findOne(EmployeeWallet, {
      where: { userId, tenantId },
      lock: { mode: 'pessimistic_write' },
    });
    if (!wallet) {
      wallet = manager.create(EmployeeWallet, {
        userId,
        pendingBalance: 0,
        payableBalance: 0,
        tenantId,
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
    const tenantId = TenantContextService.getTenantId();
    const wallet = await manager.findOne(EmployeeWallet, {
      where: { userId, tenantId },
      lock: { mode: 'pessimistic_write' },
    });
    if (!wallet) {
      throw new NotFoundException(`Wallet not found for user ${userId}`);
    }

    // Validate sufficient pending balance before transfer
    const currentPending = Number(wallet.pendingBalance);
    const transferAmount = Number(amount);

    if (transferAmount > currentPending) {
      throw new BadRequestException(
        `Insufficient pending balance: ${currentPending.toFixed(2)} < ${transferAmount.toFixed(2)}`,
      );
    }

    wallet.pendingBalance = currentPending - transferAmount;
    wallet.payableBalance = Number(wallet.payableBalance) + transferAmount;
    return manager.save(wallet);
  }

  async resetPayableBalance(
    manager: EntityManager,
    userId: string,
  ): Promise<EmployeeWallet> {
    const tenantId = TenantContextService.getTenantId();
    const wallet = await manager.findOne(EmployeeWallet, {
      where: { userId, tenantId },
      lock: { mode: 'pessimistic_write' },
    });
    if (!wallet) {
      throw new NotFoundException(`Wallet not found for user ${userId}`);
    }
    wallet.payableBalance = 0;
    return manager.save(wallet);
  }
}
