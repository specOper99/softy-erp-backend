/**
 * Manual CJS mock for the ESM-only `file-type` package.
 * Used in Jest tests to bypass the --experimental-vm-modules requirement.
 */

export const fileTypeFromBuffer = jest.fn(async (buffer: Buffer) => {
  // Detect PNG by magic bytes: 0x89 0x50 0x4E 0x47
  if (buffer.length >= 4 && buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) {
    return { mime: 'image/png', ext: 'png' };
  }
  // Detect JPEG by magic bytes: 0xFF 0xD8 0xFF
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { mime: 'image/jpeg', ext: 'jpg' };
  }
  // Detect PDF by magic bytes: %PDF
  if (buffer.length >= 4 && buffer.toString('ascii', 0, 4) === '%PDF') {
    return { mime: 'application/pdf', ext: 'pdf' };
  }
  return undefined;
});
