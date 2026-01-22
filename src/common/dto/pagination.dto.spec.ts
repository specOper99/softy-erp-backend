import 'reflect-metadata';

import { PaginationDto } from './pagination.dto';

describe('PaginationDto', () => {
  describe('getSkip()', () => {
    it('should return 0 by default', () => {
      const dto = new PaginationDto();
      expect(dto.getSkip()).toBe(0);
    });

    it('should return explicit skip value', () => {
      const dto = new PaginationDto();
      dto.skip = 10;
      expect(dto.getSkip()).toBe(10);
    });

    it('should calculate skip from page and limit', () => {
      const dto = new PaginationDto();
      dto.page = 2;
      dto.limit = 10;
      expect(dto.getSkip()).toBe(10);
    });

    it('should calculate skip from page and take when limit not provided', () => {
      const dto = new PaginationDto();
      dto.page = 3;
      dto.take = 20;
      expect(dto.getSkip()).toBe(40);
    });

    it('should use default 20 when page provided without limit or take', () => {
      const dto = new PaginationDto();
      dto.page = 2;
      expect(dto.getSkip()).toBe(20);
    });

    it('should return 0 for page 1', () => {
      const dto = new PaginationDto();
      dto.page = 1;
      dto.limit = 50;
      expect(dto.getSkip()).toBe(0);
    });

    it('should return 0 for negative page (clamped by Math.max)', () => {
      const dto = new PaginationDto();
      dto.page = -1;
      dto.limit = 10;
      expect(dto.getSkip()).toBe(0);
    });
    it('should return 0 when skip is NaN', () => {
      const dto = new PaginationDto();
      dto.skip = NaN;
      expect(dto.getSkip()).toBe(0);
    });
  });

  describe('getTake()', () => {
    it('should return 20 by default', () => {
      const dto = new PaginationDto();
      expect(dto.getTake()).toBe(20);
    });

    it('should return explicit take value', () => {
      const dto = new PaginationDto();
      dto.take = 50;
      expect(dto.getTake()).toBe(50);
    });

    it('should prefer limit over take', () => {
      const dto = new PaginationDto();
      dto.take = 30;
      dto.limit = 40;
      expect(dto.getTake()).toBe(40);
    });

    it('should clamp to max 100', () => {
      const dto = new PaginationDto();
      dto.take = 200;
      expect(dto.getTake()).toBe(100);
    });

    it('should clamp limit to max 100', () => {
      const dto = new PaginationDto();
      dto.limit = 200;
      expect(dto.getTake()).toBe(100);
    });

    it('should clamp to min 1', () => {
      const dto = new PaginationDto();
      dto.take = 0;
      expect(dto.getTake()).toBe(1);
    });

    it('should clamp negative values to 1', () => {
      const dto = new PaginationDto();
      dto.take = -10;
      expect(dto.getTake()).toBe(1);
    });
    it('should return default when take is NaN', () => {
      const dto = new PaginationDto();
      dto.take = NaN;
      expect(dto.getTake()).toBe(20);
    });
  });

  describe('integration tests', () => {
    it('should handle page=1, limit=10 correctly', () => {
      const dto = new PaginationDto();
      dto.page = 1;
      dto.limit = 10;
      expect(dto.getSkip()).toBe(0);
      expect(dto.getTake()).toBe(10);
    });

    it('should handle page=3, take=50 correctly', () => {
      const dto = new PaginationDto();
      dto.page = 3;
      dto.take = 50;
      expect(dto.getSkip()).toBe(100);
      expect(dto.getTake()).toBe(50);
    });

    it('should handle default values correctly', () => {
      const dto = new PaginationDto();
      expect(dto.getSkip()).toBe(0);
      expect(dto.getTake()).toBe(20);
    });
  });
});
