import { Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import * as Handlebars from 'handlebars';
import sanitizeHtml from 'sanitize-html';
import { Repository } from 'typeorm';
import { TenantContextService } from '../../../common/services/tenant-context.service';
import { EmailTemplate } from '../entities/email-template.entity';

export interface TemplateResolutionResult {
  template?: string;
  html?: string;
}

/**
 * Service for email template resolution, compilation, and content sanitization.
 * Handles Handlebars templates from database (tenant-specific) or filesystem fallback.
 */
@Injectable()
export class MailTemplateService {
  private readonly logger = new Logger(MailTemplateService.name);
  private readonly companyName: string;
  private readonly companyUrl: string;

  constructor(
    private readonly configService: ConfigService,
    @Optional()
    @InjectRepository(EmailTemplate)
    private readonly templateRepository?: Repository<EmailTemplate>,
  ) {
    this.companyName = this.configService.get('COMPANY_NAME', 'Soft-y');
    this.companyUrl = this.configService.get('COMPANY_URL', 'https://soft-y.com');
  }

  /**
   * Get company name for email context
   */
  getCompanyName(): string {
    return this.companyName;
  }

  /**
   * Get company URL for email context
   */
  getCompanyUrl(): string {
    return this.companyUrl;
  }

  /**
   * Resolve template from DB or fall back to filesystem
   */
  async resolveTemplate(
    dbName: string,
    fileTemplate: string,
    context: Record<string, unknown>,
  ): Promise<TemplateResolutionResult> {
    if (!this.templateRepository) {
      return { template: fileTemplate };
    }

    try {
      const tenantId = TenantContextService.getTenantId();
      if (tenantId) {
        const dbTemplate = await this.templateRepository.findOne({
          where: { name: dbName, tenantId },
        });

        if (dbTemplate) {
          const compiled = Handlebars.compile(dbTemplate.content);
          const html = compiled(context);
          return { html };
        }
      }
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : 'Unknown error';
      this.logger.warn(`Failed to resolve DB template ${dbName}, falling back to file: ${errorMessage}`);
    }

    return { template: fileTemplate };
  }

  /**
   * Inject locale-specific context variables and sanitize content
   */
  sanitizeContext(context: Record<string, unknown>, locale = 'en'): Record<string, unknown> {
    const isRtl = ['ar', 'ku'].includes(locale);
    const sanitized = this.recursiveSanitize(context);

    return {
      ...sanitized,
      direction: isRtl ? 'rtl' : 'ltr',
      textAlign: isRtl ? 'right' : 'left',
      locale,
    };
  }

  /**
   * Recursively sanitize all string values in an object to prevent XSS in email templates
   */
  recursiveSanitize<T>(context: T): T {
    if (typeof context !== 'object' || context === null) {
      if (typeof context === 'string') {
        return sanitizeHtml(context) as unknown as T;
      }
      return context;
    }

    if (Array.isArray(context)) {
      const arr = context as unknown[];
      return arr.map((item) => this.recursiveSanitize(item)) as unknown as T;
    }

    const sanitized = {} as Record<string, unknown>;
    const obj = context as Record<string, unknown>;
    for (const key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        sanitized[key] = this.recursiveSanitize(obj[key]);
      }
    }
    return sanitized as T;
  }

  /**
   * Format a date in a human-readable format
   */
  formatDate(date: Date): string {
    return new Date(date).toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  }

  /**
   * Format a number as currency
   */
  formatCurrency(amount: number): string {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);
  }

  /**
   * Build common email context with company info and current year
   */
  buildCommonContext(additionalContext: Record<string, unknown> = {}): Record<string, unknown> {
    return {
      ...additionalContext,
      year: new Date().getFullYear(),
      companyName: this.companyName,
      companyUrl: this.companyUrl,
    };
  }
}
