import { FileTypeUtil } from './file-type.util';

describe('FileTypeUtil', () => {
  it('detects PNG buffers', async () => {
    const pngBuffer = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4////fwAJ+wP+Z0D2GQAAAABJRU5ErkJggg==',
      'base64',
    );

    await expect(FileTypeUtil.validateBuffer(pngBuffer)).resolves.toEqual({
      mime: 'image/png',
      ext: 'png',
    });
  });

  it('returns undefined for unknown buffers', async () => {
    await expect(FileTypeUtil.validateBuffer(Buffer.from('not-a-real-file'))).resolves.toBeUndefined();
  });
});
