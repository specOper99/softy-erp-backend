import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Query, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../../common/decorators/roles.decorator';
import { PaginationDto } from '../../../common/dto/pagination.dto';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { TenantContextService } from '../../../common/services/tenant-context.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { Role } from '../../users/enums/role.enum';
import { UpdateReviewStatusDto } from '../dto/update-review-status.dto';
import { Review } from '../entities/review.entity';
import { ReviewStatus } from '../enums/review-status.enum';
import { ReviewsService } from '../services/reviews.service';

@ApiTags('Reviews')
@Controller('reviews')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ReviewsController {
  constructor(private readonly reviewsService: ReviewsService) {}

  @Get()
  @ApiOperation({ summary: 'Get all reviews with filters (Admin only)' })
  @ApiQuery({ name: 'status', enum: ReviewStatus, required: false })
  @ApiQuery({ name: 'packageId', required: false })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @Roles(Role.ADMIN, Role.OPS_MANAGER)
  async findAll(
    @Query('status') status?: ReviewStatus,
    @Query('packageId') packageId?: string,
    @Query() pagination: PaginationDto = new PaginationDto(),
  ): Promise<{ data: Review[]; total: number; page: number; limit: number }> {
    const tenantId = TenantContextService.getTenantIdOrThrow();
    const [data, total] = await this.reviewsService.findAll(tenantId, { status, packageId }, pagination);

    return {
      data,
      total,
      page: pagination.page ?? 1,
      limit: pagination.limit ?? 10,
    };
  }

  @Patch(':id/status')
  @ApiOperation({ summary: 'Update review status (Admin only)' })
  @Roles(Role.ADMIN)
  async updateStatus(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateReviewStatusDto): Promise<Review> {
    const tenantId = TenantContextService.getTenantIdOrThrow();
    return this.reviewsService.updateStatus(tenantId, id, dto);
  }
}
