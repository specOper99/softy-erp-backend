type FileTypeModule = {
  fileTypeFromBuffer: (buffer: Buffer) => Promise<{ mime: string; ext: string } | undefined>;
};

const importFileType = new Function('specifier', 'return import(specifier)') as (
  specifier: string,
) => Promise<FileTypeModule>;

export class FileTypeUtil {
  static async validateBuffer(buffer: Buffer): Promise<{ mime: string; ext: string } | undefined> {
    const { fileTypeFromBuffer } = await importFileType('file-type');
    const typeInfo = await fileTypeFromBuffer(buffer);
    if (!typeInfo) return undefined;

    return { mime: typeInfo.mime, ext: typeInfo.ext };
  }
}
