import { Injectable } from '@nestjs/common';
import { stringify as createCsvStringifier } from 'csv-stringify';
import type { Response } from 'express';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';

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
   * Stream CSV data from a Node Readable (e.g. TypeORM stream) to an
   * Express response. Memory-efficient for large exports; backpressure
   * and error/cleanup handled by `stream/promises.pipeline`.
   */
  async streamFromStream<T = unknown>(
    res: Response,
    dataStream: Readable,
    filename: string,
    fields?: string[],
    transformFn?: (row: T) => unknown,
  ): Promise<void> {
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${this.sanitizeFilename(filename)}"`);

    const stringifier = createCsvStringifier({ header: true, columns: fields });

    try {
      if (transformFn) {
        const mapper = new Transform({
          objectMode: true,
          transform(chunk, _enc, cb) {
            try {
              cb(null, transformFn(chunk as T));
            } catch (err) {
              cb(err as Error);
            }
          },
        });
        await pipeline(dataStream, mapper, stringifier, res);
      } else {
        await pipeline(dataStream, stringifier, res);
      }
    } catch (err) {
      if (!res.headersSent) {
        res.status(500).end();
      } else {
        res.end();
      }
      throw err;
    }
  }
}
