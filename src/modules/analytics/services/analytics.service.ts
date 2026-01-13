import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CacheUtilsService } from '../../../common/cache/cache-utils.service';
import { TenantContextService } from '../../../common/services/tenant-context.service';
import { Booking } from '../../bookings/entities/booking.entity';
import { BookingStatus } from '../../bookings/enums/booking-status.enum';
import { FinancialReportFilterDto } from '../../finance/dto/financial-report.dto';
import { RevenueByPackageEntry, RevenueByPackageRaw, TaxReportRaw } from '../../finance/types/report.types';

@Injectable()
export class AnalyticsService {
  private readonly logger = new Logger(AnalyticsService.name);
  // Cache TTL: 1 hour for financial/analytics reports
  private readonly REPORT_CACHE_TTL = 60 * 60 * 1000;

  constructor(
    @InjectRepository(Booking)
    private readonly bookingRepository: Repository<Booking>,
    private readonly cacheUtils: CacheUtilsService,
  ) {}

  private getReportCacheKey(tenantId: string, reportType: string, dateRange: string): string {
    return `analytics:report:${tenantId}:${reportType}:${dateRange}`;
  }

  async getRevenueByPackage(filter: FinancialReportFilterDto, nocache = false) {
    const tenantId = TenantContextService.getTenantIdOrThrow();

    const dateRange = `${filter.startDate}_${filter.endDate}`;
    const cacheKey = this.getReportCacheKey(tenantId, 'revenue-by-package', dateRange);

    // Try cache first
    if (!nocache) {
      const cached = await this.cacheUtils.get<Array<RevenueByPackageEntry>>(cacheKey);
      if (cached) return cached;
    }

    const result = await this.bookingRepository
      .createQueryBuilder('b')
      .leftJoin('b.servicePackage', 'pkg')
      .where('b.tenantId = :tenantId', { tenantId })
      .andWhere('b.eventDate >= :startDate', { startDate: filter.startDate })
      .andWhere('b.eventDate <= :endDate', { endDate: filter.endDate })
      .andWhere('b.status IN (:...statuses)', {
        statuses: [BookingStatus.CONFIRMED, BookingStatus.COMPLETED],
      })
      .select('pkg.name', 'packageName')
      .addSelect('COUNT(b.id)', 'bookingCount')
      .addSelect('SUM(b.totalPrice)', 'totalRevenue')
      .groupBy('pkg.name')
      .orderBy('"totalRevenue"', 'DESC')
      .getRawMany<RevenueByPackageRaw>();

    const reportData: RevenueByPackageEntry[] = result.map((r) => ({
      packageName: r.packageName || 'Unknown',
      bookingCount: Number(r.bookingCount),
      totalRevenue: Number(r.totalRevenue),
    }));

    // Cache the result
    await this.cacheUtils.set(cacheKey, reportData, this.REPORT_CACHE_TTL);

    return reportData;
  }

  async getTaxReport(startDate: string, endDate: string) {
    const tenantId = TenantContextService.getTenantIdOrThrow();

    const result = await this.bookingRepository
      .createQueryBuilder('b')
      .where('b.tenantId = :tenantId', { tenantId })
      .andWhere('b.eventDate >= :startDate', { startDate })
      .andWhere('b.eventDate <= :endDate', { endDate })
      .andWhere('b.status IN (:...statuses)', {
        statuses: [BookingStatus.CONFIRMED, BookingStatus.COMPLETED],
      })
      .select('SUM(CAST(b.tax_amount AS DECIMAL))', 'totalTax')
      .addSelect('SUM(CAST(b.sub_total AS DECIMAL))', 'totalSubTotal')
      .addSelect('SUM(CAST(b.total_price AS DECIMAL))', 'totalGross')
      .getRawOne<TaxReportRaw>();

    return {
      totalTax: Number(result?.totalTax ?? 0),
      totalSubTotal: Number(result?.totalSubTotal ?? 0),
      totalGross: Number(result?.totalGross ?? 0),
      startDate,
      endDate,
    };
  }
}
