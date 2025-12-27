import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
    IsDateString,
    IsEmail,
    IsEnum,
    IsOptional,
    IsString,
    IsUUID,
} from 'class-validator';
import { BookingStatus } from '../../../common/enums';

export class CreateBookingDto {
    @ApiProperty({ example: 'John Doe' })
    @IsString()
    clientName: string;

    @ApiPropertyOptional({ example: '+1234567890' })
    @IsString()
    @IsOptional()
    clientPhone?: string;

    @ApiPropertyOptional({ example: 'john@example.com' })
    @IsEmail()
    @IsOptional()
    clientEmail?: string;

    @ApiProperty({ example: '2024-12-31T18:00:00Z' })
    @IsDateString()
    eventDate: string;

    @ApiProperty({ description: 'Service package ID' })
    @IsUUID()
    packageId: string;

    @ApiPropertyOptional()
    @IsString()
    @IsOptional()
    notes?: string;
}

export class UpdateBookingDto {
    @ApiPropertyOptional()
    @IsString()
    @IsOptional()
    clientName?: string;

    @ApiPropertyOptional()
    @IsString()
    @IsOptional()
    clientPhone?: string;

    @ApiPropertyOptional()
    @IsEmail()
    @IsOptional()
    clientEmail?: string;

    @ApiPropertyOptional()
    @IsDateString()
    @IsOptional()
    eventDate?: string;

    @ApiPropertyOptional()
    @IsString()
    @IsOptional()
    notes?: string;

    @ApiPropertyOptional({ enum: BookingStatus })
    @IsEnum(BookingStatus)
    @IsOptional()
    status?: BookingStatus;
}

export class BookingResponseDto {
    @ApiProperty()
    id: string;

    @ApiProperty()
    clientName: string;

    @ApiPropertyOptional()
    clientPhone: string;

    @ApiPropertyOptional()
    clientEmail: string;

    @ApiProperty()
    eventDate: Date;

    @ApiProperty({ enum: BookingStatus })
    status: BookingStatus;

    @ApiProperty()
    totalPrice: number;

    @ApiProperty()
    packageId: string;

    @ApiPropertyOptional()
    notes: string;

    @ApiProperty()
    createdAt: Date;
}

export class ConfirmBookingResponseDto {
    @ApiProperty()
    booking: BookingResponseDto;

    @ApiProperty()
    tasksCreated: number;

    @ApiProperty()
    transactionId: string;
}
