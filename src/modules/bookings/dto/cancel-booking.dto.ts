import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';
import { BookingResponseDto } from './booking.dto';

export class CancelBookingDto {
  @ApiPropertyOptional({ description: 'Reason for cancellation' })
  @IsOptional()
  @IsString()
  reason?: string;
}

export class CancelBookingResponseDto {
  @ApiProperty({ description: 'The cancelled booking' })
  booking: BookingResponseDto;

  @ApiProperty({ description: 'Refund amount calculated' })
  refundAmount: number;

  @ApiProperty({ description: 'Refund percentage applied' })
  refundPercentage: number;

  @ApiProperty({ description: 'Days before event when cancelled' })
  daysBeforeEvent: number;
}
