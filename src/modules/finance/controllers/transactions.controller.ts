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
  UseInterceptors,
} from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { Roles } from '../../../common/decorators';
import { CursorPaginationDto } from '../../../common/dto/cursor-pagination.dto';
import { RolesGuard } from '../../../common/guards';
import { IDEMPOTENCY_HEADER, IdempotencyInterceptor, Idempotent } from '../../../common/interceptors';
import { MfaRequired } from '../../auth/decorators/mfa-required.decorator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { Role } from '../../users/enums/role.enum';
import { BudgetReportQueryDto, CreateBudgetDto, CreateTransactionDto, TransactionFilterDto } from '../dto';
import { FinanceService } from '../services/finance.service';
import { FinancialReportService } from '../services/financial-report.service';

@ApiTags('Finance - Transactions')
@ApiBearerAuth()
@Controller('transactions')
@UseGuards(JwtAuthGuard, RolesGuard)
export class TransactionsController {
  constructor(
    private readonly financeService: FinanceService,
    private readonly financialReportService: FinancialReportService,
  ) {}

  @Post()
  @Roles(Role.ADMIN, Role.OPS_MANAGER)
  @MfaRequired()
  @UseInterceptors(IdempotencyInterceptor)
  @Idempotent({ ttl: 24 * 60 * 60 * 1000 }) // 24 hours
  @ApiOperation({ summary: 'Create a manual transaction' })
  @ApiHeader({
    name: IDEMPOTENCY_HEADER,
    description: 'Unique idempotency key (16-256 chars, alphanumeric with hyphens/underscores)',
    required: false,
  })
  @ApiResponse({ status: 201, description: 'Transaction created successfully' })
  @ApiResponse({ status: 400, description: 'Invalid input' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Insufficient permissions or MFA missing' })
  @ApiResponse({ status: 409, description: 'Idempotency key conflict' })
  create(@Body() dto: CreateTransactionDto) {
    return this.financeService.createTransaction(dto);
  }

  @Get()
  @Roles(Role.ADMIN, Role.OPS_MANAGER)
  @ApiOperation({
    summary: 'Get all transactions (Offset Pagination)',
    deprecated: true,
    description: 'Use /transactions/cursor for better performance with large datasets.',
  })
  @ApiResponse({ status: 200, description: 'Return all transactions' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - Insufficient permissions' })
  findAll(@Query() filter: TransactionFilterDto) {
    return this.financeService.findAllTransactions(filter);
  }

  @Get('cursor')
  @Roles(Role.ADMIN, Role.OPS_MANAGER)
  @ApiOperation({ summary: 'Get transactions with cursor pagination' })
  @ApiResponse({ status: 200, description: 'Return paginated transactions' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - Insufficient permissions' })
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
  @ApiResponse({ status: 200, description: 'Transaction details' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - Insufficient permissions' })
  @ApiResponse({ status: 404, description: 'Transaction not found' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.financeService.findTransactionById(id);
  }

  // Budget Methods
  @Post('budgets')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Set or update department budget (Admin only)' })
  upsertBudget(@Body() dto: CreateBudgetDto) {
    return this.financialReportService.upsertBudget(dto);
  }

  @Get('budgets')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Get budget compliance report (Admin only)' })
  @ApiResponse({ status: 200, description: 'Budget compliance report' })
  @ApiResponse({ status: 400, description: 'Invalid period format' })
  getBudgets(@Query() query: BudgetReportQueryDto) {
    return this.financialReportService.getBudgetReport(query.period);
  }

  @Get('export')
  @Roles(Role.ADMIN, Role.OPS_MANAGER)
  @ApiOperation({ summary: 'Export transactions to CSV' })
  @ApiResponse({ status: 200, description: 'CSV file download' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - Insufficient permissions' })
  exportTransactions(@Res() res: Response) {
    return this.financeService.exportTransactionsToCSV(res);
  }
}
