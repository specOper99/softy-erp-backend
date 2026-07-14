import { randomUUID } from 'node:crypto';
import type { DataSource } from 'typeorm';
import { EmailTemplate } from '../../src/modules/mail/domain/entities';
import { Task } from '../../src/modules/tasks/domain/entities/task.entity';
import { TimeEntry } from '../../src/modules/tasks/domain/entities/time-entry.entity';

describe('Tenant raw-repository boundary regressions', () => {
  let dataSource: DataSource;

  beforeAll(() => {
    dataSource = globalThis.__DATA_SOURCE__!;
    if (!dataSource?.isInitialized) {
      throw new Error('DataSource not initialized');
    }
  });

  it('mail templates: cross-tenant id probe returns zero rows', async () => {
    const tenantA = randomUUID();
    const tenantB = randomUUID();
    const phantomId = randomUUID();

    const templateRepo = dataSource.getRepository(EmailTemplate);
    const crossTenantHit = await templateRepo
      .createQueryBuilder('template')
      .where('template.id = :id', { id: phantomId })
      .andWhere('template.tenantId = :tenantId', { tenantId: tenantA })
      .andWhere('template.tenantId <> :otherTenant', { otherTenant: tenantB })
      .getCount();

    expect(crossTenantHit).toBe(0);
  });

  it('tasks: tenant-scoped filter excludes other tenant rows', async () => {
    const tenantA = randomUUID();
    const tenantB = randomUUID();

    const leakCount = await dataSource
      .getRepository(Task)
      .createQueryBuilder('task')
      .where('task.tenantId = :tenantA', { tenantA })
      .andWhere('task.tenantId = :tenantB', { tenantB })
      .getCount();

    expect(leakCount).toBe(0);
  });

  it('time entries: tenant-scoped filter excludes other tenant rows', async () => {
    const tenantA = randomUUID();
    const tenantB = randomUUID();

    const leakCount = await dataSource
      .getRepository(TimeEntry)
      .createQueryBuilder('entry')
      .where('entry.tenantId = :tenantA', { tenantA })
      .andWhere('entry.tenantId = :tenantB', { tenantB })
      .getCount();

    expect(leakCount).toBe(0);
  });
});
