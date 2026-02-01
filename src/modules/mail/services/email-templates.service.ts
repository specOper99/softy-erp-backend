import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import Handlebars from 'handlebars';
import { PaginationDto } from '../../../common/dto/pagination.dto';
import { TenantAwareRepository } from '../../../common/repositories/tenant-aware.repository';
import { CreateEmailTemplateDto, PreviewEmailTemplateDto, UpdateEmailTemplateDto } from '../dto/email-template.dto';
import { EmailTemplate } from '../entities/email-template.entity';

/**
 * Service for managing email templates (CRUD operations).
 * All operations are tenant-scoped via TenantAwareRepository.
 */
@Injectable()
export class EmailTemplatesService {
  constructor(private readonly emailTemplateRepository: TenantAwareRepository<EmailTemplate>) {}

  /**
   * Find all email templates for the current tenant.
   */
  async findAll(pagination: PaginationDto = new PaginationDto()): Promise<EmailTemplate[]> {
    return this.emailTemplateRepository.find({
      order: { name: 'ASC' },
      skip: pagination.getSkip(),
      take: pagination.getTake(),
    });
  }

  /**
   * Find a single email template by ID.
   * @throws NotFoundException if template is not found in current tenant
   */
  async findById(id: string): Promise<EmailTemplate> {
    const template = await this.emailTemplateRepository.findOne({
      where: { id },
    });

    if (!template) {
      throw new NotFoundException('Template not found');
    }

    return template;
  }

  /**
   * Find a template by name.
   * @throws NotFoundException if template is not found in current tenant
   */
  async findByName(name: string): Promise<EmailTemplate | null> {
    return this.emailTemplateRepository.findOne({
      where: { name },
    });
  }

  /**
   * Create a new email template.
   * @throws BadRequestException if a template with the same name already exists
   */
  async create(dto: CreateEmailTemplateDto): Promise<EmailTemplate> {
    const existing = await this.findByName(dto.name);

    if (existing) {
      throw new BadRequestException('Template with this name already exists');
    }

    const template = this.emailTemplateRepository.create({
      ...dto,
      isSystem: false,
    });

    return this.emailTemplateRepository.save(template);
  }

  /**
   * Update an existing email template.
   * @throws NotFoundException if template is not found
   */
  async update(id: string, dto: UpdateEmailTemplateDto): Promise<EmailTemplate> {
    const template = await this.findById(id);

    Object.assign(template, dto);
    return this.emailTemplateRepository.save(template);
  }

  /**
   * Delete an email template.
   * @throws NotFoundException if template is not found
   * @throws BadRequestException if attempting to delete a system template
   */
  async remove(id: string): Promise<EmailTemplate> {
    const template = await this.findById(id);

    if (template.isSystem) {
      throw new BadRequestException('Cannot delete system templates');
    }

    return this.emailTemplateRepository.remove(template);
  }

  /**
   * Preview a compiled Handlebars template.
   * @throws BadRequestException if template compilation fails
   */
  preview(dto: PreviewEmailTemplateDto): { html: string } {
    try {
      const template = Handlebars.compile(dto.content);
      const rendered = template(dto.data);
      return { html: rendered };
    } catch (error) {
      if (error instanceof Error) {
        throw new BadRequestException(`Template compilation failed: ${error.message}`);
      }
      throw new BadRequestException('Template compilation failed');
    }
  }
}
