import { Injectable, Logger } from '@nestjs/common';
import { CacheUtilsService } from '../../../common/cache/cache-utils.service';
import { TenantContextService } from '../../../common/services/tenant-context.service';
import { MathUtils } from '../../../common/utils/math.utils';
import { BookingStatus } from '../../bookings/enums/booking-status.enum';
import { BookingRepository } from '../../bookings/repositories/booking.repository';
import { FinancialReportFilterDto } from '../../finance/dto/financial-report.dto';
import { RevenueByPackageEntry, RevenueByPackageRaw, TaxReportRaw } from '../../finance/types/report.types';

@Injectable()
export class AnalyticsService {
  private readonly logger = new Logger(AnalyticsService.name);
  // Cache TTL: 1 hour for financial/analytics reports
  private readonly REPORT_CACHE_TTL = 60 * 60 * 1000;

  constructor(
    private readonly bookingRepository: BookingRepository,
    private readonly cacheUtils: CacheUtilsService,
  ) {}

  private getReportCacheKey(tenantId: string, reportType: string, dateRange: string): string {
    return `analytics:report:${tenantId}:${reportType}:${dateRange}`;
  }

  private parseCount(value: string | number | null | undefined): number {
    const n = typeof value === 'number' ? value : parseInt(String(value ?? ''), 10);
    if (!Number.isFinite(n) || Number.isNaN(n) || n < 0) return 0;
    return Math.min(1_000_000_000, Math.trunc(n));
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
      bookingCount: this.parseCount(r.bookingCount),
      totalRevenue: MathUtils.parseFinancialAmount(r.totalRevenue, 0),
    }));

    // Cache the result
    await this.cacheUtils.set(cacheKey, reportData, this.REPORT_CACHE_TTL);

    return reportData;
  }

  async getTaxReport(startDate: string, endDate: string) {
    const result = await this.bookingRepository
      .createQueryBuilder('b')
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
      totalTax: MathUtils.parseFinancialAmount(result?.totalTax, 0),
      totalSubTotal: MathUtils.parseFinancialAmount(result?.totalSubTotal, 0),
      totalGross: MathUtils.parseFinancialAmount(result?.totalGross, 0),
      startDate,
      endDate,
    };
  }
}
