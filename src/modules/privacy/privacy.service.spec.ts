import { PrivacyService } from './privacy.service';

describe('PrivacyService (GDPR contract)', () => {
  let service: PrivacyService;

  beforeEach(() => {
    service = new PrivacyService();
  });

  it('exposes processDataExport for GDPR export workflow', async () => {
    await expect(service.processDataExport('request-123')).resolves.toBeUndefined();
  });

  it('is injectable with optional constructor dependencies', () => {
    expect(new PrivacyService({})).toBeInstanceOf(PrivacyService);
  });
});
