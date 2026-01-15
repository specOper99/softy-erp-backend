import { ObjectLiteral, SelectQueryBuilder } from 'typeorm';
import { decodeCursor, encodeCursor } from './cursor.utils';

export interface EntityWithTimestamps {
  createdAt: Date;
  id: string;
}

export interface CursorPaginationOptions<T extends ObjectLiteral> {
  cursor?: string;
  limit?: number;
  alias: string;
  filters?: (qb: SelectQueryBuilder<T>) => void;
}

export interface CursorPaginationResult<T> {
  data: T[];
  nextCursor: string | null;
}

export class CursorPaginationHelper {
  static async paginate<T extends EntityWithTimestamps>(
    qb: SelectQueryBuilder<T>,
    options: CursorPaginationOptions<T>,
  ): Promise<CursorPaginationResult<T>> {
    const { cursor, limit = 20, alias, filters } = options;

    if (filters) {
      filters(qb);
    }

    qb.orderBy(`${alias}.createdAt`, 'DESC')
      .addOrderBy(`${alias}.id`, 'DESC')
      .take(limit + 1);

    if (cursor) {
      const { date, id } = decodeCursor(cursor);

      qb.andWhere(`(${alias}.createdAt < :date OR (${alias}.createdAt = :date AND ${alias}.id < :id))`, { date, id });
    }

    const items = await qb.getMany();

    let nextCursor: string | null = null;

    if (items.length > limit) {
      items.pop();
      const lastItem = items[items.length - 1];
      if (lastItem) {
        nextCursor = encodeCursor(lastItem.createdAt, lastItem.id);
      }
    }

    return {
      data: items,
      nextCursor,
    };
  }

  static async paginateWithCustomDateField<T extends ObjectLiteral & { id: string }, K extends keyof T = keyof T>(
    qb: SelectQueryBuilder<T>,
    options: CursorPaginationOptions<T>,
    dateField: K,
  ): Promise<CursorPaginationResult<T>> {
    const { cursor, limit = 20, alias, filters } = options;

    if (filters) {
      filters(qb);
    }

    // Cast to string for TypeORM builder methods which expect string paths
    const dateFieldStr = String(dateField);

    qb.orderBy(`${alias}.${dateFieldStr}`, 'DESC')
      .addOrderBy(`${alias}.id`, 'DESC')
      .take(limit + 1);

    if (cursor) {
      const { date, id } = decodeCursor(cursor);

      qb.andWhere(`(${alias}.${dateFieldStr} < :date OR (${alias}.${dateFieldStr} = :date AND ${alias}.id < :id))`, {
        date,
        id,
      });
    }

    const items = await qb.getMany();

    let nextCursor: string | null = null;

    if (items.length > limit) {
      items.pop();
      const lastItem = items[items.length - 1];
      if (lastItem) {
        const dateValue = lastItem[dateField];
        // Ensure dateValue is treated as Date.
        // If K points to a non-Date field, this runtime cast is risky but required for the helper's contract.
        // Ideally T[K] should extend Date, but enforcing that in TypeORM entities is hard.
        nextCursor = encodeCursor(dateValue as unknown as Date, lastItem.id);
      }
    }

    return {
      data: items,
      nextCursor,
    };
  }
}
