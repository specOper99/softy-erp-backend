import * as fs from 'fs';
import * as path from 'path';

describe('database seed configuration', () => {
  it('uses migrations and does not drop schema by default', () => {
    const seedPath = path.join(__dirname, 'seed.ts');
    const seedContents = fs.readFileSync(seedPath, 'utf8');

    expect(seedContents).toMatch(/SEED_DROP_SCHEMA\s*\?\?\s*'false'/);
    expect(seedContents).toMatch(/migrationsRun:\s*false/);
    expect(seedContents).toMatch(/migrations:\s*\[\s*join\(__dirname,\s*'migrations',\s*'\*\.\{ts,js\}'\)\s*\]/);
  });
});
