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
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { Roles } from '../../../common/decorators';
import { CursorPaginationDto } from '../../../common/dto/cursor-pagination.dto';
import { RolesGuard } from '../../../common/guards';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { Role } from '../../users/enums/role.enum';
import {
  BookingFilterDto,
  CancelBookingDto,
  CreateBookingDto,
  RecordPaymentDto,
  UpdateBookingDto,
} from '../dto';
import { BookingExportService } from '../services/booking-export.service';
import { BookingsService } from '../services/bookings.service';

import { BookingWorkflowService } from '../services/booking-workflow.service';

@ApiTags('Bookings')
@ApiBearerAuth()
@Controller('bookings')
@UseGuards(JwtAuthGuard, RolesGuard)
export class BookingsController {
  constructor(
    private readonly bookingsService: BookingsService,
    private readonly bookingWorkflowService: BookingWorkflowService,
    private readonly bookingExportService: BookingExportService,
  ) {}

  @Post()
  @Roles(Role.ADMIN, Role.OPS_MANAGER)
  @ApiOperation({ summary: 'Create a new booking (DRAFT status)' })
  create(@Body() dto: CreateBookingDto) {
    return this.bookingsService.create(dto);
  }

  @Get()
  @Roles(Role.ADMIN, Role.OPS_MANAGER, Role.FIELD_STAFF)
  @ApiOperation({ summary: 'Get all bookings' })
  findAll(@Query() query: BookingFilterDto) {
    return this.bookingsService.findAll(query);
  }

  @Get('cursor')
  @Roles(Role.ADMIN, Role.OPS_MANAGER, Role.FIELD_STAFF)
  @ApiOperation({ summary: 'Get bookings with cursor pagination' })
  findAllCursor(@Query() query: CursorPaginationDto) {
    return this.bookingsService.findAllCursor(query);
  }

  @Get('export')
  @Roles(Role.ADMIN, Role.OPS_MANAGER)
  @ApiOperation({ summary: 'Export bookings to CSV' })
  exportBookings(@Res() res: Response) {
    return this.bookingExportService.exportBookingsToCSV(res);
  }

  @Get(':id')
  @Roles(Role.ADMIN, Role.OPS_MANAGER, Role.FIELD_STAFF)
  @ApiOperation({ summary: 'Get booking by ID' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.bookingsService.findOne(id);
  }

  @Patch(':id')
  @Roles(Role.ADMIN, Role.OPS_MANAGER)
  @ApiOperation({ summary: 'Update booking' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateBookingDto,
  ) {
    return this.bookingsService.update(id, dto);
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Delete booking (only DRAFT, Admin only)' })
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.bookingsService.remove(id);
  }

  @Patch(':id/confirm')
  @Roles(Role.ADMIN, Role.OPS_MANAGER)
  @ApiOperation({
    summary: 'Confirm booking (generates tasks and records income)',
  })
  confirm(@Param('id', ParseUUIDPipe) id: string) {
    return this.bookingWorkflowService.confirmBooking(id);
  }

  @Patch(':id/cancel')
  @Roles(Role.ADMIN, Role.OPS_MANAGER)
  @ApiOperation({ summary: 'Cancel booking with automatic refund calculation' })
  cancel(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CancelBookingDto,
  ) {
    return this.bookingWorkflowService.cancelBooking(id, dto);
  }

  @Patch(':id/complete')
  @Roles(Role.ADMIN, Role.OPS_MANAGER)
  @ApiOperation({ summary: 'Complete booking (all tasks must be done)' })
  complete(@Param('id', ParseUUIDPipe) id: string) {
    return this.bookingWorkflowService.completeBooking(id);
  }

  @Post(':id/payments')
  @Roles(Role.ADMIN, Role.OPS_MANAGER)
  @ApiOperation({ summary: 'Record a payment for this booking' })
  recordPayment(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RecordPaymentDto,
  ) {
    return this.bookingsService.recordPayment(id, dto);
  }

  @Post(':id/duplicate')
  @Roles(Role.ADMIN, Role.OPS_MANAGER)
  @ApiOperation({ summary: 'Duplicate booking as a new DRAFT' })
  duplicate(@Param('id', ParseUUIDPipe) id: string) {
    return this.bookingWorkflowService.duplicateBooking(id);
  }
}
