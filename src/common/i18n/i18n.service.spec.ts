jest.mock('node:fs', () => ({
  readFileSync: jest.fn(),
}));

import { readFileSync } from 'node:fs';

describe('I18nService', () => {
  it('fails closed when translations cannot be loaded', () => {
    (readFileSync as jest.Mock).mockImplementation(() => {
      throw new Error('missing file');
    });

    // Import after fs mock so constructor uses the mocked readFileSync.

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { I18nService } = require('./i18n.service') as typeof import('./i18n.service');

    const service = new I18nService();
    expect(() => service.onModuleInit()).toThrow('missing file');
  });
});
