import {
    Body,
    Controller,
    Get,
    Param,
    ParseUUIDPipe,
    Post,
    Query,
    UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../../common/decorators';
import { Role } from '../../../common/enums';
import { RolesGuard } from '../../../common/guards';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { CreateTransactionDto, TransactionFilterDto } from '../dto';
import { FinanceService } from '../services/finance.service';

@ApiTags('Finance - Transactions')
@ApiBearerAuth()
@Controller('transactions')
@UseGuards(JwtAuthGuard, RolesGuard)
export class TransactionsController {
    constructor(private readonly financeService: FinanceService) { }

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
}
