declare module 'file-type' {
  export function fileTypeFromBuffer(
    buffer: Uint8Array | ArrayBuffer,
  ): Promise<{ ext: string; mime: string } | undefined>;
}
