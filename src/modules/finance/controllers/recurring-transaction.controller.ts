import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../../common/decorators/roles.decorator';
import { PaginationDto } from '../../../common/dto/pagination.dto';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { Role } from '../../users/enums/role.enum';
import {
  CreateRecurringTransactionDto,
  UpdateRecurringTransactionDto,
} from '../dto/recurring-transaction.dto';
import { RecurringTransactionService } from '../services/recurring-transaction.service';

@ApiTags('Recurring Transactions')
@ApiBearerAuth()
@Controller('finance/recurring-transactions')
@UseGuards(JwtAuthGuard, RolesGuard)
export class RecurringTransactionController {
  constructor(
    private readonly recurringTransactionService: RecurringTransactionService,
  ) {}

  @Post()
  @Roles(Role.ADMIN, Role.OPS_MANAGER)
  @ApiOperation({ summary: 'Create a recurring transaction' })
  create(@Body() dto: CreateRecurringTransactionDto) {
    return this.recurringTransactionService.create(dto);
  }

  @Get()
  @Roles(Role.ADMIN, Role.OPS_MANAGER)
  @ApiOperation({ summary: 'Get all recurring transactions' })
  findAll(@Query() query: PaginationDto) {
    return this.recurringTransactionService.findAll(query);
  }

  @Get(':id')
  @Roles(Role.ADMIN, Role.OPS_MANAGER)
  @ApiOperation({ summary: 'Get recurring transaction by ID' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.recurringTransactionService.findOne(id);
  }

  @Patch(':id')
  @Roles(Role.ADMIN, Role.OPS_MANAGER)
  @ApiOperation({ summary: 'Update recurring transaction' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateRecurringTransactionDto,
  ) {
    return this.recurringTransactionService.update(id, dto);
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Delete recurring transaction' })
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.recurringTransactionService.remove(id);
  }
}
