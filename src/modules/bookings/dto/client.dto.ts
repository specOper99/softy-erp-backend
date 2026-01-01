import { IsEmail, IsNotEmpty, IsOptional, IsString } from 'class-validator';
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
