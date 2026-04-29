import { Injectable } from '@nestjs/common';
import { stringify as createCsvStringifier } from 'csv-stringify';
import { Response } from 'express';
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
  ): Promise<void> {
    const sanitizedFilename = this.sanitizeFilename(filename);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${sanitizedFilename}"`);

    const stringifier = createCsvStringifier({
      header: true,
      columns: fields,
    });

    return new Promise((resolve, reject) => {
      const cleanup = () => {
        if (!dataStream.destroyed) {
          dataStream.destroy();
        }
        if (!stringifier.destroyed) {
          stringifier.destroy();
        }
      };

      const onError = (err: Error) => {
        cleanup();
        if (!res.headersSent) {
          res.status(500).end();
        } else {
          res.end();
        }
        reject(err);
      };

      res.on('close', cleanup);
      res.on('error', onError);

      if (transformFn) {
        dataStream.on('data', (chunk) => {
          const transformed = transformFn(chunk as T);
          const canContinue = stringifier.write(transformed);
          if (!canContinue) {
            dataStream.pause();
            stringifier.once('drain', () => dataStream.resume());
          }
        });

        dataStream.on('end', () => {
          stringifier.end();
        });

        dataStream.on('error', onError);

        stringifier.on('finish', () => {
          resolve();
        });

        stringifier.on('error', onError);

        stringifier.pipe(res);
      } else {
        dataStream.on('error', onError);
        dataStream.pipe(stringifier).pipe(res);

        stringifier.on('finish', () => {
          resolve();
        });

        stringifier.on('error', onError);
      }
    });
  }
}
