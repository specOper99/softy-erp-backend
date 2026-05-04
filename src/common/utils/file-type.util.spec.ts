import { FileTypeUtil } from './file-type.util';

// Stub the ESM-only `file-type` loader to avoid --experimental-vm-modules requirement.
const mockFileTypeFromBuffer = jest.fn();
beforeAll(() => {
  FileTypeUtil._loader = jest.fn().mockResolvedValue({ fileTypeFromBuffer: mockFileTypeFromBuffer });
});
afterAll(() => {
  // Restore default so other tests importing this module are unaffected.
  FileTypeUtil._loader = () => import('file-type') as ReturnType<typeof FileTypeUtil._loader>;
});

describe('FileTypeUtil', () => {
  beforeEach(() => {
    mockFileTypeFromBuffer.mockReset();
  });

  it('detects PNG buffers', async () => {
    const pngBuffer = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4////fwAJ+wP+Z0D2GQAAAABJRU5ErkJggg==',
      'base64',
    );

    // PNG magic bytes: 0x89 0x50 0x4E 0x47
    mockFileTypeFromBuffer.mockResolvedValueOnce({ mime: 'image/png', ext: 'png' });

    await expect(FileTypeUtil.validateBuffer(pngBuffer)).resolves.toEqual({
      mime: 'image/png',
      ext: 'png',
    });
    expect(mockFileTypeFromBuffer).toHaveBeenCalledWith(pngBuffer);
  });

  it('returns undefined for unknown buffers', async () => {
    mockFileTypeFromBuffer.mockResolvedValueOnce(undefined);

    await expect(FileTypeUtil.validateBuffer(Buffer.from('not-a-real-file'))).resolves.toBeUndefined();
  });
});
