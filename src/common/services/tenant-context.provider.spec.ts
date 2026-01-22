import { TenantContextProvider } from './tenant-context.provider';
import { TenantContextService } from './tenant-context.service';

describe('TenantContextProvider', () => {
  let provider: TenantContextProvider;

  beforeEach(() => {
    provider = new TenantContextProvider();
  });

  describe('getTenantId', () => {
    it('should return tenantId when in context', (done) => {
      const tenantId = 'test-tenant-123';

      TenantContextService.run(tenantId, () => {
        expect(provider.getTenantId()).toBe(tenantId);
        done();
      });
    });

    it('should return undefined when outside context', () => {
      expect(provider.getTenantId()).toBeUndefined();
    });
  });

  describe('getRequiredTenantId', () => {
    it('should return tenantId when in context', (done) => {
      const tenantId = 'required-tenant-456';

      TenantContextService.run(tenantId, () => {
        expect(provider.getRequiredTenantId()).toBe(tenantId);
        done();
      });
    });

    it('should throw when outside context', () => {
      expect(() => provider.getRequiredTenantId()).toThrow('Tenant context is required but not available');
    });
  });
});
