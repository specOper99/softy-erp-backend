// Set test environment to disable rate limiting if not already set
process.env.NODE_ENV = process.env.NODE_ENV || 'test';

// Mock css-inline and mailer to prevent CustomGC leaks in E2E tests
jest.mock('@css-inline/css-inline', () => ({
  inline: jest.fn(),
  CSSInliner: class {
    inline = jest.fn();
  },
}));

jest.mock('@nestjs-modules/mailer', () => ({
  MailerModule: {
    forRoot: jest.fn().mockReturnValue({ module: class { }, providers: [] }),
    forRootAsync: jest
      .fn()
      .mockReturnValue({ module: class { }, providers: [] }),
  },
  MailerService: class { },
}));

jest.mock('@nestjs-modules/mailer/dist/adapters/handlebars.adapter', () => ({
  HandlebarsAdapter: class { },
}));

jest.mock('@sentry/nestjs/setup', () => ({
  SentryModule: {
    forRoot: jest.fn().mockReturnValue({ module: class { }, providers: [] }),
  },
}));



// Load environment variables from .env file
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

// Find project root by looking for package.json
let currentDir = __dirname;
while (currentDir !== path.parse(currentDir).root) {
  if (fs.existsSync(path.join(currentDir, 'package.json'))) {
    break;
  }
  currentDir = path.dirname(currentDir);
}

const envPath = path.join(currentDir, '.env');

if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
} else {
  console.warn(`⚠️  Warning: .env file not found at ${envPath}`);
}
