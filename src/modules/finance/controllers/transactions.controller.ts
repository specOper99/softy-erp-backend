import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { Roles } from '../../../common/decorators';
import { CursorPaginationDto } from '../../../common/dto/cursor-pagination.dto';
import { RolesGuard } from '../../../common/guards';
import { MfaRequired } from '../../auth/decorators/mfa-required.decorator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { Role } from '../../users/enums/role.enum';
import {
  CreateBudgetDto,
  CreateTransactionDto,
  TransactionFilterDto,
} from '../dto';
import { FinanceService } from '../services/finance.service';

@ApiTags('Finance - Transactions')
@ApiBearerAuth()
@Controller('transactions')
@UseGuards(JwtAuthGuard, RolesGuard)
@MfaRequired()
export class TransactionsController {
  constructor(private readonly financeService: FinanceService) {}

  @Post()
  @Roles(Role.ADMIN, Role.OPS_MANAGER)
  @ApiOperation({ summary: 'Create a manual transaction' })
  create(@Body() dto: CreateTransactionDto) {
    return this.financeService.createTransaction(dto);
  }

  @Get()
  @Roles(Role.ADMIN, Role.OPS_MANAGER)
  @ApiOperation({ summary: 'Get all transactions with optional filters' })
  findAll(@Query() filter: TransactionFilterDto) {
    return this.financeService.findAllTransactions(filter);
  }

  @Get('cursor')
  @Roles(Role.ADMIN, Role.OPS_MANAGER)
  @ApiOperation({ summary: 'Get transactions with cursor pagination' })
  findAllCursor(@Query() query: CursorPaginationDto) {
    return this.financeService.findAllTransactionsCursor(query);
  }

  @Get('summary')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Get financial summary (Admin only)' })
  getSummary() {
    return this.financeService.getTransactionSummary();
  }

  @Get(':id')
  @Roles(Role.ADMIN, Role.OPS_MANAGER)
  @ApiOperation({ summary: 'Get transaction by ID' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.financeService.findTransactionById(id);
  }

  // Budget Methods
  @Post('budgets')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Set or update department budget (Admin only)' })
  upsertBudget(@Body() dto: CreateBudgetDto) {
    return this.financeService.upsertBudget(dto);
  }

  @Get('budgets')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Get budget compliance report (Admin only)' })
  getBudgets(@Query('period') period: string) {
    return this.financeService.getBudgetReport(period);
  }

  @Get('export')
  @Roles(Role.ADMIN, Role.OPS_MANAGER)
  @ApiOperation({ summary: 'Export transactions to CSV' })
  exportTransactions(@Res() res: Response) {
    return this.financeService.exportTransactionsToCSV(res);
  }
}
