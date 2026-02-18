import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString, MaxLength } from 'class-validator';
import { SanitizeHtml } from '../../../common/decorators/sanitize-html.decorator';

export class CreateVendorDto {
  @ApiProperty({ example: 'Acme Supplies LLC' })
  @IsString()
  @MaxLength(255)
  @SanitizeHtml()
  name: string;

  @ApiPropertyOptional({ example: 'accounts@acme.test' })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({ example: '+9647500000000' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  @SanitizeHtml()
  phone?: string;

  @ApiPropertyOptional({ example: 'Preferred supplier for printing materials' })
  @IsOptional()
  @IsString()
  @SanitizeHtml()
  notes?: string;
}

export class VendorResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  name: string;

  @ApiPropertyOptional()
  email: string | null;

  @ApiPropertyOptional()
  phone: string | null;

  @ApiPropertyOptional()
  notes: string | null;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}
