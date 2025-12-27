import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TransactionsController } from './controllers/transactions.controller';
import { WalletsController } from './controllers/wallets.controller';
import { EmployeeWallet } from './entities/employee-wallet.entity';
import { Transaction } from './entities/transaction.entity';
import { FinanceService } from './services/finance.service';

@Module({
    imports: [
        TypeOrmModule.forFeature([Transaction, EmployeeWallet]),
    ],
    controllers: [TransactionsController, WalletsController],
    providers: [FinanceService],
    exports: [FinanceService],
})
export class FinanceModule { }
