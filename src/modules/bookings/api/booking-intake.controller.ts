import { Body, Controller, ForbiddenException, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ApiErrorResponses, CurrentUser, Roles } from '../../../common/decorators';
import { RolesGuard } from '../../../common/guards';
import { JwtAuthGuard } from '../../auth/infrastructure/guards/jwt-auth.guard';
import { User } from '../../users/domain/entities/user.entity';
import { Role } from '../../users/domain/enums/role.enum';
import { BookingIntakeDto, BookingIntakeResponseDto } from './dto/booking-intake.dto';
import { BookingIntakeService } from '../application/booking-intake.service';

@ApiTags('Bookings')
@ApiBearerAuth()
@ApiErrorResponses('BAD_REQUEST', 'UNAUTHORIZED', 'FORBIDDEN', 'NOT_FOUND', 'CONFLICT', 'INTERNAL_SERVER_ERROR')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('bookings/intake')
export class BookingIntakeController {
  constructor(private readonly bookingIntakeService: BookingIntakeService) {}

  @Post()
  @Roles(Role.ADMIN, Role.OPS_MANAGER)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Booking intake wizard',
    description:
      'Atomically creates or selects a client, creates a booking, and optionally records a deposit — ' +
      'all in a single database transaction. If any step fails the entire operation is rolled back.',
  })
  @ApiResponse({ status: 201, type: BookingIntakeResponseDto })
  intake(@Body() dto: BookingIntakeDto, @CurrentUser() user: User): Promise<BookingIntakeResponseDto> {
    if (dto.skipAvailabilityCheck && user.role !== Role.ADMIN) {
      throw new ForbiddenException('booking.skip_availability_admin_only');
    }
    return this.bookingIntakeService.intake(dto);
  }
}
