export class FileTypeUtil {
  static async validateBuffer(buffer: Buffer): Promise<{ mime: string; ext: string } | undefined> {
    const { fileTypeFromBuffer } = await import('file-type');
    const typeInfo = await fileTypeFromBuffer(buffer);
    if (!typeInfo) return undefined;

    return { mime: typeInfo.mime, ext: typeInfo.ext };
  }
}
