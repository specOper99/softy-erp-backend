import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiParam, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { ApiErrorResponses, CurrentUser, Roles } from '../../../common/decorators';
import { DeleteWithReasonDto } from '../../../common/dto/delete-with-reason.dto';
import { RolesGuard } from '../../../common/guards';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { TasksService } from '../../tasks/services/tasks.service';
import { User } from '../../users/entities/user.entity';
import { Role } from '../../users/enums/role.enum';
import {
  BookingAvailabilityQueryDto,
  BookingAvailabilityResponseDto,
  BookingCursorFilterDto,
  BookingExportFilterDto,
  BookingFilterDto,
  CancelBookingDto,
  ConfirmBookingDto,
  CreateBookingDto,
  MarkBookingPaidDto,
  RecordPaymentDto,
  RefundBookingDto,
  RescheduleBookingDto,
  UpdateBookingDto,
} from '../dto';
import { BookingStatus } from '../enums/booking-status.enum';
import { BookingExportService } from '../services/booking-export.service';
import { BookingsPaymentsService } from '../services/bookings-payments.service';
import { BookingsService } from '../services/bookings.service';

import { BookingWorkflowService } from '../services/booking-workflow.service';

@ApiTags('Bookings')
@ApiBearerAuth()
@ApiErrorResponses(
  'BAD_REQUEST',
  'UNAUTHORIZED',
  'FORBIDDEN',
  'NOT_FOUND',
  'CONFLICT',
  'UNPROCESSABLE_ENTITY',
  'TOO_MANY_REQUESTS',
)
@Controller('bookings')
@UseGuards(JwtAuthGuard, RolesGuard)
export class BookingsController {
  constructor(
    private readonly bookingsService: BookingsService,
    private readonly bookingsPaymentsService: BookingsPaymentsService,
    private readonly bookingWorkflowService: BookingWorkflowService,
    private readonly bookingExportService: BookingExportService,
    private readonly tasksService: TasksService,
  ) {}

  @Post()
  @Roles(Role.ADMIN, Role.OPS_MANAGER)
  @ApiOperation({ summary: 'Create a new booking (DRAFT status)' })
  @ApiBody({ type: CreateBookingDto })
  @ApiResponse({ status: 201, description: 'Booking created successfully' })
  @ApiResponse({ status: 400, description: 'Bad Request - Validation failed' })
  @ApiResponse({ status: 401, description: 'common.unauthorized_plain' })
  @ApiResponse({ status: 403, description: 'Forbidden - Insufficient permissions' })
  create(@Body() dto: CreateBookingDto, @CurrentUser() user: User) {
    if (dto.skipAvailabilityCheck && user.role !== Role.ADMIN) {
      throw new ForbiddenException('booking.skip_availability_admin_only');
    }
    return this.bookingsService.create(dto);
  }

  @Get()
  @Roles(Role.ADMIN, Role.OPS_MANAGER, Role.FIELD_STAFF)
  @ApiOperation({
    summary: 'Get all bookings (Offset Pagination)',
    deprecated: true,
    description: 'Use /bookings/cursor for better performance with large datasets.',
  })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'search', required: false, type: String })
  @ApiQuery({ name: 'status', required: false, enum: BookingStatus, isArray: true })
  @ApiQuery({ name: 'startDate', required: false, type: String })
  @ApiQuery({ name: 'endDate', required: false, type: String })
  @ApiQuery({ name: 'packageId', required: false, type: String })
  @ApiQuery({ name: 'clientId', required: false, type: String })
  @ApiResponse({ status: 200, description: 'Return all bookings' })
  @ApiResponse({ status: 401, description: 'common.unauthorized_plain' })
  @ApiResponse({ status: 403, description: 'Forbidden - Insufficient permissions' })
  findAll(@Query() query: BookingFilterDto, @CurrentUser() user: User) {
    return this.bookingsService.findAll(query, user);
  }

  @Get('cursor')
  @Roles(Role.ADMIN, Role.OPS_MANAGER, Role.FIELD_STAFF)
  @ApiOperation({
    summary: 'Get bookings with cursor pagination',
    description: 'Cursor pagination with same filter capabilities as the offset endpoint.',
  })
  @ApiQuery({ name: 'cursor', required: false, type: String })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'search', required: false, type: String })
  @ApiQuery({ name: 'status', required: false, enum: BookingStatus, isArray: true })
  @ApiQuery({ name: 'startDate', required: false, type: String })
  @ApiQuery({ name: 'endDate', required: false, type: String })
  @ApiQuery({ name: 'packageId', required: false, type: String })
  @ApiQuery({ name: 'clientId', required: false, type: String })
  @ApiResponse({ status: 200, description: 'Return bookings' })
  @ApiResponse({ status: 401, description: 'common.unauthorized_plain' })
  @ApiResponse({ status: 403, description: 'Forbidden - Insufficient permissions' })
  findAllCursor(@Query() query: BookingCursorFilterDto, @CurrentUser() user: User) {
    return this.bookingsService.findAllCursor(query, user);
  }

  @Get('export')
  @Roles(Role.ADMIN, Role.OPS_MANAGER)
  @ApiOperation({ summary: 'Export bookings to CSV (with optional filters)' })
  @ApiQuery({ name: 'search', required: false, type: String })
  @ApiQuery({ name: 'status', required: false, enum: BookingStatus, isArray: true })
  @ApiQuery({ name: 'startDate', required: false, type: String })
  @ApiQuery({ name: 'endDate', required: false, type: String })
  @ApiQuery({ name: 'packageId', required: false, type: String })
  @ApiQuery({ name: 'clientId', required: false, type: String })
  @ApiResponse({ status: 200, description: 'CSV file download' })
  @ApiResponse({ status: 401, description: 'common.unauthorized_plain' })
  @ApiResponse({ status: 403, description: 'Forbidden - Insufficient permissions' })
  exportBookings(@Query() filters: BookingExportFilterDto, @Res() res: Response) {
    return this.bookingExportService.exportBookingsToCSV(res, filters);
  }

  @Get('availability')
  @Roles(Role.ADMIN, Role.OPS_MANAGER)
  @ApiOperation({
    summary: 'Check booking availability with deterministic conflict reasons',
    description:
      'Returns availability verdict for a requested date/time window and includes conflict reasons when unavailable.',
  })
  @ApiQuery({ name: 'packageId', required: true, type: String, description: 'Service package ID' })
  @ApiQuery({ name: 'eventDate', required: true, type: String, description: 'ISO 8601 date' })
  @ApiQuery({ name: 'startTime', required: true, type: String, description: 'HH:mm format' })
  @ApiQuery({ name: 'durationMinutes', required: false, type: Number })
  @ApiQuery({ name: 'excludeBookingId', required: false, type: String })
  @ApiResponse({ status: 200, description: 'Availability check completed', type: BookingAvailabilityResponseDto })
  checkAvailability(@Query() query: BookingAvailabilityQueryDto) {
    return this.bookingsService.checkAvailability(query);
  }

  @Get(':id')
  @Roles(Role.ADMIN, Role.OPS_MANAGER, Role.FIELD_STAFF)
  @ApiOperation({ summary: 'Get booking by ID' })
  @ApiParam({ name: 'id', description: 'Booking UUID' })
  @ApiResponse({ status: 200, description: 'Booking details' })
  @ApiResponse({ status: 401, description: 'common.unauthorized_plain' })
  @ApiResponse({ status: 403, description: 'Forbidden - Insufficient permissions' })
  @ApiResponse({ status: 404, description: 'bookings.not_found' })
  findOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: User) {
    return this.bookingsService.findOne(id, user);
  }

  @Patch(':id')
  @Roles(Role.ADMIN, Role.OPS_MANAGER)
  @ApiOperation({ summary: 'Update booking' })
  @ApiParam({ name: 'id', description: 'Booking UUID' })
  @ApiBody({ type: UpdateBookingDto })
  @ApiResponse({ status: 200, description: 'Booking updated' })
  @ApiResponse({ status: 400, description: 'Bad Request - Validation Error' })
  @ApiResponse({ status: 401, description: 'common.unauthorized_plain' })
  @ApiResponse({ status: 403, description: 'Forbidden - Insufficient permissions' })
  @ApiResponse({ status: 404, description: 'bookings.not_found' })
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateBookingDto, @CurrentUser() user: User) {
    return this.bookingsService.update(id, dto, user);
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Delete booking (only DRAFT, Admin only)' })
  @ApiParam({ name: 'id', description: 'Booking UUID' })
  @ApiResponse({ status: 200, description: 'Booking deleted' })
  @ApiResponse({ status: 400, description: 'Bad Request - Cannot delete non-draft booking' })
  @ApiResponse({ status: 401, description: 'common.unauthorized_plain' })
  @ApiResponse({ status: 403, description: 'Forbidden - Insufficient permissions' })
  @ApiResponse({ status: 404, description: 'bookings.not_found' })
  remove(@Param('id', ParseUUIDPipe) id: string, @Body() dto: DeleteWithReasonDto, @CurrentUser() user: User) {
    return this.bookingsService.remove(id, dto.reason, user);
  }

  @Patch(':id/confirm')
  @Roles(Role.ADMIN, Role.OPS_MANAGER)
  @ApiOperation({
    summary: 'Confirm booking (accept booking request)',
    description:
      'Booking request status is DRAFT. Confirm transitions DRAFT -> CONFIRMED and generates booking tasks in PENDING state.',
  })
  @ApiParam({ name: 'id', description: 'Booking UUID' })
  @ApiBody({ type: ConfirmBookingDto, required: false })
  confirm(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ConfirmBookingDto, @CurrentUser() user: User) {
    if (dto?.skipAvailabilityCheck && user.role !== Role.ADMIN) {
      throw new ForbiddenException('booking.skip_availability_admin_only');
    }
    return this.bookingWorkflowService.confirmBooking(id, dto?.skipAvailabilityCheck ?? false);
  }

  @Patch(':id/reschedule')
  @Roles(Role.ADMIN, Role.OPS_MANAGER)
  @ApiOperation({ summary: 'Reschedule booking date and start time' })
  @ApiParam({ name: 'id', description: 'Booking UUID' })
  @ApiBody({ type: RescheduleBookingDto })
  @ApiResponse({ status: 200, description: 'Booking rescheduled' })
  reschedule(@Param('id', ParseUUIDPipe) id: string, @Body() dto: RescheduleBookingDto, @CurrentUser() user: User) {
    if (dto?.skipAvailabilityCheck && user.role !== Role.ADMIN) {
      throw new ForbiddenException('booking.skip_availability_admin_only');
    }
    return this.bookingWorkflowService.rescheduleBooking(id, dto, dto?.skipAvailabilityCheck ?? false);
  }

  @Get(':id/tasks')
  @Roles(Role.ADMIN, Role.OPS_MANAGER, Role.FIELD_STAFF)
  @ApiOperation({ summary: 'Get tasks for a booking' })
  @ApiParam({ name: 'id', description: 'Booking UUID' })
  @ApiResponse({ status: 200, description: 'Booking tasks returned' })
  @ApiResponse({ status: 404, description: 'bookings.not_found' })
  async getBookingTasks(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: User) {
    await this.bookingsService.findOne(id, user);
    return this.tasksService.findByBooking(id);
  }

  @Patch(':id/cancel')
  @Roles(Role.ADMIN, Role.OPS_MANAGER)
  @ApiOperation({
    summary: 'Cancel booking (request rejection or cancellation)',
    description:
      'Allowed transitions: DRAFT -> CANCELLED and CONFIRMED -> CANCELLED. For booking requests, cancellation from DRAFT is treated as rejection/decline.',
  })
  @ApiParam({ name: 'id', description: 'Booking UUID' })
  @ApiBody({ type: CancelBookingDto })
  @ApiResponse({ status: 200, description: 'Booking cancelled' })
  cancel(@Param('id', ParseUUIDPipe) id: string, @Body() dto: CancelBookingDto) {
    return this.bookingWorkflowService.cancelBooking(id, dto);
  }

  @Patch(':id/reject')
  @Roles(Role.ADMIN, Role.OPS_MANAGER)
  @ApiOperation({
    summary: 'Reject booking request',
    description:
      'Reject is a strict request-level action and only allowed when booking status is DRAFT. Internally this transitions booking to CANCELLED.',
  })
  @ApiParam({ name: 'id', description: 'Booking UUID' })
  @ApiBody({ type: CancelBookingDto })
  @ApiResponse({ status: 200, description: 'Booking request rejected' })
  @ApiResponse({ status: 400, description: 'booking.reject_draft_only' })
  async reject(@Param('id', ParseUUIDPipe) id: string, @Body() dto: CancelBookingDto, @CurrentUser() user: User) {
    const booking = await this.bookingsService.findOne(id, user);
    if (booking.status !== BookingStatus.DRAFT) {
      throw new BadRequestException('booking.reject_draft_only');
    }

    return this.bookingWorkflowService.cancelBooking(id, dto);
  }

  @Patch(':id/complete')
  @Roles(Role.ADMIN, Role.OPS_MANAGER)
  @ApiOperation({ summary: 'Complete booking (all tasks must be done)' })
  @ApiParam({ name: 'id', description: 'Booking UUID' })
  complete(@Param('id', ParseUUIDPipe) id: string) {
    return this.bookingWorkflowService.completeBooking(id);
  }

  @Post(':id/payments')
  @Roles(Role.ADMIN, Role.OPS_MANAGER)
  @ApiOperation({ summary: 'Record a payment for this booking' })
  @ApiParam({ name: 'id', description: 'Booking UUID' })
  @ApiBody({ type: RecordPaymentDto })
  @ApiResponse({ status: 201, description: 'Payment recorded' })
  recordPayment(@Param('id', ParseUUIDPipe) id: string, @Body() dto: RecordPaymentDto, @CurrentUser() user: User) {
    return this.bookingsPaymentsService.recordPayment(id, dto, user);
  }

  @Post(':id/submit-payment')
  @Roles(Role.ADMIN, Role.OPS_MANAGER)
  @ApiOperation({ summary: 'Submit payment (alias of /payments)' })
  @ApiParam({ name: 'id', description: 'Booking UUID' })
  @ApiBody({ type: RecordPaymentDto })
  @ApiResponse({ status: 201, description: 'Payment submitted' })
  submitPayment(@Param('id', ParseUUIDPipe) id: string, @Body() dto: RecordPaymentDto, @CurrentUser() user: User) {
    return this.bookingsPaymentsService.recordPayment(id, dto, user);
  }

  @Patch(':id/mark-paid')
  @Roles(Role.ADMIN, Role.OPS_MANAGER)
  @ApiOperation({ summary: 'Mark booking as fully paid (records remaining balance)' })
  @ApiParam({ name: 'id', description: 'Booking UUID' })
  @ApiBody({ type: MarkBookingPaidDto, required: false })
  @ApiResponse({ status: 200, description: 'Booking marked as paid' })
  @ApiResponse({ status: 400, description: 'Booking is already fully paid' })
  markPaid(@Param('id', ParseUUIDPipe) id: string, @Body() dto: MarkBookingPaidDto = {}, @CurrentUser() user: User) {
    return this.bookingsPaymentsService.markAsPaid(id, dto, user);
  }

  @Post(':id/refunds')
  @Roles(Role.ADMIN, Role.OPS_MANAGER)
  @ApiOperation({ summary: 'Record a refund for this booking' })
  @ApiParam({ name: 'id', description: 'Booking UUID' })
  @ApiBody({ type: RefundBookingDto })
  @ApiResponse({ status: 201, description: 'Refund recorded' })
  @ApiResponse({ status: 400, description: 'Refund exceeds amount paid or invalid booking status' })
  recordRefund(@Param('id', ParseUUIDPipe) id: string, @Body() dto: RefundBookingDto, @CurrentUser() user: User) {
    return this.bookingsPaymentsService.recordRefund(id, dto, user);
  }

  @Get(':id/transactions')
  @Roles(Role.ADMIN, Role.OPS_MANAGER, Role.FIELD_STAFF)
  @ApiOperation({ summary: 'Get financial transactions for this booking' })
  @ApiParam({ name: 'id', description: 'Booking UUID' })
  @ApiResponse({ status: 200, description: 'Booking transactions returned' })
  @ApiResponse({ status: 404, description: 'bookings.not_found' })
  getBookingTransactions(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: User) {
    return this.bookingsPaymentsService.getBookingTransactions(id, user);
  }

  @Post(':id/duplicate')
  @Roles(Role.ADMIN, Role.OPS_MANAGER)
  @ApiOperation({ summary: 'Duplicate booking as a new DRAFT' })
  @ApiParam({ name: 'id', description: 'Booking UUID' })
  @ApiResponse({ status: 201, description: 'Booking duplicated' })
  @ApiResponse({ status: 401, description: 'common.unauthorized_plain' })
  @ApiResponse({ status: 403, description: 'Forbidden - Insufficient permissions' })
  @ApiResponse({ status: 404, description: 'bookings.not_found' })
  duplicate(@Param('id', ParseUUIDPipe) id: string) {
    return this.bookingWorkflowService.duplicateBooking(id);
  }
}
