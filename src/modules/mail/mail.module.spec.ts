import { ConfigService } from '@nestjs/config';
import { HandlebarsAdapter } from '@nestjs-modules/mailer/dist/adapters/handlebars.adapter';
import { join } from 'node:path';
import { createMailerOptions } from './mail.module';

describe('createMailerOptions', () => {
  it('puts Handlebars partials config under MailerOptions.options.partials', () => {
    const options = createMailerOptions(new ConfigService());

    expect(options.template?.dir).toBe(join(__dirname, 'templates'));
    expect(options.template?.adapter).toBeInstanceOf(HandlebarsAdapter);
    expect(options.options?.partials?.dir).toBe(join(__dirname, 'templates', 'partials'));
    expect(options.options?.partials?.options).toEqual({ strict: true });
  });
});
