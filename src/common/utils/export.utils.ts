import { Response } from 'express';
import { Readable } from 'stream';

/**
 * Shared utilities for data export operations (CSV, etc.)
 */
export class ExportUtils {
  /**
   * Streams CSV data to HTTP response
   * @param res Express response object
   * @param filename Download filename
   * @param headers CSV column headers
   * @param dataStream Stream of data rows
   * @param rowMapper Function to map each row to string array
   */
  static async streamCsvToResponse<T>(
    res: Response,
    filename: string,
    headers: string[],
    dataStream: Readable,
    rowMapper: (row: T) => string[],
  ): Promise<void> {
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    // Write CSV headers
    res.write(headers.join(',') + '\n');

    // Stream data rows
    for await (const row of dataStream) {
      const values = rowMapper(row as T);
      const escapedValues = values.map((v) => this.escapeCsvValue(v));
      res.write(escapedValues.join(',') + '\n');
    }

    res.end();
  }

  /**
   * Escapes CSV value to prevent injection and handle special characters
   */
  static escapeCsvValue(value: unknown): string {
    const str = String(value ?? '');
    // If value contains comma, quote, or newline, wrap in quotes and escape internal quotes
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  }

  /**
   * Formats date for CSV export (YYYY-MM-DD)
   */
  static formatDateForCsv(date: Date | string | null | undefined): string {
    if (!date) return '';
    const d = typeof date === 'string' ? new Date(date) : date;
    if (isNaN(d.getTime())) return '';
    return d.toISOString().split('T')[0] ?? '';
  }

  /**
   * Formats datetime for CSV export (YYYY-MM-DD HH:mm:ss)
   */
  static formatDateTimeForCsv(date: Date | string | null | undefined): string {
    if (!date) return '';
    const d = typeof date === 'string' ? new Date(date) : date;
    if (isNaN(d.getTime())) return '';
    return d.toISOString().replace('T', ' ').substring(0, 19);
  }

  /**
   * Formats currency amount for CSV export
   */
  static formatCurrencyForCsv(amount: number | null | undefined, currency = ''): string {
    if (amount === null || amount === undefined) return '';
    const formatted = amount.toFixed(2);
    return currency ? `${currency} ${formatted}` : formatted;
  }
}
