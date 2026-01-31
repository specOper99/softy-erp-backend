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
import { ApiBearerAuth, ApiBody, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { CurrentUser, Roles } from '../../../common/decorators';
import { CursorPaginationDto } from '../../../common/dto/cursor-pagination.dto';
import { RolesGuard } from '../../../common/guards';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { User } from '../../users/entities/user.entity';
import { Role } from '../../users/enums/role.enum';
import { BookingFilterDto, CancelBookingDto, CreateBookingDto, RecordPaymentDto, UpdateBookingDto } from '../dto';
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
  @ApiBody({ type: CreateBookingDto })
  @ApiResponse({ status: 201, description: 'Booking created successfully' })
  @ApiResponse({ status: 400, description: 'Bad Request - Validation failed' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - Insufficient permissions' })
  create(@Body() dto: CreateBookingDto) {
    return this.bookingsService.create(dto);
  }

  @Get()
  @Roles(Role.ADMIN, Role.OPS_MANAGER, Role.FIELD_STAFF)
  @ApiOperation({
    summary: 'Get all bookings (Offset Pagination)',
    deprecated: true,
    description: 'Use /bookings/cursor for better performance with large datasets.',
  })
  @ApiResponse({ status: 200, description: 'Return all bookings' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - Insufficient permissions' })
  findAll(@Query() query: BookingFilterDto, @CurrentUser() user: User) {
    return this.bookingsService.findAll(query, user);
  }

  @Get('cursor')
  @Roles(Role.ADMIN, Role.OPS_MANAGER, Role.FIELD_STAFF)
  @ApiOperation({ summary: 'Get bookings with cursor pagination' })
  @ApiResponse({ status: 200, description: 'Return bookings' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - Insufficient permissions' })
  findAllCursor(@Query() query: CursorPaginationDto, @CurrentUser() user: User) {
    return this.bookingsService.findAllCursor(query, user);
  }

  @Get('export')
  @Roles(Role.ADMIN, Role.OPS_MANAGER)
  @ApiOperation({ summary: 'Export bookings to CSV' })
  @ApiResponse({ status: 200, description: 'CSV file download' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - Insufficient permissions' })
  exportBookings(@Res() res: Response) {
    return this.bookingExportService.exportBookingsToCSV(res);
  }

  @Get(':id')
  @Roles(Role.ADMIN, Role.OPS_MANAGER, Role.FIELD_STAFF)
  @ApiOperation({ summary: 'Get booking by ID' })
  @ApiResponse({ status: 200, description: 'Booking details' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - Insufficient permissions' })
  @ApiResponse({ status: 404, description: 'Booking not found' })
  findOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: User) {
    return this.bookingsService.findOne(id, user);
  }

  @Patch(':id')
  @Roles(Role.ADMIN, Role.OPS_MANAGER)
  @ApiOperation({ summary: 'Update booking' })
  @ApiBody({ type: UpdateBookingDto })
  @ApiResponse({ status: 200, description: 'Booking updated' })
  @ApiResponse({ status: 400, description: 'Bad Request - Validation Error' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - Insufficient permissions' })
  @ApiResponse({ status: 404, description: 'Booking not found' })
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateBookingDto) {
    return this.bookingsService.update(id, dto);
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Delete booking (only DRAFT, Admin only)' })
  @ApiResponse({ status: 200, description: 'Booking deleted' })
  @ApiResponse({ status: 400, description: 'Bad Request - Cannot delete non-draft booking' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - Insufficient permissions' })
  @ApiResponse({ status: 404, description: 'Booking not found' })
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
  @ApiBody({ type: CancelBookingDto })
  @ApiResponse({ status: 200, description: 'Booking cancelled' })
  cancel(@Param('id', ParseUUIDPipe) id: string, @Body() dto: CancelBookingDto) {
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
  @ApiBody({ type: RecordPaymentDto })
  @ApiResponse({ status: 201, description: 'Payment recorded' })
  recordPayment(@Param('id', ParseUUIDPipe) id: string, @Body() dto: RecordPaymentDto) {
    return this.bookingsService.recordPayment(id, dto);
  }

  @Post(':id/duplicate')
  @Roles(Role.ADMIN, Role.OPS_MANAGER)
  @ApiOperation({ summary: 'Duplicate booking as a new DRAFT' })
  @ApiResponse({ status: 201, description: 'Booking duplicated' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - Insufficient permissions' })
  @ApiResponse({ status: 404, description: 'Booking not found' })
  duplicate(@Param('id', ParseUUIDPipe) id: string) {
    return this.bookingWorkflowService.duplicateBooking(id);
  }
}
