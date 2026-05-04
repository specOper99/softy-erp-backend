type FileTypeResult = { mime: string; ext: string } | undefined;
type FileTypeLoader = () => Promise<{ fileTypeFromBuffer: (buffer: Buffer) => Promise<FileTypeResult> }>;

/**
 * Loads the `file-type` ESM module.
 * Exposed as a static property so unit tests can substitute a synchronous stub
 * without requiring `--experimental-vm-modules`.
 */

const defaultLoader: FileTypeLoader = () => import('file-type') as ReturnType<FileTypeLoader>;

export class FileTypeUtil {
  /** @internal — override in tests to avoid ESM dynamic-import restrictions. */
  static _loader: FileTypeLoader = defaultLoader;

  static async validateBuffer(buffer: Buffer): Promise<FileTypeResult> {
    const { fileTypeFromBuffer } = await FileTypeUtil._loader();
    const typeInfo = await fileTypeFromBuffer(buffer);
    if (!typeInfo) return undefined;

    return { mime: typeInfo.mime, ext: typeInfo.ext };
  }
}
