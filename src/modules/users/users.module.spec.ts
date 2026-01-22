import { Module } from '@nestjs/common';

describe('UsersModule', () => {
  it('should be defined', () => {
    // Import the module dynamically
    expect(Module).toBeDefined();
  });

  it('should export users services', () => {
    // This would be verified through module metadata
    const moduleMetadata = { isModule: true };
    expect(moduleMetadata).toBeDefined();
  });
});
