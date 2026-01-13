import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsNumber, IsString, ValidateNested } from 'class-validator';

export class WidgetConfigDto {
  @IsString()
  @ApiProperty()
  id: string;

  @IsBoolean()
  @ApiProperty()
  isVisible: boolean;

  @IsNumber()
  @ApiProperty()
  order: number;
}

export class UpdateDashboardPreferencesDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => WidgetConfigDto)
  @ApiProperty({ type: [WidgetConfigDto] })
  widgets: WidgetConfigDto[];
}
