import { BadRequestException } from '@nestjs/common';
import { TenantContextService } from './tenant-context.service';

describe('TenantContextService', () => {
  it('getTenantIdOrThrow() uses getTenantId()', () => {
    const getTenantIdSpy = jest.spyOn(TenantContextService, 'getTenantId');
    getTenantIdSpy.mockReturnValue(undefined);

    expect(() => TenantContextService.getTenantIdOrThrow()).toThrow(BadRequestException);
    expect(getTenantIdSpy).toHaveBeenCalled();

    getTenantIdSpy.mockRestore();
  });

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

  it('should preserve tenant context across async promise boundaries', async () => {
    await TenantContextService.run('tenant-async-1', async () => {
      await Promise.resolve();
      expect(TenantContextService.getTenantId()).toBe('tenant-async-1');
    });
  });

  it('should isolate tenant context across parallel executions', async () => {
    const [tenantA, tenantB] = await Promise.all([
      TenantContextService.run('tenant-a', async () => {
        await new Promise((resolve) => setTimeout(resolve, 5));
        return TenantContextService.getTenantId();
      }),
      TenantContextService.run('tenant-b', async () => {
        await new Promise((resolve) => setTimeout(resolve, 1));
        return TenantContextService.getTenantId();
      }),
    ]);

    expect(tenantA).toBe('tenant-a');
    expect(tenantB).toBe('tenant-b');
  });
});
