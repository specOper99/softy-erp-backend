import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';
import { ReviewStatus } from '../enums/review-status.enum';

export class UpdateReviewStatusDto {
  @ApiProperty({ enum: ReviewStatus, description: 'New review status' })
  @IsEnum(ReviewStatus)
  status: ReviewStatus;
}
