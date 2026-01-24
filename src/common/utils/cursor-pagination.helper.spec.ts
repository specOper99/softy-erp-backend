import { SelectQueryBuilder } from 'typeorm';
import { CursorPaginationHelper } from './cursor-pagination.helper';

describe('CursorPaginationHelper', () => {
  describe('paginate', () => {
    let qb: SelectQueryBuilder<any>;

    beforeEach(() => {
      qb = {
        orderBy: jest.fn().mockReturnThis(),
        addOrderBy: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getMany: jest.fn(),
      } as unknown as SelectQueryBuilder<any>;
    });

    interface TestEntity {
      id: string;
      createdAt: Date;
    }

    it('should cap limit at 100 (defense-in-depth)', async () => {
      (qb.getMany as jest.Mock).mockResolvedValue([]);

      await CursorPaginationHelper.paginate<TestEntity>(qb, { alias: 'e', limit: 1000 });

      // helper uses take(limit + 1) to determine nextCursor
      expect(qb.take).toHaveBeenCalledWith(101);
    });

    it('should enforce minimum limit of 1 (defense-in-depth)', async () => {
      (qb.getMany as jest.Mock).mockResolvedValue([]);

      await CursorPaginationHelper.paginate<TestEntity>(qb, { alias: 'e', limit: 0 });

      expect(qb.take).toHaveBeenCalledWith(2);
    });
  });

  describe('paginateWithCustomDateField', () => {
    let qb: SelectQueryBuilder<any>;

    beforeEach(() => {
      qb = {
        orderBy: jest.fn().mockReturnThis(),
        addOrderBy: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getMany: jest.fn(),
      } as unknown as SelectQueryBuilder<any>;
    });

    interface TestEntity {
      id: string;
      createdAt: Date;
      customDate: Date;
    }

    it('should allow valid keys of T', async () => {
      (qb.getMany as jest.Mock).mockResolvedValue([]);

      // Should compile fine
      await CursorPaginationHelper.paginateWithCustomDateField<TestEntity>(qb, { alias: 'e' }, 'customDate');

      expect(qb.orderBy).toHaveBeenCalledWith('e.customDate', 'DESC');
    });

    // Note: We cannot easily test compile-time errors in runtime tests,
    // but the type-check step in CI will catch invalid keys.
  });
});
