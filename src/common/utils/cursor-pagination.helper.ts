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

      qb.andWhere(
        `(${alias}.createdAt < :date OR (${alias}.createdAt = :date AND ${alias}.id < :id))`,
        { date, id },
      );
    }

    const items = await qb.getMany();

    let nextCursor: string | null = null;

    if (items.length > limit) {
      items.pop();
      const lastItem = items[items.length - 1];
      nextCursor = encodeCursor(lastItem.createdAt, lastItem.id);
    }

    return {
      data: items,
      nextCursor,
    };
  }

  static async paginateWithCustomDateField<
    T extends ObjectLiteral & { id: string },
  >(
    qb: SelectQueryBuilder<T>,
    options: CursorPaginationOptions<T>,
    dateField: string = 'createdAt',
  ): Promise<CursorPaginationResult<T>> {
    const { cursor, limit = 20, alias, filters } = options;

    if (filters) {
      filters(qb);
    }

    qb.orderBy(`${alias}.${dateField}`, 'DESC')
      .addOrderBy(`${alias}.id`, 'DESC')
      .take(limit + 1);

    if (cursor) {
      const { date, id } = decodeCursor(cursor);

      qb.andWhere(
        `(${alias}.${dateField} < :date OR (${alias}.${dateField} = :date AND ${alias}.id < :id))`,
        { date, id },
      );
    }

    const items = await qb.getMany();

    let nextCursor: string | null = null;

    if (items.length > limit) {
      items.pop();
      const lastItem = items[items.length - 1];
      const dateValue = lastItem[dateField as keyof T];
      nextCursor = encodeCursor(dateValue as Date, lastItem.id);
    }

    return {
      data: items,
      nextCursor,
    };
  }
}
