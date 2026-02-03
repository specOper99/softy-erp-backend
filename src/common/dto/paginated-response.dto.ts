import { ApiProperty } from '@nestjs/swagger';

export class PaginationMetaDto {
  @ApiProperty({ description: 'Current page number (1-indexed)' })
  page: number;

  @ApiProperty({ description: 'Number of items per page' })
  pageSize: number;

  @ApiProperty({ description: 'Total number of items' })
  totalItems: number;

  @ApiProperty({ description: 'Total number of pages' })
  totalPages: number;

  @ApiProperty({ description: 'Whether there is a next page' })
  hasNextPage: boolean;

  @ApiProperty({ description: 'Whether there is a previous page' })
  hasPreviousPage: boolean;
}

export class CursorPaginationMetaDto {
  @ApiProperty({ description: 'Cursor for the next page', nullable: true })
  nextCursor: string | null;

  @ApiProperty({ description: 'Cursor for the previous page', nullable: true })
  prevCursor: string | null;

  @ApiProperty({ description: 'Whether there is a next page' })
  hasNextPage: boolean;

  @ApiProperty({ description: 'Whether there is a previous page' })
  hasPreviousPage: boolean;

  @ApiProperty({ description: 'Number of items in current page' })
  count: number;
}

export class PaginatedResponseDto<T> {
  @ApiProperty({ description: 'Array of items', isArray: true })
  data: T[];

  @ApiProperty({ type: PaginationMetaDto })
  meta: PaginationMetaDto;
}

export class CursorPaginatedResponseDto<T> {
  @ApiProperty({ description: 'Array of items', isArray: true })
  data: T[];

  @ApiProperty({ type: CursorPaginationMetaDto })
  meta: CursorPaginationMetaDto;
}

export function createPaginatedResponse<T>(
  data: T[],
  total: number,
  page: number,
  pageSize: number,
): PaginatedResponseDto<T> {
  const totalPages = Math.ceil(total / pageSize);
  return {
    data,
    meta: {
      page,
      pageSize,
      totalItems: total,
      totalPages,
      hasNextPage: page < totalPages,
      hasPreviousPage: page > 1,
    },
  };
}

export function createCursorPaginatedResponse<T>(
  data: T[],
  nextCursor: string | null,
  prevCursor: string | null,
): CursorPaginatedResponseDto<T> {
  return {
    data,
    meta: {
      nextCursor,
      prevCursor,
      hasNextPage: nextCursor !== null,
      hasPreviousPage: prevCursor !== null,
      count: data.length,
    },
  };
}
