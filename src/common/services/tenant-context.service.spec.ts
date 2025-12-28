import { TenantContextService } from './tenant-context.service';

describe('TenantContextService', () => {
  it('should store and retrieve tenantId', (done) => {
    const tenantId = 'test-tenant-123';

    TenantContextService.run(tenantId, () => {
      const retrieved = TenantContextService.getTenantId();
      expect(retrieved).toBe(tenantId);
      done();
    });
  });

  it('should return undefined when outside of context', () => {
    const retrieved = TenantContextService.getTenantId();
    expect(retrieved).toBeUndefined();
  });

  it('should handle nested contexts correctly', (done) => {
    const outerId = 'outer-tenant';
    const innerId = 'inner-tenant';

    TenantContextService.run(outerId, () => {
      expect(TenantContextService.getTenantId()).toBe(outerId);

      TenantContextService.run(innerId, () => {
        expect(TenantContextService.getTenantId()).toBe(innerId);
      });

      expect(TenantContextService.getTenantId()).toBe(outerId);
      done();
    });
  });
});
