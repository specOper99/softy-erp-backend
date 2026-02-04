import { ApiProperty } from '@nestjs/swagger';
import { Expose } from 'class-transformer';

export class ReviewResponseDto {
  @ApiProperty()
  @Expose()
  id: string;

  @ApiProperty({ description: 'Rating from 1 to 5' })
  @Expose()
  rating: number;

  @ApiProperty({ description: 'Review comment' })
  @Expose()
  comment: string;

  @ApiProperty({ description: 'Review creation date' })
  @Expose()
  createdAt: Date;

  @ApiProperty({ description: 'Review status', required: false })
  @Expose()
  status?: string;
}
