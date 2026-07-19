import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../../common/decorators';
import { CursorPaginationDto } from '../../../common/dto/cursor-pagination.dto';
import { RolesGuard } from '../../../common/guards';
import { MfaRequired } from '../../auth/infrastructure/decorators/mfa-required.decorator';
import { JwtAuthGuard } from '../../auth/infrastructure/guards/jwt-auth.guard';
import { MfaRequiredGuard } from '../../auth/infrastructure/guards/mfa-required.guard';
import { Role } from '../../users/domain/enums/role.enum';
import { CreatePurchaseInvoiceDto } from './dto';
import { PurchaseInvoicesService } from '../application/purchase-invoices.service';

@ApiTags('Finance - Purchase Invoices')
@ApiBearerAuth()
@Controller('finance/purchase-invoices')
@UseGuards(JwtAuthGuard, MfaRequiredGuard, RolesGuard)
@Roles(Role.ADMIN)
export class PurchaseInvoicesController {
  constructor(private readonly purchaseInvoicesService: PurchaseInvoicesService) {}

  @Post()
  @MfaRequired()
  @ApiOperation({ summary: 'Create purchase invoice and linked expense transaction' })
  @ApiResponse({ status: 201, description: 'Purchase invoice created successfully' })
  @ApiResponse({ status: 401, description: 'common.unauthorized_plain' })
  @ApiResponse({ status: 403, description: 'Forbidden - Insufficient permissions or MFA missing' })
  @ApiResponse({ status: 404, description: 'Vendor not found in tenant' })
  @ApiResponse({ status: 409, description: 'Duplicate invoice number' })
  create(@Body() dto: CreatePurchaseInvoiceDto) {
    return this.purchaseInvoicesService.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'List purchase invoices with vendor and transaction (cursor pagination)' })
  @ApiResponse({ status: 200, description: 'Return page of tenant purchase invoices' })
  @ApiResponse({ status: 401, description: 'common.unauthorized_plain' })
  @ApiResponse({ status: 403, description: 'Forbidden - Insufficient permissions' })
  findAll(@Query() query: CursorPaginationDto) {
    return this.purchaseInvoicesService.findAll(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get purchase invoice by ID with vendor and transaction' })
  @ApiResponse({ status: 200, description: 'Purchase invoice details' })
  @ApiResponse({ status: 401, description: 'common.unauthorized_plain' })
  @ApiResponse({ status: 403, description: 'Forbidden - Insufficient permissions' })
  @ApiResponse({ status: 404, description: 'Purchase invoice not found' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.purchaseInvoicesService.findById(id);
  }
}
