import { Controller, Get, Param, ParseUUIDPipe, Post, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { Roles } from '../../../common/decorators/roles.decorator';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { Role } from '../../users/enums/role.enum';
import { InvoiceService } from '../services/invoice.service';

@ApiTags('Invoices')
@ApiBearerAuth()
@Controller('invoices')
@UseGuards(JwtAuthGuard, RolesGuard)
export class InvoiceController {
  constructor(private readonly invoiceService: InvoiceService) {}

  @Post('generate/:bookingId')
  @Roles(Role.ADMIN, Role.OPS_MANAGER)
  @ApiOperation({ summary: 'Generate invoice for a booking' })
  @ApiResponse({ status: 201, description: 'Invoice generated successfully' })
  @ApiResponse({ status: 400, description: 'Invalid booking state or arguments' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - Insufficient permissions' })
  @ApiResponse({ status: 404, description: 'Booking not found' })
  async generate(@Param('bookingId', ParseUUIDPipe) bookingId: string) {
    return this.invoiceService.createInvoice(bookingId);
  }

  @Get(':id/pdf')
  @Roles(Role.ADMIN, Role.OPS_MANAGER, Role.CLIENT) // Clients can download their own? Security check is tenant for now.
  @ApiOperation({ summary: 'Download invoice PDF' })
  @ApiResponse({ status: 200, description: 'PDF file download' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - Insufficient permissions' })
  @ApiResponse({ status: 404, description: 'Invoice not found' })
  async downloadPdf(@Param('id', ParseUUIDPipe) id: string, @Res() res: Response) {
    const pdfBuffer = await this.invoiceService.getInvoicePdf(id);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="invoice-${id}.pdf"`);
    res.setHeader('Content-Length', pdfBuffer.length);
    res.send(Buffer.from(pdfBuffer));
  }
}
