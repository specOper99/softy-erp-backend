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
  private static assertSafeIdentifier(value: string, name: 'alias' | 'dateField'): void {
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(value)) {
      throw new Error(`cursor-pagination: unsafe ${name} identifier`);
    }
  }

  static async paginate<T extends EntityWithTimestamps>(
    qb: SelectQueryBuilder<T>,
    options: CursorPaginationOptions<T>,
  ): Promise<CursorPaginationResult<T>> {
    return this.executePagination(qb, options, 'createdAt');
  }

  static async paginateWithCustomDateField<T extends ObjectLiteral & { id: string }, K extends keyof T = keyof T>(
    qb: SelectQueryBuilder<T>,
    options: CursorPaginationOptions<T>,
    dateField: K,
  ): Promise<CursorPaginationResult<T>> {
    return this.executePagination(qb, options, String(dateField));
  }

  private static async executePagination<T extends ObjectLiteral & { id: string }>(
    qb: SelectQueryBuilder<T>,
    options: CursorPaginationOptions<T>,
    dateField: string,
  ): Promise<CursorPaginationResult<T>> {
    const { cursor, limit = 20, alias, filters } = options;

    CursorPaginationHelper.assertSafeIdentifier(alias, 'alias');
    CursorPaginationHelper.assertSafeIdentifier(dateField, 'dateField');

    if (filters) {
      filters(qb);
    }

    qb.orderBy(`${alias}.${dateField}`, 'DESC')
      .addOrderBy(`${alias}.id`, 'DESC')
      .take(limit + 1);

    if (cursor) {
      const { date, id } = decodeCursor(cursor);

      qb.andWhere(`(${alias}.${dateField} < :date OR (${alias}.${dateField} = :date AND ${alias}.id < :id))`, {
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
        const dateValue = (lastItem as Record<string, unknown>)[dateField];
        if (!(dateValue instanceof Date)) {
          throw new Error('cursor-pagination: invalid date field value');
        }
        nextCursor = encodeCursor(dateValue, lastItem.id);
      }
    }

    return {
      data: items,
      nextCursor,
    };
  }
}
