import { Injectable } from '@nestjs/common';
import { Response } from 'express';
import { Parser, Transform } from 'json2csv';
import { Readable } from 'stream';

@Injectable()
export class ExportService {
  /**
   * Generates CSV content from data array
   */
  generateCSV<T>(data: T[], fields?: string[]): string {
    if (!data || data.length === 0) {
      return '';
    }

    const parser = new Parser({ fields });
    return parser.parse(data);
  }

  /**
   * Legacy method: Streams CSV data as HTTP response from in-memory array
   * @deprecated Use streamCSVFromStream instead for large datasets
   */
  streamCSV<T>(
    res: Response,
    data: T[],
    filename: string,
    fields?: string[],
  ): void {
    const csv = this.generateCSV(data, fields);

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csv);
  }

  /**
   * Streams CSV data from a Node Readable stream (e.g. TypeORM stream)
   * This is memory-efficient for large exports.
   *
   * @param res Express Response object
   * @param dataStream Source stream (TypeORM ReadStream or similar)
   * @param filename Output filename
   * @param fields Columns to include in CSV
   * @param transformFn Optional function to map raw row to CSV object
   */
  streamFromStream(
    res: Response,
    dataStream: Readable,
    filename: string,
    fields?: string[],
    transformFn?: (row: unknown) => unknown,
  ): void {
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    const json2csv = new Transform({ fields }, { objectMode: true });

    const cleanup = () => {
      if (!dataStream.destroyed) {
        dataStream.destroy();
      }
      if (!json2csv.destroyed) {
        json2csv.destroy();
      }
    };

    res.on('close', cleanup);
    res.on('error', cleanup);

    if (transformFn) {
      dataStream.on('data', (chunk) => {
        const transformed = transformFn(chunk);
        const canContinue = json2csv.write(transformed);
        if (!canContinue) {
          dataStream.pause();
          json2csv.once('drain', () => dataStream.resume());
        }
      });

      dataStream.on('end', () => {
        json2csv.end();
      });

      dataStream.on('error', (err) => {
        json2csv.destroy(err);
        if (!res.headersSent) {
          res.status(500).end();
        } else {
          res.end();
        }
      });

      json2csv.pipe(res);
    } else {
      dataStream.pipe(json2csv).pipe(res);
    }
  }
}
