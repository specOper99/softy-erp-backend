import { Body, Controller, Get, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../../common/decorators';
import { RolesGuard } from '../../../common/guards';
import { MfaRequired } from '../../auth/decorators/mfa-required.decorator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { Role } from '../../users/enums/role.enum';
import { CreatePurchaseInvoiceDto } from '../dto';
import { PurchaseInvoicesService } from '../services/purchase-invoices.service';

@ApiTags('Finance - Purchase Invoices')
@ApiBearerAuth()
@Controller('finance/purchase-invoices')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class PurchaseInvoicesController {
  constructor(private readonly purchaseInvoicesService: PurchaseInvoicesService) {}

  @Post()
  @MfaRequired()
  @ApiOperation({ summary: 'Create purchase invoice and linked expense transaction' })
  @ApiResponse({ status: 201, description: 'Purchase invoice created successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - Insufficient permissions or MFA missing' })
  @ApiResponse({ status: 404, description: 'Vendor not found in tenant' })
  @ApiResponse({ status: 409, description: 'Duplicate invoice number' })
  create(@Body() dto: CreatePurchaseInvoiceDto) {
    return this.purchaseInvoicesService.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'List purchase invoices with vendor and transaction' })
  @ApiResponse({ status: 200, description: 'Return tenant purchase invoices' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - Insufficient permissions' })
  findAll() {
    return this.purchaseInvoicesService.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get purchase invoice by ID with vendor and transaction' })
  @ApiResponse({ status: 200, description: 'Purchase invoice details' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - Insufficient permissions' })
  @ApiResponse({ status: 404, description: 'Purchase invoice not found' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.purchaseInvoicesService.findById(id);
  }
}
