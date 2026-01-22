import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsEmail, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { SanitizeHtml } from '../../../common/decorators';

export class CreateClientDto {
  @IsString()
  @IsNotEmpty()
  @SanitizeHtml()
  name: string;

  @IsEmail()
  email: string;

  @IsString()
  @IsNotEmpty()
  phone: string;

  @IsString()
  @IsOptional()
  @SanitizeHtml()
  notes?: string;
}

export class UpdateClientTagsDto {
  @IsArray()
  @IsString({ each: true })
  @MaxLength(50, { each: true })
  @ApiProperty({
    example: ['VIP', 'Wedding', 'Corporate'],
    description: 'Array of tags for client categorization',
  })
  tags: string[];
}

export class UpdateClientDto {
  @IsString()
  @IsOptional()
  @SanitizeHtml()
  @ApiProperty({ required: false, description: 'Client name' })
  name?: string;

  @IsEmail()
  @IsOptional()
  @ApiProperty({ required: false, description: 'Client email address' })
  email?: string;

  @IsString()
  @IsOptional()
  @ApiProperty({ required: false, description: 'Client phone number' })
  phone?: string;

  @IsString()
  @IsOptional()
  @SanitizeHtml()
  @ApiProperty({ required: false, description: 'Notes about the client' })
  notes?: string;

  @IsArray()
  @IsOptional()
  @IsString({ each: true })
  @MaxLength(50, { each: true })
  @ApiProperty({
    required: false,
    example: ['VIP', 'Wedding', 'Corporate'],
    description: 'Array of tags for client categorization',
  })
  tags?: string[];
}
