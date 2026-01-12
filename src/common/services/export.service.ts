import { Injectable } from '@nestjs/common';
import { Response } from 'express';
import { Transform } from 'json2csv';
import { Readable } from 'stream';

@Injectable()
export class ExportService {
  /**
   * Sanitize filename to prevent HTTP header injection.
   * Removes special characters that could be used for response splitting.
   */
  private sanitizeFilename(filename: string): string {
    return filename.replace(/[^a-zA-Z0-9._-]/g, '_');
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
  streamFromStream<T = unknown>(
    res: Response,
    dataStream: Readable,
    filename: string,
    fields?: string[],
    transformFn?: (row: T) => unknown,
  ): void {
    const sanitizedFilename = this.sanitizeFilename(filename);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${sanitizedFilename}"`,
    );

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
        const transformed = transformFn(chunk as T);
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
