import { BadRequestException } from '@nestjs/common';
import { isValid } from 'date-fns';

export interface CursorData {
  date: Date;
  id: string;
}

export function decodeCursor(cursor: string): CursorData {
  try {
    const decoded = Buffer.from(cursor, 'base64').toString('utf-8');
    const [dateStr, id] = decoded.split('|');
    if (!dateStr || !id) {
      throw new BadRequestException('cursor.invalid_format');
    }
    const date = new Date(dateStr);
    if (!isValid(date)) {
      throw new BadRequestException('cursor.invalid_date');
    }
    if (id.trim().length === 0) {
      throw new BadRequestException('cursor.invalid_id');
    }
    return { date, id };
  } catch (error) {
    if (error instanceof BadRequestException) {
      throw error;
    }
    throw new BadRequestException('cursor.malformed');
  }
}

export function encodeCursor(date: Date, id: string): string {
  const cursorData = `${date.toISOString()}|${id}`;
  return Buffer.from(cursorData).toString('base64');
}
