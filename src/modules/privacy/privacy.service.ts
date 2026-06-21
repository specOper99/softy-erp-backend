import { createWriteStream } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { ZipArchive } from 'archiver';
import { Injectable } from '@nestjs/common';
import { BUSINESS_CONSTANTS } from '../../common/constants/business.constants';

@Injectable()
export class PrivacyService {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(..._args: any[]) {}

  async processDataExport(_requestId: string): Promise<void> {}

  protected async createExportZip(
    userId: string,
    data: Record<string, unknown>,
  ): Promise<{ filePath: string; key: string }> {
    const exportDir = BUSINESS_CONSTANTS.PRIVACY.TEMP_EXPORT_DIR;
    await mkdir(exportDir, { recursive: true });

    const fileName = `privacy-export-${userId}-${Date.now()}.zip`;
    const filePath = path.join(exportDir, fileName);
    const key = `privacy-exports/${fileName}`;

    await new Promise<void>((resolve, reject) => {
      const output = createWriteStream(filePath);
      const archive = new ZipArchive({ zlib: { level: 9 } });

      output.on('close', () => resolve());
      archive.on('error', reject);
      archive.pipe(output);
      archive.append(JSON.stringify(data, null, 2), { name: 'export.json' });
      void archive.finalize();
    });

    return { filePath, key };
  }
}
