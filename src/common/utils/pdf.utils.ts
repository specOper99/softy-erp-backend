import type { Response } from 'express';

export class PdfUtils {
  static sendPdfResponse(res: Response, buffer: Uint8Array, filename: string): void {
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename=${filename}`,
      'Content-Length': buffer.length,
    });
    res.end(Buffer.from(buffer));
  }
}
