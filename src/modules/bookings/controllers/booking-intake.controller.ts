import { Body, Controller, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ApiErrorResponses, Roles } from '../../../common/decorators';
import { RolesGuard } from '../../../common/guards';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { Role } from '../../users/enums/role.enum';
import { BookingIntakeDto, BookingIntakeResponseDto } from '../dto/booking-intake.dto';
import { BookingIntakeService } from '../services/booking-intake.service';

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
  intake(@Body() dto: BookingIntakeDto): Promise<BookingIntakeResponseDto> {
    return this.bookingIntakeService.intake(dto);
  }
}
