import * as fs from 'node:fs';
import * as path from 'node:path';

describe('Tenant query guardrails (integration config)', () => {
  it('keeps tenant-safe search filtering and no dangling package event contract file', () => {
    const tasksService = fs.readFileSync(
      path.join(__dirname, '..', '..', 'src', 'modules', 'tasks', 'services', 'tasks.service.ts'),
      'utf8',
    );
    const catalogService = fs.readFileSync(
      path.join(__dirname, '..', '..', 'src', 'modules', 'catalog', 'services', 'catalog.service.ts'),
      'utf8',
    );
    const hrService = fs.readFileSync(
      path.join(__dirname, '..', '..', 'src', 'modules', 'hr', 'services', 'hr.service.ts'),
      'utf8',
    );

    expect(tasksService).not.toContain('.orWhere(');
    expect(catalogService).not.toContain('.orWhere(');
    expect(hrService).not.toContain('.orWhere(');

    const eventFile = path.join(__dirname, '..', '..', 'src', 'modules', 'catalog', 'events', 'package.events.ts');
    expect(fs.existsSync(eventFile)).toBe(false);
  });
});
