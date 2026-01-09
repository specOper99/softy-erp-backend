import { BadRequestException } from '@nestjs/common';

export interface CursorData {
  date: Date;
  id: string;
}

export function decodeCursor(cursor: string): CursorData {
  try {
    const decoded = Buffer.from(cursor, 'base64').toString('utf-8');
    const parts = decoded.split('|');
    if (parts.length !== 2) {
      throw new BadRequestException('Invalid cursor format');
    }
    const [dateStr, id] = parts;
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) {
      throw new BadRequestException('Invalid cursor date');
    }
    if (!id || id.trim().length === 0) {
      throw new BadRequestException('Invalid cursor id');
    }
    return { date, id };
  } catch (error) {
    if (error instanceof BadRequestException) {
      throw error;
    }
    throw new BadRequestException('Malformed cursor');
  }
}

export function encodeCursor(date: Date, id: string): string {
  const cursorData = `${date.toISOString()}|${id}`;
  return Buffer.from(cursorData).toString('base64');
}
