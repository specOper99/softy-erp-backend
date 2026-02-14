import { SelectQueryBuilder } from 'typeorm';
import { Booking } from '../../modules/bookings/entities/booking.entity';
import { PackageItem } from '../../modules/catalog/entities/package-item.entity';
import { Task } from '../../modules/tasks/entities/task.entity';

/**
 * Shared query builder patterns for Booking entities.
 * Reduces duplication across BookingsService, TasksService, and ReportsService.
 */
export class BookingQueryHelper {
  /**
   * Applies standard booking relations (client, package, tasks, assigned users).
   * Use this for most booking queries that need full context.
   */
  static withStandardRelations(qb: SelectQueryBuilder<Booking>, alias = 'booking'): SelectQueryBuilder<Booking> {
    return qb
      .leftJoinAndSelect(`${alias}.client`, 'client')
      .leftJoinAndSelect(`${alias}.servicePackage`, 'servicePackage')
      .leftJoinAndSelect(Task, 'tasks', `tasks.bookingId = ${alias}.id AND tasks.tenantId = ${alias}.tenantId`)
      .leftJoinAndSelect('tasks.assignedUser', 'taskAssignedUser');
  }

  /**
   * Applies minimal relations (client and package only).
   * Use for list views and performance-sensitive queries.
   */
  static withMinimalRelations(qb: SelectQueryBuilder<Booking>, alias = 'booking'): SelectQueryBuilder<Booking> {
    return qb
      .leftJoinAndSelect(`${alias}.client`, 'client')
      .leftJoinAndSelect(`${alias}.servicePackage`, 'servicePackage');
  }

  /**
   * Applies extended relations (includes package items and task types).
   * Use for detailed views, exports, and reports.
   */
  static withExtendedRelations(qb: SelectQueryBuilder<Booking>, alias = 'booking'): SelectQueryBuilder<Booking> {
    return BookingQueryHelper.withStandardRelations(qb, alias)
      .leftJoinAndMapMany(
        'servicePackage.packageItems',
        PackageItem,
        'packageItems',
        'packageItems.packageId = servicePackage.id AND packageItems.tenantId = servicePackage.tenantId',
      )
      .leftJoinAndSelect('packageItems.taskType', 'packageTaskType')
      .leftJoinAndSelect('tasks.taskType', 'taskType');
  }

  /**
   * Applies tenant filtering.
   * This is automatically handled by TenantAwareRepository for most cases,
   * but useful when using custom query builders or DataSource.createQueryBuilder.
   */
  static filterByTenant(
    qb: SelectQueryBuilder<Booking>,
    tenantId: string,
    alias = 'booking',
  ): SelectQueryBuilder<Booking> {
    return qb.where(`${alias}.tenantId = :tenantId`, { tenantId });
  }

  /**
   * Applies status filtering (single status).
   */
  static filterByStatus(
    qb: SelectQueryBuilder<Booking>,
    status: string,
    alias = 'booking',
  ): SelectQueryBuilder<Booking> {
    return qb.andWhere(`${alias}.status = :status`, { status });
  }

  /**
   * Applies status filtering (multiple statuses).
   */
  static filterByStatuses(
    qb: SelectQueryBuilder<Booking>,
    statuses: string[],
    alias = 'booking',
  ): SelectQueryBuilder<Booking> {
    return qb.andWhere(`${alias}.status IN (:...statuses)`, { statuses });
  }

  /**
   * Applies date range filtering.
   */
  static filterByDateRange(
    qb: SelectQueryBuilder<Booking>,
    startDate?: Date,
    endDate?: Date,
    alias = 'booking',
  ): SelectQueryBuilder<Booking> {
    if (startDate) {
      qb.andWhere(`${alias}.eventDate >= :startDate`, { startDate });
    }
    if (endDate) {
      qb.andWhere(`${alias}.eventDate <= :endDate`, { endDate });
    }
    return qb;
  }

  /**
   * Applies search filtering (client name or booking ID).
   */
  static search(qb: SelectQueryBuilder<Booking>, searchTerm: string, alias = 'booking'): SelectQueryBuilder<Booking> {
    return qb.andWhere(`(LOWER(client.name) LIKE LOWER(:search) OR LOWER(${alias}.id) LIKE LOWER(:search))`, {
      search: `%${searchTerm}%`,
    });
  }
}
